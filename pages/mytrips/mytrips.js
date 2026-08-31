// pages/mytrips/mytrips.js
const app = getApp()

Page({
  data: {
    // 筛选选项
    filters: [
      { id: 'all', name: '全部' },
      { id: 'recent', name: '最近7天' },
      { id: 'month', name: '本月' }
    ],
    currentFilter: 'all',
    
    // 攻略列表
    trips: [],
    filteredTrips: [],
    
    // 状态
    loading: false,
    
    // 弹窗状态
    showMenuPopup: false,
    showDeleteConfirm: false,
    currentMenuId: null,
    deleteTargetId: null
  },

  onLoad() {
    this.loadTrips()
  },

  onShow() {
    // 每次显示时刷新数据
    this.loadTrips()
  },

  onPullDownRefresh() {
    this.loadTrips()
    wx.stopPullDownRefresh()
  },

  // 加载攻略列表
  loadTrips() {
    this.setData({ loading: true })
    
    // 从本地存储读取（实际应调用云函数）
    setTimeout(() => {
      const itineraries = wx.getStorageSync('itineraries') || []
      
      // 如果没有数据，添加一些示例数据用于展示
      if (itineraries.length === 0) {
        const mockTrips = [
          {
            itinerary_id: 'IT_demo_001',
            title: '上海3日宠物友好之旅',
            destination: '上海',
            days: 3,
            input_params: {
              pets: [{ type: '狗狗', size: '中型' }],
              special_needs: '',
              options: ['pet_friendly_only', 'relaxed_pace']
            },
            created_at: '2026-07-24',
            updated_at: '2026-07-24',
            days_data: [
              {
                day: 1,
                theme: '抵达与城市初探',
                spots: [
                  { name: '武康路历史文化街区', type: 'sightseeing' },
                  { name: 'BrewBear咖啡(宠物友好)', type: 'dining' },
                  { name: '静安公园', type: 'park' },
                  { name: '外滩观景', type: 'sightseeing' }
                ]
              },
              {
                day: 2,
                theme: '文艺漫游日',
                spots: [
                  { name: 'M50创意园', type: 'sightseeing' },
                  { name: '1933老场坊', type: 'sightseeing' },
                  { name: '新天地石库门', type: 'sightseeing' },
                  { name: '田子坊', type: 'sightseeing' },
                  { name: '城隍庙', type: 'sightseeing' }
                ]
              },
              {
                day: 3,
                theme: '休闲购物与返程',
                spots: [
                  { name: '徐汇滨江绿地', type: 'park' },
                  { name: '环贸iapm商场', type: 'shopping' },
                  { name: '返程', type: 'transport' }
                ]
              }
            ]
          },
          {
            itinerary_id: 'IT_demo_002',
            title: '杭州西湖2日游',
            destination: '杭州',
            days: 2,
            input_params: {
              pets: [{ type: '猫咪', size: '小型' }],
              special_needs: '需要安静环境',
              options: ['pet_friendly_only']
            },
            created_at: '2026-07-20',
            updated_at: '2026-07-20',
            days_data: [
              {
                day: 1,
                theme: '西湖经典游',
                spots: [
                  { name: '断桥残雪', type: 'sightseeing' },
                  { name: '白堤', type: 'sightseeing' },
                  { name: '楼外楼餐厅', type: 'dining' },
                  { name: '苏堤春晓', type: 'sightseeing' },
                  { name: '雷峰塔', type: 'sightseeing' }
                ]
              },
              {
                day: 2,
                theme: '灵隐禅意与茶文化',
                spots: [
                  { name: '灵隐寺', type: 'sightseeing' },
                  { name: '龙井村', type: 'sightseeing' },
                  { name: '九溪烟树', type: 'park' }
                ]
              }
            ]
          }
        ]
        
        this.setData({
          trips: mockTrips,
          filteredTrips: mockTrips
        })
      } else {
        this.setData({
          trips: itineraries,
          filteredTrips: itineraries
        })
      }
      
      this.setData({ loading: false })
    }, 300)
  },

  // 筛选切换
  onFilterChange(e) {
    const filterId = e.currentTarget.dataset.id
    this.setData({ currentFilter: filterId })
    this.applyFilter()
  },

  // 应用筛选
  applyFilter() {
    let trips = [...this.data.trips]
    const now = new Date()
    
    switch (this.data.currentFilter) {
      case 'recent':
        // 最近7天
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        trips = trips.filter(t => new Date(t.created_at) >= weekAgo)
        break
      case 'month':
        // 本月
        trips = trips.filter(t => {
          const d = new Date(t.created_at)
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        })
        break
      default:
        break
    }
    
    this.setData({ filteredTrips: trips })
  },

  // 计算总地点数（WXS函数替代）
  getTotalSpots(item) {
    if (!item.days_data) return 0
    return item.days_data.reduce((total, day) => total + (day.spots ? day.spots.length : 0), 0)
  },

  // 点击攻略卡片
  onTripTap(e) {
    const trip = e.currentTarget.dataset.trip
    wx.navigateTo({
      url: `/pages/editor/editor?id=${trip.itinerary_id}`
    })
  },

  // 显示操作菜单
  showMenu(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      showMenuPopup: true,
      currentMenuId: id
    })
  },

  // 隐藏菜单
  hideMenu() {
    this.setData({
      showMenuPopup: false,
      currentMenuId: null
    })
  },

  // 编辑攻略
  onEditTrip(e) {
    const id = e.currentTarget.dataset.id || this.data.currentMenuId
    this.hideMenu()
    wx.navigateTo({
      url: `/pages/editor/editor?id=${id}`
    })
  },

  // 复制攻略
  onDuplicateTrip(e) {
    const id = e.currentTarget.dataset.id || this.data.currentMenuId
    this.hideMenu()
    
    const trip = this.data.trips.find(t => t.itinerary_id === id)
    if (trip) {
      const newTrip = {
        ...trip,
        itinerary_id: 'IT_' + Date.now(),
        title: trip.title + ' (副本)',
        created_at: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString().split('T')[0]
      }
      
      const trips = [newTrip, ...this.data.trips]
      wx.setStorageSync('itineraries', trips)
      
      this.setData({ trips, filteredTrips: trips })
      
      wx.showToast({
        title: '复制成功',
        icon: 'success'
      })
    }
  },

  // 删除攻略（显示确认）
  onDeleteTrip(e) {
    const id = e.currentTarget.dataset.id || this.data.currentMenuId
    this.hideMenu()
    this.setData({
      showDeleteConfirm: true,
      deleteTargetId: id
    })
  },

  // 取消删除
  cancelDelete() {
    this.setData({
      showDeleteConfirm: false,
      deleteTargetId: null
    })
  },

  // 确认删除
  confirmDelete() {
    const id = this.data.deleteTargetId
    let trips = this.data.trips.filter(t => t.itinerary_id !== id)
    
    wx.setStorageSync('itineraries', trips)
    
    this.setData({
      showDeleteConfirm: false,
      deleteTargetId: null,
      trips,
      filteredTrips: trips
    })
    
    wx.showToast({
      title: '已删除',
      icon: 'success'
    })
  },

  // 分享攻略
  onShareTrip(e) {
    const trip = e.currentTarget.dataset.trip
    
    // 触发分享
    wx.showShareMenu({
      withShareTicket: true
    })
    
    // 可以设置分享内容
    app.shareData = {
      title: trip.title,
      path: `/pages/editor/editor?id=${trip.itinerary_id}`,
      imageUrl: ''
    }
  },

  // 加载更多
  loadMore() {
    // 实际项目中这里加载更多数据
  },

  // 跳转生成页面
  goToGenerate() {
    wx.switchTab({
      url: '/pages/generate/generate'
    })
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '我的宠物友好旅行攻略',
      path: '/pages/index/index'
    }
  }
})
