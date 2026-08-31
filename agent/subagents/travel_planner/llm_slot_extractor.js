/**
 * LLM 结构化槽位抽取器（方案C：混合模式的主路径）
 *
 * 职责：
 * 1. 将 SLOT_DEFINITIONS 编译为 Function Calling JSON Schema
 * 2. 一次 LLM 调用完成全部槽位抽取（替代正则无法覆盖的自然语言场景）
 * 3. 解析 tool_calls / 纯JSON 两种返回形态
 * 4. 超时与异常时返回 null（由调用方降级到正则结果）
 *
 * 设计约定：
 * - 只抽取"本次消息明确出现或可从最近上下文推断"的信息，不编造
 * - 已确认槽位（extractionMethod=user_confirm）永不被 LLM 覆盖
 * - 每槽位返回 confidence=0.85 / extractionMethod='llm'
 */

const { logger } = require('../../utils/logger')

// ═══════════════════════════════════════════════════════════
// Function Calling Schema（由 SLOT_DEFINITIONS 的语义编译而来）
// ═══════════════════════════════════════════════════════════

const SLOT_FUNCTION_SCHEMA = {
  name: 'extract_travel_slots',
  description: '从用户携宠旅行规划的对话消息中，提取结构化槽位信息。只填写消息中明确出现或可从上下文直接推断的字段，无法确定的字段必须设为null，严禁编造。',
  parameters: {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        description: '目的地城市或景点，如"北京"、"杭州西湖"。用户明确表示要前往的地方。'
      },
      origin: {
        type: 'string',
        description: '出发城市。依据"从X出发"、"我在X"、"家在X"等表述判断；也可从上下文"还是老地方出发"等指代推断。'
      },
      days: {
        type: 'number',
        description: '游玩天数（单位：天）。支持"三天两晚"→3、"周末"→2、"一周"→7、"多待两天"（结合上下文推算）等表达。'
      },
      petType: {
        type: 'string',
        enum: ['狗', '猫', '其他'],
        description: '宠物类型。品种词（金毛/哈士奇/布偶等）归并为狗/猫；"毛孩子/它们"依上下文推断。'
      },
      petCount: {
        type: 'number',
        description: '宠物数量，1-10。如"两只狗"→2；上下文已知的不再重复提取。'
      },
      petBreed: {
        type: 'string',
        description: '宠物品种，如"金毛"、"柯基"、"布偶"。'
      },
      petSize: {
        type: 'string',
        enum: ['小型', '中型', '大型'],
        description: '宠物体型。10kg以下=小型，10-25kg=中型，25kg以上=大型；可由品种推断（如金毛=大型）。'
      },
      transport: {
        type: 'string',
        enum: ['自驾', '高铁', '飞机', '火车', '公共交通'],
        description: '出行方式。"开车/自己开"=自驾，"动车"=高铁。'
      },
      budget: {
        type: 'string',
        description: '预算。保留原文表述，如"2000-3000元"、"穷游"、"5000左右"。'
      },
      preference: {
        type: 'array',
        items: { type: 'string' },
        description: '出行偏好标签列表，如["自然风光","美食"]。最多5个。'
      },
      departureDate: {
        type: 'string',
        description: '出发日期描述，如"下周六"、"8月1日"、"国庆节"。'
      }
    },
    required: []
  }
}

// ═══════════════════════════════════════════════════════════
// Prompt 构建
// ═══════════════════════════════════════════════════════════

function _buildSystemPrompt() {
  return `你是携宠旅行规划系统的槽位抽取引擎。你的唯一任务是调用 extract_travel_slots 函数，从用户消息中提取旅行规划槽位。

## 抽取规则
1. 只提取【本次消息明确出现】或【可从最近对话上下文直接推断】的信息。
2. 指代表达必须消解：如"跟上次一样"、"还是那只金毛"、"多待两天"，要结合上下文历史计算出具体值。
3. 品种归并：金毛/哈士奇/柯基等→petType="狗"，petBreed保留具体品种；布偶/英短等→"猫"。
4. 体型可由品种推断：金毛/拉布拉多/哈士奇→大型；泰迪/比熊/柯基→小型。
5. 严禁编造：用户未提供且上下文无法推断的字段一律填null。
6. 与已知槽位冲突时，以本次消息为准（用户可能是在修改条件）。
7. 必须且只能通过函数调用返回结果，不要输出任何解释文字。`
}

function _buildUserPrompt(query, knownSlots, recentHistory) {
  const known = Object.entries(knownSlots || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
    .join('\n') || '（无）'

  const history = (recentHistory || [])
    .slice(-4)
    .map(h => `${h.role === 'user' ? '用户' : '助手'}: ${(h.content || '').slice(0, 100)}`)
    .join('\n') || '（无）'

  return `## 最近对话上下文
${history}

## 已确认的槽位（不要重复提取，但可用于指代消解）
${known}

## 本次用户消息
"${query}"

请调用 extract_travel_slots 提取本次消息中的槽位信息。`
}

// ═══════════════════════════════════════════════════════════
// 解析
// ═══════════════════════════════════════════════════════════

const VALID_KEYS = Object.keys(SLOT_FUNCTION_SCHEMA.parameters.properties)

function _sanitizeSlots(raw) {
  const cleaned = {}
  if (!raw || typeof raw !== 'object') return cleaned

  for (const key of VALID_KEYS) {
    let v = raw[key]
    if (v === null || v === undefined || v === '') continue

    // days / petCount 必须是数字
    if (key === 'days' || key === 'petCount') {
      const n = typeof v === 'number' ? v : parseFloat(v)
      if (!Number.isFinite(n) || n <= 0) continue
      if (key === 'days' && n > 30) continue
      if (key === 'petCount' && n > 10) continue
      v = n
    }

    // 字符串槽位去空格、限长
    if (typeof v === 'string') {
      v = v.trim()
      if (!v || v === 'null' || v === '未知' || v === '未指定') continue
      if (v.length > 30) continue
    }

    // preference 数组去重限长
    if (key === 'preference') {
      if (!Array.isArray(v)) continue
      v = [...new Set(v.map(s => String(s).trim()).filter(Boolean))].slice(0, 5)
      if (v.length === 0) continue
    }

    cleaned[key] = v
  }
  return cleaned
}

function _parseResponse(llmResult) {
  if (!llmResult) return null

  // 形态1：标准 tool_calls
  const toolCall = (llmResult.toolCalls || [])[0]
  if (toolCall?.function?.arguments) {
    try {
      return _sanitizeSlots(JSON.parse(toolCall.function.arguments))
    } catch (e) {
      logger.warn('LLMSlotExtractor', `tool_calls 参数解析失败: ${e.message}`)
    }
  }

  // 形态2：content 里直接输出 JSON（模型未走函数通道时的兼容）
  const content = llmResult.content || ''
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      return _sanitizeSlots(JSON.parse(jsonMatch[0]))
    } catch (e) {
      /* fallthrough */
    }
  }
  return null
}

// ═══════════════════════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT = 8000 // 槽位抽取在对话链路中，超时须短于总超时

class LLMSlotExtractor {
  /**
   * LLM 结构化槽位抽取
   * @param {string} query - 本次用户消息
   * @param {object} context - { existingSlots, recentHistory }
   * @param {object} llmClient - zhipu client（需支持 chat({ tools, toolChoice })）
   * @param {object} options - { timeout, model, temperature }
   * @returns {Promise<object|null>} 槽位对象；失败/超时返回 null（调用方降级正则）
   */
  async extract(query, context = {}, llmClient, options = {}) {
    if (!llmClient || !query) return null

    const { timeout = DEFAULT_TIMEOUT } = options
    const messages = [
      { role: 'system', content: _buildSystemPrompt() },
      {
        role: 'user',
        content: _buildUserPrompt(query, context.existingSlots, context.recentHistory)
      }
    ]

    const timer = logger.time('llm_slot_extract')

    try {
      const callPromise = llmClient.chat({
        messages,
        temperature: 0.1,          // 抽取任务低温度
        maxTokens: 512,
        tools: [SLOT_FUNCTION_SCHEMA],
        toolChoice: { type: 'function', function: { name: SLOT_FUNCTION_SCHEMA.name } },
        ...options
      })

      // 超时保护：超时则放弃 LLM 结果，走正则兜底
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`LLM槽位抽取超时(${timeout}ms)`)), timeout)
      )

      const llmResult = await Promise.race([callPromise, timeoutPromise])
      const slots = _parseResponse(llmResult)

      if (slots && Object.keys(slots).length > 0) {
        logger.info('LLMSlotExtractor', `LLM抽取成功: ${JSON.stringify(slots)}`)
        return slots
      }
      logger.info('LLMSlotExtractor', 'LLM未抽取到新槽位')
      return {}
    } catch (e) {
      logger.warn('LLMSlotExtractor', `抽取失败(将降级正则): ${e.message}`)
      return null
    } finally {
      timer.end()
    }
  }
}

module.exports = {
  extractor: new LLMSlotExtractor(),
  SLOT_FUNCTION_SCHEMA,
  sanitizeSlots: _sanitizeSlots
}
