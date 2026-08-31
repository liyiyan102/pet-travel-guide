/**
 * 特征提取器 (Feature Extractor)
 * 从用户输入中提取多维特征向量，供意图评分引擎使用
 */

const { getInstance: getEntityRecognizer } = require('./entity_recognizer')
const logger = require('../utils/logger')

// ═══════════════════════════════════════════════════════════
// 正则模式库
// ═══════════════════════════════════════════════════════════
const PATTERNS = {
  // 时间/时长
  duration: /(\d+)\s*(天|日|晚|个?夜)/i,
  days: /(\d+)日游|(\d+)天游|玩(\d+)天|待(\d+)天/i,
  weekend: /周末|双休|周六周日|两天一夜|两日游/i,
  week: /一周|七天|7天|一星期/i,

  // 城市提取（泛化）
  cityExtract: /(去|到|在|从)([\u4e00-\u9fa5]{2,4})(市?旅行|市?游|市?玩|市?旅游|市?出行)/,
  cityGeneric: /([\u4e00-\u9fa5]{2,4})带(狗|猫|宠物)|([\u4e00-\u9fa5]{2,4})宠物友好/,

  // 位置搜索（附近/周边 + 场所类型）— POI搜索核心模式
  locationSearch: /附近|周边|周围|旁边|边上|附近有没有|周边有没有|周围有没有/,
  locationWithPlace: /(?:附近|周边|周围).*(?:餐厅|饭店|餐馆|酒店|民宿|公园|景点|景区|咖啡|美食|吃的|玩的|好玩|宠物|狗咖|猫咖|医院|美容|超市|商店)/,
  petFriendlyPlace: /宠物友好.*(?:餐厅|饭店|餐馆|酒店|民宿|公园|景点|景区|咖啡|场所|地方|店)|(?:餐厅|饭店|餐馆|酒店|民宿|公园|景点|景区|咖啡|场所|地方|店).*宠物友好/,

  // 数量
  number: /(\d+)\s*(个|家|只|条|天|晚|日|小时|景点|地方|餐厅|酒店)/i,
  few: /几个|一些|多家|多处|好几个/i,

  // 句式分析
  interrogative: /^(.*?)[？?]$|[吗呢吧啊呀]|什么|怎么|哪里|哪个|能否|可以吗|是否|几|多少|哪款/i,
  imperative: /帮我|请|推荐|规划|安排|制定|查找|搜索|查一下|给(我)?做个|设计(一个)?|策划(一次)?/i,
  declarative: /^(我想|我要|打算|准备|计划|希望|想要)/i,
  request: /能不能|可不可以|麻烦|希望|想要|需要|求/i,

  // 否定/疑问词
  negative: /不|没|无|别|不要|不能|不可以|不行|禁止|不准|无法|没有/i,
  uncertain: /可能|大概|也许|或许|好像|貌似|不确定|不知道|不太清楚/i,

  // 情感倾向
  positive: /好|棒|赞|喜欢|爱|开心|高兴|期待|兴奋|太好了|厉害|牛|不错|满意/i,
  negativeEmo: /不好|差|烦|讨厌|担心|害怕|焦虑|难过|失望|生气|着急/i,

  // 紧急程度
  urgent: /快|赶紧|马上|立刻|急忙|急死|救命|快点|火烧眉毛|十万火急/i,

  // 图片相关
  imageRelated: /图片|照片|截图|拍照|相册|上传|发图|发张图|看图|这张图|图中/i,

  // 行程相关
  itineraryRelated: /行程|路线|攻略|方案|计划|日程|安排|每天|第一天|第二天|第\d+天|上午|下午|晚上|景点|景区|打卡/i,

  // 食物相关
  foodRelated: /吃|喝|喂|食物|零食|水果|蔬菜|肉|饭|饲料|营养|饮食/i,

  // 健康相关
  healthRelated: /病|痛|痒|伤|药|医|诊|治|疗|康复|恢复|症状|不舒服|异常/i,

  // ═════════ 泛化模式：给LLM更多泛化空间 ════════

  // 行程规划泛化信号（中等置信度，交给LLM判断）
  tripPlanningSignal: /(?:去|到|想|打算|准备).*(?:[\u4e00-\u9fa5]{2,4}).*(?:玩|逛|旅游|旅行|出游|出行|溜达|转转)/,
  durationWithDest: /(?:[\u4e00-\u9fa5]{2,4}).*(?:\d+\s*(?:天|日|晚)|几天|多久|多长时间).*(?:游|之旅|之行|行程|攻略|路线)/,
  requestPlan: /(?:求|想要|需要|给我|帮忙|能不能).*(?:做个?|出个?|制定个?|规划个?).*(?:方案|计划|攻略|行程|路线|安排)/,

  // POI搜索泛化信号
  placeQuery: /(?:找|搜|查|寻|想找|想了解|想知道).*(?:地方|去处|地点|场所|店|馆|园|景区|景点|餐厅|酒店|民宿)/,
  petFriendlyQuery: /(?:允许|可以|能|让).*(?:带|携|牵|领).*(?:狗|猫|宠物|毛孩子).*(?:进|入|去|玩|逛|待|停留)/,
  recommendationQuery: /(?:推荐|介绍|说说|有哪些|有什么好的|哪里有好的).*(?:地方|去处|地点|场所|店|馆|园|景区|景点|餐厅|酒店|民宿|好玩|好吃|有趣)/,

  // 政策查询泛化信号
  policySignal: /(?:规定|政策|法规|条例|办法|要求|标准|法律|条文).*(?:养|狗|猫|宠物|动物|犬)/,
  permissionQuery: /(?:让不让|允不允许|能不能|可不可以|是否允许|要不要).*(?:进|入|带|带入|进入|上车|上船|登机|住|入住|吃饭|用餐)/,

  // 交通出行泛化信号
  transportSignal: /(?:坐|乘|搭|乘坐|开车|自驾|打车|叫车|包车).*(?:飞机|高铁|火车|大巴|汽车|地铁|公交|出租车|网约车|车)/,
  transportWithPet: /(?:带|携带|带着).*(?:宠物|狗|猫|动物).*(?:坐|乘|搭|乘坐|上|去|出行|出门|外出|旅行|旅游)/,

  // 食物安全泛化信号
  foodSafetySignal: /(?:狗|猫|宠物|狗狗|猫咪|小狗|小猫|我家.*|它|它们).*(?:吃了|吃下|误食|舔了|喝了|接触了).*(?:什么|啥|哪些|这个|那个|这些东西)/,

  // 出行准备泛化信号
  prepSignal: /(?:出门|出行|外出|旅行|旅游|出去玩|出去逛|回老家|返乡|跨省|长途).*(?:前|之前|要|需要|得|该|准备|预备|带上|拿上|收拾|打包)/,
}

// ═══════════════════════════════════════════════════════════
// 特征提取器类
// ═══════════════════════════════════════════════════════════
class FeatureExtractor {
  constructor() {
    this.entityRecognizer = getEntityRecognizer()
    this.patterns = PATTERNS
  }

  /**
   * 提取完整特征向量
   * @param {string} message - 用户消息
   * @param {Object} context - 对话上下文（可选）
   * @returns {Object} 特征向量
   */
  extract(message, context = {}) {
    if (!message || typeof message !== 'string') {
      return this._emptyFeatures()
    }

    const text = message.trim()
    return {
      // 1. 关键词特征（由外部传入或内部计算）
      keywords: this._extractKeywords(text),

      // 2. 正则特征
      regex: this._extractRegex(text),

      // 3. 实体特征
      entities: this.entityRecognizer.getSummary(text),

      // 4. 句式特征
      sentence: this._analyzeSentence(text),

      // 5. 文本统计特征
      stats: this._textStats(text),

      // 6. 上下文特征
      context: this._extractContext(context)
    }
  }

  /**
   * 提取关键词匹配分数（用于每个意图规则）
   * @param {string} text - 输入文本
   * @param {Array<string|RegExp>} keywords - 意图关键词列表（支持字符串和正则）
   * @param {Object} options - 匹配选项
   * @param {boolean} options.shortMessageOnly - 是否仅限短消息匹配
   * @param {number} options.maxLength - 短消息最大长度
   * @returns {Object} 匹配结果 { score, matches, method }
   */
  matchKeywords(text, keywords, options = {}) {
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return { score: 0, matches: [], method: 'none' }
    }

    // ═════════ 短消息限制检查（闲聊意图专用）═════════
    // 如果设置了 shortMessageOnly，超过 maxLength 的消息直接返回零分
    if (options.shortMessageOnly && options.maxLength) {
      const textLen = text.trim().length
      if (textLen > options.maxLength) {
        // 检查是否是完整短语精确匹配（如"谢谢""再见"等仍可匹配）
        const exactPhrases = keywords.filter(k => 
          typeof k === 'string' && k.length >= 2 && text.trim().toLowerCase() === k.toLowerCase()
        )
        if (exactPhrases.length === 0) {
          return { score: 0, matches: [], method: 'skipped_long_message' }
        }
      }
    }

    const lowerText = text.toLowerCase()
    let exactScore = 0
    let containScore = 0
    let regexScore = 0
    const exactMatches = []
    const containMatches = []
    const regexMatches = []

    for (const kw of keywords) {
      if (!kw) continue

      // ═════════ 正则表达式匹配（泛化模式）═════════
      if (kw instanceof RegExp) {
        try {
          if (kw.test(text)) {
            // 正则匹配给中等分数（交给LLM最终判断）
            const matchLen = (kw.exec(text) || [])[0]?.length || text.length
            const lenWeight = Math.min(matchLen / text.length, 1.2)
            regexScore += 0.5 * lenWeight // 泛化正则权重适中，不垄断
            regexMatches.push({ keyword: kw.toString(), type: 'regex', weight: lenWeight })
          }
        } catch (e) {
          // 忽略无效正则
        }
        continue
      }

      // ═════════ 字符串形式的正则模式（自动编译）═════════
      // 兼容 config.js 中写成的字符串正则，如 '附近.*餐馆'
      if (typeof kw === 'string' && (kw.includes('.*') || kw.includes('.+') || kw.includes('(?:') || kw.startsWith('^') || kw.endsWith('$'))) {
        try {
          const compiledRegex = new RegExp(kw)
          if (compiledRegex.test(text)) {
            const matchLen = (compiledRegex.exec(text) || [])[0]?.length || text.length
            const lenWeight = Math.min(matchLen / text.length, 1.2)
            regexScore += 0.45 * lenWeight // 字符串正则权重稍低
            regexMatches.push({ keyword: kw, type: 'compiled-regex', weight: lenWeight })
          }
        } catch (e) {
          // 编译失败，回退到普通字符串匹配
        }
        continue
      }

      // ═════════ 字符串精确匹配 ════════
      // 完全匹配（整个文本等于关键词）
      if (lowerText === kw.toLowerCase()) {
        exactScore += 1.0
        exactMatches.push({ keyword: kw, type: 'exact' })
        continue
      }

      // 包含匹配
      if (lowerText.includes(kw.toLowerCase())) {
        // 根据关键词长度给予权重（长词更精确）
        const lengthWeight = Math.min(kw.length / 4, 1.5) // 最长1.5倍权重
        containScore += 0.7 * lengthWeight
        containMatches.push({ keyword: kw, type: 'contain', weight: lengthWeight })
      }
    }

    // 综合得分：完全匹配 > 包含匹配 > 正则匹配
    const totalScore = Math.min(exactScore + containScore + regexScore, 1.0)

    return {
      score: totalScore,
      matches: [...exactMatches, ...containMatches, ...regexMatches],
      method: exactScore > 0 ? 'exact' : containScore > 0 ? 'contain' : regexScore > 0 ? 'regex' : 'none',
      exactCount: exactMatches.length,
      containCount: containMatches.length,
      regexCount: regexMatches.length
    }
  }

  /**
   * 计算意图综合评分
   * @param {Object} features - 特征向量
   * @param {Array<string>} keywords - 意图关键词
   * @param {Object} weights - 权重配置
   * @param {Object} ruleOptions - 规则选项（如 shortMessageOnly, maxLength）
   * @returns {number} 综合评分 0~1
   */
  calculateIntentScore(features, keywords, weights = {}, ruleOptions = {}) {
    const w = {
      keyword: weights.keyword || 0.40,
      entity: weights.entity || 0.25,
      pattern: weights.pattern || 0.20,
      context: weights.context || 0.10,
      sentence: weights.sentence || 0.05
    }

    // 1. 关键词得分（传入规则选项）
    const kwResult = this.matchKeywords(features.stats.originalText, keywords, {
      shortMessageOnly: ruleOptions.shortMessageOnly,
      maxLength: ruleOptions.maxLength
    })
    const keywordScore = kwResult.score

    // 如果被跳过（长消息的闲聊意图），直接返回低分
    if (kwResult.method === 'skipped_long_message') {
      return 0
    }

    // 2. 实体得分（根据实体与意图的关联度）
    const entityScore = this._calculateEntityScore(features.entities, keywords)

    // 3. 正则/模式得分
    const patternScore = this._calculatePatternScore(features.regex, keywords)

    // 4. 上下文得分
    const contextScore = features.context.relevanceScore

    // 5. 句式得分
    const sentenceScore = this._calculateSentenceScore(features.sentence, keywords)

    // 加权融合
    const totalScore =
      w.keyword * keywordScore +
      w.entity * entityScore +
      w.pattern * patternScore +
      w.context * contextScore +
      w.sentence * sentenceScore

    return Math.round(Math.min(Math.max(totalScore, 0), 1) * 1000) / 1000
  }

  // ────────────────────────────────────────────────────────
  // 内部方法
  // ────────────────────────────────────────────────────────

  _emptyFeatures() {
    return {
      keywords: [],
      regex: {},
      entities: {},
      sentence: {},
      stats: { length: 0, wordCount: 0 },
      context: {}
    }
  }

  _extractKeywords(text) {
    // 返回分词后的关键词（简化版：按常见分隔符）
    return text.split(/[\s，。！？、；：""''（）【】\n\r]+/).filter(w => w.length > 0)
  }

  _extractRegex(text) {
    const result = {}
    for (const [name, pattern] of Object.entries(this.patterns)) {
      const match = text.match(pattern)
      result[name] = match ? {
        matched: true,
        value: match[0] || match.slice(1).filter(Boolean).join(','),
        captures: match.slice(1).filter(Boolean),
        position: match.index
      } : { matched: false }
    }
    return result
  }

  _analyzeSentence(text) {
    return {
      isInterrogative: this.patterns.interrogative.test(text),
      isImperative: this.patterns.imperative.test(text),
      isDeclarative: this.patterns.declarative.test(text),
      hasNegative: this.patterns.negative.test(text),
      hasUncertain: this.patterns.uncertain.test(text),
      hasPositive: this.patterns.positive.test(text),
      hasNegativeEmo: this.patterns.negativeEmo.test(text),
      hasUrgent: this.patterns.urgent.test(text),
      endsWithQuestion: /[？?]$/.test(text.trim()),
      textLength: text.length,
      wordCount: text.length // 中文近似字数
    }
  }

  _textStats(text) {
    return {
      originalText: text,
      length: text.length,
      wordCount: text.length,
      isShort: text.length <= 10,
      isMedium: text.length > 10 && text.length <= 30,
      isLong: text.length > 30,
      hasImages: false, // 由外部设置
      hasEmoji: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(text)
    }
  }

  _extractContext(context) {
    if (!context || !context.history || context.history.length === 0) {
      return {
        hasHistory: false,
        prevIntent: null,
        prevMessage: null,
        relevanceScore: 0
      }
    }

    const lastTurn = context.history[context.history.length - 1]
    return {
      hasHistory: true,
      prevIntent: lastTurn.intent || null,
      prevMessage: lastTurn.userMessage || lastTurn.message || null,
      turnCount: context.history.length,
      relevanceScore: 0.3 // 默认上下文相关性
    }
  }

  /**
   * 计算实体得分
   */
  _calculateEntityScore(entities, keywords) {
    let score = 0

    // 如果有关键实体，加分
    if (entities.hasCity) score += 0.15
    if (entities.hasPet) score += 0.12
    if (entities.hasTransport) score += 0.12
    if (entities.hasSeason || entities.hasHoliday) score += 0.08
    if (entities.hasDangerousFood) score += 0.20
    if (entities.hasSafeFood) score += 0.08

    // 实体数量加分（多实体说明意图更明确）
    if (entities.entityCount >= 3) score += 0.10
    else if (entities.entityCount >= 2) score += 0.05

    return Math.min(score, 1.0)
  }

  /**
   * 计算正则/模式得分
   */
  _calculatePatternScore(regex, keywords) {
    let score = 0

    if (regex.duration && regex.duration.matched) score += 0.15
    if (regex.days && regex.days.matched) score += 0.12
    if (regex.weekend && regex.weekend.matched) score += 0.08
    if (regex.number && regex.number.matched) score += 0.06
    if (regex.itineraryRelated && regex.itineraryRelated.matched) score += 0.10
    if (regex.foodRelated && regex.foodRelated.matched) score += 0.10
    if (regex.healthRelated && regex.healthRelated.matched) score += 0.10
    if (regex.imageRelated && regex.imageRelated.matched) score += 0.08
    if (regex.urgent && regex.urgent.matched) score += 0.15

    // ═════════ POI 搜索模式加分（关键修复）═════════
    // "附近/周边" + 场所类型 → 强信号
    if (regex.locationSearch && regex.locationSearch.matched) score += 0.20
    // "附近+餐厅/酒店/公园..." 完整模式 → 非常强信号
    if (regex.locationWithPlace && regex.locationWithPlace.matched) score += 0.30
    // "宠物友好+场所类型" → 强信号
    if (regex.petFriendlyPlace && regex.petFriendlyPlace.matched) score += 0.25

    // ═════════ 泛化模式加分（给LLM泛化空间）═════════
    // 行程规划泛化信号
    if (regex.tripPlanningSignal && regex.tripPlanningSignal.matched) score += 0.18
    if (regex.durationWithDest && regex.durationWithDest.matched) score += 0.15
    if (regex.requestPlan && regex.requestPlan.matched) score += 0.16

    // POI搜索泛化信号
    if (regex.placeQuery && regex.placeQuery.matched) score += 0.18
    if (regex.petFriendlyQuery && regex.petFriendlyQuery.matched) score += 0.22
    if (regex.recommendationQuery && regex.recommendationQuery.matched) score += 0.16

    // 政策查询泛化信号
    if (regex.policySignal && regex.policySignal.matched) score += 0.18
    if (regex.permissionQuery && regex.permissionQuery.matched) score += 0.16

    // 交通出行泛化信号
    if (regex.transportSignal && regex.transportSignal.matched) score += 0.14
    if (regex.transportWithPet && regex.transportWithPet.matched) score += 0.18

    // 食物安全泛化信号
    if (regex.foodSafetySignal && regex.foodSafetySignal.matched) score += 0.20

    // 出行准备泛化信号
    if (regex.prepSignal && regex.prepSignal.matched) score += 0.16

    return Math.min(score, 1.0)
  }

  /**
   * 计算句式得分
   */
  _calculateSentenceScore(sentence, keywords) {
    let score = 0

    // 疑问句通常表示查询意图
    if (sentence.isInterrogative || sentence.endsWithQuestion) score += 0.10
    // 祈使句通常表示操作意图
    if (sentence.isImperative) score += 0.08
    // 陈述句通常表示信息提供
    if (sentence.isDeclarative) score += 0.05
    // 紧急程度
    if (sentence.hasUrgent) score += 0.15

    return Math.min(score, 1.0)
  }
}

// 单例导出
let instance = null
function getInstance() {
  if (!instance) {
    instance = new FeatureExtractor()
  }
  return instance
}

module.exports = {
  FeatureExtractor,
  getInstance,
  PATTERNS
}
