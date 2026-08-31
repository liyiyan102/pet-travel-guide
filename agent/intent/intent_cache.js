/**
 * 意图识别结果缓存 (Intent Cache)
 * 用于缓存 LLM 分类结果，相似问题复用，减少 API 调用
 */

const logger = require('../utils/logger')

class IntentCache {
  constructor(options = {}) {
    this.cache = new Map()
    this.maxEntries = options.maxEntries || 1000
    this.ttl = options.ttl || 3600000 // 默认1小时
    this.similarityThreshold = options.similarityThreshold || 0.85

    // 统计
    this.stats = { hits: 0, misses: 0, evictions: 0 }
  }

  /**
   * 生成缓存 key（基于文本标准化）
   * @param {string} text - 原始文本
   * @returns {string} 标准化后的 key
   */
  _normalizeKey(text) {
    if (!text) return ''
    return text
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[，。！？、；：""''（）【】\n\r]/g, '')
      .trim()
  }

  /**
   * 计算简单相似度（基于编辑距离）
   */
  _similarity(a, b) {
    if (!a || !b) return 0
    if (a === b) return 1

    const lenA = a.length
    const lenB = b.length

    if (Math.abs(lenA - lenB) > Math.max(lenA, lenB) * 0.5) {
      return 0 // 长度差异太大，直接返回0
    }

    // 简化的编辑距离计算
    const matrix = []
    for (let i = 0; i <= lenA; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= lenB; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= lenA; i++) {
      for (let j = 1; j <= lenB; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        )
      }
    }

    const distance = matrix[lenA][lenB]
    const maxLen = Math.max(lenA, lenB)
    return 1 - distance / maxLen
  }

  /**
   * 查找缓存（精确匹配+模糊匹配）
   * @param {string} text - 用户输入
   * @returns {Object|null} 缓存结果或 null
   */
  get(text) {
    const key = this._normalizeKey(text)

    // 1. 精确匹配
    if (this.cache.has(key)) {
      const entry = this.cache.get(key)
      if (this._isExpired(entry)) {
        this.cache.delete(key)
        this.stats.misses++
        return null
      }
      this.stats.hits++
      logger.debug('IntentCache', `命中缓存(精确): ${key}`)
      return entry.data
    }

    // 2. 模糊匹配（遍历查找相似的）
    let bestMatch = null
    let bestSimilarity = 0

    for (const [cachedKey, entry] of this.cache.entries()) {
      if (this._isExpired(entry)) {
        this.cache.delete(cachedKey)
        continue
      }

      const sim = this._similarity(key, cachedKey)
      if (sim >= this.similarityThreshold && sim > bestSimilarity) {
        bestSimilarity = sim
        bestMatch = entry
      }
    }

    if (bestMatch) {
      this.stats.hits++
      logger.debug('IntentCache', `命中缓存(模糊 ${bestSimilarity.toFixed(2)}): ${key}`)
      return bestMatch.data
    }

    this.stats.misses++
    return null
  }

  /**
   * 写入缓存
   * @param {string} text - 原始文本
   * @param {Object} data - 缓存数据
   */
  set(text, data) {
    const key = this._normalizeKey(text)

    // 容量检查
    if (this.cache.size >= this.maxEntries) {
      this._evictOldest()
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 1
    })

    logger.debug('IntentCache', `写入缓存: ${key}`)
  }

  /**
   * 清除过期条目
   */
  cleanup() {
    let cleaned = 0
    for (const [key, entry] of this.cache.entries()) {
      if (this._isExpired(entry)) {
        this.cache.delete(key)
        cleaned++
      }
    }
    if (cleaned > 0) {
      logger.debug('IntentCache', `清理了 ${cleaned} 个过期条目`)
    }
    return cleaned
  }

  /**
   * 清空全部缓存
   */
  clear() {
    const size = this.cache.size
    this.cache.clear()
    logger.debug('IntentCache', `清空全部缓存 (${size} 条)`)
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxEntries,
      hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests).toFixed(2) : '0.00',
      ttl: this.ttl,
      similarityThreshold: this.similarityThreshold
    }
  }

  // ────────────────────────────────────────────────────────
  // 内部方法
  // ────────────────────────────────────────────────────────

  _isExpired(entry) {
    return Date.now() - entry.timestamp > this.ttl
  }

  _evictOldest() {
    let oldestKey = null
    let oldestTime = Infinity

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.stats.evictions++
      logger.debug('IntentCache', `淘汰最旧条目: ${oldestKey}`)
    }
  }
}

// 单例导出
let instance = null
function getInstance(options = {}) {
  if (!instance) {
    instance = new IntentCache(options)
  }
  return instance
}

module.exports = {
  IntentCache,
  getInstance
}
