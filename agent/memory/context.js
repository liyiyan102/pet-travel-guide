/**
 * 上下文管理器
 * 管理会话记忆和用户状态
 */

class ContextManager {
  constructor() {
    this.sessions = new Map()
  }

  /**
   * 创建或获取会话
   */
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, this.createSession())
    }
    return this.sessions.get(sessionId)
  }

  /**
   * 创建新会话
   */
  createSession() {
    return {
      conversationHistory: [],
      currentItinerary: null,
      userContext: {
        pets: [],
        destination: '',
        dates: {},
        constraints: [],
        preferences: []
      },
      pendingTasks: [],
      recentImages: [],
      searchHistory: [],
      metadata: {
        createdAt: new Date(),
        lastActiveAt: new Date(),
        turnCount: 0
      }
    }
  }

  /**
   * 添加消息到历史
   */
  addMessage(sessionId, role, content, extra = {}) {
    const session = this.getSession(sessionId)
    
    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      ...extra
    })

    // 更新活跃时间
    session.metadata.lastActiveAt = new Date()
    session.metadata.turnCount++

    // 控制历史长度
    const maxLength = 20
    if (session.conversationHistory.length > maxLength) {
      // 保留系统消息和最近的对话
      const systemMsgs = session.conversationHistory.filter(m => m.role === 'system')
      const recentMsgs = session.conversationHistory.slice(-(maxLength - systemMsgs.length))
      session.conversationHistory = [...systemMsgs, ...recentMsgs]
    }

    return session
  }

  /**
   * 获取对话历史（用于构建LLM上下文）
   */
  getConversationHistory(sessionId, limit = 10) {
    const session = this.getSession(sessionId)
    return session.conversationHistory.slice(-limit)
  }

  /**
   * 更新用户上下文
   */
  updateUserContext(sessionId, updates) {
    const session = this.getSession(sessionId)
    Object.assign(session.userContext, updates)
    return session
  }

  /**
   * 设置当前行程
   */
  setCurrentItinerary(sessionId, itinerary) {
    const session = this.getSession(sessionId)
    session.currentItinerary = itinerary
    return session
  }

  /**
   * 添加待办任务
   */
  addPendingTask(sessionId, task) {
    const session = this.getSession(sessionId)
    session.pendingTasks.push({
      ...task,
      createdAt: new Date()
    })
    return session
  }

  /**
   * 记录搜索历史
   */
  addSearchHistory(sessionId, query, results) {
    const session = this.getSession(sessionId)
    session.searchHistory.unshift({
      query,
      resultCount: results?.length || 0,
      timestamp: new Date()
    })
    // 只保留最近20条
    session.searchHistory = session.searchHistory.slice(0, 20)
    return session
  }

  /**
   * 生成会话摘要
   */
  summarizeSession(sessionId) {
    const session = this.getSession(sessionId)
    
    return {
      sessionId,
      duration: Date.now() - session.metadata.createdAt,
      turnCount: session.metadata.turnCount,
      hasItinerary: !!session.currentItinerary,
      userContext: session.userContext,
      recentTopics: this.extractRecentTopics(session),
      pendingTasks: session.pendingTasks.length
    }
  }

  /**
   * 提取近期话题
   */
  extractRecentTopics(session) {
    const recentMessages = session.conversationHistory
      .filter(m => m.role === 'user')
      .slice(-5)
    
    return recentMessages.map(m => ({
      content: m.content?.substring(0, 50),
      timestamp: m.timestamp,
      hasImage: m.hasImage || false
    }))
  }

  /**
   * 清除会话
   */
  clearSession(sessionId) {
    this.sessions.delete(sessionId)
  }

  /**
   * 获取所有活跃会话数
   */
  getActiveSessionsCount() {
    return this.sessions.size
  }
}

module.exports = new ContextManager()
