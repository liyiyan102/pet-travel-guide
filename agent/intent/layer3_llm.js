/**
 * Layer 3: LLM 语义层 (LLM Semantic Layer)
 * 
 * 触发条件：
 * - Layer 2 置信度 < 阈值
 * - Layer 2 Top-2 候选差距过小（冲突）
 * - Layer 2 无候选结果
 * 
 * 能力：
 * - 调用智谱 GLM-4-flash 进行语义理解
 * - 支持Few-shot示例
 * - 结果缓存复用
 * - 失败降级策略
 */

const { ClassifyPromptBuilder, ClassifyResultParser } = require('./prompts/classify_prompt')
const { getInstance: getCache } = require('./intent_cache')
const config = require('../config')
const logger = require('../utils/logger')

// 使用现有的智谱客户端
let zhipuClient = null

function getZhipuClient() {
  if (!zhipuClient) {
    try {
      zhipuClient = require('../llm/zhipu_client')
    } catch (e) {
      logger.error('Layer3', `无法加载智谱客户端: ${e.message}`)
      return null
    }
  }
  return zhipuClient
}

class Layer3LLMClassifier {
  constructor(options = {}) {
    this.model = options.model || 'glm-4-flash'
    this.cache = options.cache || getCache()
    this.promptBuilder = new ClassifyPromptBuilder()
    this.resultParser = new ClassifyResultParser()

    // 配置
    this.config = {
      maxRetries: options.maxRetries || 2,
      timeout: options.timeout || 10000, // 10秒超时
      fallbackStrategy: options.fallbackStrategy || 'USE_LAYER2_BEST',
      minConfidence: options.minConfidence || 0.4 // LLM 返回的最低置信度
    }

    // 统计
    this.stats = {
      totalCalls: 0,
      cacheHits: 0,
      llmCalls: 0,
      fallbacks: 0,
      errors: 0,
      avgLatency: 0
    }
  }

  /**
   * 执行 LLM 意图分类
   * @param {string} message - 用户消息
   * @param {Object} options - 分类选项
   * @param {Array} options.layer2Candidates - Layer 2 候选（作为参考）
   * @param {Object} options.context - 对话上下文
   * @param {boolean} options.hasImages - 是否有图片
   * @param {Object} options.layer2Best - Layer 2 最佳候选（用于降级）
   * @returns {Promise<Object>} 分类结果
   */
  async classify(message, options = {}) {
    const startTime = Date.now()
    const {
      layer2Candidates = [],
      context = {},
      hasImages = false,
      layer2Best = null
    } = options

    this.stats.totalCalls++

    // ── 1. 检查缓存 ──
    const cachedResult = this.cache.get(message)
    if (cachedResult) {
      this.stats.cacheHits++
      logger.debug('Layer3', `缓存命中`)
      return {
        ...cachedResult,
        source: 'layer3_cache',
        processingTime: Date.now() - startTime
      }
    }

    // ── 2. 构建 Prompt ──
    const prompt = this.promptBuilder.build({
      userMessage: message,
      hasImages,
      layer2Candidates,
      context
    })

    // ── 3. 调用 LLM ──
    let llmResult
    try {
      llmResult = await this._callLLM(prompt)
      this.stats.llmCalls++
    } catch (error) {
      logger.warn('Layer3', `LLM 调用失败: ${error.message}`)
      this.stats.errors++

      // 降级处理
      const fallbackResult = this._getFallback(layer2Best, error.message)
      this.stats.fallbacks++
      return {
        ...fallbackResult,
        processingTime: Date.now() - startTime
      }
    }

    // ── 4. 解析结果 ──
    const parsedResult = this.resultParser.parse(llmResult)

    // ── 5. 校验和修正 ──
    const validatedResult = this._validateResult(parsedResult)

    // ── 6. 写入缓存 ──
    this.cache.set(message, validatedResult)

    // 更新统计
    const latency = Date.now() - startTime
    this.stats.avgLatency = (
      (this.stats.avgLatency * (this.stats.llmCalls - 1) + latency) / this.stats.llmCalls
    )

    logger.info('Layer3', `LLM分类完成: intent=${validatedResult.intent}, confidence=${validatedResult.confidence}, 耗时=${latency}ms`)

    return {
      ...validatedResult,
      source: 'layer3_llm',
      processingTime: latency
    }
  }

  // ══════════════════════════════════════════════════════════
  // 内部方法
  // ══════════════════════════════════════════════════════════

  /**
   * 调用智谱 API
   */
  async _callLLM(prompt) {
    const client = getZhipuClient()
    if (!client) {
      throw new Error('智谱客户端不可用')
    }

    let lastError = null
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // 使用 chat 方法（zhipu_client 的实际接口）
        const response = await client.chat({
          messages: [{ role: 'user', content: prompt }],
          model: this.model,
          temperature: 0.1,  // 低温度，更确定性的输出
          maxTokens: 500
        })

        // chat 方法可能返回字符串或对象
        if (typeof response === 'string') {
          return response
        }
        return response.content || response.text || response.response || ''
      } catch (error) {
        lastError = error
        logger.warn(`Layer3`, `LLM调用第${attempt + 1}次失败: ${error.message}`)

        if (attempt < this.config.maxRetries) {
          // 指数退避等待
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)))
        }
      }
    }

    throw lastError || new Error('LLM 调用失败')
  }

  /**
   * 校验和修正 LLM 返回的结果
   */
  _validateResult(result) {
    // 确保意图在允许列表中
    const validIntents = Object.values(config.intents)
    if (!validIntents.includes(result.intent)) {
      logger.warn('Layer3', `LLM返回未知意图: ${result.intent}, 降级为 chit_chat`)
      result.intent = 'chit_chat'
      result.confidence = Math.min(result.confidence, 0.3)
      result.reason += ' [已修正为有效意图]'
    }

    // 确保置信度在合理范围
    result.confidence = Math.min(Math.max(result.confidence, 0), 1)

    return result
  }

  /**
   * 降级策略：LLM 失败时的回退方案
   */
  _getFallback(layer2Best, errorMessage) {
    switch (this.config.fallbackStrategy) {
      case 'USE_LAYER2_BEST':
        if (layer2Best && layer2Best.confidence >= this.config.minConfidence) {
          logger.info('Layer3', `降级使用 Layer2 最佳候选: ${layer2Best.intent}`)
          return {
            intent: layer2Best.intent,
            confidence: layer2Best.confidence * 0.9, // 降级后略微降低置信度
            params: layer2Best.params || {},
            reason: `LLM失败，降级到Layer2最佳候选 (${errorMessage})`,
            source: 'layer3_fallback_layer2'
          }
        }
        // Layer2 也不够好 → 降到闲聊
        return {
          intent: 'chit_chat',
          confidence: 0.25,
          params: {},
          reason: `LLM失败且无可用Layer2候选，降级到闲聊 (${errorMessage})`,
          source: 'layer3_fallback_chitchat'
        }

      case 'CHIT_CHAT':
      default:
        return {
          intent: 'chit_chat',
          confidence: 0.2,
          params: {},
          reason: `LLM失败，直接降级到闲聊 (${errorMessage})`,
          source: 'layer3_fallback_chitchat'
        }
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      cacheStats: this.cache.getStats(),
      model: this.model,
      config: this.config
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.cache.cleanup()
  }
}

// 单例导出
let instance = null
function getInstance(options = {}) {
  if (!instance) {
    instance = new Layer3LLMClassifier(options)
  }
  return instance
}

module.exports = {
  Layer3LLMClassifier,
  getInstance
}
