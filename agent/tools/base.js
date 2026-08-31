/**
 * 工具基类
 * 所有工具必须继承此类
 */

class BaseTool {
  /**
   * 获取工具元信息（子类必须实现）
   */
  static get schema() {
    throw new Error('子类必须实现 schema 方法')
  }

  /**
   * 获取工具名称
   */
  static get name() {
    return this.schema?.name || this.name || 'unknown_tool'
  }

  /**
   * 获取工具描述
   */
  static get description() {
    return this.schema?.description || ''
  }

  /**
   * 执行工具（子类必须实现）
   * @param {Object} params - 参数
   * @returns {Promise<Object>} 结果
   */
  async execute(params) {
    throw new Error(`子类 ${this.constructor.name} 必须实现 execute 方法`)
  }

  /**
   * 验证参数
   */
  validateParams(params) {
    const schema = this.constructor.schema
    if (!schema?.parameters?.properties) {
      return params  // 无schema定义则跳过验证
    }

    const { properties, required = [] } = schema.parameters
    const errors = []

    // 检查必填字段
    for (const field of required) {
      if (!(field in params) || params[field] === undefined || params[field] === null) {
        errors.push(`缺少必填参数: ${field}`)
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '))
    }

    return params
  }

  /**
   * 包装执行（带日志和错误处理）
   */
  async safeExecute(params) {
    const { logger } = require('../utils/logger')
    const toolName = this.constructor.name

    try {
      logger.debug(toolName, `执行参数: ${JSON.stringify(params)}`)
      
      const validatedParams = this.validateParams(params)
      const result = await this.execute(validatedParams)
      
      logger.info(toolName, '执行成功')
      
      return {
        success: true,
        data: result
      }
    } catch (error) {
      logger.error(toolName, `执行失败: ${error.message}`)
      
      return {
        success: false,
        error: error.message
      }
    }
  }
}

module.exports = BaseTool
