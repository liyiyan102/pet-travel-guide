/**
 * PetTravelAgent - 宠物友好旅行攻略智能助手
 * 主入口模块
 */

const config = require('../config')
const planner = require('./planner')
const contextManager = require('../memory/context')
const { logger } = require('../utils/logger')
const { validators } = require('../utils/validator')
const formatters = require('../utils/formatter')

class PetTravelAgent {
  constructor(options = {}) {
    this.name = config.agent.name
    this.maxTurns = options.maxTurns || config.agent.maxTurns
    this.initialized = false
  }

  /**
   * 初始化Agent
   */
  async initialize() {
    if (this.initialized) return this

    logger.info('Agent', `初始化 ${this.name}...`)

    // 注册所有工具
    await this.registerTools()

    this.initialized = true
    logger.info('Agent', `${this.name} 初始化完成`)
    return this
  }

  /**
   * 注册工具
   */
  async registerTools() {
    const registry = require('../tools/registry')

    // 核心工具
    const VisionTool = require('../tools/vision')
    const KnowledgeTool = require('../tools/knowledge')
    const WebSearchTool = require('../tools/web_search')
    
    // 业务工具
    const POITool = require('../tools/poi_tool')
    const WeatherTool = require('../tools/weather_tool')
    const ItineraryTool = require('../tools/itinerary_tool')

    // 注册
    registry.register(VisionTool)
    registry.register(KnowledgeTool)
    registry.register(WebSearchTool)
    registry.register(POITool)
    registry.register(WeatherTool)
    registry.register(ItineraryTool)

    logger.info('Agent', `已注册 ${registry.getToolNames().length} 个工具: ${registry.getToolNames().join(', ')}`)
  }

  /**
   * 主入口 - 处理用户输入
   * @param {Object} input - 用户输入
   * @param {string} input.message - 用户消息
   * @param {Array} input.images - 图片列表（URL或base64）
   * @param {string} input.userId - 用户ID
   * @param {string} input.sessionId - 会话ID
   * @param {string} input.directAgent - 直接调用的子Agent名称（可选，跳过意图识别）
   * @returns {Promise<Object>} Agent响应
   */
  async run(input) {
    const timer = logger.time('agent_run')
    
    try {
      // 1. 验证输入
      const validatedInput = validators.userInput(input)
      const sessionId = validatedInput.sessionId || validatedInput.userId || 'default'
      const userId = validatedInput.userId || 'anonymous'
      const directAgent = input.directAgent || null

      logger.info('Agent', `用户[${userId}] 会话[${sessionId}]: "${(validatedInput.message || '').substring(0, 50)}" 图片:${validatedInput.images.length}${directAgent ? ` 直接分发:${directAgent}` : ''}`)

      // 2. 确保初始化
      if (!this.initialized) {
        await this.initialize()
      }

      // 3. 记录用户消息到上下文
      contextManager.addMessage(sessionId, 'user', validatedInput.message, {
        hasImages: validatedInput.images.length > 0,
        imageCount: validatedInput.images.length
      })

      // 4. 获取当前会话上下文
      const sessionContext = contextManager.getSession(sessionId)
      
      // 5. 构建增强输入（包含上下文）
      const enhancedInput = {
        ...validatedInput,
        context: {
          userContext: sessionContext.userContext,
          currentItinerary: sessionContext.currentItinerary,
          conversationHistory: contextManager.getConversationHistory(sessionId, 6),
          recentImages: sessionContext.recentImages
        }
      }

      // 6. 调用规划引擎处理
      let result
      if (directAgent) {
        // 直接分发模式：跳过意图识别，直接调用子Agent
        logger.info('Agent', `直接分发模式: ${directAgent}`)
        const router = require('./router')
        const directResult = await router.dispatchDirect(directAgent, enhancedInput)
        
        if (directResult.error) {
          // 直接分发失败，回退到正常流程
          logger.warn('Agent', `直接分发失败，回退到正常流程: ${directResult.message}`)
          result = await planner.plan(enhancedInput, enhancedInput.context)
        } else {
          result = directResult
        }
      } else {
        // 正常流程：通过规划引擎
        result = await planner.plan(enhancedInput, enhancedInput.context)
      }

      // 7. 记录助手回复
      contextManager.addMessage(sessionId, 'assistant', result.content || '', {
        type: result.type,
        hasItinerary: !!result.itineraryData,
        hasImageAnalysis: !!result.imageAnalysis
      })

      // 8. 更新上下文中的关键信息
      // planner.plan() 已经在处理过程中更新了 context.userContext（城市/天数/宠物等）
      if (result.itineraryData) {
        contextManager.setCurrentItinerary(sessionId, result.itineraryData)
        contextManager.updateUserContext(sessionId, {
          destination: result.itineraryData.destination
        })
      }
      // 把 planner 中更新的 userContext 同步到 contextManager
      if (enhancedInput.context?.userContext) {
        contextManager.updateUserContext(sessionId, enhancedInput.context.userContext)
      }

      // 9. 构建最终响应
      // planner.plan() 已经把 routingResult.intent 附加到 result 上了
      const intentLabel = directAgent || result?.intent || 'unknown'

      const response = formatters.agentResponse(true, {
        type: result.type || 'text',
        content: result.content || '',
        imageAnalysis: result.imageAnalysis || null,
        sources: result.sources || null,
        suggestions: result.suggestions || [],
        actions: result.actions || [],
        itineraryData: result.itineraryData || null,
        poiList: result.poiList || null,
        weatherData: result.weatherData || null,
        memoryUpdate: {
          userContext: sessionContext.userContext
        },
        metrics: {
          intent: intentLabel,
          confidence: result?.confidence,
          toolsUsed: [],
          latency: timer.end(),
          hasImage: validatedInput.images.length > 0,
          sessionId,
          directCall: !!directAgent,
          source: result?.source || 'planner'
        }
      })

      return response

    } catch (error) {
      logger.error('Agent', `处理失败: ${error.message}\n${error.stack}`)

      // 返回错误响应
      return formatters.agentResponse(false, {
        error: error.name || 'AgentError',
        message: error.message,
        fallback: this.generateFallbackResponse(input)
      })
    }
  }

  /**
   * 生成兜底回复
   */
  generateFallbackResponse(input) {
    const errorMsgs = [
      '抱歉，我刚才走神了 😅 能再说一次吗？',
      '哎呀，出了点小问题。你可以试试：\n1. 重新发送你的问题\n2. 换个方式描述你的需求',
      '我的大脑正在重启中...请稍等片刻再试！'
    ]
    
    return {
      type: 'text',
      content: errorMsgs[Math.floor(Math.random() * errorMsgs.length)],
      suggestions: [
        { text: '重新提问', type: 'retry' },
        { text: '开始新对话', type: 'new_chat' }
      ]
    }
  }

  /**
   * 获取Agent状态
   */
  getStatus() {
    return {
      name: this.name,
      initialized: this.initialized,
      activeSessions: contextManager.getActiveSessionsCount(),
      version: '2.0.0',
      uptime: process.uptime ? Math.floor(process.uptime()) : 0
    }
  }

  /**
   * 重置会话
   */
  resetSession(sessionId) {
    contextManager.clearSession(sessionId)
    return { success: true, message: '会话已重置' }
  }
}

// 导出单例
module.exports = new PetTravelAgent()
module.exports.PetTravelAgent = PetTravelAgent
