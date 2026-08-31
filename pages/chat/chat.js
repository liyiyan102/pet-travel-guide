/**
 * 聊天页面逻辑
 */

const app = getApp()

Page({
  data: {
    messages: [],
    inputText: '',
    selectedImages: [],
    toView: '',
    userInfo: {},
    loading: false,
    sessionId: ''
  },

  onLoad() {
    this.data.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    this.setData({ userInfo: app.globalData.userInfo || {} })
    
    // 发送欢迎消息
    this.addMessage('assistant', this.getWelcomeMessage())
  },

  onShow() {
    // 滚动到底部
    this.scrollToBottom()
  },

  /**
   * 获取欢迎消息
   */
  getWelcomeMessage() {
    return `你好！我是小D 🐾，你的宠物出行助手。

我可以帮你：
• 查找宠物友好餐厅、公园、酒店
• 解答宠物出行法规（养犬规定、地铁/高铁/飞机政策）
• 评估宠物品种的出行风险
• 生成出行准备清单
• 规划带宠物的旅行行程

直接输入你的问题吧~`
  },

  /**
   * 添加消息
   */
  addMessage(role, content, options = {}) {
    const now = new Date()
    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
    
    const lastMsg = this.data.messages[this.data.messages.length - 1]
    const showTime = !lastMsg || (now - new Date(lastMsg.timestamp)) > 5 * 60 * 1000

    const message = {
      id: msgId,
      role,
      content: content || '',
      timestamp: now.toISOString(),
      timeStr: this.formatTime(now),
      showTime,
      ...options
    }

    this.setData({
      messages: [...this.data.messages, message],
      toView: msgId
    })

    setTimeout(() => this.scrollToBottom(), 100)
    return message
  },

  /**
   * 输入变化
   */
  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  /**
   * 选择图片
   */
  chooseImage() {
    if (this.data.selectedImages.length >= 4) {
      wx.showToast({ title: '最多选择4张图片', icon: 'none' })
      return
    }

    wx.chooseMedia({
      count: 4 - this.data.selectedImages.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles.map(f => f.tempFilePath)
        this.setData({
          selectedImages: [...this.data.selectedImages, ...tempFiles]
        })
      }
    })
  },

  /**
   * 移除已选图片
   */
  removeImage(e) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.selectedImages]
    images.splice(index, 1)
    this.setData({ selectedImages: images })
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: [url]
    })
  },

  /**
   * 发送消息
   */
  async sendMessage() {
    const { inputText, selectedImages } = this.data
    
    if (!inputText.trim() && selectedImages.length === 0) return
    
    if (this.data.loading) return

    // 添加用户消息
    const userMsg = this.addMessage('user', inputText, {
      images: [...selectedImages]
    })

    // 清空输入
    this.setData({
      inputText: '',
      selectedImages: [],
      loading: true
    })

    // 添加打字中的提示
    const typingMsg = this.addMessage('assistant', '', { typing: true })

    try {
      // 调用后端 Agent HTTP 接口
      const serverUrl = app.globalData.serverUrl || 'http://localhost:3000'
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: serverUrl + '/api/chat',
          method: 'POST',
          data: {
            message: inputText,
            images: selectedImages,
            userId: app.globalData.userInfo?.openId || 'anonymous',
            sessionId: this.data.sessionId
          },
          header: { 'Content-Type': 'application/json' },
          timeout: 90000,
          success: resolve,
          fail: reject
        })
      })

      // 移除打字提示
      const messages = this.data.messages.filter(m => m.id !== typingMsg.id)

      if (res.statusCode === 200 && res.data && res.data.success) {
        const result = res.data.response

        // 渲染Markdown（简单处理）
        const renderedContent = this.renderMarkdown(result.content || '')

        this.setData({ messages })

        this.addMessage('assistant', result.content, {
          renderedContent,
          imageAnalysis: result.imageAnalysis,
          itineraryData: result.itineraryData,
          suggestions: result.suggestions || [],
          actions: result.actions || []
        })
      } else {
        this.setData({ messages })
        this.addMessage('assistant', res.data?.message || '抱歉，出了点问题，请重试~')
      }

    } catch (error) {
      console.error('调用Agent失败:', error)

      // 移除打字提示
      const messages = this.data.messages.filter(m => m.id !== typingMsg.id)
      this.setData({ messages })

      const serverUrl = app.globalData.serverUrl || 'http://localhost:3000'
      this.addMessage('assistant', `连接服务失败，请检查后端服务是否启动。\n\n服务地址：${serverUrl}\n\n错误信息：${error.errMsg || error.message || '网络异常'}`)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 使用建议
   */
  useSuggestion(e) {
    const text = e.currentTarget.dataset.text
    this.setData({ inputText: text })
    this.sendMessage()
  },

  /**
   * 快捷操作
   */
  quickAction(e) {
    const action = e.currentTarget.dataset.action
    const prompts = {
      itinerary: '帮我规划一次宠物友好的旅行',
      poi: '附近有什么宠物友好的餐厅或公园？',
      knowledge: '狗狗能吃巧克力吗？'
    }
    
    if (prompts[action]) {
      this.setData({ inputText: prompts[action] })
      this.sendMessage()
    }
  },

  /**
   * 处理快捷动作
   */
  handleAction(e) {
    const action = e.currentTarget.dataset.action
    console.log('执行动作:', action)
    
    switch (action.type) {
      case 'view_detail':
      case 'view_itinerary':
        wx.navigateTo({
          url: `/pages/editor/editor?itinerary_id=${action.poiId || ''}`
        })
        break
      case 'save':
        wx.showToast({ title: '行程已保存', icon: 'success' })
        break
      default:
        this.setData({ inputText: action.label })
        this.sendMessage()
    }
  },

  /**
   * 查看行程详情
   */
  viewItinerary(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/editor/editor?itinerary_id=${id}`
    })
  },

  /**
   * 简单的Markdown渲染
   */
  renderMarkdown(text) {
    if (!text) return ''
    
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code style="background:#f0f0f0;padding:2rpx 8rpx;border-radius:4rpx;font-size:26rpx;">$1</code>')
      .replace(/【⚠️】/g, '<span style="color:#FA8C16;">⚠️</span>')
      .replace(/【✅】/g, '<span style="color:#27AE60;">✅</span>')
      .replace(/【❌】/g, '<span style="color:#FF4D4F;">❌</span>')
      .replace(/【📍】/g, '<span>📍</span>')
      .replace(/【📷】/g, '<span>📷</span>')
      .replace(/【📚】/g, '<span style="color:#1890FF;">📚</span>')
      .replace(/【🌐】/g, '<span style="color:#722ED1;">🌐</span>')
      .replace(/【💡】/g, '<span style="color:#FAAD14;">💡</span>')
      .replace(/【🆘】/g, '<span style="color:#FF4D4F;">🆘</span>')
      .replace(/\n/g, '<br/>')
  },

  /**
   * 滚动到底部
   */
  scrollToBottom() {
    setTimeout(() => {
      const msgs = this.data.messages
      if (msgs.length > 0) {
        this.setData({ toView: msgs[msgs.length - 1].id })
      }
    }, 150)
  },

  /**
   * 格式化时间
   */
  formatTime(date) {
    const now = new Date()
    const diff = now - date
    
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }
})
