/**
 * 意图路由器 V2 - 三层意图识别架构
 * 
 * 架构：
 * Layer 1: 快速拦截层 (规则匹配, < 1ms) - 紧急/图片/闲聊/off-topic
 * Layer 2: 规则增强层 (多维特征评分, < 5ms) - 关键词+实体+正则+句式
 * Layer 3: LLM 语义层 (智谱API, ~200-500ms) - 复杂语义理解
 */

const config = require('../config')
const { logger } = require('../utils/logger')
const { getInstance: getIntentRecognizer } = require('../intent')

// ═══════════════════════════════════════════════════════════
// 子Agent注册表 — 某些意图需要分发到专门的子Agent处理
// ═══════════════════════════════════════════════════════════

const SUB_AGENT_REGISTRY = {
  generate_itinerary: {
    agentPath: '../subagents/travel_planner',
    description: '旅行攻略规划子Agent（含槽位提取/澄清/工具编排/会话管理/记忆）',
    lazyLoad: true  // 延迟加载，避免启动时加载所有模块
  },
  search_poi: {
    agentPath: '../subagents/poi_searcher',
    description: '地点查询子Agent（本地POI数据库+高德地图API双源检索）',
    lazyLoad: true
  }
}

class IntentRouterV2 {
  constructor() {
    // 新版：三层意图识别器
    this.intentRecognizer = null
    this.initialized = false

    // 兼容旧版：保留规则引用
    this.rules = config.routingRules

    // 子Agent实例缓存（延迟加载）
    this.subAgents = {}

    // 意图描述
    this.intentDescriptions = {
      generate_itinerary:    '生成完整行程规划',
      search_poi:            '搜索宠物友好场所',
      pet_advice:            '宠物出行建议',
      weather_check:         '天气查询',
      modify_itinerary:      '修改现有行程',
      transport_guide:       '交通出行流程指南',
      emergency_help:        '紧急求助',
      chit_chat:             '闲聊对话',
      image_analysis:        '图片内容分析',
      pet_breed_recognition: '宠物品种识别',
      scene_recognition:     '场景/景点识别',
      food_detection:        '食物安全性检测',
      knowledge_query:       '知识库问答',
      realtime_search:       '实时信息搜索',
      travel_tips:           '旅行攻略分享',
      policy_check:          '[Skill1] 城市宠物政策查询（养犬规定/禁养/地铁等）',
      travel_checklist:      '[Skill2] 宠物出行清单生成（证件/物品/注意事项）',
      breed_risk:            '[Skill3] 品种出行风险评估（能否入城/乘交通/风险等级）',
      off_topic:             '无关问题拦截'
    }
  }

  /**
   * 延迟初始化（避免循环依赖）
   */
  _ensureInitialized() {
    if (!this.initialized) {
      try {
        this.intentRecognizer = getIntentRecognizer()
        this.initialized = true
        logger.info('Router', '三层意图识别器初始化成功')
      } catch (e) {
        logger.warn('Router', `意图识别器初始化失败，降级到旧版路由: ${e.message}`)
        this.initialized = true // 标记已尝试，不再重复
      }
    }
    return this.intentRecognizer
  }

  /**
   * 路由用户输入到意图（主入口）
   * @param {Object} input - 用户输入 {message, images}
   * @param {Object} context - 对话上下文（可选）
   * @returns {Promise<Object>} 路由结果 {intent, confidence, params, ...}
   */
  async route(input, context = {}) {
    const { message = '', images = [] } = input

    logger.debug('Router', `路由分析: "${message?.substring(0, 50)}", 图片数: ${images.length}`)

    // 尝试使用新版三层路由
    const recognizer = this._ensureInitialized()

    if (recognizer) {
      try {
        const result = await recognizer.recognize(input, context)
        
        // 统一输出格式（兼容旧版接口）
        const normalizedResult = {
          intent: result.intent,
          confidence: result.confidence,
          params: result.params || {},
          source: result.source || 'unknown',
          
          // 新增字段
          isCompound: result.isCompound || false,
          subIntents: result.subIntents || [],
          reason: result.reason || '',
          processingTime: result.processingTime || 0,
          
          // 兼容旧版字段
          hasImage: (images || []).length > 0,
          needRealtime: result.intent === 'realtime_search',
          matchedKeywords: [] // 新版不使用关键词列表
        }

        logger.debug('Router', `新版路由结果: ${normalizedResult.intent} (${(normalizedResult.confidence * 100).toFixed(1)}%), 来源=${normalizedResult.source}, 复合=${normalizedResult.isCompound}`)

        return normalizedResult
      } catch (error) {
        logger.error('Router', `新版路由失败，降级到旧版: ${error.message}`)
        // 降级到旧版路由
      }
    }

    // 降级：使用旧版路由逻辑
    return this._legacyRoute(input)
  }

  /**
   * 旧版路由逻辑（降级备选）
   */
  _legacyRoute(input) {
    const { message = '', images = [] } = input

    // 1. 图片意图
    if (images && images.length > 0) {
      const imageIntent = this._routeImageIntent(message)
      if (imageIntent) return imageIntent
    }

    // 2. 文本意图
    return this._routeTextIntent(message)
  }

  _routeImageIntent(message) {
    const msgLower = (message || '').toLowerCase()

    if (['什么品种', '是什么狗', '是什么猫', '帮我看看', '识别', '鉴定'].some(k => msgLower.includes(k))) {
      return { intent: 'pet_breed_recognition', confidence: 0.95, hasImage: true }
    }
    if (['这是哪里', '这个景点', '这个地方', '拍照地点'].some(k => msgLower.includes(k))) {
      return { intent: 'scene_recognition', confidence: 0.9, hasImage: true }
    }
    if (['能吃吗', '有毒吗', '狗狗能吃', '猫咪能吃', '食物安全'].some(k => msgLower.includes(k))) {
      return { intent: 'food_detection', confidence: 0.92, hasImage: true }
    }
    if (!message || message.trim().length === 0) {
      return { intent: 'image_analysis', confidence: 0.85, hasImage: true }
    }
    return null
  }

  _routeTextIntent(message) {
    if (!message || message.trim().length === 0) {
      return { intent: 'chit_chat', confidence: 0.3, isEmpty: true }
    }

    const msgLower = message.toLowerCase()
    let bestMatch = { intent: 'chit_chat', confidence: 0.1 }

    for (const rule of this.rules) {
      if (rule.hasImage && !('needRealtime' in rule)) continue

      let score = 0
      const matchedKeywords = []

      for (const keyword of rule.keywords) {
        // 跳过 RegExp 对象（新版正则关键词由 feature_extractor 处理）
        if (keyword instanceof RegExp) {
          try {
            if (keyword.test(message)) {
              score += 0.5
              matchedKeywords.push(keyword.toString())
            }
          } catch (e) { /* ignore */ }
          continue
        }
        // 字符串关键词：兼容正则字符串模式（如 '附近.*餐馆'）
        if (typeof keyword === 'string') {
          // 含正则语法的字符串
          if (keyword.includes('.*') || keyword.includes('.+') || keyword.includes('(?:') || keyword.startsWith('^') || keyword.endsWith('$')) {
            try {
              const re = new RegExp(keyword)
              if (re.test(message)) {
                score += 0.5
                matchedKeywords.push(keyword)
              }
            } catch (e) { /* ignore */ }
            continue
          }
          // 普通字符串匹配
          if (msgLower.includes(keyword.toLowerCase())) {
            score += 1
            matchedKeywords.push(keyword)
          }
        }
      }

      if (score > 0) {
        const confidence = Math.min(0.95, (score / rule.keywords.length) * 0.8 + (rule.priority || 5) / 15)
        if (confidence > bestMatch.confidence) {
          bestMatch = {
            intent: rule.intent,
            confidence,
            priority: rule.priority,
            matchedKeywords,
            needRealtime: rule.needRealtime || false
          }
        }
      }
    }

    // 实时信息提升
    const realtimeKeywords = ['最新', '最近', '现在', '今天', '2026', '今年']
    if (realtimeKeywords.some(k => msgLower.includes(k)) && bestMatch.confidence < 0.7) {
      bestMatch.intent = 'realtime_search'
      bestMatch.confidence = Math.max(bestMatch.confidence, 0.6)
      bestMatch.needRealtime = true
    }

    // Off-topic 检测
    const hasAnyKeywordMatch = bestMatch.matchedKeywords && bestMatch.matchedKeywords.length > 0
    if (bestMatch.confidence < 0.4 && !hasAnyKeywordMatch) {
      const petKeywords = ['宠物', '狗', '猫', '犬', '遛', '旅行', '旅游', '出行', '行程', '攻略']
      const isRelated = petKeywords.some(k => msgLower.includes(k))
      
      if (!isRelated) {
        bestMatch = { intent: 'off_topic', confidence: 0.9, matchedKeywords: [] }
      }
    }

    logger.debug('Router', `旧版路由结果: ${bestMatch.intent} (${(bestMatch.confidence * 100).toFixed(1)}%)`)
    return bestMatch
  }

  /**
   * 获取意图的描述信息
   */
  getIntentDescription(intent) {
    return this.intentDescriptions[intent] || '未知意图'
  }

  /**
   * 获取路由统计信息
   */
  getStats() {
    const recognizer = this._ensureInitialized()
    return {
      version: recognizer ? 'v2-three-layer' : 'v1-legacy',
      initialized: !!recognizer,
      intentStats: recognizer ? recognizer.getStats() : null,
      subAgents: Object.keys(this.subAgents)
    }
  }

  // ════════════════════════════════════════════════════════
  // 子Agent分发
  // ════════════════════════════════════════════════════════

  /**
   * 判断某个意图是否需要子Agent处理
   */
  requiresSubAgent(intent) {
    return intent in SUB_AGENT_REGISTRY
  }

  /**
   * 获取子Agent实例（延迟加载）
   */
  async getSubAgent(intent) {
    const config = SUB_AGENT_REGISTRY[intent]
    if (!config) return null

    // 缓存命中
    if (this.subAgents[intent]) {
      return this.subAgents[intent]
    }

    try {
      logger.info('Router', `加载子Agent: ${intent} → ${config.agentPath}`)
      const AgentModule = require(config.agentPath)
      this.subAgents[intent] = AgentModule
      logger.info('Router', `子Agent加载成功: ${intent}`)
      return AgentModule
    } catch (error) {
      logger.error('Router', `子Agent加载失败 [${intent}]: ${error.message}`)
      return null
    }
  }

  /**
   * 分发请求到子Agent处理
   * 
   * @param {string} intent - 意图名称
   * @param {object} request - 完整的用户请求对象
   * @returns {object|null} 子Agent的处理结果，如果不需要子Agent则返回null
   */
  async dispatchToSubAgent(intent, request) {
    if (!this.requiresSubAgent(intent)) {
      return null
    }

    const subAgent = await this.getSubAgent(intent)
    if (!subAgent) {
      logger.warn('Router', `子Agent不可用，回退到主流程: ${intent}`)
      return { fallback: true, reason: 'sub_agent_unavailable' }
    }

    logger.info(`Router[SubAgent]`, `分发到子Agent: ${intent}`)
    
    try {
      const result = await subAgent.process(request)
      
      return {
        fromSubAgent: true,
        agentName: intent,
        ...result
      }
    } catch (error) {
      logger.error(`Router[SubAgent]`, `子Agent执行失败 [${intent}]: ${error.message}`)
      return {
        fallback: true,
        error: error.message
      }
    }
  }

  /**
   * 直接分发到指定子Agent（跳过意图识别）
   * 用于外部直接调用场景，如前端"攻略定制"按钮直接触发
   * 
   * @param {string} intent - 意图名称（如 'generate_itinerary', 'search_poi'）
   * @param {object} request - 用户请求对象
   * @returns {object} 子Agent的处理结果
   */
  async dispatchDirect(intent, request) {
    if (!this.requiresSubAgent(intent)) {
      logger.warn('Router', `直接分发失败: ${intent} 未在注册表中`)
      return { error: true, message: `意图 ${intent} 没有对应的子Agent` }
    }

    const subAgent = await this.getSubAgent(intent)
    if (!subAgent) {
      logger.warn('Router', `直接分发: 子Agent不可用 [${intent}]`)
      return { error: true, message: `子Agent加载失败` }
    }

    logger.info(`Router[Direct]`, `跳过意图识别，直接分发: ${intent}`)

    // 子Agent的 process 方法解构 { text: userMessage }，但外层传入的是 { message }
    // 这里做兼容映射，确保 text 字段存在
    const subAgentRequest = {
      ...request,
      text: request.text || request.message || '',
      message: request.message || request.text || ''
    }
    
    try {
      const result = await subAgent.process(subAgentRequest)
      return {
        fromSubAgent: true,
        agentName: intent,
        directCall: true,
        ...result
      }
    } catch (error) {
      logger.error(`Router[Direct]`, `子Agent执行失败 [${intent}]: ${error.message}`)
      return {
        error: true,
        message: error.message
      }
    }
  }
}

module.exports = new IntentRouterV2()
