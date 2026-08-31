/**
 * 智谱AI客户端
 * 支持文本对话、视觉理解、联网搜索、函数调用
 */

const config = require('../config')
const { logger } = require('../utils/logger')

class ZhiPuClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || config.zhipu.apiKey
    this.baseUrl = options.baseUrl || config.zhipu.baseUrl
    this.defaultModel = config.zhipu.textModel
  }

  /**
   * 构建请求头
   */
  _buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    }
  }

  /**
   * 发送API请求
   */
  async _request(body, model = null) {
    const url = this.baseUrl
    const requestBody = {
      ...body,
      model: body.model || model || this.defaultModel
    }

    logger.debug('ZhiPuClient', `请求模型: ${requestBody.model}`)
    
    // 添加 60 秒超时
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: this._buildHeaders(),
      body: JSON.stringify(requestBody),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('ZhiPuClient', `API请求失败: ${response.status} - ${errorText}`)
      throw new Error(`智谱API错误 [${response.status}]: ${errorText}`)
    }

    const data = await response.json()

    if (data.error) {
      logger.error('ZhiPuClient', `API返回错误: ${JSON.stringify(data.error)}`)
      throw new Error(data.error.message || JSON.stringify(data.error))
    }

    return data
  }

  // ==================== 文本对话 ====================

  /**
   * 文本对话补全
   * @param {Object} params
   * @param {Array} params.messages - 消息历史 [{role, content}]
   * @param {string} params.model - 模型名称（可选）
   * @param {number} params.temperature - 温度参数
   * @param {number} params.maxTokens - 最大token数
   * @param {boolean} params.enableWebSearch - 是否启用联网搜索
   * @returns {Promise<string>} AI回复内容
   */
  async chat(params = {}) {
    const {
      messages,
      model = this.defaultModel,
      temperature = 0.7,
      maxTokens = 2048,
      enableWebSearch = false,
      tools = null,
      toolChoice = null
    } = params

    if (!messages || messages.length === 0) {
      throw new Error('消息列表不能为空')
    }

    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    }

    // 联网搜索已移至独立工具 web_search.js
    // 此处保留兼容性，如需在对话中启用请使用 WebSearchTool

    // 函数调用支持
    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: t
      }))
      // 强制指定函数（用于结构化抽取场景）
      if (toolChoice) {
        body.tool_choice = toolChoice
      }
    }

    const timer = logger.time('chat_completion')
    const data = await this._request(body, model)
    timer.end()

    const choice = data.choices?.[0]
    if (!choice) {
      throw new Error('API返回了空的选择结果')
    }

    return {
      content: choice.message?.content || '',
      role: choice.message?.role || 'assistant',
      toolCalls: choice.message?.tool_calls || null,
      finishReason: choice.finish_reason || 'stop',
      usage: data.usage || {}
    }
  }

  /**
   * 简单的单轮对话
   */
  async simpleChat(prompt, systemPrompt = null, options = {}) {
    const messages = []
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    
    messages.push({ role: 'user', content: prompt })

    return this.chat({
      messages,
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 2048,
      enableWebSearch: options.enableWebSearch || false,
      model: options.model || null
    })
  }

  // ==================== 视觉理解 ====================

  /**
   * 图片分析（多模态）
   * @param {Object} params
   * @param {string|Array} params.image - 图片URL或base64，或多张图片
   * @param {string} params.prompt - 分析提示词
   * @param {string} params.question - 用户问题（可选）
   * @param {string} params.model - 视觉模型（默认glm-4v-flash）
   */
  async visionAnalyze(params = {}) {
    const {
      image,
      prompt,
      question = '',
      model = config.zhipu.visionModel,
      maxTokens = 1024  // glm-4v-flash 限制 max_tokens 范围 [1, 1024]
    } = params

    if (!image) {
      throw new Error('图片不能为空')
    }

    // 构建用户内容（多模态）
    const userContent = []

    // 处理单张或多张图片
    const images = Array.isArray(image) ? image : [image]
    for (const img of images) {
      // 判断图片类型：URL/base64/file协议/本地路径
      let imageUrl
      if (img.startsWith('http') || img.startsWith('cloud://') || img.startsWith('wxfile://')) {
        imageUrl = img
      } else if (img.startsWith('data:image')) {
        imageUrl = img
      } else if (img.startsWith('file://') || img.startsWith('/uploads/') || img.startsWith('/')) {
        // 本地文件路径 → 读取为 base64
        const fs = require('fs')
        const path = require('path')
        const filePath = img.replace(/^file:\/\//, '')
        try {
          const buffer = fs.readFileSync(filePath)
          const base64 = buffer.toString('base64')
          imageUrl = `data:image/jpeg;base64,${base64}`
        } catch (e) {
          throw new Error(`无法读取图片文件: ${filePath} - ${e.message}`)
        }
      } else {
        // 纯 base64 字符串
        imageUrl = img.startsWith('data:image') ? img : `data:image/jpeg;base64,${img}`
      }
      userContent.push({
        type: 'image_url',
        image_url: { url: imageUrl }
      })
    }

    // 添加文本prompt
    const textContent = question ? `${question}\n\n${prompt}` : prompt
    userContent.push({
      type: 'text',
      text: textContent
    })

    const messages = [{
      role: 'user',
      content: userContent
    }]

    const timer = logger.time('vision_analyze')
    const result = await this.chat({
      messages,
      model,
      maxTokens,
      temperature: 0.3  // 视觉任务用较低温度保证准确性
    })
    timer.end()

    return {
      content: result.content,
      usage: result.usage
    }
  }

  // ==================== 流式输出 ====================

  /**
   * 流式对话（用于实时显示）
   * 注意：云函数环境可能不支持流式，此方法主要用于本地开发或WebSocket场景
   */
  async *chatStream(params = {}) {
    const {
      messages,
      model = this.defaultModel,
      temperature = 0.7,
      maxTokens = 2048
    } = params

    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: this._buildHeaders(),
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error(`流式请求失败: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const json = JSON.parse(line.slice(6))
            const delta = json.choices?.[0]?.delta?.content
            if (delta) {
              yield delta
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  }

  // ==================== 工具辅助方法 ====================

  /**
   * 带工具调用的对话（Function Calling）
   */
  async chatWithTools(params = {}) {
    const {
      messages,
      tools,
      model = config.zhipu.textModelPro,
      maxIterations = 5
    } = params

    let currentMessages = [...messages]
    const toolResults = []

    for (let i = 0; i < maxIterations; i++) {
      const result = await this.chat({
        messages: currentMessages,
        model,
        tools: tools.map(t => t.schema),
        temperature: 0.2  // 工具调用用低温度
      })

      // 如果没有工具调用，直接返回
      if (!result.toolCalls || result.toolCalls.length === 0) {
        return {
          content: result.content,
          toolResults,
          usage: result.usage
        }
      }

      // 记录助手消息
      currentMessages.push({
        role: 'assistant',
        content: result.content || '',
        tool_calls: result.toolCalls
      })

      // 执行每个工具调用
      for (const toolCall of result.toolCalls) {
        const { id, function: fn } = toolCall
        const fnName = fn.name
        let fnArgs = {}

        try {
          fnArgs = JSON.parse(fn.arguments || '{}')
        } catch (e) {
          fnArgs = {}
        }

        // 查找并执行工具
        const tool = tools.find(t => t.schema.name === fnName)
        let toolResult

        if (tool && typeof tool.execute === 'function') {
          try {
            toolResult = await tool.execute(fnArgs)
            toolResult = JSON.stringify(toolResult)
          } catch (e) {
            toolResult = JSON.stringify({ error: e.message })
          }
        } else {
          toolResult = JSON.stringify({ error: `未找到工具: ${fnName}` })
        }

        toolResults.push({ name: fnName, args: fnArgs, result: toolResult })

        // 添加工具结果到消息
        currentMessages.push({
          role: 'tool',
          tool_call_id: id,
          content: toolResult
        })
      }
    }

    // 达到最大迭代次数，返回最后一次结果
    const finalResult = await this.chat({ messages: currentMessages, model })
    return {
      content: finalResult.content,
      toolResults,
      usage: finalResult.usage,
      truncated: true
    }
  }
}

// 导出单例
module.exports = new ZhiPuClient()
module.exports.ZhiPuClient = ZhiPuClient
