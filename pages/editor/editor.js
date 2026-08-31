// pages/editor/editor.js
const app = getApp()

// 主要城市中心坐标
const CITY_CENTER = {
  '北京': { latitude: 39.9042, longitude: 116.4074 },
  '上海': { latitude: 31.2304, longitude: 121.4737 },
  '成都': { latitude: 30.5728, longitude: 104.0668 },
  '杭州': { latitude: 30.2741, longitude: 120.1551 },
  '广州': { latitude: 23.1291, longitude: 113.2644 },
  '大理': { latitude: 25.6065, longitude: 100.2675 }
}

// 地点类型 → 图标名映射
const SPOT_ICON_MAP = {
  sightseeing: 'compass',
  dining: 'restaurant',
  hotel: 'hotel',
  park: 'park',
  transport: 'bus',
  shopping: 'map',
  hospital: 'hospital',
  museum: 'compass',
  cafe: 'cafe'
}

Page({
  data: {
    itinerary: null,
    statusBarHeight: 20,
    currentDayIndex: 0,
    currentDay: null,
    isPreview: false,
    mode: 'edit',
    hasChanges: false,
    totalSpots: 0,

    // 地图
    mapCenter: { latitude: 39.9042, longitude: 116.4074 },
    markers: [],

    // 图标映射
    spotIconMap: SPOT_ICON_MAP,

    // 弹窗
    showEditPopup: false,
    editingIndex: -1,

    // 表单
    spotTypes: ['景点', '餐厅', '酒店', '公园', '交通', '购物', '医院', '其他'],
    typeIndex: -1,
    formData: {
      name: '', type: '', time: '', duration: '', pet_friendly: true, note: ''
    },

    // 拖拽排序状态
    _dragMode: false,
    _dragIndex: -1,
    _touchStartY: 0,
    _touchStartX: 0,
    _swipeThreshold: 120 // 左滑触发删除的阈值(rpx)
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sys.statusBarHeight })
    const { id, mode } = options
    this.setData({ mode: mode || 'edit' })

    if (mode === 'preview') {
      this.setData({ isPreview: true })
      const previewData = wx.getStorageSync('previewItinerary')
      if (previewData) {
        this.loadItineraryData(previewData)
      }
    } else if (id) {
      this.loadItinerary(id)
    }
  },

  // 加载攻略数据并初始化
  loadItineraryData(data) {
    const days = data.days_data || []
    // 如果没有结构化数据但有纯文本内容，生成基础展示
    let displayDays = days
    if (displayDays.length === 0 && data.content) {
      displayDays = [{
        day: 1,
        theme: data.title || 'AI 生成攻略',
        spots: [],
        _textContent: data.content
      }]
    }
    const totalSpots = displayDays.reduce((sum, d) => sum + (d.spots ? d.spots.length : 0), 0)
    this.setData({
      itinerary: data,
      currentDay: displayDays[0] || null,
      totalSpots,
      _displayDays: displayDays
    })
    this.updateMap()
  },

  // 从存储加载
  loadItinerary(id) {
    const itineraries = wx.getStorageSync('itineraries') || []
    const itinerary = itineraries.find(t => t.itinerary_id === id)
    if (itinerary) {
      this.loadItineraryData(itinerary)
    } else {
      wx.showToast({ title: '攻略不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  // 更新地图标记（避免挤压）
  updateMap() {
    const { currentDay, itinerary } = this.data
    if (!currentDay || !currentDay.spots) {
      this.setData({ markers: [] })
      return
    }

    // 根据目的地设置地图中心
    const dest = itinerary.destination || ''
    const center = CITY_CENTER[dest] || { latitude: 39.9042, longitude: 116.4074 }

    const count = currentDay.spots.length

    // 为每个 spot 生成标记（无坐标时围绕中心散开，加大间距避免挤压）
    const markers = currentDay.spots.map((spot, index) => {
      // 根据数量动态调整散布半径，避免 marker 重叠
      const baseRadius = count <= 3 ? 0.025 : (count <= 6 ? 0.04 : 0.055)
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2 // 从顶部开始
      const radius = baseRadius + (index % 3) * 0.008
      return {
        id: index,
        latitude: spot.lat || (center.latitude + Math.sin(angle) * radius),
        longitude: spot.lng || (center.longitude + Math.cos(angle) * radius),
        title: spot.name,
        width: 22,
        height: 22,
        anchor: { x: 0.5, y: 0.5 },
        label: {
          content: String(index + 1),
          color: '#fff',
          fontSize: 11,
          bgColor: spot.pet_friendly === false ? '#FF7A1A' : '#00B86B',
          borderRadius: 50,
          padding: 4,
          anchorX: 0,
          anchorY: 0,
          textAlign: 'center'
        }
      }
    })

    this.setData({ mapCenter: center, markers })
  },

  // 预览模式：点击地点跳转详情
  onSpotTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name) return
    wx.navigateTo({ url: `/pages/poidetail/poidetail?name=${encodeURIComponent(name)}` })
  },

  // 返回
  goBack() {
    if (this.data.hasChanges) {
      wx.showModal({
        title: '提示',
        content: '您有未保存的修改，确定要离开吗？',
        success: (res) => { if (res.confirm) wx.navigateBack() }
      })
    } else {
      wx.navigateBack()
    }
  },

  // 保存攻略
  saveItinerary() {
    const { itinerary } = this.data
    const itineraries = wx.getStorageSync('itineraries') || []
    const index = itineraries.findIndex(t => t.itinerary_id === itinerary.itinerary_id)
    const updated = { ...itinerary, updated_at: new Date().toISOString().split('T')[0] }
    if (index > -1) itineraries[index] = updated
    else itineraries.unshift(updated)
    wx.setStorageSync('itineraries', itineraries)
    this.setData({ hasChanges: false })
    wx.showToast({ title: '保存成功', icon: 'success' })
  },

  // 预览模式：保存到我的攻略
  saveToMyTrips() {
    const { itinerary } = this.data
    const itineraries = wx.getStorageSync('itineraries') || []
    const newTrip = {
      ...itinerary,
      itinerary_id: itinerary.itinerary_id || 'TRIP_' + Date.now(),
      updated_at: new Date().toISOString().split('T')[0],
      status: 'saved'
    }
    itineraries.unshift(newTrip)
    wx.setStorageSync('itineraries', itineraries)
    wx.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 1200)
  },

  // 切换天数
  onDayChange(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    this.setData({
      currentDayIndex: index,
      currentDay: this.data.itinerary.days_data[index]
    })
    this.updateMap()
  },

  // 添加新的一天
  addDay() {
    const { itinerary } = this.data
    const newDay = {
      day: itinerary.days_data.length + 1,
      theme: `第${itinerary.days_data.length + 1}天`,
      spots: []
    }
    itinerary.days_data.push(newDay)
    itinerary.days = itinerary.days_data.length
    this.setData({
      itinerary,
      currentDayIndex: itinerary.days_data.length - 1,
      currentDay: newDay,
      hasChanges: true
    })
    this.updateMap()
  },

  // 添加地点
  addSpot() {
    this.setData({
      showEditPopup: true,
      editingIndex: -1,
      formData: { name: '', type: '', time: '', duration: '', pet_friendly: true, note: '' },
      typeIndex: -1
    })
  },

  // 编辑地点
  editSpot(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const spot = this.data.currentDay.spots[index]
    const typeName = this.getTypeName(spot.type)
    const typeIndex = this.data.spotTypes.indexOf(typeName)
    this.setData({
      showEditPopup: true,
      editingIndex: index,
      formData: {
        name: spot.name || '',
        type: spot.type || '',
        time: spot.time || '',
        duration: spot.duration || '',
        pet_friendly: spot.pet_friendly !== undefined ? spot.pet_friendly : true,
        note: spot.note || ''
      },
      typeIndex: typeIndex >= 0 ? typeIndex : -1
    })
  },

  onFormInput(e) {
    this.setData({ [`formData.${e.currentTarget.dataset.field}`]: e.detail.value })
  },

  onTypeChange(e) {
    const index = parseInt(e.detail.value)
    this.setData({ typeIndex: index, 'formData.type': this.data.spotTypes[index] })
  },

  onPetFriendlyChange(e) {
    this.setData({ 'formData.pet_friendly': e.detail.value })
  },

  // 确认编辑
  confirmEdit() {
    const { formData, editingIndex, itinerary, currentDayIndex } = this.data
    if (!formData.name.trim()) {
      wx.showToast({ title: '请输入地点名称', icon: 'none' })
      return
    }
    const newSpot = {
      name: formData.name,
      type: formData.type || '其他',
      time: formData.time,
      duration: formData.duration,
      pet_friendly: formData.pet_friendly,
      note: formData.note
    }
    if (editingIndex >= 0) {
      itinerary.days_data[currentDayIndex].spots[editingIndex] = newSpot
    } else {
      if (!itinerary.days_data[currentDayIndex].spots) itinerary.days_data[currentDayIndex].spots = []
      itinerary.days_data[currentDayIndex].spots.push(newSpot)
    }
    this.setData({
      itinerary,
      currentDay: itinerary.days_data[currentDayIndex],
      showEditPopup: false,
      hasChanges: true
    })
    this.updateMap()
  },

  closeEditPopup() { this.setData({ showEditPopup: false }) },

  // 长按进入拖拽排序模式
  onSpotLongPress(e) {
    if (this.data.isPreview) return
    const index = parseInt(e.currentTarget.dataset.index)
    this.setData({ _dragMode: true, _dragIndex: index })
    wx.vibrateShort({ type: 'medium' })
  },

  // 触摸开始
  onTouchStart(e) {
    if (this.data.isPreview) return
    const touch = e.touches[0]
    this._touchStartX = touch.clientX
    this._touchStartY = touch.clientY
    this._touchStartTime = Date.now()
  },

  // 触摸移动（左滑删除 / 拖拽排序）
  onTouchMove(e) {
    if (this.data.isPreview) return
    const touch = e.touches[0]
    const index = parseInt(e.currentTarget.dataset.index)
    const deltaX = touch.clientX - this._touchStartX
    const deltaY = touch.clientY - this._touchStartY

    // 拖拽排序模式
    if (this.data._dragMode && Math.abs(deltaY) > Math.abs(deltaX)) {
      this.handleDragMove(index, deltaY)
      return
    }

    // 左滑删除模式
    if (deltaX < -20) {
      const spots = this.data.currentDay.spots
      const offset = Math.max(deltaX, -200)
      const key = `currentDay.spots[${index}]._offsetX`
      const showDeleteKey = `currentDay.spots[${index}]._showDelete`
      const swipingKey = `currentDay.spots[${index}]._swiping`
      this.setData({
        [key]: offset,
        [showDeleteKey]: offset < -this.data._swipeThreshold,
        [swipingKey]: true
      })
    }
  },

  // 触摸结束
  onTouchEnd(e) {
    if (this.data.isPreview) return
    const index = parseInt(e.currentTarget.dataset.index)

    // 拖拽模式结束
    if (this.data._dragMode) {
      this.handleDragEnd()
      return
    }

    // 左滑模式：回弹或保持
    const spots = this.data.currentDay.spots
    if (!spots || !spots[index]) return
    const offsetX = spots[index]._offsetX || 0

    // 重置所有项的偏移（除了当前显示删除的）
    spots.forEach((s, i) => {
      if (i !== index) {
        s._offsetX = 0
        s._swiping = false
        s._showDelete = false
      }
    })

    if (offsetX > -this.data._swipeThreshold) {
      // 未达到阈值，回弹
      spots[index]._offsetX = 0
      spots[index]._swiping = false
      spots[index]._showDelete = false
    }
    this.setData({ currentDay: { ...this.data.currentDay, spots: [...spots] } })
  },

  // 拖拽移动处理
  handleDragMove(index, deltaY) {
    const { currentDay, _dragIndex } = this.data
    if (!currentDay || !currentDay.spots) return
    const spots = [...currentDay.spots]
    const itemHeight = 120 // 大约每个item的高度(rpx)

    // 计算目标位置
    const targetIndex = Math.round(_dragIndex + deltaY / itemHeight)
    const clampedTarget = Math.max(0, Math.min(spots.length - 1, targetIndex))

    if (clampedTarget !== _dragIndex && clampedTarget !== index) {
      // 交换位置
      const draggedItem = spots[_dragIndex]
      spots.splice(_dragIndex, 1)
      spots.splice(clampedTarget, 0, draggedItem)

      // 标记拖拽中
      spots[clampedTarget] = { ...spots[clampedTarget], _dragging: true }

      this.setData({
        _dragIndex: clampedTarget,
        'itinerary.days_data[this.data.currentDayIndex].spots': spots,
        currentDay: { ...currentDay, spots },
        hasChanges: true
      })
      this.updateMap()
    }
  },

  // 拖拽结束
  handleDragEnd() {
    const { currentDay } = this.data
    if (!currentDay || !currentDay.spots) return
    const spots = currentDay.spots.map(s => ({
      ...s,
      _dragging: false
    }))
    this.setData({
      _dragMode: false,
      _dragIndex: -1,
      currentDay: { ...currentDay, spots },
      hasChanges: true
    })
    // 延迟退出拖拽模式，让用户看到效果
    setTimeout(() => {
      if (this.data._dragMode === false) {
        // 保持状态
      }
    }, 500)
  },

  // 退出拖拽模式
  exitDragMode() {
    const { currentDay } = this.data
    if (currentDay && currentDay.spots) {
      const spots = currentDay.spots.map(s => ({ ...s, _dragging: false }))
      this.setData({ _dragMode: false, _dragIndex: -1, currentDay: { ...currentDay, spots } })
    } else {
      this.setData({ _dragMode: false, _dragIndex: -1 })
    }
  },

  // 左滑删除（需确认）
  confirmDeleteSpot(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const spot = this.data.currentDay.spots[index]
    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${spot.name}」吗？`,
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (res.confirm) {
          const { itinerary, currentDayIndex } = this.data
          itinerary.days_data[currentDayIndex].spots.splice(index, 1)
          // 重置所有左滑状态
          const spots = itinerary.days_data[currentDayIndex].spots.map(s => ({
            ...s,
            _offsetX: 0,
            _swiping: false,
            _showDelete: false
          }))
          this.setData({
            itinerary,
            currentDay: { ...this.data.currentDay, spots },
            hasChanges: true
          })
          this.updateMap()
        }
      }
    })
  },

  // 类型名称
  getTypeName(type) {
    const typeMap = {
      sightseeing: '景点', dining: '餐厅', hotel: '酒店', park: '公园',
      transport: '交通', shopping: '购物', hospital: '医院', museum: '博物馆', cafe: '咖啡厅'
    }
    return typeMap[type] || type || '其他'
  },

  onShareAppMessage() {
    return {
      title: this.data.itinerary ? this.data.itinerary.title : '我的宠物友好旅行攻略',
      path: `/pages/editor/editor?id=${this.data.itinerary?.itinerary_id}&mode=preview`
    }
  }
})
