/**
 * 旅行攻略子Agent — 主入口
 * 
 * 当主Router识别到 generate_itinerary 意图时，分发到这个子Agent处理
 * 
 * 完整流程：
 * 1. 接收用户输入 + 会话上下文
 * 2. SessionManager 判断场景（新对话/延续/切换/修改）
 * 3. SlotManager 提取槽位（正则 + LLM）
 * 4. ClarificationEngine 分析是否需要澄清
 *    → 需要澄清 → 返回反问，等待用户补充
 *    → 槽位就绪 → 进入规划阶段
 * 5. ToolOrchestrator 构建执行计划并调度执行
 * 6. MemoryStore 记录结果和偏好
 * 7. 返回格式化结果
 */

const { logger } = require('../../utils/logger')
const slotManager = require('./slot_manager')
const clarificationEngine = require('./clarification')
const toolOrchestrator = require('./tool_orchestrator')
const sessionManager = require('./session_manager')
const memoryStore = require('./memory_store')

// LLM 客户端（用于槽位提取和行程生成）
let zhipuClient = null

function _getLLMClient() {
  if (!zhipuClient) {
    try {
      zhipuClient = require('../../llm/zhipu_client')
    } catch (e) {
      logger.warn('TravelPlanner', 'LLM客户端加载失败，将使用纯正则模式')
    }
  }
  return zhipuClient
}

class TravelPlannerAgent {
  constructor() {
    this.name = 'travel_planner'
    this.version = '2.0.0'
    
    // 组件引用
    this.slotManager = slotManager
    this.clarificationEngine = clarificationEngine
    this.toolOrchestrator = toolOrchestrator
    this.sessionManager = sessionManager
    this.memoryStore = memoryStore

    logger.info('TravelPlanner', `子Agent初始化完成: v${this.version}`)
  }

  /**
   * 主入口方法 — 处理旅行攻略请求
   * 
   * @param {object} request - 用户请求
   * @param {string} request.text - 用户消息文本
   * @param {string} request.sessionId - 会话ID
   * @param {string} request.userId - 用户ID
   * @param {Array} request.images - 图片列表（可选）
   * @param {object} request.context - 额外上下文
   * @returns {object} 响应结果
   */
  async process(request) {
    const timer = logger.time('travel_planner')
    const { text: userMessage, sessionId = 'default', userId = 'anonymous', images = [], context = {} } = request

    logger.info('TravelPlanner', `收到请求: session=${sessionId}, user=${userId}, msg="${userMessage.slice(0, 50)}"`)

    try {
      // ═══ Step 1: 获取/创建会话 ═══
      const session = this.sessionManager.getSession(sessionId, userId)

      // ═══ Step 2: 场景意图分析 ═══
      const intentAnalysis = this.sessionManager.analyzeUserIntent(userMessage, session)
      logger.info('TravelPlanner', `场景意图: ${intentAnalysis.intent} (${(intentAnalysis.confidence * 100).toFixed(0)}%)`)

      // 处理场景切换
      if (intentAnalysis.intent === 'switch' || intentAnalysis.intent === 'switch_destination') {
        this.sessionManager.resetSession(sessionId, true) // 保留偏好
        logger.info('TravelPlanner', `检测到场景切换，会话已重置`)
        // 继续走正常流程，用新消息重新提取槽位
      }

      // 处理修改模式
      if (intentAnalysis.intent === 'modify') {
        return await this._handleModifyMode(userMessage, session, context)
      }

      // ═══ Step 3: 加载长期记忆/用户档案 ═══
      const userProfile = context.userProfile || {}
      let userMemory = await this.memoryStore.getUserMemory(userId)

      // 如果有小程序传来的用户信息，初始化记忆
      if (userProfile.pets && (!userMemory.pets || userMemory.pets.length === 0)) {
        userMemory = await this.memoryStore.initFromUserProfile(userId, userProfile)
      }

      // 召回相关记忆
      const relevantMemories = await this.memoryStore.recallRelevantMemories(userId, {})

      // ═══ Step 4: 构建上下文（供槽位提取使用）═══
      // 合并主 Agent 的 userContext（planner 已更新的宠物/目的地/天数等）
      const mainUserContext = context.userContext || {}
      const existingPets = mainUserContext.pets || []
      const existingPet = existingPets[existingPets.length - 1] || {}

      const extractionContext = {
        historySlots: this.sessionManager.getHistorySlots(sessionId),
        location: context.location || userMemory.homeCity ? { city: userMemory.homeCity } : null,
        userProfile: {
          petInfo: {
            type: existingPet.type || (relevantMemories.petInfo?.primaryPet?.type) || null,
            breed: existingPet.breed || null,
            size: existingPet.size || null,
            count: existingPet.count || (relevantMemories.petInfo?.allPets?.length) || null,
            motionSickness: existingPet.motionSickness || false,
            vaccinated: existingPet.vaccinated || false,
            allergies: existingPet.allergies || []
          },
          preferences: relevantMemories.preferences
        },
        // 传入已有槽位，避免重复提问
        existingSlots: {
          destination: mainUserContext.destination || '',
          days: mainUserContext.days || null,
          origin: mainUserContext.origin || '',
          travelMode: mainUserContext.travelMode || '',
          budget: mainUserContext.budget || null,
          petType: existingPet.type || '',
          petBreed: existingPet.breed || '',
          petSize: existingPet.size || '',
          petCount: existingPet.count || null
        },
        recentHistory: session.history?.slice(-4),
        suggestedDays: relevantMemories.suggestedDays
      }

      // ═══ Step 5: 槽位提取（混合模式）+ Slot Merge ═══
      // 方案C：正则快路径 + LLM结构化抽取一次完成，
      // 替代旧链路"正则提取→合并→缺失≥2再二次LLM补抽→再合并"的双重理解
      const llmClient = _getLLMClient()
      let extractionResult = await this.slotManager.extractSlotsHybrid(userMessage, extractionContext, llmClient)

      // Slot Merge：把当前轮提取结果与历史累积槽位智能合并
      const mergedSlots = this.sessionManager.mergeAndSaveSlots(sessionId, extractionResult.slots)
      // 用合并后的槽位重新判断缺失（而不是只看当前轮）
      extractionResult.slots = mergedSlots
      this.slotManager.recheckMissing(extractionResult)

      logger.info('TravelPlanner', `合并后槽位: ${JSON.stringify(extractionResult.slots)}`)
      logger.info('TravelPlanner', `缺失槽位: [${extractionResult.missing.map(m => m.name).join(', ')}]`)

      // ═══ Step 5.5: Planning Readiness Score ═══
      const readinessScore = this.slotManager.calculateReadiness(extractionResult.slots)
      logger.info('TravelPlanner', `Readiness Score: ${readinessScore}`)

      // ═══ Step 6: 更新会话状态 + 状态机推进 ═══
      const phase = readinessScore >= 70 ? 'ready_to_plan' : 'slot_filling'
      this.sessionManager.updateSession(sessionId, {
        userMessage,
        currentSlots: extractionResult.slots,
        newSlots: extractionResult.slots,
        phase
      })

      // ═══ Step 7: 澄清分析 ═══
      const clarificationDecision = this.clarificationEngine.analyze(
        extractionResult, sessionId, readinessScore
      )

      // readiness >= 70 直接规划，不进入澄清
      if (clarificationDecision.needClarify && !clarificationDecision.isReady && readinessScore < 70) {
        const response = this.clarificationEngine.generateResponse(clarificationDecision, extractionResult)
        
        if (response.askedSlots) {
          for (const slotName of response.askedSlots) {
            this.clarificationEngine.markAsAsked(sessionId, slotName)
          }
        }

        this.sessionManager.updateSession(sessionId, { botResponse: response.content })

        timer.end()
        
        return {
          type: 'clarification',
          content: response.content,
          shouldProceed: false,
          askedSlots: response.askedSlots || [],
          missingSlots: extractionResult.missing.map(m => m.name),
          currentSlots: extractionResult.slots,
          suggestions: clarificationDecision.suggestions
        }
      }

      // ═══ Step 8: 槽位就绪，生成 TravelBrief，开始规划 ═══
      logger.info('TravelPlanner', '槽位就绪，生成 TravelBrief 进入规划阶段...')

      // 生成统一规划上下文（TravelBrief）
      const travelBrief = this.slotManager.buildTravelBrief(extractionResult.slots)
      // 把原始消息也带上，供 _detectItineraryType 使用
      travelBrief.rawMessage = userMessage
      logger.info('TravelPlanner', `TravelBrief: ${JSON.stringify(travelBrief)}`)

      // 记录宠物信息到长期记忆
      if (extractionResult.slots.petType) {
        await this.memoryStore.recordPetInfo(userId, {
          type: extractionResult.slots.petType,
          breed: extractionResult.slots.petBreed || extractionResult.slots.petType,
          count: extractionResult.slots.petCount || 1
        })
      }

      // 更新会话阶段
      this.sessionManager.updateSession(sessionId, { phase: 'planning' })

      // ═══ Step 9: 工具编排与执行（统一读取 TravelBrief）═══
      const planResult = await this._executePlanning(travelBrief, context, sessionId)

      // ═══ Step 10: 记录到记忆 ═══
      if (planResult && planResult.itinerary) {
        await this.memoryStore.recordTrip(userId, {
          destination: extractionResult.slots.destination,
          days: extractionResult.slots.days,
          petType: extractionResult.slots.petType,
          budget: extractionResult.slots.budget
        })
      }

      // ═══ Step 11: 标记完成 & 返回 ═══
      this.sessionManager.markPlanningComplete(sessionId, planResult)

      timer.end()
      logger.info('TravelPlanner', `请求处理完成`)

      return {
        type: 'itinerary',
        ...planResult,
        slots: extractionResult.slots,
        executionTime: timer.getElapsed ? timer.getElapsed() : null
      }

    } catch (error) {
      logger.error('TravelPlanner', `处理失败: ${error.message}\n${error.stack}`)
      
      // 兜底：用 LLM 生成一个基础攻略
      try {
        const llmClient = _getLLMClient()
        if (llmClient) {
          logger.info('TravelPlanner', '尝试用 LLM 兜底生成攻略')
          // 用变量安全地获取 slots（避免 extractionResult 未定义）
          const slots = (typeof extractionResult !== 'undefined' && extractionResult?.slots) || {}
          const dest = slots.destination || '目标城市'
          const days = slots.days || 3
          const petType = slots.petType || '宠物'
          
          const fallbackPrompt = `请为用户生成一份${dest}的${days}日宠物友好旅行攻略。

宠物类型：${petType}
天数：${days}天

要求：
1. 每天按上午/下午/晚上安排
2. 推荐宠物友好的景点、餐厅
3. 给出交通建议
4. 包含宠物出行注意事项
5. 用 emoji 和换行让内容易读，分点用 •
6. 内容要详细实用`

          const llmResult = await llmClient.simpleChat(
            fallbackPrompt,
            '你是宠物出行AI助手"小D"（不是猫豆）。请生成详细实用的旅行攻略。',
            { temperature: 0.7, maxTokens: 2500 }
          )
          const content = llmResult.content || (typeof llmResult === 'string' ? llmResult : '')
          
          return {
            type: 'itinerary',
            content: content || '抱歉，生成攻略时遇到了一些问题，请稍后重试～',
            itinerary: null,
            slots: slots,
            suggestions: ['需要调整行程吗？', '想要更详细的某个景点介绍？'],
            actions: [
              { type: 'regenerate', label: '重新生成方案' },
              { type: 'modify', label: '修改行程' }
            ]
          }
        }
      } catch (fallbackErr) {
        logger.error('TravelPlanner', `LLM兜底也失败: ${fallbackErr.message}`)
      }
      
      return {
        type: 'error',
        content: '抱歉，生成攻略时遇到了一些问题，请稍后重试～',
        error: error.message
      }
    }
  }

  /**
   * 执行行程规划（工具调度核心）
   */
  async _executePlanning(slots, context, sessionId) {
    // 检测行程类型
    const itineraryType = this._detectItineraryType({ ...slots, rawMessage: slots.rawMessage || context?.rawMessage })

    // 构建执行计划
    const plan = this.toolOrchestrator.buildExecutionPlan(slots, context)
    
    logger.info('TravelPlanner', `执行计划: ${JSON.stringify(plan.phases.map(p => ({ name: p.name, tools: p.tools })))}, 类型: ${itineraryType}`)

    // 创建工具执行器
    const toolExecutor = this._createToolExecutor(context, sessionId)

    // 执行计划
    const executionResult = await this.toolOrchestrator.executePlan(plan, slots, context, toolExecutor)

    // 格式化最终输出（传入类型）
    return this._formatOutput(executionResult.finalOutput, slots, itineraryType)
  }

  /**
   * 创建工具执行器（桥接 ToolOrchestrator 和实际工具）
   */
  _createToolExecutor(context, sessionId) {
    return {
      /**
       * 执行指定工具
       */
      execute: async (toolId, slots, execContext) => {
        const capability = this.toolOrchestrator.getCapability(toolId)
        if (!capability) {
          throw new Error(`未知工具: ${toolId}`)
        }

        logger.info(`TravelPlanner[Tool]`, `执行: ${capability.name}`)

        switch (toolId) {
          case 'poi_search':
            return await this._executePOISearch(slots, execContext)
          
          case 'city_policy':
            return await this._executeCityPolicy(slots, execContext)
          
          case 'weather_query':
            return await this._executeWeatherQuery(slots, execContext)
          
          case 'breed_risk_check':
            return await this._executeBreedRiskCheck(slots, execContext)
          
          case 'travel_checklist':
            return await this._executeTravelChecklist(slots, execContext)
          
          case 'itinerary_generation':
            return await this._executeItineraryGeneration(slots, execContext)
          
          default:
            logger.warn(`TravelPlanner[Tool]`, `未实现的工具: ${toolId}`)
            return null
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════
  // 各工具的具体实现
  // ════════════════════════════════════════════════════════

  async _executePOISearch(slots, context) {
    try {
      const searchTool = require('../../tools/registry').getTool('search_poi')
      if (searchTool) {
        const query = `${slots.destination} 宠物友好 ${slots.preference?.join(' ') || ''}`
        const result = await searchTool.execute({ query, city: slots.destination })
        return result
      }
    } catch (e) {
      logger.warn('TravelPlanner[POI]', `搜索失败: ${e.message}`)
    }
    return { pois: [], totalCount: 0 }
  }

  async _executeCityPolicy(slots, context) {
    try {
      const policySkill = require('../../skills/city_policy_skill')
      return await policySkill.execute({ city: slots.destination, petType: slots.petType })
    } catch (e) {
      logger.warn('TravelPlanner[Policy]', `政策查询失败: ${e.message}`)
    }
    return { policies: {}, restrictions: [] }
  }

  async _executeWeatherQuery(slots, context) {
    try {
      const weatherTool = require('../../tools/registry').getTool('weather')
      if (weatherTool) {
        return await weatherTool.execute({ city: slots.destination })
      }
    } catch (e) {
      logger.warn('TravelPlanner[Weather]', `天气查询失败: ${e.message}`)
    }
    return { forecast: [], suggestions: [] }
  }

  async _executeBreedRiskCheck(slots, context) {
    try {
      const breedSkill = require('../../skills/breed_risk_skill')
      return await breedSkill.execute({
        breed: slots.petType,
        destination: slots.destination,
        days: slots.days
      })
    } catch (e) {
      logger.warn('TravelPlanner[BreedRisk]', `品种评估失败: ${e.message}`)
    }
    return { riskLevel: 'unknown', tips: [] }
  }

  async _executeTravelChecklist(slots, context) {
    try {
      const checklistSkill = require('../../skills/travel_checklist_skill')
      return await checklistSkill.execute({
        destination: slots.destination,
        days: slots.days,
        petType: slots.petType,
        travelMode: slots.travelMode
      })
    } catch (e) {
      logger.warn('TravelPlanner[Checklist]', `清单生成失败: ${e.message}`)
    }
    return { categories: [], items: [] }
  }

  async _executeItineraryGeneration(slots, context) {
    const llmClient = _getLLMClient()
    if (!llmClient) {
      throw new Error('LLM客户端不可用')
    }

    // 获取前置工具的结果
    const poiData = context.toolResults?.poi_search || { pois: [] }
    const policyData = context.toolResults?.city_policy || { policies: {}, restrictions: [] }
    const weatherData = context.toolResults?.weather_query || { forecast: [] }
    const breedRiskData = context.toolResults?.breed_risk_check || { tips: [] }

    // 构建 Prompt
    const prompt = this._buildItineraryPrompt(slots, {
      pois: poiData,
      policy: policyData,
      weather: weatherData,
      breedRisk: breedRiskData
    })

    try {
      const response = await llmClient.chat([
        { role: 'system', content: this._getSystemPrompt() },
        { role: 'user', content: prompt }
      ], { temperature: 0.7, maxTokens: 4000 })

      // 解析响应
      return this._parseItineraryResponse(response, slots)
    } catch (e) {
      logger.error('TravelPlanner[Gen]', `行程生成失败: ${e.message}`)
      throw e
    }
  }

  // ════════════════════════════════════════════════════════
  // Prompt 工程
  // ════════════════════════════════════════════════════════

  _getSystemPrompt() {
    return `# 角色：携宠旅行攻略专用Agent

你是专业国内宠物旅行规划专家，你的核心工作：根据用户目的地、出行天数、出行偏好、【用户宠物档案】，调用工具获取真实POI点位，编排安全合理的携宠出行行程，解答宠物出行相关政策。

你的名字：小D（不是猫豆，遇到询问直接回答"我叫小D"）

## 已知上下文信息（后端每轮自动带入）

【用户宠物档案】
包含：宠物类型、品种、体型大小、体重、是否晕车、过敏情况、疫苗状态。

规则：
1. 档案已有信息，绝对禁止重复向用户询问宠物相关问题。
2. 只有档案缺失【宠物体型/宠物类型】且需要查询点位时，仅简洁追问缺失的1项参数，禁止连环提问。

## 可用工具，必须使用Function Call调用，严禁虚构任何POI数据

1. 在本地知识库里查询宠物友好地点和宠物禁入地点（search_poi）
   - 数据库覆盖55城402条POI，含friendliness_level友好等级（1级官方允许~4级严禁）
   - 按friendliness_level排序，1级优先推荐
2. 调用高德api查询宠物友好地点（作为补充）

### 工具调用强制规则（最高优先级）

1. 用户提出：规划几日游、查询酒店、民宿、公园、景区、咖啡馆、遛狗地，**必须先调用对应工具获取真实点位，不允许直接输出行程或者地点**。
2. 不允许凭知识编造酒店名字、景区、地址、营业时间、电话。
3. 用户修改已有行程：更换景点、更换住宿、增加天数、删除点位、重新规划，复用当前城市、宠物档案，重新调用工具获取最新POI再编排。
4. 工具返回空数据：如实告知用户当前暂无匹配条件点位，建议放宽筛选条件，禁止强行编造点位填充行程。
5. 拿到工具返回POI结果后，基于返回的点位列表再生成行程，不能引入工具返回以外的地点。

## 行程规划核心约束

拿到工具返回POI之后再生成攻略，严格遵守下面规则：

1. 单日游玩点位控制2-3个，不要堆砌大量景点，照顾宠物体力，避免过度奔波。
2. 如果宠物档案标记【晕车】：减少长距离跨区域移动，优先就近点位，行程减少通勤耗时，增加休息提示。
3. 大型犬：自动避开工具中标注不接待大型犬的点位。
4. 短鼻犬（法斗、巴哥等）：行程提示高温避免外出，不推荐航空托运方案，优先自驾。
5. 输出结构固定：

🐾X日携宠旅行｜目的地

Day1：
🔹上午：点位名称（宠物友好提示）
🔹下午：点位名称（宠物友好提示）
🏨住宿推荐：工具返回酒店
✨携宠小提示：结合该日行程+宠物档案给出提醒

Day2：
……以此类推

📌出行总提醒：综合宠物情况、当地养宠政策、必备物品给出简短提示

6. 不要输出复杂Markdown语法，适配小程序对话展示，少量emoji表情，分段清晰可读。
7. 行程所需关键信息（出发地/目的地/天数/宠物档案等）已由系统槽位引擎提取并附在本次消息中，直接使用即可；仅当其中仍缺失必填项时才礼貌问询，禁止重复询问已提供的信息。
8. 地点之间要考虑是否顺路，避免来回奔波。
9. 每日地点要有游玩、饮食、住宿不同类别，不要全是一类场所。

## 边界处理

1. 遇到宠物中毒、受伤、急症：只输出应急提示，明确告知不能替代兽医，建议尽快前往宠物医院。
2. 用户问天气：告知无法获取实时天气，建议使用天气软件查询。
3. 无关问题（股票、代码、电影、数学、写诗、彩票等）礼貌拒绝，引导回到宠物旅行相关。

## 禁止行为

❌ 禁止不调用工具直接生成行程、编造地点
❌ 已有宠物档案信息，重复提问宠物情况
❌ 输出工具原始JSON、内部思考、工具调用过程给用户
❌ 行程塞入不在工具返回列表的景点酒店
❌ 大段冗长文字，不分段，阅读压力大`
  }

  _buildItineraryPrompt(slots, toolResults) {
    const { origin, destination, days, petType, petCount, budget, preference, departureDate, travelMode } = slots
    const petProfile = slots.petProfile || {}

    // ── 1. 宠物档案摘要 ──
    const profileLines = []
    if (petProfile.breed) profileLines.push(`品种：${petProfile.breed}`)
    if (petProfile.weight) profileLines.push(`体重：${petProfile.weight}kg`)
    if (petProfile.size) profileLines.push(`体型：${petProfile.size}`)
    if (petProfile.vaccinated === false) profileLines.push(`⚠️ 未接种疫苗`)
    if (petProfile.allergies?.length) profileLines.push(`过敏史：${petProfile.allergies.join('、')}`)
    if (petProfile.motionSickness) profileLines.push(`⚠️ 有晕车史，单程车程建议不超过1.5小时`)
    const profileSummary = profileLines.length
      ? profileLines.join('\n')
      : `类型：${petType || '未知'}，数量：${petCount || 1}只`

    // ── 2. POI 数据整理（只输出有效字段，不要原始JSON） ──
    const pois = toolResults.pois?.pois || []
    const poiSummary = pois.length > 0
      ? pois.map((p, i) =>
          `${i+1}. ${p.name}（${p.category || '场所'}）- ${p.address || ''}` +
          (p.pet_policy ? ` | 宠物政策：${p.pet_policy}` : '') +
          (p.pet_friendly_level ? ` | 友好度：${p.pet_friendly_level}` : '')
        ).join('\n')
      : `⚠️ 该城市POI库暂无匹配点位，请在行程末尾注明"以下场所为AI建议，建议出行前电话确认宠物政策"`

    // ── 3. 政策摘要 ──
    const policy = toolResults.policy || {}
    const policyLines = []
    if (policy.leashRequired) policyLines.push('公共场所必须牵绳')
    if (policy.bannedBreeds?.length) policyLines.push(`禁养品种：${policy.bannedBreeds.join('、')}`)
    if (policy.transitRules) policyLines.push(`公共交通：${policy.transitRules}`)
    const policySummary = policyLines.length ? policyLines.join('\n') : '暂无特殊限制信息'

    // ── 4. 天气摘要 ──
    const weather = toolResults.weather || {}
    const weatherSummary = weather.forecast?.length
      ? weather.forecast.slice(0, days).map(d => `${d.date}：${d.weather}，${d.tempMin}~${d.tempMax}℃`).join('\n')
      : '暂无天气数据'

    // ── 5. 品种风险摘要 ──
    const breedRisk = toolResults.breedRisk || {}
    const riskLines = breedRisk.tips?.length ? breedRisk.tips.slice(0, 3) : []
    if (breedRisk.riskLevel === 'high') riskLines.unshift('⚠️ 该品种出行风险较高，请特别注意以下事项')
    const riskSummary = riskLines.join('\n') || '无特殊风险提示'

    return `请为以下旅行需求生成 ${days} 日携宠行程，严格基于下方POI数据规划路线。

═══════════════════════════════
基本信息
═══════════════════════════════
出发地：${origin || '未指定'}
目的地：${destination}
天数：${days}天
出发日期：${departureDate || '未指定'}
出行方式：${travelMode || '未指定'}
预算：${budget || '未指定'}
偏好：${preference?.join('、') || '无特殊偏好'}

═══════════════════════════════
宠物档案
═══════════════════════════════
${profileSummary}

═══════════════════════════════
目的地POI库（只能使用库中的场所）
═══════════════════════════════
${poiSummary}

═══════════════════════════════
城市政策
═══════════════════════════════
${policySummary}

═══════════════════════════════
天气预报
═══════════════════════════════
${weatherSummary}

═══════════════════════════════
宠物出行风险提示
═══════════════════════════════
${riskSummary}

═══════════════════════════════
规划要求
═══════════════════════════════
1. 只推荐POI库中存在的场所，POI库无数据则注明"暂无收录点位，以下为AI建议"
2. 每日按"上午/下午/餐饮/住宿"结构输出，每个POI注明宠物友好要点
3. 结合宠物档案个性化调整：
   - 晕车宠物：控制单次车程，路线紧凑
   - 大型犬：标注"大型犬友好"，过滤不接待大狗的点位
   - 过敏宠物：规避过敏原环境
   - 未接种疫苗：提示避开高密度宠物聚集场所
4. 行程末尾附"宠物出行小贴士"3-5条（饮水/牵绳/住宿确认/针对性提示）
5. 语言亲切轻量化，不用Markdown复杂语法，适量emoji

请直接输出行程内容，不要输出思考过程或工具调用信息。`
  }

  _parseItineraryResponse(response, slots) {
    // 尝试解析结构化数据，如果失败则返回原始文本
    try {
      // 简单处理：直接返回LLM生成的文本
      return {
        rawText: response,
        dailyPlans: this._extractDailyPlans(response),
        summary: {
          destination: slots.destination,
          days: slots.days,
          petType: slots.petType,
          generatedAt: new Date().toISOString()
        }
      }
    } catch (e) {
      return {
        rawText: response,
        dailyPlans: [],
        summary: { generatedAt: new Date().toISOString() }
      }
    }
  }

  _extractDailyPlans(text) {
    // 简单的每日计划提取逻辑
    const dayPattern = /第?\d+[\s]*天|Day\s*\d+|D\d+/gi
    const matches = text.match(dayPattern)
    
    if (!matches) return [{ day: 1, content: text }]
    
    // 按天数分割
    const parts = text.split(/第?\d+[\s]*天|Day\s*\d+|D\d+/i).filter(Boolean)
    
    return parts.map((content, idx) => ({
      day: idx + 1,
      content: content.trim()
    }))
  }

  /**
   * 格式化最终输出
   * @param {Object} output - 工具执行结果
   * @param {Object} slots - 用户槽位
   * @param {string} itineraryType - 行程类型: 'multi_day_same_city' | 'multi_city' | 'default'
   */
  _formatOutput(output, slots, itineraryType = 'default') {
    if (!output) {
      return {
        content: '抱歉，暂时无法生成攻略，请稍后再试。',
        itinerary: null,
        suggestions: ['可以换个城市或时间试试']
      }
    }

    // 根据类型选择模版
    if (itineraryType === 'multi_day_same_city' && output.itinerary?.dailyPlans) {
      return this._formatMultiDaySameCity(output, slots)
    }

    if (itineraryType === 'multi_city' && output.itinerary?.cityPlans) {
      return this._formatMultiCity(output, slots)
    }

    // 默认格式化（原有逻辑）
    const baseContent = output.rawText || output.itinerary?.rawText || ''

    // 组装附加信息
    let additionalInfo = []

    if (output.checklist && output.checklist.items?.length > 0) {
      additionalInfo.push('\n\n📋 **出行清单**\n' + 
        output.checklist.items.slice(0, 10).map(i => `- ${i}`).join('\n'))
    }

    if (output.breedRisk && output.breedRisk.tips && output.breedRisk.tips.length > 0) {
      additionalInfo.push('\n\n🐕 **宠物出行提醒**\n' +
        output.breedRisk.tips.slice(0, 5).map(t => `- ${t}`).join('\n'))
    }

    if (output.policy && output.policy.restrictions && output.policy.restrictions.length > 0) {
      additionalInfo.push('\n\n⚠️ **重要提醒**\n' +
        output.policy.restrictions.map(r => `- ${r}`).join('\n'))
    }

    return {
      content: baseContent + additionalInfo.join(''),
      itinerary: output.itinerary || output,
      pois: output.pois,
      policy: output.policy,
      checklist: output.checklist,
      breedRisk: output.breedRisk,
      suggestions: [
        '需要调整行程吗？可以直接告诉我',
        '想要更详细的某个景点介绍？',
        '需要出行清单吗？'
      ],
      actions: [
        { type: 'regenerate', label: '重新生成方案' },
        { type: 'modify', label: '修改行程' },
        { type: 'checklist', label: '查看出行清单' },
        { type: 'share', label: '分享攻略' }
      ]
    }
  }

  /**
   * 检测行程类型
   * - multi_day_same_city: 多日同城市游（"规划 X 日游"、"X 天怎么玩"）
   * - multi_city: 跨城多日游（"X 地 + Y 地怎么玩"、多城市 query）
   * - default: 默认类型
   */
  _detectItineraryType(extracted) {
    const { destination, days, rawMessage } = extracted

    // 跨城检测：多城市关键词或 "+" 连接
    const multiCityPatterns = [
      /.*\+.+怎么玩/,           // "北京+上海怎么玩"
      /.*和.*一起.*玩/,          // "北京和上海一起玩"
      /.*加.*旅游/,              // "北京加上海旅游"
      /双城|多城|跨城|环线/,     // "双城游"、"跨城游"
      /多城市/,                  // "多城市攻略"
    ]

    const isMultiCity = multiCityPatterns.some(p => p.test(rawMessage || '')) ||
                        (destination && /\+|、|和/.test(destination))

    if (isMultiCity) {
      return 'multi_city'
    }

    // 多日同城市检测：明确的天数 + 单城市
    const multiDayPatterns = [
      /规划.*\d+.*日游/,
      /规划.*\d+.*天游/,
      /\d+天怎么玩/,
      /\d+日游攻略/,
      /玩\d+天/,
      /(\d+)日游/,
      /Day\d+/i,
    ]

    const isMultiDay = multiDayPatterns.some(p => p.test(rawMessage || '')) ||
                       (days && parseInt(days) > 1)

    if (isMultiDay && destination && !isMultiCity) {
      return 'multi_day_same_city'
    }

    return 'default'
  }

  /**
   * 格式化：多日同城市游模版
   */
  _formatMultiDaySameCity(output, slots) {
    const formatter = require('../../utils/formatter')
    const dailyPlans = output.itinerary.dailyPlans || []
    const pois = output.pois || []

    // 构建每日数据结构
    const daysData = dailyPlans.map((plan, idx) => ({
      day: idx + 1,
      theme: plan.theme || `第${idx + 1}天`,
      pois: (plan.pois || []).map((poi, poiIdx) => ({
        name: poi.name || poi.title || '',
        image: poi.image || poi.cover || '',
        reason: poi.petFriendly || poi.reason || '',
        avgPrice: poi.avgPrice || poi.price || '',
        hours: poi.hours || poi.openTime || '',
        order: poiIdx + 1
      }))
    }))

    return formatter.multiDaySameCityTemplate({
      city: slots.destination,
      days: parseInt(slots.days) || daysData.length,
      daysData
    })
  }

  /**
   * 格式化：跨城多日游模版
   */
  _formatMultiCity(output, slots) {
    const formatter = require('../../utils/formatter')
    const cityPlans = output.itinerary.cityPlans || []
    const cities = cityPlans.map(cp => cp.city)

    // 城际交通建议
    const interCityTransport = output.itinerary.interCityTransport ||
      this._generateInterCityTransport(cities)

    return formatter.multiCityTemplate({
      cities,
      totalDays: parseInt(slots.days) || cityPlans.reduce((s, cp) => s + (cp.days || 1), 0),
      cityPlans,
      interCityTransport
    })
  }

  /**
   * 生成城际交通建议（兜底）
   */
  _generateInterCityTransport(cities) {
    if (!cities || cities.length < 2) return null

    const transports = []
    for (let i = 0; i < cities.length - 1; i++) {
      transports.push({
        from: cities[i],
        to: cities[i + 1],
        method: '高铁',
        duration: '约2-3小时',
        tips: `建议提前购买${cities[i]}→${cities[i]}的高铁票`
      })
    }
    return transports
  }

  /**
   * 处理修改模式
   */
  async _handleModifyMode(userMessage, session, context) {
    this.sessionManager.enterModifyMode(session.id)
    
    // 从消息中提取修改指令
    const modifications = this._parseModificationIntent(userMessage)
    
    // 获取当前槽位
    const currentSlots = session.accumulatedSlots
    
    // 应用修改
    for (const [key, value] of Object.entries(modifications)) {
      if (value !== undefined) {
        currentSlots[key] = value
      }
    }

    // 重新规划
    return await this.process({
      text: `重新规划: ${JSON.stringify(currentSlots)}`,
      sessionId: session.id,
      context
    })
  }

  _parseModificationIntent(message) {
    const mods = {}

    // 增加景点
    const addMatch = message.match(/增加|加上|添加|想去(.{2,15})/)
    if (addMatch) mods.addPoi = addMatch[1]

    // 删除景点
    const removeMatch = message.match(/删除|去掉|不要|不想去(.{2,15})/)
    if (removeMatch) mods.removePoi = removeMatch[1]

    // 修改天数
    const daysMatch = message.match(/(\d+)天/)
    if (daysMatch) mods.days = parseInt(daysMatch[1])

    // 修改预算
    const budgetMatch = message.match(/预算.*?(\d+)/)
    if (budgetMatch) mods.budget = budgetMatch[1] + '元'

    return mods
  }
}

// 导出单例
module.exports = new TravelPlannerAgent()
