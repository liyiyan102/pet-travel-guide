/**
 * LLM 意图分类 Prompt 模板
 * 用于 Layer 3 语义层调用智谱 API 进行意图识别
 */

const config = require('../../config')

// ═══════════════════════════════════════════════════════════
// 意图描述（用于 LLM 理解每个意图的含义）
// ═══════════════════════════════════════════════════════════
const INTENT_DESCRIPTIONS = {
  generate_itinerary: '用户想要生成/规划/制定宠物友好的旅行行程、攻略、路线方案。包含城市、天数、宠物类型等信息。',
  search_poi: '用户想搜索/查找附近的或特定城市的宠物友好场所（餐厅、酒店、公园、景点、咖啡店等）。',
  pet_advice: '用户询问带宠物出行的注意事项、安全建议、防护措施等通用建议。',
  weather_check: '用户询问天气情况，包括温度、降雨、晴天等天气信息。',
  modify_itinerary: '用户想要修改、调整、变更已生成的行程安排（换景点、改时间等）。',
  transport_guide: '用户询问如何带宠物乘坐交通工具（飞机/高铁/火车/自驾），需要操作流程和步骤说明。',
  emergency_help: '用户的宠物出现紧急健康问题（中毒、受伤、中暑、骨折等），需要立即就医或急救建议。',
  chit_chat: '用户在闲聊、打招呼、感谢、告别等社交性对话，无具体功能需求。',
  image_analysis: '用户上传了图片，想让AI分析图片内容（非品种识别、非场景识别的通用图片分析）。',
  image_qa: '用户上传了图片并针对图片内容提出具体问题。',
  pet_breed_recognition: '用户上传了宠物照片，想知道是什么品种（狗/猫品种鉴定）。',
  scene_recognition: '用户上传了场景/风景照片，想知道是哪里、什么地点、什么景区。',
  food_detection: '用户询问某种食物宠物能不能吃、是否有毒、是否安全。可能上传食物图片。',
  knowledge_query: '用户询问关于宠物的知识性问题（什么是、如何、为什么、区别、科普类）。',
  realtime_search: '用户需要查询实时信息（最新规定、开放时间、价格、当前状态等时效性强的信息）。',
  policy_check: '用户询问某城市的养犬规定、宠物政策（地铁能否带狗、公园准入、禁养品种、罚款等法规政策）。',
  travel_tips: '用户询问旅行中的实用技巧、经验分享、避坑指南等。',
  breed_risk: '用户询问某个具体品种的宠物能否去某城市、能否乘坐某种交通工具、有什么出行限制或风险。',
  travel_checklist: '用户明确询问带宠物出行需要准备什么东西、证件、装备清单。',
  city_policy: '用户查询特定城市的详细宠物相关政策（内部使用，对应 policy_check 的精确查表）。',
  off_topic: '用户的问题与宠物出行完全无关（股票、编程、政治、游戏攻略等）。'
}

// ═══════════════════════════════════════════════════════════
// Few-shot 示例
// ═══════════════════════════════════════════════════════════
const FEW_SHOT_EXAMPLES = [
  {
    input: '帮我规划3天的北京带狗旅行',
    output: { intent: 'generate_itinerary', confidence: 0.95, params: { city: '北京', duration: '3天' }, reason: '含城市+天数+宠物+规划动词，典型行程规划请求' }
  },
  {
    input: '法斗能坐飞机吗',
    output: { intent: 'breed_risk', confidence: 0.92, params: { breed: '法斗', transport: '飞机' }, reason: '具体品种+交通工具+能否，品种风险评估' }
  },
  {
    input: '北京地铁能带狗吗',
    output: { intent: 'policy_check', confidence: 0.93, type: 'answer', userContext: { pets: ['狗'], destination: '北京' }, params: { city: '北京', transport: '地铁' }, reason: '城市+公共交通工具+能否携带，政策查询' }
  },
  {
    input: '巧克力狗狗能吃吗',
    output: { intent: 'food_detection', confidence: 0.96, type: 'answer', userContext: { pets: ['狗'] }, params: { food: '巧克力', petType: 'dog' }, reason: '具体食物+宠物+能否吃，食物安全检测' }
  },
  {
    input: '今天天气怎么样',
    output: { intent: 'weather_check', confidence: 0.98, params: {}, reason: '明确询问天气' }
  },
  {
    input: '带狗去成都旅游需要准备什么',
    output: { intent: 'travel_checklist', confidence: 0.88, params: { city: '成都', petType: 'dog' }, reason: '目的地+宠物+准备什么，出行清单请求' }
  },
  {
    input: '附近有什么宠物友好餐厅',
    output: { intent: 'search_poi', confidence: 0.90, params: { poiType: '餐厅' }, reason: '搜索宠物友好场所' }
  },
  {
    input: '怎么带猫坐高铁',
    output: { intent: 'transport_guide', confidence: 0.91, params: { petType: 'cat', transport: '高铁' }, reason: '操作流程类：怎么+宠物+交通工具' }
  },
  {
    input: '我家狗子吐血了怎么办',
    output: { intent: 'emergency_help', confidence: 0.97, params: { symptom: '吐血', petType: 'dog' }, reason: '严重症状描述，紧急医疗需求' }
  },
  {
    input: '你好',
    output: { intent: 'chit_chat', confidence: 0.99, type: 'answer', userContext: { pets: [], destination: '', dates: { days: null } }, params: {}, reason: '简单问候语' }
  },
  {
    input: '金毛和拉布拉多有什么区别',
    output: { intent: 'knowledge_query', confidence: 0.85, params: { topic: '品种对比' }, reason: '知识性比较问题' }
  },
  {
    input: '把第二天的故宫换成颐和园',
    output: { intent: 'modify_itinerary', confidence: 0.93, params: { action: '替换', day: 2 }, reason: '修改已生成行程的具体内容' }
  },
  {
    input: '帮我看看这是什么品种 [图片]',
    output: { intent: 'pet_breed_recognition', confidence: 0.95, params: { hasImage: true }, reason: '有图片+询问品种识别' }
  },
  {
    input: '最新宠物入境规定',
    output: { intent: 'realtime_search', confidence: 0.88, params: { topic: '入境规定' }, reason: '含"最新"，需实时信息' }
  },
  {
    input: '股票今天涨了没',
    output: { intent: 'off_topic', confidence: 0.95, params: {}, reason: '与宠物出行完全无关' }
  },
  {
    input: '狗可以上地铁吗',
    output: { intent: 'policy_check', confidence: 0.92, type: 'answer', userContext: { pets: ['狗'] }, params: { transport: '地铁', petType: 'dog' }, reason: '公共交通+能否携带宠物，政策查询' }
  },
  {
    input: '猫咪能吃葡萄吗',
    output: { intent: 'food_detection', confidence: 0.95, type: 'answer', userContext: { pets: ['猫'] }, params: { food: '葡萄', petType: 'cat' }, reason: '具体食物+宠物+能否吃，食物安全' }
  },
  {
    input: '公园能让狗进吗',
    output: { intent: 'policy_check', confidence: 0.90, type: 'answer', userContext: { pets: ['狗'] }, params: { place: '公园', petType: 'dog' }, reason: '公共场所+能否带宠物，准入政策' }
  },
  {
    input: '你是谁',
    output: { intent: 'chit_chat', confidence: 0.90, type: 'answer', userContext: { pets: [], destination: '', dates: { days: null } }, params: {}, reason: '询问AI身份，闲聊' }
  },
  {
    input: '你能做什么',
    output: { intent: 'chit_chat', confidence: 0.88, type: 'answer', userContext: { pets: [], destination: '', dates: { days: null } }, params: {}, reason: '询问AI能力，闲聊' }
  }
]

// ═══════════════════════════════════════════════════════════
// Prompt 构建器
// ═══════════════════════════════════════════════════════════
class ClassifyPromptBuilder {
  /**
   * 构建完整的分类 Prompt
   * @param {Object} options - 构建选项
   * @param {string} options.userMessage - 用户消息
   * @param {boolean} options.hasImages - 是否有图片
   * @param {Array} options.layer2Candidates - Layer 2 候选意图列表
   * @param {Object} options.context - 对话上下文
   * @returns {string} 完整 Prompt
   */
  build(options) {
    const { userMessage, hasImages = false, layer2Candidates = [], context = {} } = options

    const parts = [
      this._buildSystemPrompt(),
      this._buildIntentList(),
      this._buildLayer2Hint(layer2Candidates),
      this._buildContext(context),
      this._buildUserInput(userMessage, hasImages),
      this._buildOutputFormat(),
      this._buildFewShot()
    ]

    return parts.filter(Boolean).join('\n\n')
  }

  _buildSystemPrompt() {
    return `你是一个专业的宠物出行助手意图识别器。你的任务是分析用户输入，准确判断意图，同时提取所有实体填充 userContext。

════════════════════════════════════════
【输出格式硬性要求】
════════════════════════════════════════
1. 必须严格输出可被 json.loads 直接解析的纯 JSON
2. 禁止任何 markdown 代码块、禁止 \`\`\` 标记、禁止 json 字样、禁止额外解释文字
3. 先从用户 message 提取全部实体，填充 userContext，再决定是否 clarification
4. 校验规则：当 message 已经明确给出 destination、days、pets，userContext 必须填入对应值，不许留空
5. 只有当 userContext 缺失必填字段，type 才等于 clarification
6. 当 pets、destination、dates.days 全部非空，type 直接设为 action，不要输出 clarification

════════════════════════════════════════
【userContext 字段释义】
════════════════════════════════════════
- pets: 数组，提取宠物，示例 ["猫"] 或 ["狗"]
- destination: 字符串，目的地城市，示例 "郑州"
- dates: 对象，游玩天数，示例 { "days": 3 }
- origin: 字符串，出发城市（如有），示例 "北京"
- travelMode: 字符串，出行方式（如有），示例 "自驾"
- petCount: 数字，宠物数量（如有），示例 2

════════════════════════════════════════
【判断规则】
════════════════════════════════════════
1. 必须从给定的意图列表中选择最匹配的一个意图
2. 如果用户输入与所有意图都不匹配，选择 off_topic
3. 置信度应基于你判断的确信程度（0.0~1.0）
4. 尽可能提取结构化参数（城市、品种、时长等）
5. 给出简短的推理过程
6. type 字段：
   - "action" — 用户提供了足够信息，可直接执行（如做攻略）
   - "clarification" — 缺少必填信息，需要追问用户
   - "answer" — 直接回答问题（知识问答/闲聊等）`
  }

  _buildIntentList() {
    let list = '【可选意图列表】\n'
    for (const [intent, desc] of Object.entries(INTENT_DESCRIPTIONS)) {
      list += `- ${intent}: ${desc}\n`
    }
    return list.trim()
  }

  _buildLayer2Hint(candidates) {
    if (!candidates || candidates.length === 0) return ''

    let hint = '\n【Layer 2 规则层候选结果】（供参考，你可以推翻这个结果）\n'
    candidates.forEach((c, i) => {
      hint += `${i + 1}. 意图=${c.intent}, 置信度=${c.confidence}, 特征=${JSON.stringify(c.features || {})}\n`
    })
    return hint
  }

  _buildContext(context) {
    if (!context.history || context.history.length === 0) return ''

    // 只取最近3轮对话作为上下文
    const recentHistory = context.history.slice(-3)
    let ctxStr = '\n【最近对话上下文】\n'

    recentHistory.forEach((turn, i) => {
      const userMsg = turn.userMessage || turn.content || turn.message
      const agentMsg = turn.agentResponse || turn.response || turn.reply
      const intent = turn.intent || ''
      if (userMsg) ctxStr += `用户${i + 1}: ${userMsg}\n`
      if (agentMsg) ctxStr += `助手${i + 1}${intent ? `[${intent}]` : ''}: ${String(agentMsg).substring(0, 120)}...\n`
    })

    // 关键规则：如果上一轮是澄清追问（agent询问宠物档案），用户当前消息大概率是补充回答
    const lastTurn = recentHistory[recentHistory.length - 1]
    if (lastTurn && (lastTurn.agentResponse || lastTurn.response)) {
      const agentMsg = lastTurn.agentResponse || lastTurn.response || ''
      const askedFor = /(体重|体型|品种|宠物类型|几天|哪里出发|什么时候出发|预算|偏好|出发|哪天|猫|狗|宠物类型|出发地|天数)/.test(agentMsg)
      const prevIntent = lastTurn.intent || context.prevIntent
      if (askedFor && prevIntent && prevIntent !== 'chit_chat') {
        ctxStr += `\n⚠️ 关键判断：上一轮 agent 询问了补充信息（intent=${prevIntent}），用户当前消息很可能是【回答上轮问题】，请继续识别为同一意图 ${prevIntent}。\n`
        ctxStr += `例如："小型"→回答宠物体型（继续 ${prevIntent}），不是新意图。\n`
        ctxStr += `例如："接种过"→回答疫苗状态（继续 ${prevIntent}），不是新意图。\n`
      }
    }

    return ctxStr
  }

  _buildUserInput(message, hasImages) {
    let input = '\n【用户输入】\n'
    input += message || ''
    if (hasImages) {
      input += '\n[用户上传了图片]'
    }
    return input
  }

  _buildOutputFormat() {
    return `\n请以严格 JSON 格式返回（不要包含任何其他文字、不要用代码块包裹）：
{"intent":"意图名称","confidence":0.0,"type":"action或clarification或answer","userContext":{"pets":[],"destination":"","dates":{"days":null},"origin":"","travelMode":"","petCount":null},"params":{"city":"","petType":"","breed":"","duration":"","transport":"","food":""},"reason":"一句话推理"}


userContext 提取规则：
- pets: 从消息提取宠物类型，如"猫"→["猫"]，"狗"→["狗"]，"两只猫"→["猫","猫"]或["猫"]
- destination: 提取目的地城市（"去郑州"→"郑州"）
- dates.days: 提取天数（"3日游"→3，"玩5天"→5）
- origin: 提取出发城市（"从北京出发"→"北京"）
- travelMode: 提取出行方式（"自驾"→"自驾"，"高铁"→"高铁"）
- petCount: 提取宠物数量（"两只"→2）
- 用户没提到的字段留空字符串或 null，不要猜测填充`
  }

  _buildFewShot() {
    // 选择最具代表性的示例（覆盖关键意图）
    // 确保包含 policy_check、food_detection、breed_risk 等容易误判的示例
    // 示例索引：0行程/1品种/2政策/3食物/4天气/5清单/6POI/7交通/9闲聊/10知识/14无关/15地铁政策/16葡萄食物/17公园政策/18你是谁/19你能做什么
    const indices = [0, 1, 2, 3, 6, 7, 9, 14, 15, 16, 17, 18, 19]
    const selectedExamples = indices.map(i => FEW_SHOT_EXAMPLES[i]).filter(Boolean)
    let fewShot = '\n\n【示例】\n'

    selectedExamples.forEach(ex => {
      fewShot += `输入: "${ex.input}"\n`
      fewShot += `输出: ${JSON.stringify(ex.output)}\n\n`
    })

    return fewShot
  }
}

// ═══════════════════════════════════════════════════════════
// 结果解析器
// ═══════════════════════════════════════════════════════════
class ClassifyResultParser {
  /**
   * 解析 LLM 返回的分类结果
   * @param {string} rawResponse - LLM 原始返回文本
   * @returns {Object} 解析后的结构化结果
   */
  parse(rawResponse) {
    if (!rawResponse) {
      return this._fallbackResult('空响应')
    }

    try {
      // 尝试直接解析 JSON
      const cleaned = this._cleanJsonString(rawResponse)
      const result = JSON.parse(cleaned)

      // 验证必要字段
      if (!result.intent) {
        return this._fallbackResult('缺少 intent 字段')
      }

      return {
        intent: result.intent,
        confidence: Math.min(Math.max(parseFloat(result.confidence) || 0.5, 0), 1),
        params: result.params || {},
        reason: result.reason || '',
        source: 'llm',
        raw: rawResponse,
        // 新增字段：LLM 提取的结构化用户上下文
        userContext: result.userContext || null,
        // 新增字段：LLM 建议的处理类型（action/clarification/answer）
        suggestedType: result.type || null
      }
    } catch (e) {
      logger.warn('ClassifyParser', `JSON 解析失败: ${e.message}, 原始: ${rawResponse.substring(0, 100)}`)
      return this._fallbackResult(`解析错误: ${e.message}`)
    }
  }

  _cleanJsonString(str) {
    // 移除可能的 markdown 代码块标记
    let cleaned = str
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim()

    // 尝试提取第一个 { ... } 块
    const jsonStart = cleaned.indexOf('{')
    const jsonEnd = cleaned.lastIndexOf('}')

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1)
    }

    return cleaned
  }

  _fallbackResult(reason) {
    return {
      intent: 'knowledge_query',
      confidence: 0.3,
      params: {},
      reason: `LLM 分类失败，回退到知识问答: ${reason}`,
      source: 'fallback',
      error: reason
    }
  }
}

module.exports = {
  ClassifyPromptBuilder,
  ClassifyResultParser,
  INTENT_DESCRIPTIONS,
  FEW_SHOT_EXAMPLES
}
