// pages/generate/generate.js
const app = getApp()

Page({
  data: {
    // 表单数据
    formData: {
      destination: '北京',
      days: 3,
      nights: 2,
      petType: 'dog',
      petSize: 'medium',
      transport: 'car',
      specialNeeds: ''
    },

    // 天数选项（兼容旧逻辑）
    dayOptions: [1, 2, 3, 4, 5, 7],

    // 宠物相关
    pets: [],
    selectedPetIds: [],

    // 快速填写
    petTypes: ['狗狗', '猫咪', '兔子', '其他'],
    petSizes: ['小型', '中型', '大型'],
    quickPetTypeIndex: -1,
    quickPetSizeIndex: -1,

    // 生成选项
    generateOptions: [
      { id: 'nature',       label: '自然风光', selected: true  },
      { id: 'culture',      label: '人文',     selected: false },
      { id: 'food',         label: '美食',     selected: true  },
      { id: 'photo',        label: '打卡',     selected: false },
      { id: 'relaxed_pace', label: '宠物友好', selected: true  }
    ],
    
    // 状态
    generating: false,
    canGenerate: false,
    
    // 进度步骤
    progressSteps: [
      { text: '分析目的地信息...', status: 'pending' },
      { text: '搜索宠物友好POI...', status: 'pending' },
      { text: '规划每日行程路线...', status: 'pending' },
      { text: '优化行程安排...', status: 'pending' },
      { text: '生成攻略详情...', status: 'pending' }
    ],
    
    // 生成结果
    generatedItinerary: null
  },

  onLoad() {
    this.loadPets()
    this.checkCanGenerate()
  },

  onShow() {
    // 刷新宠物列表
    this.loadPets()
  },

  // 加载宠物列表
  loadPets() {
    const pets = app.globalData.pets || []
    this.setData({ pets })
  },

  // 目的地输入
  onDestinationInput(e) {
    this.setData({
      'formData.destination': e.detail.value
    })
    this.checkCanGenerate()
  },

  // 选择天数
  onDaySelect(e) {
    const day = parseInt(e.currentTarget.dataset.day)
    this.setData({
      'formData.days': day
    })
    this.checkCanGenerate()
  },

  // 定位选择目的地
  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        if (res.address) {
          this.setData({
            'formData.destination': res.address || res.name
          })
          this.checkCanGenerate()
        }
      },
      fail: (err) => {
        console.log('选择位置失败', err)
      }
    })
  },

  // 切换宠物选择
  onPetToggle(e) {
    const pet = e.currentTarget.dataset.pet
    let selectedIds = [...this.data.selectedPetIds]
    const index = selectedIds.indexOf(pet.id)
    
    if (index > -1) {
      selectedIds.splice(index, 1)
    } else {
      selectedIds.push(pet.id)
    }
    
    this.setData({ selectedPetIds: selectedIds })
    this.checkCanGenerate()
  },

  // 跳转添加宠物
  goToAddPet() {
    wx.navigateTo({
      url: '/pages/profile/profile?mode=addPet'
    })
  },

  // 快速填写-宠物类型
  onQuickPetTypeChange(e) {
    this.setData({
      quickPetTypeIndex: parseInt(e.detail.value)
    })
    this.checkCanGenerate()
  },

  // 快速填写-宠物体型
  onQuickPetSizeChange(e) {
    this.setData({
      quickPetSizeIndex: parseInt(e.detail.value)
    })
    this.checkCanGenerate()
  },

  // 特殊需求输入
  onSpecialNeedsInput(e) {
    this.setData({
      'formData.specialNeeds': e.detail.value
    })
  },

  // 生成选项切换
  // 天数/晚数控制
  incDay()  { this.setData({ 'formData.days':   Math.min(this.data.formData.days + 1,   7) }) },
  decDay()  { this.setData({ 'formData.days':   Math.max(this.data.formData.days - 1,   1) }) },
  incNight(){ this.setData({ 'formData.nights': Math.min(this.data.formData.nights + 1, this.data.formData.days - 1) }) },
  decNight(){ this.setData({ 'formData.nights': Math.max(this.data.formData.nights - 1, 0) }) },

  // 宠物类型/体型/出行方式
  setPetType(e)   { this.setData({ 'formData.petType':   e.currentTarget.dataset.type }) },
  setPetSize(e)   { this.setData({ 'formData.petSize':   e.currentTarget.dataset.size }) },
  setTransport(e) { this.setData({ 'formData.transport': e.currentTarget.dataset.mode }) },

  // 跳转AI对话
  goToChat() { wx.navigateTo({ url: '/pages/chat/chat' }) },

  onOptionToggle(e) {
    const optionId = e.currentTarget.dataset.id
    const options = this.data.generateOptions.map(opt => {
      if (opt.id === optionId) {
        return { ...opt, selected: !opt.selected }
      }
      return opt
    })
    this.setData({ generateOptions: options })
  },

  // 检查是否可以生成
  checkCanGenerate() {
    const { destination, petType } = this.data.formData
    this.setData({
      canGenerate: !!destination && !!petType
    })
  },

  // 开始生成攻略
  onGenerate() {
    if (!this.data.canGenerate || this.data.generating) return
    
    this.setData({ 
      generating: true,
      generatedItinerary: null,
      progressSteps: this.data.progressSteps.map(s => ({ ...s, status: 'pending' }))
    })
    
    // 调用云函数生成
    this.callAIGenerate()
  },

  // 取消生成
  cancelGenerate() {
    if (this.requestTask) {
      this.requestTask.abort()
      this.requestTask = null
    }
    this.stopProgressAnimation()
    this.setData({ generating: false })
    wx.showToast({ title: '已取消', icon: 'none', duration: 1000 })
  },

  // 调用后端Agent生成攻略
  async callAIGenerate() {
    const { destination, days, specialNeeds } = this.data.formData

    // 开始进度动画
    this.startProgressAnimation()

    try {
      const pets = this.getSelectedPets()
      let message = `帮我规划${days}天的${destination}带宠物旅行`
      if (pets.length > 0) {
        const petDesc = pets.map(p => `${p.size || ''}${p.type || '宠物'}${p.name ? '(' + p.name + ')' : ''}`).join('、')
        message += `，携带${petDesc}`
      }
      if (specialNeeds) message += `，${specialNeeds}`
      const selectedOpts = this.data.generateOptions.filter(o => o.selected).map(o => o.label)
      if (selectedOpts.length > 0) message += `，要求：${selectedOpts.join('、')}`

      const serverUrl = app.globalData.serverUrl || 'http://localhost:3000'
      const res = await new Promise((resolve, reject) => {
        this.requestTask = wx.request({
          url: serverUrl + '/api/chat',
          method: 'POST',
          data: {
            message,
            userId: app.globalData.userInfo?.openId || 'anonymous',
            sessionId: 'generate_' + Date.now()
          },
          header: { 'Content-Type': 'application/json' },
          timeout: 120000,
          success: resolve,
          fail: reject
        })
      })
      
      this.stopProgressAnimation()
      
      if (res.statusCode === 200 && res.data && res.data.success) {
        // Agent返回的是文本格式行程，包装成可预览/保存的格式
        const result = res.data.response
        const itineraryId = 'AI_' + Date.now()
        this.setData({
          generating: false,
          generatedItinerary: {
            itinerary_id: itineraryId,
            title: `${destination}${days}日宠物友好之旅`,
            destination: destination,
            days: days,
            content: result.content,
            suggestions: result.suggestions || [],
            type: 'agent_generated',
            // 同时生成 days_data 供编辑器使用
            days_data: this.parseAgentContentToDaysData(result.content, destination, days),
            created_at: new Date().toISOString()
          }
        })
        wx.showToast({ title: '生成成功！', icon: 'success' })
      } else {
        throw new Error(res.data?.message || '生成失败')
      }
    } catch (err) {
      console.error('调用Agent失败:', err)
      this.stopProgressAnimation()
      this.requestTask = null

      // 用户主动取消，不弹错误
      if (err.errMsg && err.errMsg.includes('abort')) {
        this.setData({ generating: false })
        return
      }

      const isTimeout = err.errMsg && err.errMsg.includes('timeout')
      wx.showModal({
        title: isTimeout ? '生成超时' : '生成失败',
        content: isTimeout
          ? 'AI正在生成详细攻略，耗时较长，请重试或换一种简短的需求。'
          : `${err.errMsg || err.message || '服务连接失败'}\n请检查后端服务是否启动。`,
        confirmText: '重试',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) this.onGenerate()
        }
      })

      this.setData({ generating: false })
    }
  },

  // 点击建议快捷操作
  onSuggestionTap(e) {
    const text = e.currentTarget.dataset.text
    if (!text) return
    wx.switchTab({ url: '/pages/chat/chat' })
  },

  // 进度动画
  startProgressAnimation() {
    let currentStep = 0
    this._progressTimer = setInterval(() => {
      if (currentStep < this.data.progressSteps.length) {
        const progressSteps = this.data.progressSteps.map((step, index) => {
          if (index < currentStep) return { ...step, status: 'completed' }
          if (index === currentStep) return { ...step, status: 'current' }
          return { ...step, status: 'pending' }
        })
        this.setData({ progressSteps })
        currentStep++
      }
    }, 1000)
  },

  stopProgressAnimation() {
    if (this._progressTimer) {
      clearInterval(this._progressTimer)
      this._progressTimer = null
    }
    // 完成所有步骤
    this.setData({
      progressSteps: this.data.progressSteps.map(s => ({ ...s, status: 'completed' }))
    })
  },

  // 模板兜底
  useTemplateFallback() {
    const { destination, days } = this.data.formData
    const mockItinerary = {
      itinerary_id: 'TEMPLATE_' + Date.now(),
      user_id: app.globalData.userInfo ? app.globalData.userInfo.openId : 'anonymous',
      title: `${destination}${days}日宠物友好之旅`,
      destination: destination,
      days: days,
      input_params: {
        pets: this.getSelectedPets(),
        special_needs: this.data.formData.specialNeeds,
        options: this.data.generateOptions.filter(o => o.selected).map(o => o.id)
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      days_data: this.generateMockDaysData(destination, days)
    }
    
    this.setData({
      generating: false,
      generatedItinerary: mockItinerary
    })
  },

  // 获取选中的宠物信息
  getSelectedPets() {
    if (this.data.selectedPetIds.length > 0) {
      return this.data.pets.filter(p => this.data.selectedPetIds.includes(p.id))
    }
    return [{
      type: this.data.petTypes[this.data.quickPetTypeIndex] || '未知',
      size: this.data.petSizes[this.data.quickPetSizeIndex] || '未知'
    }]
  },

  // 生成模拟的每日行程数据
  generateMockDaysData(destination, days) {
    const mockData = {
      '上海': [
        {
          day: 1,
          theme: '抵达与城市初探',
          spots: [
            { name: destination + '虹桥/浦东机场', type: 'transport', time: '09:00', duration: '1h' },
            { name: '武康路历史文化街区', type: 'sightseeing', time: '11:00', duration: '2h', pet_friendly: true, note: '街道宽敞，适合遛狗' },
            { name: 'BrewBear咖啡(宠物友好)', type: 'dining', time: '13:00', duration: '1.5h', pet_friendly: true, note: '提供宠物菜单' },
            { name: '静安公园', type: 'park', time: '15:00', duration: '2h', pet_friendly: true, note: '有专门宠物活动区' },
            { name: '外滩观景', type: 'sightseeing', time: '18:00', duration: '1.5h', pet_friendly: false, note: '建议轮流看管宠物' }
          ]
        },
        {
          day: 2,
          theme: '文艺漫游日',
          spots: [
            { name: 'M50创意园', type: 'sightseeing', time: '10:00', duration: '2h', pet_friendly: true, note: '开放式园区' },
            { name: '1933老场坊', type: 'sightseeing', time: '13:00', duration: '1.5h', pet_friendly: true },
            { name: '新天地石库门', type: 'sightseeing', time: '15:00', duration: '2h', pet_friendly: true, note: '室外区域可携带' },
            { name: '田子坊', type: 'sightseeing', time: '17:30', duration: '2h', pet_friendly: true }
          ]
        },
        {
          day: 3,
          theme: '休闲购物与返程',
          spots: [
            { name: '徐汇滨江绿地', type: 'park', time: '09:00', duration: '2h', pet_friendly: true, note: '超大型宠物友好区域' },
            { name: '龙华寺', type: 'sightseeing', time: '11:30', duration: '1.5h', pet_friendly: false, note: '室外可停留' },
            { name: '环贸iapm商场(部分店铺)', type: 'shopping', time: '14:00', duration: '2.5h', pet_friendly: true, note: '部分店铺允许中小型宠物' },
            { name: '机场/车站返程', type: 'transport', time: '17:30', duration: '1h' }
          ]
        }
      ],
      '杭州': [
        {
          day: 1,
          theme: '西湖经典游',
          spots: [
            { name: '杭州东站', type: 'transport', time: '09:00', duration: '1h' },
            { name: '西湖断桥残雪', type: 'sightseeing', time: '10:30', duration: '1.5h', pet_friendly: true },
            { name: '白堤', type: 'sightseeing', time: '12:00', duration: '1h', pet_friendly: true },
            { name: '楼外楼餐厅(室外)', type: 'dining', time: '13:00', duration: '1.5h', pet_friendly: true },
            { name: '苏堤春晓', type: 'sightseeing', time: '15:00', duration: '2h', pet_friendly: true }
          ]
        },
        {
          day: 2,
          theme: '灵隐禅意与茶文化',
          spots: [
            { name: '灵隐寺', type: 'sightseeing', time: '09:00', duration: '2.5h', pet_friendly: false, note: '室外区域可停留' },
            { name: '中国茶叶博物馆', type: 'museum', time: '12:30', duration: '1.5h', pet_friendly: true, note: '户外展区' },
            { name: '龙井村', type: 'sightseeing', time: '14:30', duration: '2h', pet_friendly: true },
            { name: '九溪烟树', type: 'park', time: '16:30', duration: '2h', pet_friendly: true }
          ]
        },
        {
          day: 3,
          theme: '西溪湿地与返程',
          spots: [
            { name: '西溪国家湿地公园', type: 'park', time: '09:00', duration: '3h', pet_friendly: true, note: '部分区域允许宠物' },
            { name: '河坊街', type: 'shopping', time: '13:00', duration: '2h', pet_friendly: true },
            { name: '南宋御街', type: 'sightseeing', time: '15:30', duration: '1.5h', pet_friendly: true },
            { name: '返程', type: 'transport', time: '17:30', duration: '1h' }
          ]
        }
      ]
    }

    // 根据目的地匹配或使用默认数据
    let result = mockData[destination]
    if (!result) {
      // 生成通用模板
      result = []
      for (let i = 1; i <= days; i++) {
        result.push({
          day: i,
          theme: `第${i}天：探索${destination}`,
          spots: [
            { name: `${destination}景点A`, type: 'sightseeing', time: '09:00', duration: '2h', pet_friendly: true },
            { name: `宠物友好餐厅`, type: 'dining', time: '12:00', duration: '1.5h', pet_friendly: true },
            { name: `${destination}公园`, type: 'park', time: '14:30', duration: '2h', pet_friendly: true },
            { name: `特色街区`, type: 'sightseeing', time: '17:00', duration: '2h', pet_friendly: true }
          ]
        })
      }
    }
    
    return result.slice(0, days)
  },

  // 将 Agent 返回的文本内容解析为结构化 days_data
  parseAgentContentToDaysData(content, destination, days) {
    if (!content) return []
    const result = []
    // 按天分割（匹配 "第X天" 或 "Day X" 等模式）
    const dayPattern = /(?:第\s*(\d+)\s*天|Day\s*(\d+)|【?\s*(\d+)\s*】?)[：:：]?\s*\n?/gi
    const parts = content.split(dayPattern)

    let currentDay = 1
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim()
      if (!part || /^\d+$/.test(part)) continue

      // 提取主题（第一行通常是主题）
      const lines = part.split('\n').filter(l => l.trim())
      const theme = lines[0] ? lines[0].replace(/[#*>\-]/g, '').trim() : `第${currentDay}天`

      // 提取地点（匹配带时间或地点名的行）
      const spots = []
      const spotPatterns = [
        /(\d{1,2}[:：]\d{2})\s*[–\-~～]\s*(.+?)(?:\n|$)/g,
        /[•·]\s*(.+?)(?:\n|$)/g,
        /(\d+[.、])\s*(.+?)(?:\n|$)/g
      ]

      for (const line of lines.slice(1)) {
        const trimmed = line.replace(/[#*>\-]/g, '').trim()
        if (trimmed.length < 3) continue
        spots.push({
          name: trimmed,
          type: this.guessSpotType(trimmed),
          time: '',
          duration: '',
          pet_friendly: true,
          note: ''
        })
      }

      if (spots.length > 0 || theme) {
        result.push({ day: currentDay, theme, spots })
        currentDay++
      }
    }

    // 如果没解析出天数，生成默认结构
    if (result.length === 0 && content) {
      const lines = content.split('\n').filter(l => l.trim())
      for (let d = 1; d <= days; d++) {
        result.push({
          day: d,
          theme: `第${d}天`,
          spots: lines.slice((d - 1) * 4, d * 4).map(l => ({
            name: l.replace(/[#*>\-]/g, '').trim(),
            type: 'sightseeing',
            pet_friendly: true
          })).filter(s => s.name)
        })
      }
    }
    return result.slice(0, days)
  },

  guessSpotType(name) {
    const lower = name.toLowerCase()
    if (/餐|饭|食|咖啡|cafe|茶/i.test(lower)) return 'dining'
    if (/酒店|住宿|民宿|宾馆/i.test(lower)) return 'hotel'
    if (/公园|绿地|广场|湖|山|景区|景点/i.test(lower)) return 'park'
    if (/机场|车站|高铁|地铁|公交/i.test(lower)) return 'transport'
    if (/购物|商场|街|店/i.test(lower)) return 'shopping'
    if (/医院|宠物店/i.test(lower)) return 'hospital'
    return 'sightseeing'
  },

  // 预览详情
  previewItinerary() {
    const data = this.data.generatedItinerary
    if (!data) return
    wx.setStorageSync('previewItinerary', data)
    wx.navigateTo({
      url: `/pages/editor/editor?mode=preview&id=${data.itinerary_id}`
    })
  },

  // 保存并编辑
  saveAndEdit() {
    const data = this.data.generatedItinerary
    if (!data) return

    // 保存到本地存储
    const itineraries = wx.getStorageSync('itineraries') || []
    itineraries.unshift(data)
    wx.setStorageSync('itineraries', itineraries)

    wx.showToast({ title: '已保存！', icon: 'success' })

    setTimeout(() => {
      wx.navigateTo({
        url: `/pages/editor/editor?id=${data.itinerary_id}`
      })
    }, 1000)
  }
})
