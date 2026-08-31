/**
 * 规划引擎 V2 - 支持复合意图处理
 * 
 * 负责制定执行计划、协调工具调用、整合结果
 * 新增能力：
 * - 支持复合意图（一条消息触发多个 Skill）
 * - 按优先级顺序依次执行多个 Skill
 * - 整合多段结果统一返回
 */

const config = require('../config')
const registry = require('../tools/registry')
const zhipuClient = require('../llm/zhipu_client')
const { logger } = require('../utils/logger')
const formatter = require('../utils/formatter')
const cityPolicySkill = require('../skills/city_policy_skill')
const travelChecklistSkill = require('../skills/travel_checklist_skill')
const breedRiskSkill = require('../skills/breed_risk_skill')

class PlanningEngineV2 {
  constructor() {
    this.router = require('./router')
  }

  /**
   * 主规划方法（支持异步路由 + 复合意图）
   */
  async plan(userInput, context) {
    const timer = logger.time('planning')
    
    try {
      // Step 1: 意图识别（现在是异步的）
      const routingResult = await this.router.route(userInput, context)
      logger.info('Planner', `意图: ${routingResult.intent}, 置信度: ${(routingResult.confidence * 100).toFixed(1)}%, 复合: ${routingResult.isComposite || false}`)

      // Step 1.5: 从用户消息中提取关键信息，更新 userContext
      this._updateUserContextFromMessage(userInput.message, context)

      // Step 1.6: 合并 LLM 返回的 userContext（Layer3 提取的结构化实体）
      if (routingResult.userContext) {
        this._mergeLLMUserContext(routingResult.userContext, context)
      }

      // Step 2: 检查是否为复合意图
      if (routingResult.isCompound && routingResult.subIntents && routingResult.subIntents.length > 0) {
        logger.info('Planner', `检测到复合意图: 主=${routingResult.intent}, 次=[${routingResult.subIntents.join(', ')}]`)
        const compoundResult = await this.handleCompoundIntent(routingResult, userInput, context)
        timer.end()
        return compoundResult
      }

      // Step 3: 单意图处理（原有逻辑）
      let result
      
      // ═════════ 保护机制：image_analysis 但无图片时回退 ═════════
      if (routingResult.intent === 'image_analysis' || 
          routingResult.intent === 'pet_breed_recognition' || 
          routingResult.intent === 'scene_recognition') {
        const hasImages = userInput.images && userInput.images.length > 0
        if (!hasImages) {
          logger.warn('Planner', `意图 ${routingResult.intent} 需要图片但未提供，尝试重新识别意图`)
          
          // 尝试基于文本内容重新判断意图
          const text = (userInput.message || userInput.text || '').toLowerCase()
          
          // 食物安全相关关键词
          if (/能吃吗|可以吃吗|能喂吗|可以喂吗|有没有毒|有毒吗|会中毒|吃了.*怎么样|食物安全/.test(text) ||
              /巧克力|葡萄|洋葱|木糖醇|酒精|咖啡|骨头|坚果|牛油果/.test(text)) {
            logger.info('Planner', '回退到 food_detection 意图')
            routingResult.intent = 'food_detection'
            result = await this.handleKnowledgeQuery(routingResult, userInput, context)
          }
          // 品种相关
          else if (/品种|金毛|泰迪|法斗|柯基|哈士奇|拉布拉多|边牧|柴犬|比熊|博美/.test(text)) {
            logger.info('Planner', '回退到 knowledge_query 意图')
            routingResult.intent = 'knowledge_query'
            result = await this.handleKnowledgeQuery(routingResult, userInput, context)
          }
          // 其他情况走知识库
          else {
            logger.info('Planner', '回退到 knowledge_query 意图')
            routingResult.intent = 'knowledge_query'
            result = await this.handleKnowledgeQuery(routingResult, userInput, context)
          }
        } else {
          result = await this.handleVisionTask(routingResult, userInput, context)
        }
      } else
      switch (routingResult.intent) {
        case 'pet_breed_recognition':
        case 'scene_recognition':
        case 'image_analysis':
          result = await this.handleVisionTask(routingResult, userInput, context)
          break

        case 'food_detection':
          // 有图片走视觉分析，无图片走知识库问答
          if (userInput.images && userInput.images.length > 0) {
            result = await this.handleVisionTask(routingResult, userInput, context)
          } else {
            result = await this.handleKnowledgeQuery(routingResult, userInput, context)
          }
          break

        case 'generate_itinerary':
          // ══ 子Agent分发：旅行攻略由专门的子Agent处理 ══
          if (this.router.requiresSubAgent('generate_itinerary')) {
            logger.info('Planner', '检测到 generate_itinerary 意图，分发到旅行攻略子Agent')
            
            const subAgentRequest = {
              text: userInput.message || userInput.text || '',
              sessionId: context.sessionId || `session_${Date.now()}`,
              userId: context.userId || 'anonymous',
              images: userInput.images || [],
              context: {
                userProfile: context.userProfile,
                location: context.location,
                // 传入 userContext（包含已提取的宠物档案/目的地/天数等）
                userContext: context.userContext || {},
                conversationHistory: context.conversationHistory || []
              }
            }
            
            const subAgentResult = await this.router.dispatchToSubAgent('generate_itinerary', subAgentRequest)
            
            if (subAgentResult && !subAgentResult.fallback) {
              result = subAgentResult
            } else {
              // 子Agent不可用，回退到原有逻辑
              logger.warn('Planner', '子Agent不可用，回退到原有行程生成逻辑')
              result = await this.handleItineraryGeneration(routingResult, userInput, context)
            }
          } else {
            result = await this.handleItineraryGeneration(routingResult, userInput, context)
          }
          break

        case 'search_poi':
          result = await this.handlePOISearch(routingResult, userInput, context)
          break

        case 'weather_check':
          result = await this.handleWeatherQuery(routingResult, userInput, context)
          break

        case 'knowledge_query':
        case 'policy_check':
          // 优先走 Skill 1 精确查表，没结果再走知识库
          result = this.handleCityPolicySkill(routingResult, userInput, context)
          if (!result) result = await this.handleKnowledgeQuery(routingResult, userInput, context)
          break

        case 'emergency_help':
        case 'pet_advice':
          result = await this.handleKnowledgeQuery(routingResult, userInput, context)
          break

        case 'travel_checklist':
          result = this.handleChecklistSkill(routingResult, userInput, context)
          break

        case 'breed_risk':
          result = this.handleBreedRiskSkill(routingResult, userInput, context)
          break

        case 'realtime_search':
          result = await this.handleRealtimeSearch(routingResult, userInput, context)
          break

        case 'modify_itinerary':
        case 'transport_guide':
        case 'travel_tips': {
          // 先尝试品种风险/清单，没结果再走 LLM
          const skillResult = this.handleBreedRiskSkill(routingResult, userInput, context)
          result = skillResult || await this.handleComplexQuery(routingResult, userInput, context)
          break
        }
          break

        case 'off_topic':
          result = this.handleOffTopic(userInput, context)
          break

        default:
          // chit_chat 或未知意图
          result = await this.handleGeneralChat(routingResult, userInput, context)
      }

      // 把意图识别结果附加到 result 上，供 index.js 构建 metrics 使用
      if (result && typeof result === 'object') {
        result.intent = routingResult.intent
        result.source = routingResult.source || 'planner'
        result.confidence = routingResult.confidence
      }

      timer.end()
      return result

    } catch (error) {
      logger.error('Planner', `规划失败: ${error.message}`)
      throw error
    }
  }

  // ==================== 各类任务处理器 ====================

  /**
   * 处理视觉任务（图片分析）
   */
  async handleVisionTask(routingResult, input, context) {
    const { images = [], message = '' } = input
    const taskTypeMap = {
      pet_breed_recognition: 'pet_breed',
      scene_recognition: 'scene',
      food_detection: 'food_safety',
      image_analysis: 'general'
    }

    const taskType = taskTypeMap[routingResult.intent] || 'general'
    
    // 从消息中提取宠物类型（用于食物检测）
    let petType = 'dog'
    if (message.includes('猫') || message.includes('cat')) petType = 'cat'
    else if (message.includes('鹦鹉') || message.includes('鸟') || message.includes('parrot') || message.includes('bird')) petType = 'parrot'
    else if (message.includes('兔子') || message.includes('rabbit')) petType = 'rabbit'
    else if (message.includes('仓鼠') || message.includes('hamster')) petType = 'hamster'

    // 调用Vision工具
    const visionResult = await registry.execute('vision_analyze', {
      image_url: images[0],
      images: images.length > 1 ? images : undefined,
      task_type: taskType,
      question: message || undefined,
      pet_type: petType
    })

    if (!visionResult.success) {
      throw new Error(`图片分析失败: ${visionResult.error}`)
    }

    const analysisData = visionResult.data

    // 使用LLM生成友好的回复
    const responsePrompt = this.buildVisionResponsePrompt(taskType, analysisData, message)
    const llmResponse = await zhipuClient.simpleChat(
      responsePrompt,
      VISION_RESPONSE_SYSTEM_PROMPT,
      { temperature: 0.7, maxTokens: 800 }
    )

    return {
      type: 'image_analysis',
      content: formatter.beautify(llmResponse.content),
      imageAnalysis: {
        taskType,
        result: analysisData.result,
        rawContent: analysisData.rawContent,
        confidence: analysisData.result?.confidence || 0.8
      },
      suggestions: this.generateVisionSuggestions(taskType, analysisData),
      actions: [
        { type: 'ask_followup', label: '还有其他问题吗？' },
        { type: 'new_image', label: '再分析一张图片' }
      ]
    }
  }

  /**
   * 处理行程生成
   */
  async handleItineraryGeneration(routingResult, input, context) {
    // 先尝试从上下文提取参数，不足则追问
    const params = this.extractItineraryParams(input, context)
    
    if (!params.complete) {
      return {
        type: 'clarification',
        content: params.clarificationMessage,
        missingFields: params.missingFields,
        suggestions: params.suggestions || []
      }
    }

    // 调用行程生成工具
    const itineraryResult = await registry.execute('generate_itinerary', params.data)

    if (!itineraryResult.success) {
      throw new Error(`行程生成失败: ${itineraryResult.error}`)
    }

    const itinerary = itineraryResult.data

    // 生成摘要回复
    const summaryResponse = await zhipuClient.simpleChat(
      `用户生成了一个${itinerary.destination}${itinerary.days}天的行程。请生成一段简洁的介绍（200字内），突出亮点和宠物友好特色。记住：不用markdown符号，用emoji让内容更活泼！\n\n行程数据：${JSON.stringify(itinerary.days_data?.slice(0, 2))}`,
      '你是"小D"🐾，为用户的行程生成热情又可爱的介绍！',
      { temperature: 0.85, maxTokens: 300 }
    )

    return {
      type: 'itinerary',
      content: formatter.beautify(summaryResponse.content),
      itineraryData: itinerary,
      actions: [
        { type: 'view_detail', label: '查看完整行程' },
        { type: 'modify_day', label: '修改行程' },
        { type: 'save', label: '保存行程' },
        { type: 'share', label: '分享行程' }
      ]
    }
  }

  /**
   * 处理POI搜索
   */
  async handlePOISearch(routingResult, input, context) {
    // 优先从当前消息提取位置，再从上下文历史中提取
    let location = this.extractLocation(input.message, context)
    if (!location) {
      location = context.userContext?.destination 
        || this.extractLocationFromHistory(context)
        || '当前位置'
    }
    const keyword = this.extractKeyword(input.message, ['找', '搜索', '附近', '推荐'])
    const category = this.guessCategory(input.message)

    // 从用户消息中提取请求的数量（如"10个"、"5家"、"3个"）
    const requestedCount = this.extractRequestedCount(input.message)

    const poiResult = await registry.execute('search_poi', {
      location,
      keyword,
      category,
      limit: Math.min(requestedCount || 10, 20)  // 用户指定数量，默认10，上限20
    })

    if (!poiResult.success) {
      throw new Error(`POI搜索失败: ${poiResult.error}`)
    }

    let pois = poiResult.data.pois || []
    
    if (pois.length === 0 && poiResult.data.allPois && poiResult.data.allPois.length > 0) {
      pois = poiResult.data.allPois
    }

    if (pois.length === 0) {
      // POI 无结果 → 让 LLM 根据通用知识给出建议
      logger.info('Planner', `POI搜索无结果(${location}/${keyword})，调用 LLM 兜底`)
      const poiFallbackPrompt = `用户在找宠物友好场所，但本地数据库没有找到结果。请根据你的通用知识给用户一些实用建议。

用户查询：
位置：${location}
关键词：${keyword || '宠物友好场所'}
类别：${category || '未指定'}

要求：
1. 推荐该地区常见的宠物友好场所类型（如宠物公园、宠物餐厅、宠物酒店等）
2. 给出搜索建议，比如用什么关键词在大众点评/小红书上搜索
3. 用 emoji 和换行让内容易读，分点用 •
4. 每段不超过3行`

      try {
        const llmAnswer = await zhipuClient.simpleChat(
          poiFallbackPrompt,
          '你是宠物出行AI助手"小D"。请给用户实用的宠物友好场所搜索建议。',
          { temperature: 0.7, maxTokens: 1000 }
        )
        const answerText = llmAnswer.content || (typeof llmAnswer === 'string' ? llmAnswer : '')
        return {
          type: 'poi_list',
          content: answerText,
          poiList: [],
          suggestions: [
            { text: '换个关键词搜索', type: 'action' },
            { text: '帮我规划行程', type: 'generate_itinerary' }
          ]
        }
      } catch (e) {
        logger.warn('Planner', 'POI LLM 兜底失败: ' + e.message)
        return {
          type: 'poi_list',
          content: formatter.getFallbackReply('no_results'),
          poiList: [],
          suggestions: [
            { text: '换个关键词搜索', type: 'action' },
            { text: '帮我规划行程', type: 'generate_itinerary' }
          ]
        }
      }
    }

    // 使用结构化模板（同时传入禁入场所）
    const totalCount = poiResult.data.totalFound || pois.length
    const bannedPois = poiResult.data.banned_pois || []
    let content = formatter.poiResultTemplate(pois, location, category, totalCount, bannedPois)

    // 如果数据库返回数量少于用户请求，让 LLM 补充推荐
    if (requestedCount && pois.length < requestedCount) {
      logger.info('Planner', `POI数量不足: 用户要${requestedCount}个，实际${pois.length}个，调用LLM补充`)
      const supplementPrompt = `用户在找${location}的宠物友好${category === 'restaurant' ? '餐厅' : category === 'hotel' ? '酒店' : category === 'park' ? '公园' : '场所'}，要${requestedCount}个，但本地数据库只找到${pois.length}个。

已找到的场所：
${pois.map((p, i) => `${i+1}. ${p.name} - ${p.address || ''}`).join('\n')}

请根据你的通用知识，再推荐 ${requestedCount - pois.length} 个${location}可能存在的宠物友好${category === 'restaurant' ? '餐厅' : '场所'}。

要求：
1. 不要重复已列出的场所
2. 每个推荐包含名称和所在区域
3. 注明"以下为AI推荐，建议出行前电话确认宠物政策"
4. 用 emoji 和换行，分点用 •`

      try {
        const llmAnswer = await zhipuClient.simpleChat(
          supplementPrompt,
          '你是宠物出行AI助手"小D"。请根据通用知识推荐宠物友好场所。',
          { temperature: 0.7, maxTokens: 1500 }
        )
        const supplementText = llmAnswer.content || (typeof llmAnswer === 'string' ? llmAnswer : '')
        if (supplementText && supplementText.length > 10) {
          content += '\n\n' + supplementText
        }
      } catch (e) {
        logger.warn('Planner', 'POI LLM 补充失败: ' + e.message)
      }
    }

    return {
      type: 'poi_list',
      content,
      poiList: pois,
      actions: pois.slice(0, 5).map(poi => ({
        type: 'view_poi_detail',
        label: `查看${poi.name}`,
        poiId: poi.id
      }))
    }
  }

  /**
   * 处理天气查询
   */
  async handleWeatherQuery(routingResult, input, context) {
    const city = this.extractLocation(input.message, context) || context.userContext?.destination || '当前城市'
    const daysMatch = input.message.match(/(\d+)\s*天/)
    const days = daysMatch ? parseInt(daysMatch[1]) : 3

    const weatherResult = await registry.execute('get_weather', { city, days })

    if (!weatherResult.success) {
      throw new Error(`天气查询失败: ${weatherResult.error}`)
    }

    const weather = weatherResult.data
    const forecasts = weather.forecasts || []

    // 格式化天气预报（美化版）
    let weatherText = `🌤️ ${city}天气预报来啦～\n\n`
    
    forecasts.forEach((f, i) => {
      const comfort = f.pet_comfort 
        ? `\n🐾 宠物舒适度: ${f.pet_comfort.level} (${f.pet_comfort.score}/10分)\n   ${f.pet_comfort.tips.join('\n   ')}`
        : ''
      
      weatherText += `${formatter.randomEmoji('weather')} 第${i + 1}天：${f.date} ${f.weekday}\n🌡️ 气温：${f.temp_low}°C ~ ${f.temp_high}°C\n🌤️ 天气：${f.weather}\n💧 湿度：${f.humidity} | 🌬️ 风力：${f.wind}${comfort}\n\n`
    })

    return {
      type: 'weather',
      content: formatter.beautify(weatherText),
      weatherData: weather,
      suggestions: [
        { text: '根据天气调整行程', type: 'action' },
        { text: '查询目的地POI', type: 'action' }
      ]
    }
  }

  /**
   * 处理知识问答
   */
  async handleKnowledgeQuery(routingResult, input, context) {
    const query = input.message

    // 判断是否需要联网
    const needWeb = routingResult.needRealtime || routingResult.intent === 'realtime_search'

    // 执行知识检索
    const knowledgeResult = await registry.execute('knowledge_search', {
      query,
      category: this.mapIntentToCategory(routingResult.intent),
      use_web_search: needWeb,
      top_k: 5
    })

    if (!knowledgeResult.success) {
      throw new Error(`知识检索失败: ${knowledgeResult.error}`)
    }

    const results = knowledgeResult.data.results || []

    if (results.length === 0) {
      // 知识库无结果 → 让 LLM 用通用知识回答
      logger.info('Planner', '知识库无结果，调用 LLM 用通用知识回答')
      const fallbackPrompt = `请回答用户的问题。

用户问题：${query}

要求：
1. 用你的专业知识给出准确、详细的回答
2. 如果涉及具体政策/价格/地址等不确定信息，注明"建议出行前联系官方确认"
3. 用 emoji 和换行让内容易读，分点用 •
4. 每段不超过3行`

      try {
        const llmAnswer = await zhipuClient.simpleChat(
          fallbackPrompt,
          '你是宠物出行AI助手"小D"（不是猫豆）。请用你的专业知识回答用户关于宠物出行、宠物护理、宠物食物安全等问题。给出详细、准确、实用的回答。',
          { temperature: 0.6, maxTokens: 1500 }
        )
        const answerText = llmAnswer.content || (typeof llmAnswer === 'string' ? llmAnswer : '')
        return {
          type: 'knowledge_answer',
          content: answerText,
          sources: [],
          suggestions: [
            { text: '搜索附近宠物友好场所', type: 'search_poi' },
            { text: '查看宠物出行法规', type: 'policy_check' }
          ]
        }
      } catch (e) {
        logger.warn('Planner', 'LLM 兜底回答失败: ' + e.message)
        return {
          type: 'knowledge_answer',
          content: `这个问题我暂时没有准确的信息。\n\n建议：\n• 换个方式描述你的问题\n• 或者尝试搜索相关场所`,
          sources: [],
          suggestions: [
            { text: '搜索附近宠物友好场所', type: 'search_poi' },
            { text: '查看宠物出行法规', type: 'policy_check' }
          ]
        }
      }
    }

    // 构建带来源的回答
    const contextText = results.map((r, i) => 
      `[来源${i + 1}] ${r.title}\n${r.snippet}`
    ).join('\n\n')

    const answerPrompt = `基于以下参考资料回答用户问题。如果资料不足以完全回答，请补充你的专业知识。

## 参考资料
${contextText}

## 用户问题
${query}

请给出清晰、结构化的回答。记住：不用markdown符号，用emoji和换行让内容更易读！`

    const answer = await zhipuClient.simpleChat(
      answerPrompt,
      KNOWLEDGE_SYSTEM_PROMPT,
      { temperature: 0.6, maxTokens: 1500 }
    )

    return {
      type: 'knowledge_answer',
      content: formatter.beautify(answer.content),
      sources: results.map(r => ({
        title: r.title,
        snippet: r.snippet,
        sourceType: r.source_type,
        isRealtime: r.is_realtime
      })),
      suggestions: this.generateKnowledgeSuggestions(query)
    }
  }

  /**
   * 处理实时搜索
   */
  async handleRealtimeSearch(routingResult, input, context) {
    // 复用知识问答逻辑，强制启用联网
    return this.handleKnowledgeQuery({ ...routingResult, needRealtime: true }, input, context)
  }

  /**
   * 处理复杂查询（修改行程、交通等）
   */
  async handleComplexQuery(routingResult, input, context) {
    // 这类问题通常需要结合多个工具或深度理解
    try {
      const llmResponse = await zhipuClient.simpleChat(
        input.message,
        COMPLEX_QUERY_SYSTEM_PROMPT,
        { enableWebSearch: true, maxTokens: 1500 }
      )

      return {
        type: 'text',
        content: formatter.beautify(llmResponse.content),
        suggestions: [
          { text: '生成新行程', type: 'action' },
          { text: '搜索附近场所', type: 'action' }
        ]
      }
    } catch (error) {
      logger.error('Planner', `复杂查询失败: ${error.message}`)
      return {
        type: 'text',
        content: formatter.getFallbackReply('error'),
        suggestions: [
          { text: '换个简单的问题', type: 'action' },
          { text: '回到主菜单', type: 'reset' }
        ]
      }
    }
  }

  /**
   * Skill 1：城市宠物政策精确查询
   * 有结果返回结构化回答，无结果返回 null 让调用方降级
   */
  handleCityPolicySkill(routingResult, input, context) {
    const msg = input.message || ''
    const result = cityPolicySkill.query(msg)
    if (!result.found || !result.content) return null
    logger.info('Planner', `CityPolicySkill 命中: ${result.city || '通用'} - ${result.topic}`)
    return {
      type: 'policy_answer',
      content: result.content,
      source: result.source,
      suggestions: [
        { text: '查询附近宠物友好场所', type: 'search_poi' },
        { text: '生成出行清单', type: 'travel_checklist' }
      ]
    }
  }

  /**
   * Skill 2：宠物出行清单生成
   */
  handleChecklistSkill(routingResult, input, context) {
    const msg = input.message || ''
    const result = travelChecklistSkill.generate({}, msg)
    if (!result.found) return null
    logger.info('Planner', `TravelChecklistSkill 生成: ${result.title}`)
    return {
      type: 'checklist',
      content: result.content,
      suggestions: [
        { text: '查询目的地宠物政策', type: 'policy_check' },
        { text: '查找宠物友好酒店', type: 'search_poi' }
      ]
    }
  }

  /**
   * Skill 3：品种出行风险评估
   * 未检测到品种则返回 null
   */
  handleBreedRiskSkill(routingResult, input, context) {
    const msg = input.message || ''
    const result = breedRiskSkill.assess(msg)
    if (!result.found || !result.content) return null
    logger.info('Planner', `BreedRiskSkill 命中: ${result.breed}`)
    return {
      type: 'breed_risk',
      content: result.content,
      riskLevel: result.overallRisk,
      suggestions: [
        { text: '生成出行准备清单', type: 'travel_checklist' },
        { text: '查询目的地宠物政策', type: 'policy_check' }
      ]
    }
  }

  /**
   * 处理无关问题（非宠物出行类）
   */
  handleOffTopic(input, context) {
    const msg = input.message || ''
    return {
      type: 'off_topic',
      content: `这个问题超出了我的能力范围。\n\n我是小D，专门帮你解决宠物出行相关的问题（猫狗鸟类爬行类等所有宠物）：\n• 查找宠物友好餐厅、公园、酒店\n• 规划带宠物的旅行行程\n• 解答宠物出行法规（高铁/飞机/养犬规定）\n• 判断食物对宠物是否安全（猫狗鹦鹉兔子仓鼠等）\n\n试试问我：\n• "上海有什么宠物友好餐厅"\n• "带法斗坐飞机需要注意什么"\n• "鹦鹉可以吃巧克力吗"\n• "兔子能吃胡萝卜吗"`,
      suggestions: [
        { text: '上海有什么宠物友好餐厅', type: 'search_poi' },
        { text: '鹦鹉可以吃巧克力吗', type: 'knowledge_query' },
        { text: '北京养大型犬有什么规定', type: 'policy_check' }
      ]
    }
  }

  /**
   * 处理通用聊天
   */
  async handleGeneralChat(routingResult, input, context) {
    // 如果问题包含宠物政策/场所相关词，先尝试知识库检索
    const msg = input.message || ''
    const policyKeywords = ['能带宠物', '可以带宠物', '允许宠物', '禁止宠物', '宠物政策', '带狗进', '带猫进',
      '能进去吗', '可以进吗', '允许进入', '禁止进入', '能不能带', '可不可以带']
    const hasPolicyQuestion = policyKeywords.some(k => msg.includes(k))

    if (hasPolicyQuestion) {
      // 转交知识库处理
      return this.handleKnowledgeQuery(
        { ...routingResult, intent: 'policy_check' },
        input,
        context
      )
    }

    const systemPrompt = routingResult.isEmpty 
      ? BASE_SYSTEM_PROMPT + '\n\n【当前场景】用户刚打开对话，简洁打招呼并介绍你能做的5件事即可，不要长篇大论。'
      : CHAT_SYSTEM_PROMPT

    // 构建包含对话历史的完整prompt
    const fullPrompt = this.buildContextAwarePrompt(input.message, context)

    try {
      const llmResponse = await zhipuClient.simpleChat(
        fullPrompt,
        systemPrompt,
        { temperature: 0.85, maxTokens: 800 }
      )

      // 使用formatter美化输出
      const beautifiedContent = formatter.beautify(llmResponse.content)

      return {
        type: 'text',
        content: beautifiedContent,
        suggestions: [
          { text: '帮我规划一次旅行', type: 'generate_itinerary' },
          { text: '附近有什么宠物友好餐厅', type: 'search_poi' },
          { text: '狗狗能吃巧克力吗', type: 'knowledge_query' },
          { text: '看看这张照片', type: 'image_upload' }
        ]
      }
    } catch (error) {
      logger.error('Planner', `通用聊天失败: ${error.message}`)
      
      // 返回友好的兜底回复
      return {
        type: 'text',
        content: formatter.getFallbackReply('general'),
        suggestions: [
          { text: '帮我规划一次旅行', type: 'generate_itinerary' },
          { text: '附近有什么宠物友好餐厅', type: 'search_poi' },
          { text: '狗狗能吃巧克力吗', type: 'knowledge_query' }
        ]
      }
    }
  }

  // ==================== 复合意图处理 ====================

  /**
   * 处理复合意图（一条消息触发多个 Skill）
   * 
   * 策略：
   * - 按优先级顺序执行：主意图 → 次要意图
   * - 每个意图独立获取结果
   * - 最终整合为统一回复
   */
  async handleCompoundIntent(routingResult, userInput, context) {
    const primaryIntent = routingResult.intent
    const subIntents = routingResult.subIntents || []
    
    // 构建执行队列（主意图 + 次要意图）
    const executionQueue = [primaryIntent, ...subIntents]
    
    logger.info('Planner', `复合意图执行队列: [${executionQueue.join(', ')}]`)

    const results = []
    let primaryResult = null

    for (const intent of executionQueue) {
      try {
        // 为每个意图构造虚拟路由结果
        const mockRoutingResult = { ...routingResult, intent, isCompound: false }
        
        // 执行对应的处理器
        const result = await this.executeIntentHandler(intent, mockRoutingResult, userInput, context)
        
        if (result) {
          results.push({ intent, result })
          
          // 标记主意图结果
          if (intent === primaryIntent) {
            primaryResult = result
          }
        }
      } catch (error) {
        logger.warn(`Planner`, `复合意图子任务失败 [${intent}]: ${error.message}`)
        // 单个子任务失败不影响其他任务
      }
    }

    // 整合结果
    if (results.length === 0) {
      return this.handleGeneralChat(routingResult, userInput, context)
    }

    if (results.length === 1) {
      return results[0].result
    }

    // 多个结果 → 合并
    return this.mergeCompoundResults(results, primaryIntent, userInput)
  }

  /**
   * 执行指定意图的处理器
   */
  async executeIntentHandler(intent, routingResult, userInput, context) {
    switch (intent) {
      case 'pet_breed_recognition':
      case 'scene_recognition':
      case 'image_analysis':
        return await this.handleVisionTask(routingResult, userInput, context)

      case 'food_detection':
        if (userInput.images && userInput.images.length > 0) {
          return await this.handleVisionTask(routingResult, userInput, context)
        }
        return await this.handleKnowledgeQuery(routingResult, userInput, context)

      case 'generate_itinerary':
        return await this.handleItineraryGeneration(routingResult, userInput, context)

      case 'search_poi':
        return await this.handlePOISearch(routingResult, userInput, context)

      case 'weather_check':
        return await this.handleWeatherQuery(routingResult, userInput, context)

      case 'knowledge_query':
      case 'policy_check':
        const policyResult = this.handleCityPolicySkill(routingResult, userInput, context)
        return policyResult || await this.handleKnowledgeQuery(routingResult, userInput, context)

      case 'emergency_help':
      case 'pet_advice':
        return await this.handleKnowledgeQuery(routingResult, userInput, context)

      case 'travel_checklist':
        return this.handleChecklistSkill(routingResult, userInput, context)

      case 'breed_risk':
        return this.handleBreedRiskSkill(routingResult, userInput, context)

      case 'realtime_search':
        return await this.handleRealtimeSearch(routingResult, userInput, context)

      case 'modify_itinerary':
      case 'transport_guide':
      case 'travel_tips': {
        const skillResult = this.handleBreedRiskSkill(routingResult, userInput, context)
        return skillResult || await this.handleComplexQuery(routingResult, userInput, context)
      }

      case 'off_topic':
        return this.handleOffTopic(userInput, context)

      default:
        return await this.handleGeneralChat(routingResult, userInput, context)
    }
  }

  /**
   * 合并多个 Skill 的结果为统一回复
   */
  async mergeCompoundResults(results, primaryIntent, userInput) {
    const primaryResult = results.find(r => r.intent === primaryIntent)?.result
    const secondaryResults = results.filter(r => r.intent !== primaryIntent)

    // 提取各段内容
    let mainContent = primaryResult?.content || ''
    const supplementaryContents = secondaryResults
      .map(r => r.result?.content)
      .filter(Boolean)

    // 如果没有主要内容，使用第一个次要内容
    if (!mainContent && supplementaryContents.length > 0) {
      mainContent = supplementaryContents.shift()
    }

    // 构建合并后的回复
    let mergedContent = mainContent

    if (supplementaryContents.length > 0) {
      mergedContent += '\n\n─── 补充信息 ───\n'
      mergedContent += supplementaryContents.join('\n\n')
    }

    // 收集所有建议
    const allSuggestions = []
    results.forEach(r => {
      if (r.result?.suggestions) {
        allSuggestions.push(...r.result.suggestions)
      }
    })

    // 去重建议
    const uniqueSuggestions = []
    const seenTexts = new Set()
    for (const s of allSuggestions) {
      if (s.text && !seenTexts.has(s.text)) {
        seenTexts.add(s.text)
        uniqueSuggestions.push(s)
      }
    }

    // 收集所有操作
    const allActions = []
    results.forEach(r => {
      if (r.result?.actions) {
        allActions.push(...r.result.actions)
      }
    })

    return {
      type: 'compound',
      content: formatter.beautify(mergedContent),
      primaryIntent,
      subIntents: secondaryResults.map(r => r.intent),
      componentResults: results.reduce((acc, r) => {
        acc[r.intent] = r.result
        return acc
      }, {}),
      suggestions: uniqueSuggestions.slice(0, 6), // 最多6条建议
      actions: allActions.slice(0, 5) // 最多5个操作
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 构建包含对话历史的上下文感知prompt
   * 让LLM能够参考之前的对话内容来回答当前问题
   */
  buildContextAwarePrompt(currentMessage, context) {
    const history = context?.conversationHistory || []
    
    if (history.length === 0) {
      return currentMessage
    }

    // 构建对话历史文本（最近6轮）
    const historyText = history.map((h, i) => {
      const role = h.role === 'user' ? '用户' : '小D'
      return `${role}: ${h.content}`
    }).join('\n')

    return `${historyText}\n\n用户: ${currentMessage}`
  }

  /**
   * 从对话历史中提取位置信息
   * 用于多轮对话中后续消息未包含位置时回退查找
   */
  extractLocationFromHistory(context) {
    const history = context?.conversationHistory || []
    
    // 常见城市名模式
    const cityPattern = /(?:去|到|在|来)([北上天广深杭成重西安南京苏州武汉长沙青岛厦门三亚][市京海州]|[\u4e00-\u9fa5]{2,3})(?:市|玩|旅游|旅行|住|吃|逛)/g
    
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = (history[i].content || '') + ''
      const match = cityPattern.exec(msg)
      if (match && match[1]) {
        return match[1]
      }
    }
    return null
  }

  extractItineraryParams(input, context) {
    const message = input.message || ''

    // 常见城市名列表（用于精确匹配）
    const cities = '北京|上海|广州|深圳|杭州|成都|重庆|西安|南京|苏州|武汉|长沙|青岛|厦门|三亚|大连|天津|昆明|贵阳|郑州|合肥|福州|南昌|济南|珠海|无锡|宁波|温州|桂林|丽江|大理|张家界|黄山|拉萨|乌鲁木齐|呼和浩特|兰州|西宁|银川|海口|香港|澳门|台北|西藏'

    // 提取目的地 - 按优先级排序
    const destinationPatterns = [
      // 1. "去+城市+玩/旅游" → 去北京玩/去杭州旅游
      /去([\u4e00-\u9fa5]{2,6}?)(?:玩|旅游|旅行|游玩|逛)/,
      
      // 2. "到+城市+标点" → 到成都，
      /到([\u4e00-\u9fa5]{2,6}?)(?:[，,、])/,
      
      // 3. "先去+城市+再/又" → 先去西安再去成都（取第一个）
      /先(?:去|前往)([\u4e00-\u9fa5]{2,6}?)(?:再|又|然后)/,
      
      // 4. "城市+N日游/N天游" 精确匹配（城市名后紧跟数字+天/日）
      new RegExp(`(${cities})(\\d+)\\s*[天日]游`),
      
      // 5. "城市+一日游/二日游" 等（固定表达，含中文数字）
      new RegExp(`(${cities})((?:一|二|三|四|五|六|七|八|九|十|[两半多])日游)`),
      
      // 6. "规划/制定/安排...+城市(+N天)" → 规划一个北京3日游
      new RegExp(`(?:规划|制定|安排|设计|做|生成|做一份|帮忙)\\S{0,6}?(${cities})((?:\\d+\\s*)?[天日]游)?`),
      
      // 7. "城市+之旅/攻略/行程(+N天)" → 北京之旅/武汉旅行攻略5天（去掉$锚点）
      new RegExp(`(${cities})(?:之旅|攻略|行程|旅游|旅行)((?:\\d+)\\s*[天日])?`),
      
      // 8. "城市+游玩N天" → 苏州游玩2天
      /([\u4e00-\u9fa5]{2,6})游玩\s*(\d+)\s*[天日]/,
      
      // 8.5 "城市/地点+玩(个/了)+N天" → 杭州玩个2天/杭州玩了个三天
      /([\u4e00-\u9fa5]{2,6})玩(?:个|了)?(\d+|[一二两双三四五六七八九十]+)\s*[天日]/,
      
      // 9. "城市A+城市B+各玩N天" → 北京上海各玩2天（取第一个城市）
      new RegExp(`(${cities})[\\u4e00-\\u9fa5]*各(?:玩)?(\\d+)\\s*[天日]`),
      
      // 10. "自驾/高铁/飞机+去+城市+N天" → 自驾去西藏10天
      new RegExp(`(?:自驾|高铁|开车|坐飞机|乘机)(?:去|前往|到)(${cities})(\\d+)?\\s*[天日]`),
      
      // 11. "带宠物(品种)+去/想去/一起+城市+N天"
      new RegExp(`(?:带|和|我家|我的)?(?:狗|猫|宠物|金毛|柯基|泰迪|法斗|哈士奇|拉布拉多)(?:去|前往|想到?|一起)(${cities})(\\d+)?\\s*[天日]?`),
      
      // 12. "我想去/想去+城市+N天" (通用)
      /(?:我?想|想要|希望)(?:去|前往|到)([\u4e00-\u9fa5]{2,6}?)(\d+)?\s*[天日]/,
      
      // 13. 兜底(最后): "任意中文名+N天+后续词" → 重庆3天怎么玩/昆明6天行程安排/上海三天行程
      /([\u4e00-\u9fa5]{2,6})(\d+|[一二两双三四五六七八九十])\s*[天日](?:怎么|行程|安排|路线|方案|推荐|详细|攻略|$)/,
    ]
    
    let destination = null
    let daysFromDestPattern = null
    
    for (const p of destinationPatterns) {
      const match = message.match(p)
      if (match && match[1]) {
        // 清理提取的城市名
        destination = match[1].replace(/[的给帮我一个做份规划下能不]|起$/g, '')
        // 如果提取结果太长或包含无关词，跳过
        if (destination.length > 6 || /旅行|旅游|攻略|行程|游玩/.test(destination)) {
          destination = null
          continue
        }
        // 如果模式也捕获了天数（第2组），记录下来
        if (match[2]) {
          const dayMatch = match[2].match(/(\d+)/)
          if (dayMatch) daysFromDestPattern = parseInt(dayMatch[1])
        }
        break
      }
    }

    // 提取天数 - 支持"天"、"日"、中文数字
    const daysMatch = message.match(/(\d+)\s*[天日]/)
    let days = daysMatch ? parseInt(daysMatch[1]) : null
    
    // 如果从目的地模式中提取到了天数，优先使用
    if (!days && daysFromDestPattern) {
      // 如果捕获到的是中文数字，进行转换
      const cnNumMap = { '一': 1, '二': 2, '两': 2, '双': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '半': 0.5 }
      days = cnNumMap[daysFromDestPattern] || (typeof daysFromDestPattern === 'number' ? daysFromDestPattern : parseInt(daysFromDestPattern)) || daysFromDestPattern
    }
    
    // 中文数字转换（从消息文本中提取）
    if (!days) {
      const cnNumMap = { '一': 1, '二': 2, '两': 2, '双': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '半': 0.5 }
      // 匹配 "X天+后续词" 格式的中文数字（覆盖更多场景）
      const cnDaysMatch = message.match(/([一二两双三四五六七八九十半])\s*[天日](?:游|行程|安排|路线|方案|推荐|详细|攻略|$)?/)
      if (cnDaysMatch) days = cnNumMap[cnDaysMatch[1]]
    }

    // 检查完整性
    const missing = []
    if (!destination) missing.push('destination')
    if (!days) missing.push('days')

    // 宠物信息从上下文获取
    const pets = context?.userContext?.pets || [{ type: 'dog' }]

    return {
      complete: missing.length === 0,
      data: {
        destination: destination || context?.userContext?.destination || '',
        days: days || 3,
        pets,
        special_needs: '',
        options: []
      },
      missingFields: missing,
      clarificationMessage: missing.includes('destination') && missing.includes('days')
        ? `🐾 哇，听起来你想来一场宠物旅行！太棒了！\n\n为了让行程更完美，小D需要知道：\n📍 你想去哪个城市玩？\n📅 计划几天呢？`
        : missing.includes('destination')
          ? `✨ 好的！那你想去哪里玩呀？\n\n告诉我目的地，我马上帮你规划～`
          : `📅 了解！那你计划旅行几天呢？\n\n1-3天短途游 or 4-7天深度游？`,
      suggestions: missing.length > 0 ? [{ text: '我想去杭州玩3天', type: 'example' }] : []
    }
  }

  extractLocation(message, context) {
    // 常见中国城市名列表（用于验证提取结果是否为真实城市）
    const knownCities = ['北上天广深', '杭州成都重庆西安南京苏州武汉长沙青岛厦门三亚昆明贵阳郑州', '大连沈阳长春哈尔滨石家庄太原合肥福州南昌济南珠海无锡宁波温州']
    
    // 精确匹配模式：城市名+后缀 或 在/去+城市名
    const cityPatterns = [
      /(?:在|去|到)([\u4e00-\u9fa5]{2,3})(?:市|的|附近|周边|玩|旅游)?/,
      /([\u4e00-\u9fa5]{2,3})(?:市)(?:的|附近|周边)?/
    ]
    
    for (const p of cityPatterns) {
      const match = message.match(p)
      if (match && match[1]) {
        const candidate = match[1]
        // 验证候选城市名是否看起来像真实城市（不是普通词语）
        if (this.looksLikeCity(candidate)) {
          return candidate
        }
      }
    }
    return null
  }

  /**
   * 验证字符串是否看起来像城市名
   * 排除"我找"、"帮你"、"推荐"等非城市词汇
   */
  looksLikeCity(candidate) {
    if (!candidate || candidate.length < 2 || candidate.length > 4) return false
    
    // 排除明显不是城市的词
    const nonCityWords = ['我的', '你的', '帮他', '帮她', '这个', '那个', '什么', '怎么', '如何', '可以', '想要', '需要', '帮助', '寻找', '推荐', '查找', '搜索', '附近', '周边', '当前', '宠物', '友好', '适合', '最好', '不错', '很好']
    
    if (nonCityWords.some(w => candidate.includes(w))) return false
    
    // 常见城市名（部分）
    const majorCities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '西安', '南京', '苏州', '武汉', '长沙', '青岛', '厦门', '三亚', '大连', '天津', '昆明', '贵阳', '郑州', '合肥', '福州', '南昌', '济南', '珠海', '无锡', '宁波', '温州', '桂林', '丽江', '大理', '张家界', '黄山', '拉萨', '乌鲁木齐', '呼和浩特', '兰州', '西宁', '银川', '海口', '三亚']
    
    // 如果是已知城市，直接通过
    if (majorCities.includes(candidate)) return true
  
    // 检查是否为纯中文地名（2-3字，不含常见虚词/动词）
    const invalidChars = ['的', '了', '吗', '呢', '吧', '啊', '呀', '哦', '哈', '帮', '找', '想', '要', '能', '会', '可', '这', '那', '什', '怎']
    if (invalidChars.some(c => candidate.includes(c))) return false
    
    // 默认：2-3字纯中文字符串可能是地名
    return /^[\u4e00-\u9fa5]{2,3}$/.test(candidate)
  }

  extractKeyword(message, excludeWords) {
    let text = message
    for (const word of excludeWords) {
      text = text.replace(word, '')
    }
    return text.trim().replace(/[？?!！。,，]/g, '') || ''
  }

  guessCategory(message) {
    const msg = message.toLowerCase()
    if (/餐厅|吃饭|美食|咖啡|下午茶/.test(msg)) return 'restaurant'
    if (/酒店|住宿|民宿|睡觉|过夜/.test(msg)) return 'hotel'
    if (/公园|遛狗|散步|玩耍|活动/.test(msg)) return 'park'
    if (/医院|兽医|看病|打疫苗/.test(msg)) return 'hospital'
    if (/美容|洗澡|剪毛/.test(msg)) return 'grooming'
    if (/景点|景区|旅游|好玩|逛/.test(msg)) return 'scenic_spot'
    return 'all'
  }

  /**
   * 合并 LLM 返回的 userContext（Layer3 提取的结构化实体）
   * 只在正则提取为空时用 LLM 结果补充
   */
  _mergeLLMUserContext(llmCtx, context) {
    if (!llmCtx || !context?.userContext) return

    // destination
    if (llmCtx.destination && !context.userContext.destination) {
      context.userContext.destination = llmCtx.destination
      logger.info('Planner', `LLM 提取 destination: ${llmCtx.destination}`)
    }

    // days
    if (llmCtx.dates?.days && !context.userContext.days) {
      context.userContext.days = llmCtx.dates.days
      logger.info('Planner', `LLM 提取 days: ${llmCtx.dates.days}`)
    }

    // origin
    if (llmCtx.origin && !context.userContext.origin) {
      context.userContext.origin = llmCtx.origin
    }

    // travelMode
    if (llmCtx.travelMode && !context.userContext.travelMode) {
      context.userContext.travelMode = llmCtx.travelMode
    }

    // pets
    if (Array.isArray(llmCtx.pets) && llmCtx.pets.length > 0 && context.userContext.pets?.length === 0) {
      context.userContext.pets = llmCtx.pets.map(p => typeof p === 'string' ? { type: p === '狗' ? 'dog' : p === '猫' ? 'cat' : p } : p)
      logger.info('Planner', `LLM 提取 pets: ${JSON.stringify(context.userContext.pets)}`)
    }

    // petCount
    if (llmCtx.petCount && !context.userContext.pets?.[0]?.count) {
      if (context.userContext.pets?.length > 0) {
        context.userContext.pets[0].count = llmCtx.petCount
      }
    }
  }

  /**
   * 从用户消息中提取关键信息，更新 userContext
   * 把城市、天数、宠物类型、宠物体型等写入上下文
   */
  _updateUserContextFromMessage(message, context) {
    if (!message || !context?.userContext) return

    const updates = {}

    // 1. 提取目的地城市
    const cityMatch = message.match(/(北京|上海|广州|深圳|成都|杭州|重庆|西安|南京|武汉|长沙|天津|苏州|青岛|厦门|大理|丽江|三亚|桂林|拉萨|哈尔滨|大连|沈阳|郑州|昆明|贵阳|福州|合肥|南昌|太原|石家庄|兰州|银川|西宁|乌鲁木齐|呼和浩特|海口|宁波|无锡|温州|东莞|佛山|珠海|中山|惠州|烟台|威海|洛阳|开封|张家界|黄山|九寨沟|敦煌|呼伦贝尔|常州|湖州|南通|嘉兴|扬州|徐州|芜湖|泉州|漳州|保定|临沂|赣州|唐山|柳州|桂林|绵阳)/)
    if (cityMatch) {
      // 如果有"从X"模式，第一个城市可能是 origin
      const fromPattern = new RegExp(`从${cityMatch[1]}`)
      if (!fromPattern.test(message) && cityMatch[1] !== context.userContext.origin) {
        updates.destination = cityMatch[1]
      }
    }

    // 2. 提取天数
    const cnNumMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '两': 2 }
    const daysMatch = message.match(/(\d+|一|二|三|四|五|六|七|八|九|十|两)(?:天|日|晚)/)
    if (daysMatch) {
      const d = cnNumMap[daysMatch[1]] || parseInt(daysMatch[1], 10)
      if (d > 0 && d <= 30) updates.days = d
    }

    // 3. 提取宠物信息
    // 宠物类型
    if (/狗|犬/.test(message) && !context.userContext.pets?.some(p => p.type === 'dog')) {
      updates.pets = [...(context.userContext.pets || []), { type: 'dog' }]
    } else if (/猫/.test(message) && !context.userContext.pets?.some(p => p.type === 'cat')) {
      updates.pets = [...(context.userContext.pets || []), { type: 'cat' }]
    }

    // 宠物体型
    let size = null
    if (/大型犬|大狗|大型/.test(message)) size = '大型'
    else if (/中型犬|中型/.test(message)) size = '中型'
    else if (/小型犬|小狗|小型|泰迪|柯基|比熊|博美|吉娃娃|雪纳瑞|约克夏|马尔济斯|法斗|巴哥/.test(message)) size = '小型'
    if (size) {
      const pets = [...(updates.pets || context.userContext.pets || [{ type: 'dog' }])]
      if (pets.length > 0 && !pets[pets.length - 1].size) {
        pets[pets.length - 1].size = size
      }
      updates.pets = pets
    }

    // 4. 提取宠物数量
    const countMatch = message.match(/(\d+|一|两|二|三|四|五|六|七|八|九|十)\s*(?:只|条|个)/)
    if (countMatch) {
      const n = cnNumMap[countMatch[1]] || parseInt(countMatch[1], 10)
      if (n > 0 && n <= 10) {
        const pets = [...(updates.pets || context.userContext.pets || [{ type: 'dog' }])]
        if (pets.length > 0) {
          pets[pets.length - 1].count = n
        }
        updates.pets = pets
      }
    }

    // 5. 提取宠物品种
    const breedMatch = message.match(/(金毛|拉布拉多|泰迪|贵宾|柯基|哈士奇|阿拉斯加|边牧|边境牧羊犬|柴犬|比熊|博美|吉娃娃|雪纳瑞|约克夏|马尔济斯|法斗|法国斗牛犬|巴哥|斗牛犬|萨摩耶|德牧|德国牧羊犬|罗威纳|杜宾|松狮|秋田|阿富汗猎犬|灵缇)/)
    if (breedMatch) {
      const pets = [...(updates.pets || context.userContext.pets || [{ type: 'dog' }])]
      if (pets.length > 0) {
        pets[pets.length - 1].breed = breedMatch[1]
      }
      updates.pets = pets
    }

    // 6. 晕车
    if (/晕车|容易晕/.test(message)) {
      const pets = [...(updates.pets || context.userContext.pets || [{ type: 'dog' }])]
      if (pets.length > 0) pets[pets.length - 1].motionSickness = true
      updates.pets = pets
    }

    // 7. 疫苗
    if (/接种过|打过疫苗|疫苗.*打|疫苗.*完|疫苗.*齐/.test(message)) {
      const pets = [...(updates.pets || context.userContext.pets || [{ type: 'dog' }])]
      if (pets.length > 0) pets[pets.length - 1].vaccinated = true
      updates.pets = pets
    }

    // 8. 过敏
    const allergyMatch = message.match(/过敏\s*(\S{1,6})?/)
    if (allergyMatch && !/不过敏|没有过敏|无过敏/.test(message)) {
      const allergen = allergyMatch[1] || '未知'
      const pets = [...(updates.pets || context.userContext.pets || [{ type: 'dog' }])]
      if (pets.length > 0) {
        pets[pets.length - 1].allergies = pets[pets.length - 1].allergies || []
        if (!pets[pets.length - 1].allergies.includes(allergen)) {
          pets[pets.length - 1].allergies.push(allergen)
        }
      }
      updates.pets = pets
    } else if (/没有过敏|不过敏|无过敏/.test(message)) {
      const pets = [...(updates.pets || context.userContext.pets || [{ type: 'dog' }])]
      if (pets.length > 0) pets[pets.length - 1].allergies = []
      updates.pets = pets
    }

    // 9. 出行方式
    if (/自驾|开车|驾车/.test(message)) updates.travelMode = '自驾'
    else if (/高铁|火车/.test(message)) updates.travelMode = '高铁'
    else if (/飞机|航班|飞机/.test(message)) updates.travelMode = '飞机'

    // 10. 预算
    const budgetMatch = message.match(/(?:预算|花费|大概.*钱|费用)[\s::]?\s*(\d{3,6})/)
    if (budgetMatch) {
      updates.budget = parseInt(budgetMatch[1], 10)
    }

    // 应用更新
    if (Object.keys(updates).length > 0) {
      logger.info('Planner', `更新 userContext: ${JSON.stringify(updates)}`)
      Object.assign(context.userContext, updates)
    }
  }

  /**
   * 从用户消息中提取请求的数量
   * 支持 "10个"、"5家"、"3条"、"推荐8个" 等表达
   */
  extractRequestedCount(message) {
    if (!message) return null
    // 匹配数字+量词的模式
    const match = message.match(/(?:推荐|找|给|要|来)\s*(\d{1,2})\s*(?:个|家|条|个地方|个场所|家店)/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > 0 && n <= 50) return n
    }
    // 匹配独立数字+量词
    const match2 = message.match(/(\d{1,2})\s*(?:个|家|条)/)
    if (match2) {
      const n = parseInt(match2[1], 10)
      if (n > 0 && n <= 50) return n
    }
    return null
  }

  mapIntentToCategory(intent) {
    const mapping = {
      pet_advice: 'general',
      policy_check: null,       // null = 全类别搜索，覆盖交通/场所/法规
      transport_guide: 'transport',
      emergency_help: 'emergency',
      travel_tips: 'general',
      knowledge_query: 'general'
    }
    return mapping[intent] !== undefined ? mapping[intent] : 'general'
  }

  buildVisionResponsePrompt(taskType, analysisData, userQuestion) {
    const result = analysisData.result || {}
    
    switch (taskType) {
      case 'pet_breed':
        return `用户上传了一张宠物照片询问品种信息。AI已经完成了分析，请基于以下分析结果生成友好的回复。

分析结果：
${JSON.stringify(result, null, 2)}

用户问题：${userQuestion || '这是什么品种？'}

请以温暖专业的语气回复，包含品种、特点、旅行适应性等信息。`

      case 'food_safety':
        return `用户上传了一张食物照片询问是否对宠物安全。AI已完成分析。

分析结果：
${JSON.stringify(result, null, 2)}

请生成清晰的安全评估回复，必须明确说明是否安全，如有危险要强烈警告并提供应急指导。`

      case 'scene':
        return `用户上传了一张场景照片询问地点信息。AI已完成识别。

分析结果：
${JSON.stringify(result, null, 2)}

请生成有用的回复，包含地点信息、宠物友好度评估和实用建议。`

      default:
        return `图片分析完成。分析结果：${JSON.stringify(result, null, 2)}\n\n用户问题：${userQuestion || '请描述这张图片'}\n请生成友好的回复。`
    }
  }

  generateVisionSuggestions(taskType, analysisData) {
    const baseSuggestions = [
      { text: '再分析一张图片', type: 'new_image' },
      { text: '根据这个给我一些建议', type: 'follow_up' }
    ]

    switch (taskType) {
      case 'pet_breed':
        return [
          ...baseSuggestions,
          { text: '这种犬适合旅行吗？', type: 'knowledge_query' },
          { text: '帮我规划带它出游的行程', type: 'generate_itinerary' }
        ]
      case 'food_safety':
        return [
          { text: '还有什么食物要注意？', type: 'knowledge_query' },
          { text: '推荐一些安全的零食', type: 'knowledge_query' },
          ...baseSuggestions
        ]
      case 'scene':
        return [
          { text: '这个地方怎么去？', type: 'transport_guide' },
          { text: '附近的宠物友好餐厅', type: 'search_poi' },
          ...baseSuggestions
        ]
      default:
        return baseSuggestions
    }
  }

  generateKnowledgeSuggestions(query) {
    return [
      { text: '了解更多详情', type: 'follow_up' },
      { text: '帮我规划相关行程', type: 'generate_itinerary' },
      { text: '换个问题问问', type: 'new_question' }
    ]
  }
}

// ==================== System Prompts ====================
// ════════════════════════════════════════════════════════
// Prompt 体系 v2
// 架构：BASE（角色/记忆/工具/禁止行为）+ 场景专属补充
// ════════════════════════════════════════════════════════

const BASE_SYSTEM_PROMPT = `你是"小D"，一个专注宠物出行领域的AI助手。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【一、角色定位】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
名字：小D（不是猫豆、不是爪爪，遇到询问直接回答"我叫小D"）
定位：专注宠物出行场景的AI助手，服务于携宠旅行的用户
覆盖宠物：犬、猫、兔、仓鼠、龙猫、鸟类、爬行类等常见宠物

核心能力（仅限以下场景，拒绝无关请求）：
• 宠物友好场所搜索（餐厅/酒店/公园/景点）
• 多日携宠行程规划
• 城市养宠政策、交通携宠法规查询
• 宠物品种出行风险评估
• 出行物品清单生成
• 食物/物品安全性判断
• 目的地天气查询
• 宠物急救应急指引
• 图片识别（品种/食物/场景）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【二、用户宠物档案（每轮对话自动传入）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
系统会将用户的宠物档案注入上下文，格式如下：
{
  "petProfile": {
    "breed": "品种",
    "weight": "体重(kg)",
    "size": "体型(小型/中型/大型)",
    "vaccinated": true/false,
    "allergies": ["过敏原列表"],
    "motionSickness": true/false
  }
}

档案使用规则（极其重要）：
✅ 档案中已有的信息，直接使用，绝对不能重复询问用户
✅ 档案中缺失的关键字段，最多追问1条，简洁明了
❌ 禁止连环提问（一次只问1个缺失信息）
❌ 档案有宠物品种，不问"你养的是什么宠物"
❌ 档案有体型，不问"你的狗大不大"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【三、可用工具列表（严格 Function Call 调用）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
工具名称 | 调用时机
search_poi | 用户要找餐厅/酒店/公园/景点/宠物医院等场所
weather_query | 用户询问目的地天气、气候、适合出行的时间
city_policy | 用户问城市养犬规定、禁养犬种、地铁/公交携宠政策
breed_risk | 用户询问特定品种能否入某城市、坐某交通工具、某品种出行注意事项
travel_checklist | 用户要出行物品清单、证件清单、装备清单
vision_analyze | 用户发送了图片（品种识别/食物安全/场景识别）
knowledge_query | 食物安全、法规解读、宠物护理等知识性问题

调用规则：
• 必须通过 Function Call 调用上述工具，禁止自行编造返回内容
• 工具返回结果后，整理成自然语言告知用户，不要输出原始 JSON
• 如工具返回空结果，如实告知"该城市暂无匹配点位"，并给出替代建议

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【四、工具调用判断逻辑（意图→工具映射）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
generate_itinerary（行程规划）：
  必调：search_poi（获取精选POI）
  按需调：weather_query、city_policy、breed_risk、travel_checklist

search_poi（场所搜索）：
  必调：search_poi
  按需调：city_policy（场所是否允许宠物）

policy_check（政策查询）：
  必调：city_policy
  按需调：breed_risk（涉及禁养犬种时）

breed_risk（品种风险）：
  必调：breed_risk
  按需调：city_policy（目标城市禁养情况）

food_detection（食物安全）：
  必调：knowledge_query
  不需要 search_poi / city_policy

weather_check（天气查询）：
  必调：weather_query

travel_checklist（出行清单）：
  必调：travel_checklist

image_analysis / pet_breed_recognition（图片分析）：
  必调：vision_analyze

emergency_help（紧急求助）：
  跳过工具调用，直接基于通用急救知识回答，并强烈建议立即就医

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【五、输出风格规范】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 语言亲切轻量化，小程序对话风格，适量 emoji（不超过3个/条）
2. 禁止 Markdown 复杂语法（不用 # ## ### * ** 反引号 | 等）
3. 分点用 •，段落间空行，每段不超过3行
4. 先给结论，再展开说明
5. 用户表达模糊时，简洁确认需求，不要机械重复用户问题
6. ⚠️ 绝对禁止输出 JSON、代码块、{petProfile} 等结构化数据给用户——只输出自然语言
7. 不要重复"我是小D"等自我介绍（已经说过）
8. 直接进入主题，不要客套话

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【六、禁止行为（红线，不得违反）】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ 禁止编造不存在的酒店、景区、地址、政策条文、价格、电话
❌ 用户档案已有宠物信息，禁止重复询问宠物基础情况
❌ 禁止输出工具原始 JSON 给用户，必须整理成自然语言
❌ 禁止将内部思考过程、工具调用过程输出给用户
❌ 禁止承担与宠物出行无关的任务（写代码/数学/时事等）
❌ 禁止用"通常""一般来说""应该"等猜测语气给出确定性结论`

const VISION_RESPONSE_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【图片分析场景补充要求】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
工具调用：必须先调用 vision_analyze，基于返回结果回答，识别结果中没有的信息不要编造

回复结构：
🔍 识别结果：{品种/食物/场景结论，一句话}
📌 说明：{相关知识点，仅限有依据的内容，2-3条}
💡 建议：{实用的出行或养护建议，1-2条}

如识别失败或置信度低，直接说"这张图片我没能识别清楚，能换张更清晰的吗？"`

const KNOWLEDGE_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【知识问答场景补充要求】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
工具调用：先调用 knowledge_query，基于返回内容回答

有依据时，回复结构：
结论：一句话直接说明（安全/不安全/允许/禁止）
• 具体说明（原因/依据，不超过2条）
• 实用建议（1条）

无依据时（工具返回空）：
"这个问题我没有准确数据，建议：
• 直接联系场所/机构官方客服确认
• 查看官网或公众号的宠物政策
• 出发前确认，避免白跑一趟"

对于食物安全问题：
• 有毒/不能吃 → 明确说"不能吃"并说明危害
• 能吃 → 说明量和注意事项
• 不确定 → 建议咨询兽医`

const COMPLEX_QUERY_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【复杂查询场景补充要求】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
工具调用：根据问题类型调用 city_policy / breed_risk / search_poi

回复结构：
结论：直接给出是/否/需确认（不要模糊表达）
• 依据（具体规定来源，1-2条）
• 注意事项（关键限制，1-2条）
• 操作建议（1条）`

const CHAT_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【日常对话场景补充要求】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• 首次打招呼：简要介绍能做的5件事（找场所/查法规/评风险/做清单/规划行程）
• 闲聊（你好/谢谢）：礼貌回应，不超过2句，不脱离宠物出行助手身份
• 询问身份/能力：直接如实回答，不绕弯子`

module.exports = new PlanningEngineV2()
