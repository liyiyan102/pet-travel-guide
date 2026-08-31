/**
 * 会话状态管理器 — 维护多轮对话上下文、场景切换判断
 * 
 * 核心职责：
 * 1. 维护每个会话的完整状态（槽位历史、对话轮次、当前阶段）
 * 2. 场景切换判断：用户说"再来一个"是延续还是切换？
 * 3. 上下文透传：把关键信息传递给下游工具
 * 4. 会话生命周期管理：创建/更新/过期/归档
 */

const { logger } = require('../../utils/logger')

// ═══════════════════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════════════════

const SESSION_CONFIG = {
  // 会话超时时间（毫秒）— 30分钟无操作则视为新会话
  sessionTimeout: 30 * 60 * 1000,
  
  // 最大保留的对话轮次
  maxTurns: 20,
  
  // 最大保留的历史会话数
  maxArchivedSessions: 50,

  // 场景切换关键词
  switchKeywords: [
    '重新开始', '重新规划', '换个地方', '换一个', '不去了', '改去',
    '新的行程', '另一次', '别的城市', '其他地方', '不想去.*了'
  ],

  // 延续关键词（表示继续当前场景）
  continueKeywords: [
    '再来一个', '再生成一次', '重新生成', '换一种', '换个方案',
    '还有吗', '其他的', '不一样', '调整一下', '修改', '加上', '去掉',
    '可以吗', '怎么样', '好的', '嗯', '行', '可以', 'OK', 'ok'
  ],

  // 确认关键词（用户在回答澄清问题）
  confirmKeywords: [
    '是的', '对', '没错', '对的', '是的啊', '嗯对', '确认',
    '就是', '没错的', '正确', 'OK', 'ok', '好'
  ],

  // 否定关键词
  denyKeywords: [
    '不是', '不对', '不是的', '不对的', '没有', '不想', '不要',
    '算了', '取消', '不用了', '不需要', '错了'
  ]
}

// ═══════════════════════════════════════════════════════════
// 会话阶段枚举
// ═══════════════════════════════════════════════════════════

const SESSION_PHASES = {
  IDLE: 'idle',                 // 空闲，等待第一次输入
  COLLECTING: 'collecting',     // 收集/补充行程信息（对应原 SLOT_FILLING）
  READY: 'ready_to_plan',       // 达到规划门槛（Readiness >= 70）
  PLANNING: 'planning',         // 执行工具编排与行程生成
  RESULT: 'completed',          // 展示当前行程
  MODIFICATION: 'modifying',    // 处理增量修改（"再加一天"/"换成高铁"）
  FOLLOW_UP: 'follow_up'        // 后续追问
}

class SessionManager {
  constructor() {
    this.config = SESSION_CONFIG
    this.sessions = new Map()         // sessionId -> Session
    this.archivedSessions = new Map() // 已归档会话
  }

  /**
   * 获取或创建会话
   */
  getSession(sessionId, userId = 'anonymous') {
    let session = this.sessions.get(sessionId)

    if (!session) {
      session = this._createSession(sessionId, userId)
      this.sessions.set(sessionId, session)
      logger.info('SessionManager', `新会话创建: ${sessionId}`)
    } else if (this._isSessionExpired(session)) {
      // 会话过期 → 归档旧会话，创建新会话
      this._archiveSession(sessionId)
      session = this._createSession(sessionId, userId)
      this.sessions.set(sessionId, session)
      logger.info('SessionManager', `会话过期重建: ${sessionId}`)
    } else {
      // 更新最后活跃时间
      session.lastActiveAt = Date.now()
    }

    return session
  }

  /**
   * 更新会话状态（每次用户消息后调用）
   */
  updateSession(sessionId, updateData) {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    // 更新基本字段
    Object.assign(session, {
      lastActiveAt: Date.now(),
      turnCount: session.turnCount + 1,
      ...updateData
    })

    // 记录对话历史
    if (updateData.userMessage) {
      session.history.push({
        role: 'user',
        content: updateData.userMessage,
        timestamp: Date.now(),
        slotsSnapshot: updateData.currentSlots ? { ...updateData.currentSlots } : undefined
      })
      
      // 限制历史长度
      if (session.history.length > this.config.maxTurns) {
        session.history = session.history.slice(-this.config.maxTurns)
      }
    }

    if (updateData.botResponse) {
      session.history.push({
        role: 'assistant',
        content: updateData.botResponse,
        timestamp: Date.now()
      })
    }

    // 更新累积槽位
    if (updateData.newSlots) {
      session.accumulatedSlots = { ...session.accumulatedSlots, ...updateData.newSlots }
    }

    logger.info('SessionManager', `会话更新: ${sessionId}, 阶段: ${session.phase}, 轮次: ${session.turnCount}`)

    return session
  }

  /**
   * 判断用户意图：切换场景 vs 延续场景 vs 回答澄清
   */
  analyzeUserIntent(userMessage, session) {
    const msg = userMessage.trim().toLowerCase()

    // ══ 场景切换检测 ══
    for (const keyword of this.config.switchKeywords) {
      try {
        if (new RegExp(keyword).test(msg)) {
          return {
            intent: 'switch',
            confidence: 0.9,
            reason: `检测到切换关键词: ${keyword}`,
            suggestion: '重置槽位，开始新的规划流程'
          }
        }
      } catch (e) { /* ignore invalid regex */ }
    }

    // ══ 目的地变更检测 ══
    // 如果用户提到了一个新的城市名，且与当前目的地不同
    if (session?.accumulatedSlots?.destination) {
      const currentDest = session.accumulatedSlots.destination
      const cityPattern = /(北京|上海|广州|深圳|成都|杭州|重庆|西安|南京|武汉|长沙|天津|苏州|青岛|厦门|大理|丽江|三亚|桂林|拉萨|哈尔滨|大连|沈阳|郑州|昆明|贵阳|福州|合肥|南昌|太原|石家庄|兰州|银川|西宁|乌鲁木齐|呼和浩特|海口|宁波|无锡|温州|东莞|佛山|珠海|中山|惠州|烟台|威海|洛阳|开封|张家界|黄山|九寨沟|敦煌|呼伦贝尔)/g
      
      const citiesInMsg = msg.match(cityPattern)
      if (citiesInMsg && !citiesInMsg.includes(currentDest)) {
        return {
          intent: 'switch_destination',
          confidence: 0.85,
          reason: `检测到新目的地: ${citiesInMsg[0]}, 当前: ${currentDest}`,
          suggestion: `将目的地从 ${currentDest} 改为 ${citiesInMsg[0]}`
        }
      }
    }

    // ══ 延续/修改检测 ══
    for (const keyword of this.config.continueKeywords) {
      if (msg.includes(keyword) || keyword.toLowerCase() === msg) {
        // 进一步区分是"重新生成"还是"微调"
        const isRegenerate = /再来|重新生成|换一种|换个方案/.test(msg)
        const isModify = /调整|修改|加上|去掉|换成|改成|增加|减少/.test(msg)

        return {
          intent: isModify ? 'modify' : (isRegenerate ? 'regenerate' : 'continue'),
          confidence: 0.8,
          reason: `检测到延续关键词: ${keyword}`,
          suggestion: isModify ? '进入修改模式' : (isRegenerate ? '重新生成方案' : '继续当前流程')
        }
      }
    }

    // ══ 否定回复检测（可能是在否定某个澄清选项）══
    for (const keyword of this.config.denyKeywords) {
      if (msg.includes(keyword)) {
        return {
          intent: 'deny',
          confidence: 0.75,
          reason: `检测到否定词: ${keyword}`,
          suggestion: '用户可能在否定之前的建议或选项'
        }
      }
    }

    // ══ 默认：信息补充（用户在回答澄清问题或提供新信息）══
    return {
      intent: 'info_supplement',
      confidence: 0.6,
      reason: '未检测到特殊意图，作为信息补充处理',
      suggestion: '尝试从消息中提取新槽位值'
    }
  }

  /**
   * 获取会话的上下文摘要（传递给下游工具）
   */
  getContextSummary(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    return {
      sessionId,
      userId: session.userId,
      phase: session.phase,
      turnCount: session.turnCount,
      accumulatedSlots: session.accumulatedSlots,
      recentHistory: session.history.slice(-6), // 最近3轮对话
      completedPlans: session.completedPlans,
      userPreferences: session.userPreferences,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt
    }
  }

  /**
   * 获取历史槽位（供 SlotManager 继承用）
   */
  getHistorySlots(sessionId) {
    const session = this.sessions.get(sessionId)
    return session?.accumulatedSlots || {}
  }

  /**
   * 智能合并槽位（V2.5 核心方法）
   * 规则：
   * 1. 当前轮没有提及的字段 → 继承历史值
   * 2. 当前轮明确提供的新值 → 覆盖旧值
   * 3. 明确表达修改或否定时 → 允许更新或清空
   * 4. null/undefined 不覆盖历史有效值
   * 5. 列表类字段支持追加与删除
   */
  mergeAndSaveSlots(sessionId, currentSlots) {
    const session = this.sessions.get(sessionId)
    if (!session) return currentSlots

    const previous = session.accumulatedSlots || {}
    const merged = { ...previous }

    for (const [key, value] of Object.entries(currentSlots)) {
      // null/undefined 不覆盖历史有效值
      if (value === null || value === undefined || value === '') {
        continue
      }

      // 列表字段（preference）支持追加
      if (key === 'preference' && Array.isArray(value) && Array.isArray(previous[key])) {
        const combined = [...new Set([...(previous[key] || []), ...value])]
        merged[key] = combined
        continue
      }

      // 其他字段直接覆盖（当前轮提供新值优先）
      merged[key] = value
    }

    // 持久化
    session.accumulatedSlots = merged
    logger.info('SessionManager', `槽位合并完成[${sessionId}]: ${JSON.stringify(merged)}`)
    return merged
  }

  /**
   * 增量修改槽位（处理"再加一天"/"换成高铁"等场景）
   */
  patchSlots(sessionId, patches) {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.accumulatedSlots = { ...(session.accumulatedSlots || {}), ...patches }
    session.phase = SESSION_PHASES.MODIFYING
    logger.info('SessionManager', `槽位增量修改[${sessionId}]: ${JSON.stringify(patches)}`)
  }

  /**
   * 重置槽位（用户明确说要重新规划）
   */
  resetSlots(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.accumulatedSlots = {}
    session.phase = SESSION_PHASES.INITIALIZING
    logger.info('SessionManager', `槽位已重置[${sessionId}]`)
  }

  /**
   * 标记规划完成
   */
  markPlanningComplete(sessionId, planResult) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.phase = SESSION_PHASES.COMPLETED
    session.completedPlans.push({
      id: `plan_${Date.now()}`,
      result: planResult,
      completedAt: Date.now(),
      slotsUsed: { ...session.accumulatedSlots }
    })

    logger.info('SessionManager', `规划完成: ${sessionId}, 方案数: ${session.completedPlans.length}`)
  }

  /**
   * 进入修改模式
   */
  enterModifyMode(sessionId) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.phase = SESSION_PHASES.MODIFYING
    logger.info('SessionManager', `进入修改模式: ${sessionId}`)
  }

  /**
   * 重置会话（场景切换时调用）
   */
  resetSession(sessionId, keepPreferences = true) {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const preservedPrefs = keepPreferences ? session.userPreferences : null

    session.phase = SESSION_PHASES.INITIALIZING
    session.accumulatedSlots = {}
    session.turnCount = 0
    session.history = []
    session.startedAt = Date.now()
    session.userPreferences = preservedPrefs || {}

    logger.info('SessionManager', `会话重置: ${sessionId}, 保留偏好: ${keepPreferences}`)

    return session
  }

  /**
   * 清理过期会话（定时任务调用）
   */
  cleanupExpiredSessions() {
    let cleaned = 0
    for (const [id, session] of this.sessions.entries()) {
      if (this._isSessionExpired(session)) {
        this._archiveSession(id)
        cleaned++
      }
    }
    if (cleaned > 0) {
      logger.info('SessionManager', `清理了 ${cleaned} 个过期会话`)
    }
    return cleaned
  }

  /**
   * 获取会话统计信息
   */
  getStats() {
    return {
      activeSessions: this.sessions.size,
      archivedSessions: this.archivedSessions.size,
      totalCreated: this.totalCreated || 0
    }
  }

  // ════════════════════════════════════════════════════════
  // 内部方法
  // ════════════════════════════════════════════════════════

  _createSession(sessionId, userId) {
    this.totalCreated = (this.totalCreated || 0) + 1
    return {
      id: sessionId,
      userId,
      phase: SESSION_PHASES.INITIALIZING,
      turnCount: 0,
      history: [],
      accumulatedSlots: {},
      completedPlans: [],
      userPreferences: {},
      metadata: {},
      createdAt: Date.now(),
      startedAt: Date.now(),
      lastActiveAt: Date.now()
    }
  }

  _isSessionExpired(session) {
    return (Date.now() - session.lastActiveAt) > this.config.sessionTimeout
  }

  _archiveSession(sessionId) {
    const session = this.sessions.get(sessionId)
    if (session) {
      this.archivedSessions.set(sessionId, {
        ...session,
        archivedAt: Date.now()
      })
      this.sessions.delete(sessionId)

      // 限制归档数量
      if (this.archivedSessions.size > this.config.maxArchivedSessions) {
        const oldestKey = this.archivedSessions.keys().next().value
        this.archivedSessions.delete(oldestKey)
      }
    }
  }
}

module.exports = new SessionManager()
