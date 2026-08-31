/**
 * 意图识别模块 - 主入口
 * 
 * 三层意图识别架构：
 * Layer 1: 快速拦截层 (规则匹配, < 1ms)
 * Layer 2: 规则增强层 (多维特征评分, < 5ms)
 * Layer 3: LLM 语义层 (智谱API调用, ~200-500ms)
 */

const { getInstance: getLayer1 } = require('./layer1_fast')
const { getInstance: getLayer2 } = require('./layer2_enhanced')
const { getInstance: getLayer3 } = require('./layer3_llm')
const config = require('../config')
const logger = require('../utils/logger')

class IntentRecognizer {
  constructor(options = {}) {
    this.layer1 = options.layer1 || getLayer1()
    this.layer2 = options.layer2 || getLayer2()
    this.layer3 = options.layer3 || getLayer3()

    // 配置
    this.config = {
      // 是否启用各层
      enableLayer1: options.enableLayer1 !== false,
      enableLayer2: options.enableLayer2 !== false,
      enableLayer3: options.enableLayer3 !== false,

      // 强制使用 LLM（调试用）
      forceLLM: options.forceLLM || false,

      // 超时配置
      layer3Timeout: options.layer3Timeout || 8000 // LLM 层最大等待时间
    }

    // 统计
    this.stats = {
      totalRequests: 0,
      layer1Hits: 0,
      layer2Directs: 0,
      layer3Calls: 0,
      errors: 0,
      avgProcessingTime: 0
    }
  }

  /**
   * 意图识别主入口
   * @param {Object} userInput - 用户输入
   * @param {string} userInput.message - 用户消息文本
   * @param {Array} userInput.images - 图片列表（可选）
   * @param {Object} context - 对话上下文（可选）
   * @returns {Promise<Object>} 识别结果
   */
  async recognize(userInput, context = {}) {
    const startTime = Date.now()
    this.stats.totalRequests++

    const message = userInput.message || ''
    const images = userInput.images || []

    logger.debug('Intent', `开始识别: "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`)

    try {
      let result

      // ════════════════════════════════════════════
      // Layer 1: 快速拦截
      // ════════════════════════════════════════════
      if (this.config.enableLayer1 && !this.config.forceLLM) {
        const l1Result = this.layer1.intercept({
          message,
          images,
          ...userInput
        })

        if (l1Result) {
          this.stats.layer1Hits++
          result = this._buildFinalResult(l1Result, userInput, Date.now() - startTime)
          logger.info('Intent', `Layer1命中: ${result.intent} (${result.confidence}), 耗时=${result.processingTime}ms`)
          return result
        }
      }

      // ════════════════════════════════════════════
      // Layer 2: 规则增强
      // ════════════════════════════════════════════
      if (this.config.enableLayer2 && !this.config.forceLLM) {
        const l2Result = await this.layer2.classify(message, context)

        // 判断是否可以直接分发（不需要 LLM）
        if (!l2Result.needsLLM) {
          this.stats.layer2Directs++
          result = this._buildFinalResult(l2Result.bestCandidate, userInput, Date.now() - startTime, l2Result)
          result.isCompound = l2Result.isCompound
          result.subIntents = l2Result.subIntents
          logger.info('Intent', `Layer2直接分发: ${result.intent} (${result.confidence}), 复合=${l2Result.isCompound}, 耗时=${result.processingTime}ms`)
          return result
        }

        // Layer 2 结果不够确定，继续到 Layer 3
        // 但先保存 Layer 2 候选作为参考和降级备选
        const layer2Best = l2Result.bestCandidate
        const layer2Candidates = l2Result.candidates

        // ════════════════════════════════════════════
        // Layer 3: LLM 语义
        // ════════════════════════════════════════════
        if (this.config.enableLayer3) {
          this.stats.layer3Calls++

          // 把 context 转为 Layer3 期望的格式（包含 history 字段）
          const l3Context = {
            history: context.conversationHistory || context.history || [],
            prevIntent: context.prevIntent || null
          }

          // 设置超时保护
          const l3Promise = this.layer3.classify(message, {
            layer2Candidates,
            context: l3Context,
            hasImages: images.length > 0,
            layer2Best
          })

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('LLM 分类超时')), this.config.layer3Timeout)
          )

          let l3Result
          try {
            l3Result = await Promise.race([l3Promise, timeoutPromise])
          } catch (timeoutError) {
            logger.warn('Intent', `Layer3超时，降级到Layer2: ${timeoutError.message}`)
            l3Result = {
              intent: layer2Best?.intent || 'chit_chat',
              confidence: (layer2Best?.confidence || 0.3) * 0.85,
              params: layer2Best?.params || {},
              reason: `LLM超时，使用Layer2最佳候选`,
              source: 'layer3_timeout_fallback'
            }
          }

          result = this._buildFinalResult(l3Result, userInput, Date.now() - startTime)
          
          // 如果 LLM 返回的结果与 Layer 2 差异不大，保留复合意图信息
          if (layer2Candidates.length > 1) {
            result.layer2Alternatives = layer2Candidates.slice(1).map(c => ({
              intent: c.intent,
              confidence: c.confidence
            }))
          }

          logger.info(`Intent`, `Layer3完成: ${result.intent} (${result.confidence}), 来源=${l3Result.source}, 耗时=${result.processingTime}ms`)
          return result
        }

        // 不启用 Layer 3，直接使用 Layer 2 最佳候选
        this.stats.layer2Directs++
        result = this._buildFinalResult(layer2Best, userInput, Date.now() - startTime)
        logger.info('Intent', `Layer2最终(无L3): ${result.intent} (${result.confidence})`)
        return result
      }

      // 兜底：无任何层可用
      result = {
        intent: 'chit_chat',
        confidence: 0.1,
        params: {},
        reason: '所有识别层均不可用',
        source: 'fallback',
        processingTime: Date.now() - startTime
      }

      return result

    } catch (error) {
      this.stats.errors++
      logger.error('Intent', `识别过程出错: ${error.message}`)

      return {
        intent: 'chit_chat',
        confidence: 0.05,
        params: {},
        reason: `识别异常: ${error.message}`,
        source: 'error',
        error: error.message,
        processingTime: Date.now() - startTime
      }
    }
  }

  /**
   * 构建最终的统一结果格式
   */
  _buildFinalResult(sourceResult, userInput, processingTime, extraInfo = {}) {
    const base = {
      intent: sourceResult.intent,
      confidence: sourceResult.confidence,
      params: sourceResult.params || {},
      reason: sourceResult.reason || '',
      source: sourceResult.source || 'unknown',
      processingTime,
      timestamp: Date.now(),

      // 原始输入摘要
      inputSummary: {
        hasImages: (userInput.images || []).length > 0,
        imageCount: (userInput.images || []).length,
        messageLength: (userInput.message || '').length
      },

      // 元数据
      skipLowerLayers: sourceResult.skipLowerLayers || false,
      isCompound: false,
      subIntents: []
    }

    // 合并额外信息
    return { ...base, ...extraInfo }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const total = this.stats.totalRequests || 1
    return {
      ...this.stats,
      layer1HitRate: (this.stats.layer1Hits / total).toFixed(2),
      layer2DirectRate: (this.stats.layer2Directs / total).toFixed(2),
      layer3CallRate: (this.stats.layer3Calls / total).toFixed(2),
      errorRate: (this.stats.errors / total).toFixed(2),
      layer3Stats: this.layer3 ? this.layer3.getStats() : null
    }
  }

  /**
   * 重置统计
   */
  resetStats() {
    this.stats = {
      totalRequests: 0,
      layer1Hits: 0,
      layer2Directs: 0,
      layer3Calls: 0,
      errors: 0,
      avgProcessingTime: 0
    }
  }
}

// 单例导出
let instance = null
function getInstance(options = {}) {
  if (!instance) {
    instance = new IntentRecognizer(options)
  }
  return instance
}

module.exports = {
  IntentRecognizer,
  getInstance
}
