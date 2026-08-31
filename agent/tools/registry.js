/**
 * 工具注册中心
 * 管理所有可用工具的注册、查找和执行
 */

const { logger } = require('../utils/logger')

class ToolRegistry {
  constructor() {
    this._tools = new Map()
    this._aliases = new Map()
  }

  /**
   * 注册工具
   * @param {BaseTool} ToolClass - 工具类
   */
  register(ToolClass) {
    const schema = ToolClass.schema
    const name = schema.name
    
    if (this._tools.has(name)) {
      logger.warn('ToolRegistry', `工具 "${name}" 已存在，将被覆盖`)
    }

    this._tools.set(name, {
      class: ToolClass,
      schema,
      instance: null  // 延迟实例化
    })

    logger.info('ToolRegistry', `注册工具: ${name} - ${schema.description}`)
    return this
  }

  /**
   * 注册别名
   */
  registerAlias(name, alias) {
    this._aliases.set(alias, name)
    return this
  }

  /**
   * 获取工具实例（单例模式）
   */
  getInstance(name) {
    const realName = this._aliases.get(name) || name
    const entry = this._tools.get(realName)

    if (!entry) {
      return null
    }

    if (!entry.instance) {
      entry.instance = new entry.class()
    }

    return entry.instance
  }

  /**
   * 获取工具Schema
   */
  getSchema(name) {
    const realName = this._aliases.get(name) || name
    const entry = this._tools.get(realName)
    return entry?.schema || null
  }

  /**
   * 获取所有已注册工具的Schema列表
   */
  getAllSchemas() {
    const schemas = []
    for (const [, entry] of this._tools) {
      schemas.push(entry.schema)
    }
    return schemas
  }

  /**
   * 获取所有工具名称
   */
  getToolNames() {
    return Array.from(this._tools.keys())
  }

  /**
   * 检查工具是否存在
   */
  has(name) {
    return this._tools.has(name) || this._aliases.has(name)
  }

  /**
   * 执行指定工具
   */
  async execute(name, params) {
    const instance = this.getInstance(name)

    if (!instance) {
      throw new Error(`未找到工具: ${name}`)
    }

    return instance.safeExecute(params)
  }

  /**
   * 根据关键词匹配工具
   */
  matchTools(keywords) {
    const matches = []
    const keywordLower = keywords.toLowerCase()

    for (const [name, entry] of this._tools) {
      const schema = entry.schema
      const desc = (schema.description + ' ' + name).toLowerCase()

      // 名称完全匹配
      if (name.toLowerCase().includes(keywordLower) || keywordLower.includes(name.toLowerCase())) {
        matches.push({ name, score: 1.0, schema })
        continue
      }

      // 描述包含关键词
      if (desc.includes(keywordLower)) {
        matches.push({ name, score: 0.7, schema })
      }
    }

    // 按分数排序
    matches.sort((a, b) => b.score - a.score)
    return matches
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalTools: this._tools.size,
      totalAliases: this._aliases.size,
      toolNames: this.getToolNames()
    }
  }
}

// 创建全局注册中心实例
const registry = new ToolRegistry()

// 导出
module.exports = registry
module.exports.ToolRegistry = ToolRegistry
