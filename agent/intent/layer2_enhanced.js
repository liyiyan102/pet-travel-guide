/**
 * Layer 2: 规则增强层 (Enhanced Rules Layer)
 * 
 * 核心能力：
 * - 多维度特征提取（关键词 + 正则 + 实体 + 句式）
 * - 加权评分引擎
 * - Top-N 候选生成
 * - 上下文消歧
 */

const { getInstance: getFeatureExtractor } = require('./feature_extractor')
const config = require('../config')
const logger = require('../utils/logger')

class Layer2EnhancedRules {
  constructor() {
    this.featureExtractor = getFeatureExtractor()
    this.routingRules = config.routingRules || []

    // 评分配置
    this.scoringConfig = {
      topN: 3,                    // 返回候选数量
      minConfidence: 0.15,        // 最低置信度阈值
      directRouteThreshold: 0.75, // 高于此值直接分发
      conflictThreshold: 0.12,    // Top-1 和 Top-2 差距小于此值视为冲突

      // 特征权重
      weights: {
        keyword: 0.40,
        entity: 0.25,
        pattern: 0.20,
        context: 0.10,
        sentence: 0.05
      }
    }

    // 上下文消歧规则
    this.disambiguationRules = [
      // 行程规划后的短追问 → 可能是修改意图
      {
        condition: (ctx) => ctx.prevIntent === 'generate_itinerary',
        action: (candidates) => this._boostCandidate(candidates, 'modify_itinerary', 0.25),
        description: '行程规划后追问 → 倾向于修改'
      },
      // 食物安全后续追问
      {
        condition: (ctx) => ctx.prevIntent === 'food_detection',
        action: (candidates) => this._boostCandidate(candidates, 'food_detection', 0.35),
        description: '食物检测后续 → 继续归入食物检测'
      },
      // 有城市+时长实体 → 强力提升 generate_itinerary
      {
        condition: (features) => features.entities && features.entities.hasCity && features.regex && features.regex.duration,
        action: (candidates) => this._boostCandidate(candidates, 'generate_itinerary', 0.20),
        description: '城市+时长 → 提升行程规划'
      },
      // 有具体品种 → 提升 breed_risk
      {
        condition: (features) => (features.entities && (features.entities.hasDogBreed || features.entities.hasCatBreed)),
        action: (candidates) => this._boostCandidate(candidates, 'breed_risk', 0.15),
        description: '有具体品种 → 提升品种风险'
      },
      // 有危险食物实体 → 提升 food_detection
      {
        condition: (features) => features.entities && features.entities.hasDangerousFood,
        action: (candidates) => this._boostCandidate(candidates, 'food_detection', 0.25),
        description: '危险食物 → 提升食物检测'
      }
    ]
  }

  /**
   * 执行规则增强识别
   * @param {string} message - 用户消息
   * @param {Object} context - 对话上下文
   * @returns {Object} 识别结果
   */
  async classify(message, context = {}) {
    const startTime = Date.now()

    // 1. 提取特征
    const features = this.featureExtractor.extract(message, context)

    // 2. 对每个意图规则进行评分
    const scoredIntents = this._scoreAllIntents(features)

    // 3. 排序并取 Top-N
    const candidates = this._selectTopN(scoredIntents)

    // 4. 上下文消歧
    const disambiguatedCandidates = this._applyDisambiguation(candidates, features, context)

    // 5. 判断是否需要 LLM
    const bestCandidate = disambiguatedCandidates[0]
    const needsLLM = this._needsLLM(disambiguatedCandidates, features)

    const result = {
      candidates: disambiguatedCandidates,
      bestCandidate,
      needsLLM,
      confidence: bestCandidate ? bestCandidate.confidence : 0,
      features,
      layer: 'layer2',
      processingTime: Date.now() - startTime,

      // 复合意图检测
      isCompound: this._isCompoundIntent(disambiguatedCandidates),
      subIntents: disambiguatedCandidates.length > 1
        ? disambiguatedCandidates.slice(1).map(c => c.intent)
        : []
    }

    logger.debug('Layer2', `分类完成: 最佳=${bestCandidate?.intent}(${bestCandidate?.confidence}), 耗时=${result.processingTime}ms`)

    return result
  }

  // ══════════════════════════════════════════════════════════
  // 评分核心方法
  // ══════════════════════════════════════════════════════════

  /**
   * 对所有意图规则评分
   */
  _scoreAllIntents(features) {
    const scored = []

    for (const rule of this.routingRules) {
      if (!rule.intent || !rule.keywords) continue

      // 跳过图片专属意图（无图片时不匹配）
      if (rule.hasImage && !features.stats.hasImages) continue

      // 构建规则选项（用于闲聊等特殊意图的长度限制）
      const ruleOptions = {
        shortMessageOnly: rule.shortMessageOnly || false,
        maxLength: rule.maxLength || undefined
      }

      const score = this.featureExtractor.calculateIntentScore(
        features,
        rule.keywords,
        this.scoringConfig.weights,
        ruleOptions
      )

      if (score >= this.scoringConfig.minConfidence) {
        scored.push({
          intent: rule.intent,
          confidence: score,
          priority: rule.priority || 5,
          keywords: rule.keywords,
          hasImage: rule.hasImage || false,
          features: {
            keywordMatch: this.featureExtractor.matchKeywords(
              features.stats.originalText,
              rule.keywords,
              ruleOptions
            )
          }
        })
      }
    }

    return scored
  }

  /**
   * 选择 Top-N 候选
   */
  _selectTopN(scoredIntents) {
    // 先按置信度降序，同分按优先级升序（优先级数字越大越重要）
    return scoredIntents
      .sort((a, b) => {
        if (Math.abs(b.confidence - a.confidence) > 0.001) {
          return b.confidence - a.confidence
        }
        return (b.priority || 5) - (a.priority || 5)
      })
      .slice(0, this.scoringConfig.topN)
  }

  /**
   * 应用上下文消歧规则
   */
  _applyDisambiguation(candidates, features, context) {
    if (!candidates || candidates.length === 0) return candidates

    let adjusted = [...candidates]

    for (const rule of this.disambiguationRules) {
      let shouldApply = false

      // 检查条件
      if (typeof rule.condition === 'function') {
        shouldApply = rule.condition(context, features)
      }

      if (shouldApply && typeof rule.action === 'function') {
        adjusted = rule.action(adjusted)
        logger.debug('Layer2', `应用消歧规则: ${rule.description}`)
      }
    }

    return adjusted
  }

  /**
   * 判断是否需要 LLM 层
   */
  _needsLLM(candidates, features) {
    if (!candidates || candidates.length === 0) {
      return true // 无候选，必须走 LLM
    }

    const best = candidates[0]
    const second = candidates[1]

    // 置信度足够高且领先明显 → 不需要 LLM
    if (best.confidence >= this.scoringConfig.directRouteThreshold) {
      if (!second || (best.confidence - second.confidence) >= this.scoringConfig.conflictThreshold) {
        return false
      }
    }

    // 短文本且置信度低 → 需要 LLM 消歧
    if (features.sentence.isShort && best.confidence < 0.6) {
      return true
    }

    // 默认：置信度不够高，交给 LLM
    return best.confidence < this.scoringConfig.directRouteThreshold
  }

  /**
   * 检测复合意图
   */
  _isCompoundIntent(candidates) {
    if (!candidates || candidates.length < 2) return false

    const best = candidates[0]
    const second = candidates[1]

    // 第二候选置信度也较高 → 可能为复合意图
    return second.confidence >= 0.35
  }

  /**
   * 提升指定候选的分数
   */
  _boostCandidate(candidates, intentName, boostAmount) {
    return candidates.map(c => {
      if (c.intent === intentName) {
        return {
          ...c,
          confidence: Math.min(c.confidence + boostAmount, 1.0),
          boosted: true,
          boostAmount
        }
      }
      return c
    })
  }
}

// 单例导出
let instance = null
function getInstance() {
  if (!instance) {
    instance = new Layer2EnhancedRules()
  }
  return instance
}

module.exports = {
  Layer2EnhancedRules,
  getInstance
}
