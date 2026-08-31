/**
 * 槽位管理器 — 旅行攻略子Agent核心
 * 
 * 职责：
 * 1. 定义所有槽位类型（必填/可选/上下文/默认）
 * 2. 从用户输入中提取槽位值（正则 + LLM混合）
 * 3. 槽位验证（冲突检测、合理性检查）
 * 4. 槽位填充状态判断
 */

const { logger } = require('../../utils/logger')
const { extractor: llmSlotExtractor } = require('./llm_slot_extractor')

// ═══════════════════════════════════════════════════════════
// 槽位定义 — 按 P0/P1/P2 分级（V2.5）
// P0 核心：destination、petType — 缺失时通常需要澄清
// P1 关键：days、origin、transport — 可推断；无法推断时一次性询问
// P2 可选：budget、preference、petAge、petSize等 — 不阻塞生成，有默认值
// ═══════════════════════════════════════════════════════════

const SLOT_DEFINITIONS = {
  // ══ P0 核心槽位（缺失时需要澄清）══
  destination: {
    name: '到达城市/目的地',
    level: 'P0',
    type: 'city_or_attraction',
    required: true,
    priority: 1,
    readinessWeight: 30,
    aliases: ['目的地', '去哪里', '去哪', '到哪', '去', '到', '前往', '目标城市', '想去', '打算去', '准备去'],
    examples: ['北京', '上海', '杭州西湖', '西安兵马俑', '成都大熊猫基地'],
    validation: { pattern: /^[\u4e00-\u9fa5]{2,20}$/, minLength: 2, maxLength: 30 },
    clarificationPrompt: '您想去哪里旅游？',
    conflictMessage: '目的地信息有冲突，请确认具体想去哪里？'
  },

  petType: {
    name: '宠物类型',
    level: 'P0',
    type: 'pet_category',
    required: true,
    priority: 2,
    readinessWeight: 25,
    aliases: ['宠物', '什么宠物', '狗', '猫', '狗狗', '猫咪', '毛孩子', '动物', '带什么', '带的什么'],
    examples: ['狗', '猫', '金毛', '泰迪', '柴犬', '英短', '布偶猫', '哈士奇'],
    validation: { allowedTypes: ['狗', '犬', '猫', '犬类', '猫科', '其他'] },
    clarificationPrompt: '带什么宠物出门呀？🐶🐱',
    conflictMessage: '宠物类型信息不一致，请确认一下'
  },

  // ══ P1 关键槽位（可推断；无法推断时一次性询问）══
  days: {
    name: '游玩天数',
    level: 'P1',
    type: 'duration',
    required: true,
    priority: 3,
    readinessWeight: 20,
    aliases: ['几天', '多少天', '玩几天', '待几天', '住几晚', '行程天数', '时长', '几日游', '天'],
    examples: ['1天', '2天', '3天', '一周', '五天四晚', '三天两夜', '周末', '短期'],
    validation: { min: 0.5, max: 30, unit: '天' },
    clarificationPrompt: '计划玩几天呢？',
    conflictMessage: '行程天数不太合理，一般建议1-7天的行程，是否需要调整？'
  },

  origin: {
    name: '出发城市',
    level: 'P1',
    type: 'city',
    required: true,
    priority: 4,
    readinessWeight: 15,
    aliases: ['出发地', '从哪里', '从哪出发', '起点', '起始城市', '目前在', '我在', '我住'],
    examples: ['北京', '上海', '广州', '深圳', '成都', '杭州'],
    validation: { pattern: /^[\u4e00-\u9fa5]{2,10}(市|县|区)?$/, minLength: 2, maxLength: 20 },
    clarificationPrompt: '从哪个城市出发？',
    conflictMessage: '出发地信息有矛盾，请确认一下'
  },

  transport: {
    name: '出行方式',
    level: 'P1',
    type: 'transport_mode',
    required: true,
    priority: 5,
    readinessWeight: 10,
    aliases: ['自驾', '高铁', '飞机', '火车', '公共交通', '怎么去', '交通方式', '怎么走'],
    examples: ['自驾', '高铁', '飞机', '火车', '公共交通'],
    validation: { allowedValues: ['自驾', '高铁', '飞机', '火车', '公共交通', '未指定'] },
    clarificationPrompt: '打算怎么去？（自驾/高铁/飞机）',
    defaultValue: '未指定',
    conflictMessage: '出行方式信息有冲突，请确认一下'
  },

  // ══ P2 可选槽位（有默认值，不阻塞规划）══
  petCount: {
    name: '宠物数量',
    level: 'P2',
    type: 'number',
    required: false,
    priority: 6,
    readinessWeight: 0,
    aliases: ['几只', '多少只', '几条', '几只宠物', '几个', '数量', '一只', '两只', '1只', '2只'],
    examples: ['1只', '2只', '一', '二', '两只狗', '三只猫'],
    validation: { min: 1, max: 10 },
    clarificationPrompt: '一共带几只宠物？',
    defaultValue: 1,
    conflictMessage: '宠物数量似乎不对，请确认一下'
  },

  budget: {
    name: '预算',
    level: 'P2',
    type: 'price_range',
    required: false,
    priority: 7,
    readinessWeight: 0,
    aliases: ['预算', '多少钱', '花费', '费用', '大概花多少', '价位', '消费水平', '多少钱以内'],
    examples: ['1000元', '2000-3000', '5000左右', '穷游', '经济型', '豪华', '不限预算'],
    validation: { min: 100, max: 100000, unit: '元' },
    clarificationPrompt: '大概有多少预算呢？',
    conflictMessage: '预算信息不合理'
  },

  preference: {
    name: '出行偏好',
    level: 'P2',
    type: 'preference_list',
    required: false,
    priority: 8,
    readinessWeight: 0,
    aliases: ['偏好', '喜欢', '不喜欢', '风格', '类型', '主题', '特色', '要求'],
    examples: ['自然风光', '历史人文', '美食', '亲子友好', '文艺', '刺激好玩'],
    validation: { maxItems: 5 },
    clarificationPrompt: '有什么特别的偏好或要求吗？',
    conflictMessage: '偏好信息有冲突',
    multiValue: true
  },

  departureDate: {
    name: '出发日期',
    level: 'P2',
    type: 'date',
    required: false,
    priority: 9,
    readinessWeight: 0,
    aliases: ['什么时候', '几号', '哪天', '出发时间', '几月几号', '周几', '节假日', '假期'],
    examples: ['明天', '下周六', '8月1日', '国庆节', '暑假', '这个周末'],
    validation: { futureOnly: true },
    clarificationPrompt: '什么时候出发呢？',
    conflictMessage: '出发日期信息不合理'
  },

  petBreed: {
    name: '宠物品种',
    level: 'P2',
    type: 'pet_breed',
    required: false,
    priority: 10,
    readinessWeight: 0,
    aliases: ['品种', '什么品种', '叫什么', '哪个品种'],
    examples: ['金毛', '泰迪', '布偶', '英短', '哈士奇', '柯基'],
    clarificationPrompt: '是什么品种的宠物呢？'
  },

  petSize: {
    name: '宠物体型',
    level: 'P2',
    type: 'pet_size',
    required: false,
    priority: 11,
    readinessWeight: 0,
    aliases: ['大型', '中型', '小型', '体型', '多大', '大小'],
    examples: ['小型（10kg以下）', '中型（10-25kg）', '大型（25kg以上）'],
    clarificationPrompt: '宠物是什么体型？（小型/中型/大型）'
  },

  travelMode: {
    name: '出行方式(兼容旧字段)',
    level: 'P2',
    type: 'transport_mode',
    required: false,
    priority: 12,
    readinessWeight: 0,
    aliases: ['transport', '自驾', '高铁', '飞机'],
    examples: ['自驾', '高铁'],
    clarificationPrompt: '打算怎么去？',
    defaultValue: '未指定'
  }
}


// ═══════════════════════════════════════════════════════════
// 正则提取规则库
// ═══════════════════════════════════════════════════════════

const EXTRACTION_RULES = {
  // 城市提取规则（优先级顺序）
  city: [
    // 从X去/到Y
    /从([\u4e00-\u9fa5]{2,4}?(?:市|省|自治区)?).{0,15}(?:去|到|往|前往|自驾)([\u4e00-\u9fa5]{2,6}?(?:市|省|自治区)?)/i,
    // 去/到/往 + 城市
    /(?:去|到|往|前往|目标|想去|打算去|准备去)([\u4e00-\u9fa5]{2,8}?(?:市|省)?)/i,
    // 常见城市名
    /(北京|上海|广州|深圳|成都|杭州|重庆|西安|南京|武汉|长沙|天津|苏州|青岛|厦门|大理|丽江|三亚|桂林|拉萨|哈尔滨|大连|沈阳|郑州|昆明|贵阳|福州|合肥|南昌|太原|石家庄|兰州|银川|西宁|乌鲁木齐|呼和浩特|海口|宁波|无锡|温州|东莞|佛山|珠海|中山|惠州|烟台|威海|洛阳|开封|张家界|黄山|九寨沟|敦煌|呼伦贝尔|常州|湖州|南通|嘉兴|扬州|徐州|芜湖|泉州|漳州|保定|临沂|赣州|唐山|柳州|绵阳)/g,
    // 我在/目前在 + 城市
    /(?:我在|目前|当前|住在|家在)([\u4e00-\u9fa5]{2,8}?(?:市|省)?)/i
  ],

  // 天数提取规则
  duration: [
    /(一|二|三|四|五|六|七|八|九|十|\d+(?:\.\d+)?)(?:天|日|晚|夜)/i,
    /(\d+)天(\d+)晚/i,
    /(一|二|三|四|五|六|七|八|九|十|\d+)[\s]*日?游/i,
    /周末|短期|一周|半个月|一个月/i,
    /(?:玩|待|住|逛)(一|二|三|四|五|六|七|八|九|十|\d+(?:\.\d+)?)(?:天|日)/i
  ],

  // 数量提取规则
  number: [
    /(\d+)\s*(?:只|条|个|位|头|匹)/i,
    /(一|二|三|四|五|六|七|八|九|十)\s*(?:只|条|个)/i,
    /(一|两|三|四|五|六|七|八|九|十|[123456789])\s*只\s*[狗猫]/i
  ],

  // 宠物类型规则
  pet_type: [
    /带(?:着?|上)?([\u4e00-\u9fa5]{1,6}?(?:猫|狗|犬|兔|仓鼠|龙猫))/,
    /(?:有|养|我的|我家)([\u4e00-\u9fa5]{1,6}?(?:猫|狗|犬|兔))/,
    /(金毛|拉布拉多|泰迪|贵宾|柯基|哈士奇|阿拉斯加|边牧|边境牧羊犬|柴犬|比熊|博美|吉娃娃|雪纳瑞|约克夏|马尔济斯|法斗|法国斗牛犬|巴哥|斗牛犬|萨摩耶|德牧|德国牧羊犬|罗威纳|杜宾|松狮|秋田|布偶|英短|美短|橘猫|蓝猫)/
  ],

  // 预算规则
  budget: [
    /预算[\s:：]?(\d+)/,
    /(\d+)元(?:以内|左右|以下)?(?:的预算)?/,
    /(穷游|经济型|豪华型|中档)/
  ],

  // 日期规则
  date: [
    /(\d{1,2})月(\d{1,2})(?:日|号)/,
    /(下周[一二三四五六日天]|本周[一二三四五六日天])/,
    /(明天|后天|大后天)/,
    /(国庆|五一|元旦|春节|暑假|寒假|周末)/
  ],

  // 交通方式规则（V2.5 新增）
  transport: [
    /(?:自驾|开车|驾车|自己开)/,
    /(?:高铁|动车|高速列车)/,
    /(?:飞机|航班|坐飞机)/,
    /(?:火车|普通列车|绿皮车)/,
    /(?:公共交通|地铁|公交)/
  ],

  // 偏好规则
  preference: [
    /(?:想)?(?:看|玩|去|体验)([\u4e00-\u9fa5]{2,8}?(?:风景|文化|美食|历史|古迹|景点|公园|自然))/,
    /(自然风光|历史文化|美食|亲子|文艺|小众|网红|打卡|遛狗|户外)/
  ]
}

// 中文数字转阿拉伯数字
const DURATION_TEXT_MAP = {
  '周末': 2, '短期': 2, '一周': 7, '半个月': 15, '一个月': 30
}

const CN_NUM_MAP = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
  '两': 2
}

function cnToNum(cn) {
  if (typeof cn === 'number') return cn
  if (/^\d/.test(cn)) return parseFloat(cn)
  if (cn === '十') return 10
  if (cn.startsWith('十')) return 10 + (CN_NUM_MAP[cn[1]] || 0)
  if (cn.endsWith('十')) return (CN_NUM_MAP[cn[0]] || 0) * 10
  if (cn.includes('十')) {
    const parts = cn.split('十')
    return (CN_NUM_MAP[parts[0]] || 0) * 10 + (CN_NUM_MAP[parts[1]] || 0)
  }
  return CN_NUM_MAP[cn] || 0
}


class SlotManager {
  constructor() {
    this.slots = { ...SLOT_DEFINITIONS }
    this.extractionRules = EXTRACTION_RULES
  }

  /**
   * 获取槽位定义
   */
  getSlotDefinition(slotName) {
    return this.slots[slotName] || null
  }

  /**
   * 获取所有必填槽位
   */
  getRequiredSlots() {
    return Object.entries(this.slots)
      .filter(([, def]) => def.required)
      .map(([key, def]) => ({ name: key, displayName: def.name, ...def, name: key, displayName: def.name }))
  }

  /**
   * 获取可选槽位
   */
  getOptionalSlots() {
    return Object.entries(this.slots)
      .filter(([, def]) => !def.required)
      .map(([name, def]) => ({ name, ...def }))
  }

  /**
   * 核心方法：从用户输入中提取所有槽位
   * 
   * @param {string} query - 用户原始输入
   * @param {object} context - 会话上下文（历史消息、用户档案等）
   * @returns {object} 提取结果 { slots, missing, conflicts, ambiguities }
   */
  extractSlots(query, context = {}) {
    const result = {
      slots: {},
      confidence: {},
      missing: [],
      conflicts: [],
      ambiguities: [],
      extractionMethod: {} // 记录每个槽位的提取方式：regex | llm | context | default
    }

    const normalizedQuery = query.trim()

    // Step 0: 先从 context.existingSlots 填充已有信息（避免重复提问）
    if (context.existingSlots) {
      const existing = context.existingSlots
      if (existing.destination) {
        result.slots.destination = existing.destination
        result.confidence.destination = 0.95
        result.extractionMethod.destination = 'context'
      }
      if (existing.days) {
        result.slots.days = existing.days
        result.confidence.days = 0.95
        result.extractionMethod.days = 'context'
      }
      if (existing.origin) {
        result.slots.origin = existing.origin
        result.confidence.origin = 0.95
        result.extractionMethod.origin = 'context'
      }
      if (existing.travelMode) {
        result.slots.travelMode = existing.travelMode
        result.confidence.travelMode = 0.95
        result.extractionMethod.travelMode = 'context'
      }
      if (existing.budget) {
        result.slots.budget = existing.budget
        result.confidence.budget = 0.95
        result.extractionMethod.budget = 'context'
      }
      if (existing.petType) {
        result.slots.petType = existing.petType
        result.confidence.petType = 0.95
        result.extractionMethod.petType = 'context'
      }
      if (existing.petBreed) {
        result.slots.petBreed = existing.petBreed
        result.confidence.petBreed = 0.95
        result.extractionMethod.petBreed = 'context'
      }
      if (existing.petSize) {
        result.slots.petSize = existing.petSize
        result.confidence.petSize = 0.95
        result.extractionMethod.petSize = 'context'
      }
      if (existing.petCount) {
        result.slots.petCount = existing.petCount
        result.confidence.petCount = 0.95
        result.extractionMethod.petCount = 'context'
      }
      logger.info('SlotManager', `从 existingSlots 继承: ${JSON.stringify(result.slots)}`)
    }

    // Step 1: 正则快速提取（会覆盖 existingSlots 中的值——新信息优先）
    this._extractByRegex(normalizedQuery, result)

    // Step 2: 上下文继承
    this._inheritFromContext(context, result)

    // Step 3: 默认值填充
    this._applyDefaults(result)

    // Step 4: 验证与冲突检测
    this._validateAndDetectConflicts(result, query)

    // Step 5: 判断缺失的必填槽位
    this._checkMissingRequired(result)

    logger.info('SlotManager', `槽位提取完成: ${JSON.stringify(result.slots)}, 缺失: [${result.missing.join(', ')}]`)

    return result
  }

  /**
   * ═══ 混合抽取主入口（方案C：LLM结构化抽取为主，正则为快路径+兜底）═══
   *
   * 策略：
   * 1. 快路径：正则已覆盖全部必填槽位 且 无困难语言信号 → 直接返回（零LLM成本）
   * 2. 主路径：存在缺失或困难表达（省略/指代/比较级/口语）→ 一次LLM结构化抽取补齐
   * 3. 兜底：LLM 失败/超时 → 保留正则结果，流程不中断
   *
   * 槽位状态管理（merge/readiness/missing）完全保留，仅替换"理解"环节。
   */
  async extractSlotsHybrid(query, context = {}, llmClient = null, options = {}) {
    // Step 1: 正则快路径（同时作为兜底结果）
    const result = this.extractSlots(query, context)

    // Step 1.5: 字段规范化 — 旧字段 travelMode 归一到标准 P1 槽位 transport
    // （存量问题：_extractTransport 写 travelMode，而必填校验查 transport）
    if (result.slots.travelMode && !result.slots.transport) {
      result.slots.transport = result.slots.travelMode
      result.confidence.transport = result.confidence.travelMode
      result.extractionMethod.transport = result.extractionMethod.travelMode
    }

    if (!llmClient) return result // 无LLM客户端 → 纯正则模式（降级兼容）

    // Step 2: 判断是否需要 LLM
    const requiredFilled = this.getRequiredSlots().every(({ name }) => result.slots[name])
    const hasHardSignals = this._hasHardLanguage(query)

    if (requiredFilled && !hasHardSignals) {
      logger.info('SlotManager', `正则已覆盖必填槽位且无困难表达，跳过LLM (hard=${hasHardSignals})`)
      return result
    }

    logger.info('SlotManager', `启用LLM结构化抽取 (必填齐=${requiredFilled}, 缺失=${result.missing.map(m => m.name).join(',') || '无'}, 困难表达=${hasHardSignals})`)

    // Step 3: LLM 结构化抽取（主路径）
    const llmContext = {
      existingSlots: {
        ...result.slots,
        ...(context.existingSlots || {})
      },
      recentHistory: context.recentHistory || []
    }
    const llmSlots = await llmSlotExtractor.extract(query, llmContext, llmClient, options)

    // Step 4: 合并 —— LLM 结果补充/覆盖正则，但用户确认(user_confirm)的值不可覆盖
    if (llmSlots) { // null=失败(已降级)，{}=无新信息，均保留正则结果
      for (const [slotName, value] of Object.entries(llmSlots)) {
        const isUserConfirmed = result.extractionMethod[slotName] === 'user_confirm'
        if (isUserConfirmed) continue
        result.slots[slotName] = value
        result.confidence[slotName] = 0.85
        result.extractionMethod[slotName] = 'llm'
      }

      // Step 5: 用合并结果重新验证
      this._validateAndDetectConflicts(result, query)
      this._checkMissingRequired(result)
    } else {
      result.degraded = true // 标记本轮为正则兜底（可供监控统计降级率）
      logger.warn('SlotManager', 'LLM抽取失败，已降级为纯正则结果')
    }

    return result
  }

  /**
   * 困难语言信号检测：正则覆盖不了、需要LLM语义理解的表达
   */
  _hasHardLanguage(query) {
    const HARD_PATTERNS = [
      /跟上次|还是上次|上次|同样|一样|照旧/,          // 历史指代
      /毛孩子|它们|他俩|他们|它/,                       // 宠物代词
      /多待|少玩|多玩|比|再[加减多]|延长|缩短/,          // 比较级/增量
      /就这|先这样|听你的|你定|随便|都行/,              // 口语省略
      /吧$|呢$|啊$/,                                    // 语气词结尾的模糊表达
      /刚|最近|上个月/,                                 // 时间相对指代
    ]
    // 短输入（如"杭州吧"、"3天"）语义不完整，交给LLM更稳
    const isShort = query.trim().length <= 6
    return isShort || HARD_PATTERNS.some(p => p.test(query))
  }

  /**
   * 使用 LLM 进行槽位提取（当正则覆盖不足时）
   * @deprecated 已由 extractSlotsHybrid 取代，保留兼容旧调用方
   */
  async extractSlotsWithLLM(query, context = {}, llmClient) {
    // 先用正则做快速提取
    const regexResult = this.extractSlots(query, context)

    // 如果必填槽位都已提取，无需调用 LLM
    const requiredSlots = this.getRequiredSlots().map(s => s.name)
    const filledRequired = requiredSlots.filter(s => regexResult.slots[s])

    if (filledRequired.length === requiredSlots.length) {
      logger.info('SlotManager', '正则已覆盖全部必填槽位，跳过LLM')
      return regexResult
    }

    // 构建 Prompt 让 LLM 补充提取
    const prompt = this._buildExtractionPrompt(query, regexResult, context)
    
    try {
      const llmResponse = await llmClient.chat([
        { role: 'system', content: '你是一个专业的旅行意图理解助手。从用户输入中提取结构化信息，严格按JSON格式返回。' },
        { role: 'user', content: prompt }
      ], { temperature: 0.1 })

      const llmSlots = this._parseLLMResponse(llmResponse)

      // 合并结果（LLM 结果优先级低于已确认的正则结果）
      for (const [slotName, value] of Object.entries(llmSlots)) {
        if (!regexResult.slots[slotName] && value) {
          regexResult.slots[slotName] = value
          regexResult.confidence[slotName] = 0.85
          regexResult.extractionMethod[slotName] = 'llm'
          logger.info('SlotManager', `LLM补充槽位: ${slotName}=${value}`)
        }
      }

      // 重新验证
      this._validateAndDetectConflicts(regexResult, query)
      this._checkMissingRequired(regexResult)

      return regexResult
    } catch (error) {
      logger.error('SlotManager', `LLM槽位提取失败: ${error.message}`)
      return regexResult // 降级为纯正则结果
    }
  }

  // ════════════════════════════════════════════════════════
  // 内部方法：正则提取
  // ════════════════════════════════════════════════════════

  _extractByRegex(query, result) {
    // 提取城市（出发地 + 目的地）
    this._extractCities(query, result)

    // 提取天数
    this._extractDuration(query, result)

    // 提取宠物信息
    this._extractPetInfo(query, result)

    // 提取预算
    this._extractBudget(query, result)

    // 提取日期
    this._extractDate(query, result)

    // 提取交通方式
    this._extractTransport(query, result)

    // 提取偏好
    this._extractPreference(query, result)
  }

  _extractCities(query, result) {
    const rules = this.extractionRules.city

    // 优先级1：先尝试"从X去/到 Y"模式（一次性同时确定 origin + destination）
    const fromToPattern = /从([\u4e00-\u9fa5]{2,4}?(?:市|省|自治区)?).{0,15}(?:去|到|往|前往|自驾)([\u4e00-\u9fa5]{2,6}?(?:市|省|自治区)?)/i
    const fromToMatch = query.match(fromToPattern)
    if (fromToMatch) {
      // 提取 origin（"从"和动词之间的城市）
      const origin = fromToMatch[1].replace(/(?:市|省|自治区)$/, '').replace(/(?:出发|走|自驾|驱车)$/, '')
      const destination = fromToMatch[2].replace(/(?:市|省|自治区)$/, '').replace(/(?:玩|旅游|游|景点|攻略)$/, '')
      if (!result.slots.origin) {
        result.slots.origin = origin
        result.confidence.origin = 0.95
        result.extractionMethod.origin = 'regex'
      }
      if (!result.slots.destination) {
        result.slots.destination = destination
        result.confidence.destination = 0.95
        result.extractionMethod.destination = 'regex'
      }
      if (result.slots.origin && result.slots.destination) return
    }

    // 优先级2：常见城市列表（无"从"字修饰的城市名）
    const commonCityMatch = query.match(new RegExp(rules[2].source, 'g'))
    if (commonCityMatch) {
      const allCities = [...new Set(commonCityMatch)]
      // 检查是否有"从/在/住/家"前缀
      for (const city of allCities) {
        const beforeCity = query.substring(0, query.indexOf(city))
        const isAfterFrom = /(?:从|在|住|家)$/.test(beforeCity)
        const isAfterToVerb = /(?:去|到|往|前往|想做|准备去|打算去|想)$/.test(beforeCity)

        if (isAfterFrom && !result.slots.origin) {
          result.slots.origin = city.replace(/市$/, '')
          result.confidence.origin = 0.92
          result.extractionMethod.origin = 'regex'
        } else if (city !== result.slots.origin && !result.slots.destination) {
          // 任何非 origin 的城市都设为 destination（包括首位的城市）
          result.slots.destination = city.replace(/市$/, '').replace(/(?:玩|旅游|游|景点|攻略)$/, '')
          result.confidence.destination = isAfterToVerb || query.indexOf(city) === 0 ? 0.92 : 0.80
          result.extractionMethod.destination = 'regex'
        }
      }
      if (result.slots.origin && result.slots.destination) return
    }

    // 优先级3：通用模式（"去X"/"X日游"等）
    for (let i = 0; i < rules.length; i++) {
      if (i === 2) continue  // 跳过城市列表，已处理
      const rule = rules[i]
      const matches = query.match(rule)
      if (matches) {
        const cityMatch = matches[1]
        if (cityMatch) {
          const beforeCity = query.substring(0, query.indexOf(cityMatch))
          const isAfterFrom = /(?:从|在|住|家)$/.test(beforeCity)

          if (isAfterFrom && !result.slots.origin) {
            result.slots.origin = cityMatch.replace(/市$/, '')
            result.confidence.origin = 0.90
            result.extractionMethod.origin = 'regex'
          } else if (!result.slots.destination) {
            result.slots.destination = cityMatch.replace(/市$/, '').replace(/(?:玩|旅游|游|景点|攻略)$/, '')
            result.confidence.destination = 0.85
            result.extractionMethod.destination = 'regex'
          }
        }
      }
    }
  }

  _extractDuration(query, result) {
    const rules = this.extractionRules.duration

    for (const rule of rules) {
      const match = query.match(rule)
      if (match) {
        let days
        
        if (match[0] && DURATION_TEXT_MAP[match[0]]) {
          days = DURATION_TEXT_MAP[match[0]]
        } else if (match[1] && match[2]) {
          // X天Y晚 → 取天数
          days = cnToNum(match[1])
        } else if (match[1]) {
          days = cnToNum(match[1])
        }

        if (days && days > 0 && days <= 30) {
          result.slots.days = days
          result.confidence.days = 0.93
          result.extractionMethod.days = 'regex'
          
          // 冲突检测：1天玩太多景点
          if (days <= 1 && /(\d{2,})个/.test(query)) {
            const attractionCount = parseInt(query.match(/(\d{2,})个/)?.[1] || 0)
            if (attractionCount > 8) {
              result.conflicts.push({
                slot: 'days',
                type: 'unreasonable',
                message: `${days}天内游览${attractionCount}个景点可能过于紧张`,
                suggestion: `建议延长行程或精简景点至${Math.ceil(attractionCount / 3)}个`
              })
            }
          }
          return
        }
      }
    }
  }

  _extractPetInfo(query, result) {
    // 提取宠物类型
    const petRules = this.extractionRules.pet_type
    for (const rule of petRules) {
      const match = query.match(rule)
      if (match) {
        const pet = match[1] || match[0]
        // 归类为狗/猫
        if (/狗|犬|金毛|拉布拉多|哈士奇|泰迪|贵宾|柴犬|柯基|法斗|英斗|巴哥|萨摩耶|德牧|边牧|阿拉斯加|松狮|比熊|博美|雪纳瑞|约克夏|马尔济斯|吉娃娃|腊肠|藏獒|比特|罗威纳|田园犬/i.test(pet)) {
          result.slots.petType = '狗'
        } else if (/猫|英短|美短|布偶|缅因|波斯|暹罗|蓝猫|加菲|折耳|无毛|狸花|田园猫/i.test(pet)) {
          result.slots.petType = '猫'
        } else {
          result.slots.petType = pet
        }
        result.confidence.petType = 0.94
        result.extractionMethod.petType = 'regex'
        break
      }
    }

    // 提取数量
    const numRules = this.extractionRules.number
    for (const rule of numRules) {
      const match = query.match(rule)
      if (match) {
        let count = match[1]
        if (CN_NUM_MAP[count]) {
          count = CN_NUM_MAP[count]
        } else {
          count = parseInt(count)
        }
        if (count >= 1 && count <= 10) {
          result.slots.petCount = count
          result.confidence.petCount = 0.91
          result.extractionMethod.petCount = 'regex'
          break
        }
      }
    }
  }

  _extractBudget(query, result) {
    const rules = this.extractionRules.budget
    for (const rule of rules) {
      const match = query.match(rule)
      if (match) {
        if (match[1] && match[2]) {
          // 范围
          result.slots.budget = `${match[1]}-${match[2]}元`
        } else if (match[0] && /穷游|经济|实惠|便宜/.test(match[0])) {
          result.slots.budget = '经济型(500-1500元)'
        } else if (match[0] && /中等|舒适/.test(match[0])) {
          result.slots.budget = '中等(1500-4000元)'
        } else if (match[0] && /豪华|高端|奢侈|不差钱|不限/.test(match[0])) {
          result.slots.budget = '豪华(4000元以上)'
        } else if (match[1]) {
          result.slots.budget = `${match[1]}元左右`
        }
        result.confidence.budget = 0.88
        result.extractionMethod.budget = 'regex'
        break
      }
    }
  }

  _extractDate(query, result) {
    const rules = this.extractionRules.date
    for (const rule of rules) {
      const match = query.match(rule)
      if (match) {
        result.slots.departureDate = match[0]
        result.confidence.departureDate = 0.89
        result.extractionMethod.departureDate = 'regex'
        break
      }
    }
  }

  _extractTransport(query, result) {
    const rules = this.extractionRules.transport
    for (const rule of rules) {
      const match = query.match(rule)
      if (match) {
        let mode = match[0]
        // 规范化
        if (/自驾|开车|驾车|自己开车|私家车/.test(mode)) mode = '自驾'
        else if (/高铁|动车/.test(mode)) mode = '高铁'
        else if (/飞机|航空|航班|飞/.test(mode)) mode = '飞机'
        else if (/大巴|客车|长途汽车|巴士/.test(mode)) mode = '大巴'
        else if (/公共交通|公交|地铁/.test(mode)) mode = '公共交通'
        
        result.slots.travelMode = mode
        result.confidence.travelMode = 0.90
        result.extractionMethod.travelMode = 'regex'
        break
      }
    }
  }

  _extractPreference(query, result) {
    const rules = this.extractionRules.preference
    const preferences = []

    for (const rule of rules) {
      const matches = query.match(rule)
      if (matches) {
        preferences.push(matches[0])
      }
    }

    if (preferences.length > 0) {
      result.slots.preference = [...new Set(preferences)] // 去重
      result.confidence.preference = 0.85
      result.extractionMethod.preference = 'regex'
    }
  }

  // ════════════════════════════════════════════════════════
  // 内部方法：上下文继承
  // ════════════════════════════════════════════════════════

  _inheritFromContext(context, result) {
    if (!context) return

    // 从历史对话继承
    if (context.historySlots) {
      for (const [slotName, value] of Object.entries(context.historySlots)) {
        if (!result.slots[slotName] && value) {
          result.slots[slotName] = value
          result.confidence[slotName] = 0.75
          result.extractionMethod[slotName] = 'context'
          logger.info(`SlotManager`, `从上下文继承槽位: ${slotName}`)
        }
      }
    }

    // 从用户档案获取宠物信息
    if (context.userProfile?.petInfo && !result.slots.petType) {
      result.slots.petType = context.userProfile.petInfo.type || context.userProfile.petInfo.species
      result.confidence.petType = 0.80
      result.extractionMethod.petType = 'profile'
      
      if (!result.slots.petCount && context.userProfile.petInfo.count) {
        result.slots.petCount = context.userProfile.petInfo.count
        result.confidence.petCount = 0.80
        result.extractionMethod.petCount = 'profile'
      }
    }

    // 从定位获取出发地
    if (context.location && !result.slots.origin) {
      result.slots.origin = context.location.city || context.location.name
      result.confidence.origin = 0.70
      result.extractionMethod.origin = 'location'
    }
  }

  _applyDefaults(result) {
    // 默认宠物数量为1
    if (!result.slots.petCount) {
      result.slots.petCount = this.slots.petCount.defaultValue || 1
      result.confidence.petCount = 0.5 // 低置信度，标记为默认值
      result.extractionMethod.petCount = 'default'
    }
  }

  // ════════════════════════════════════════════════════════
  // 内部方法：验证与冲突检测
  // ════════════════════════════════════════════════════════

  _validateAndDetectConflicts(result, originalQuery) {
    const { slots } = result

    // 天数合理性检查
    if (slots.days) {
      const def = this.slots.days.validation
      if (slots.days < def.min || slots.days > def.max) {
        result.conflicts.push({
          slot: 'days',
          type: 'out_of_range',
          message: `天数${slots.days}超出合理范围(${def.min}-${def.max}天)`,
          suggestion: `建议调整为${slots.days < 3 ? '2-5天' : '7-14天'}`
        })
      }
    }

    // 预算合理性检查
    if (slots.budget && slots.days) {
      const budgetNum = parseInt(slots.budget)
      if (budgetNum && budgetNum < slots.days * 200) {
        result.conflicts.push({
          slot: 'budget',
          type: 'insufficient',
          message: `预算${slots.budget}对于${slots.days}天行程可能偏紧`,
          suggestion: `建议最低预算约${slots.days * 300}元`
        })
      }
    }

    // 歧义检测：常见歧义地名
    const ambiguousLocations = this._detectAmbiguity(slots.destination, originalQuery)
    if (ambiguousLocations) {
      result.ambiguities.push({
        slot: 'destination',
        value: slots.destination,
        candidates: ambiguousLocations,
        message: `"${slots.destination}"可能有多个含义，请确认`
      })
    }
  }

  _detectAmbiguity(destination, query) {
    if (!destination) return null

    // 已知歧义词典
    const AMBIGUITY_DICT = {
      '长城': ['八达岭长城', '慕田峪长城', '居庸关长城', '金山岭长城'],
      '故宫': ['北京故宫博物院', '南京故宫(旧址)', '沈阳故宫'],
      '西湖': ['杭州西湖', '惠州西湖', '福州西湖'],
      '天池': ['长白山天池', '新疆天山天池'],
      '黄山': ['安徽黄山风景区', '香港太平山(俗称)'],
      '泰山': ['山东泰安泰山', '其他同名山'],
      '熊猫基地': ['成都大熊猫繁育研究基地', '都江堰熊猫谷', '碧峰峡熊猫基地'],
      '古镇': ['乌镇', '周庄', '西塘', '凤凰古城', '丽江古城', '平遥古城'],
      '海边': ['青岛', '大连', '三亚', '厦门', '北海', '舟山', '威海'],
      '温泉': ['汤山温泉', '华山温泉', '从化温泉', '腾冲热海', '鞍山千山温泉']
    }

    for (const [key, candidates] of Object.entries(AMBIGUITY_DICT)) {
      if (destination.includes(key) || key.includes(destination)) {
        return candidates
      }
    }

    return null
  }

  _checkMissingRequired(result) {
    const requiredSlots = this.getRequiredSlots()
    
    for (const { name } of requiredSlots) {
      if (!result.slots[name]) {
        const slotDef = this.slots[name] || {}
        result.missing.push({
          name,
          definition: slotDef,
          prompt: slotDef.clarificationPrompt || `请提供${slotDef.name || name}信息`
        })
      }
    }
  }

  // ════════════════════════════════════════════════════════
  // 内部方法：LLM 辅助提取
  // ════════════════════════════════════════════════════════

  _buildExtractionPrompt(query, regexResult, context) {
    const missingFields = regexResult.missing.map(m => m.name).join(', ')
    const alreadyExtracted = Object.entries(regexResult.slots)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')

    return `请从以下用户输入中提取旅行规划所需的槽位信息。

【用户输入】
"${query}"

【正则已提取的信息】
${alreadyExtracted || '(无)'}

【需要补充的字段】
${missingFields || '所有字段'}

【槽位定义】
- origin(出发城市): 用户出发的城市
- destination(到达城市): 目的地城市或具体景点
- days(游玩天数): 数字，单位天
- petType(宠物类型): 狗/猫/其他
- petCount(宠物数量): 数字，1-10
- budget(预算): 金额或档位(可选)
- preference(偏好): 旅游偏好标签列表(可选)
- departureDate(出发日期): 时间描述(可选)
- travelMode(出行方式): 自驾/高铁/飞机等(可选)

请严格按以下JSON格式返回，无法确定的字段设为null：
\`\`\`json
{
  "origin": "...",
  "destination": "...",
  "days": ...,
  "petType": "...",
  "petCount": ...,
  "budget": "...",
  "preference": [...],
  "departureDate": "...",
  "travelMode": "..."
}
\`\`\``
  }

  _parseLLMResponse(response) {
    try {
      // 尝试提取 JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        // 清理空值
        Object.keys(parsed).forEach(key => {
          if (parsed[key] === null || parsed[key] === '' || parsed[key] === 'null') {
            delete parsed[key]
          }
        })
        return parsed
      }
    } catch (e) {
      logger.warn('SlotManager', `LLM响应解析失败: ${e.message}`)
    }
    return {}
  }

  /**
   * 更新槽位值（用于澄清后用户补充信息）
   */
  updateSlot(slotName, value, result) {
    if (this.slots[slotName]) {
      result.slots[slotName] = value
      result.confidence[slotName] = 1.0 // 用户明确提供，最高置信度
      result.extractionMethod[slotName] = 'user_confirm'
      
      // 从缺失列表移除
      const idx = result.missing.findIndex(m => m.name === slotName)
      if (idx !== -1) {
        result.missing.splice(idx, 1)
      }
      
      logger.info(`SlotManager`, `槽位更新: ${slotName}=${value}`)
      return true
    }
    return false
  }

  /**
   * 生成槽位状态摘要（用于日志和调试）
   */
  getSlotSummary(result) {
    const lines = []
    lines.push('=== 槽位状态 ===')
    
    for (const [name, def] of Object.entries(this.slots)) {
      const value = result.slots[name]
      const conf = result.confidence[name] || 0
      const method = result.extractionMethod[name] || '-'
      const status = value ? `[✓]` : (def.required ? `[✗ 缺失]` : `[○ 可选]`)
      
      lines.push(`${status} ${def.name}(${name}): ${value || '(空)'} | 置信度:${(conf*100).toFixed(0)}% | 来源:${method}`)
    }
    
    if (result.conflicts.length > 0) {
      lines.push('\n--- 冲突 ---')
      result.conflicts.forEach(c => {
        lines.push(`  ⚠️ ${c.slot}: ${c.message}`)
      })
    }
    
    if (result.ambiguities.length > 0) {
      lines.push('\n--- 歧义 ---')
      result.ambiguities.forEach(a => {
        lines.push(`  ❓ ${a.slot}: ${a.message}`)
        lines.push(`     选项: ${a.candidates.join(' / ')}`)
      })
    }
    
    return lines.join('\n')
  }

  /**
   * 用合并后的槽位重新判断缺失（V2.5 新增）
   * 在 Slot Merge 之后调用，用完整的合并结果重新检查
   */
  recheckMissing(result) {
    result.missing = []
    this._checkMissingRequired(result)
  }

  /**
   * 计算 Planning Readiness Score（V2.5 方案5）
   * 各字段权重：destination 30、petType 25、days 20、origin 15、transport 10
   * ≥70：可以开始基础规划
   * ≥90：具备完整条件
   * <70：需要澄清关键缺失信息
   */
  calculateReadiness(slots) {
    let score = 0
    for (const [key, def] of Object.entries(SLOT_DEFINITIONS)) {
      if (!def.readinessWeight) continue
      const val = slots[key]
      if (val !== null && val !== undefined && val !== '' && val !== '未指定') {
        score += def.readinessWeight
      }
    }
    return Math.min(score, 100)
  }

  /**
   * 生成 TravelBrief（V2.5 方案6）
   * 统一规划上下文，为 POI/政策/天气/品种风险/LLM 提供单一数据来源
   */
  buildTravelBrief(slots) {
    return {
      origin: slots.origin || null,
      destination: slots.destination || null,
      days: slots.days || null,
      petType: slots.petType || null,
      petCount: slots.petCount || 1,
      petBreed: slots.petBreed || null,
      petSize: slots.petSize || null,
      transport: slots.transport || '未指定',
      budget: slots.budget || null,
      preference: slots.preference || [],
      departureDate: slots.departureDate || null,
      // 元信息
      readinessScore: this.calculateReadiness(slots),
      builtAt: new Date().toISOString()
    }
  }
}

const instance = new SlotManager()
instance.SLOT_DEFINITIONS = SLOT_DEFINITIONS  // 导出供 clarification.js 使用
module.exports = instance
