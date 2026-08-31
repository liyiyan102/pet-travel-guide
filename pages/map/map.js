// 找地点页
const app = getApp()
const serverUrl = () => app.globalData.serverUrl || 'http://localhost:3000'

// 分类 icon 映射
const CATEGORY_ICON = {
  restaurant: { icon: '/images/ic-restaurant.png', bg: '#FFF3EA', color: '#FF7A1A' },
  cafe:       { icon: '/images/ic-cafe.png',       bg: '#FFF3EA', color: '#FF7A1A' },
  park:       { icon: '/images/ic-park.png',       bg: '#E8F8F0', color: '#00B86B' },
  hotel:      { icon: '/images/ic-hotel.png',      bg: '#EFF6FF', color: '#3B82F6' },
  hospital:   { icon: '/images/ic-hospital.png',   bg: '#FDF2F8', color: '#EC4899' },
  grooming:   { icon: '/images/ic-settings.png',   bg: '#F4F4F6', color: '#6E7681' },
  scenic:     { icon: '/images/ic-compass.png',    bg: '#E8F8F0', color: '#00B86B' },
  default:    { icon: '/images/ic-location.png',   bg: '#F4F4F6', color: '#6E7681' }
}

Page({
  data: {
    statusBarHeight: 20,
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 14,
    markers: [],
    poiList: [],
    loading: false,
    currentFilter: 'all',
    filterTabs: [
      { id: 'all',        name: '全部' },
      { id: 'restaurant', name: '美食',  icon: '/images/ic-restaurant.png' },
      { id: 'scenic',     name: '景区',  icon: '/images/ic-compass.png' },
      { id: 'hotel',      name: '酒店',  icon: '/images/ic-hotel.png' },
      { id: 'cafe',       name: '咖啡',  icon: '/images/ic-cafe.png' },
      { id: 'hospital',   name: '宠物医院', icon: '/images/ic-hospital.png' }
    ]
  },

  onLoad() {
    const sys = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sys.statusBarHeight })
    this.getLocation()
  },

  onShow() {
    // 读取首页传来的分类参数
    const category = app.globalData.mapCategory
    if (category) {
      this.setData({ currentFilter: category })
      app.globalData.mapCategory = null
    }
    // 只有获取过真实位置后才加载POI
    if (this.data.latitude !== 39.9042 || this.data.longitude !== 116.4074) {
      this.loadPOIs()
    }
  },

  getLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({ latitude: res.latitude, longitude: res.longitude })
        app.globalData.currentLocation = { latitude: res.latitude, longitude: res.longitude }
        this.loadPOIs()
      },
      fail: () => this.loadPOIs()
    })
  },

  locateMe() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({ latitude: res.latitude, longitude: res.longitude })
      }
    })
  },

  zoomIn()  { this.setData({ scale: Math.min(this.data.scale + 1, 20) }) },
  zoomOut() { this.setData({ scale: Math.max(this.data.scale - 1, 5)  }) },

  // 拨打电话
  callPhone(e) {
    const tel = e.currentTarget.dataset.tel
    if (tel) {
      wx.makePhoneCall({ phoneNumber: tel })
    }
  },

  onFilterTap(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ currentFilter: id })
    this.loadPOIs()
  },

  async loadPOIs() {
    const { currentFilter, latitude, longitude } = this.data
    this.setData({ loading: true })
    try {
      // 手动拼 URL 参数（微信小程序不支持 URLSearchParams）
      const parts = [`limit=20`, `lat=${latitude}`, `lng=${longitude}`]
      if (currentFilter !== 'all') parts.push(`category=${encodeURIComponent(currentFilter)}`)
      const url = `${serverUrl()}/api/local/poi/search?${parts.join('&')}`

      const res = await new Promise((resolve, reject) => {
        wx.request({
          url,
          timeout: 8000,
          success: resolve,
          fail: reject
        })
      })

      if (res.statusCode === 200 && res.data?.success) {
        const rawPois = res.data.data?.pois || []
        const pois = rawPois.map(p => {
          const cat = CATEGORY_ICON[p.category] || CATEGORY_ICON.default
          return {
            ...p,
            icon: cat.icon,
            bgColor: cat.bg,
            iconColor: cat.color,
            rating: p.rating ? String(p.rating) : '—',
            distance: p.distance_text || p.distance ? (p.distance_text || p.distance + 'm') : '—'
          }
        })
        this.setData({
          poiList: pois,
          markers: this.buildMarkers(pois)
        })
      } else {
        this.setData({ poiList: this.getFallbackPOIs(), loading: false })
      }
    } catch (e) {
      console.warn('加载POI失败，使用兜底数据', e)
      // 服务未启动时展示兜底数据
      this.setData({ poiList: this.getFallbackPOIs() })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 服务不可用时的兜底示例数据
  getFallbackPOIs() {
    return [
      { id: 'demo1', name: '朝阳公园', category: 'park',       address: '北京市朝阳区朝阳公园南路1号', rating: '4.5', distance: '—', pet_policy: '指定区域可遛狗，需牵绳', bgColor:'#E8F8F0', iconColor:'#00B86B', icon:'/images/ic-park.png', pet_fee: '免费' },
      { id: 'demo2', name: 'Barking Brunch', category: 'restaurant', address: '北京市朝阳区三里屯路', rating: '4.6', distance: '—', pet_policy: '户外区域欢迎携带宠物', bgColor:'#FFF3EA', iconColor:'#FF7A1A', icon:'/images/ic-restaurant.png', pet_fee: '免费' },
      { id: 'demo3', name: 'WAG宠物酒店',   category: 'hotel',      address: '北京市朝阳区某某路',     rating: '4.7', distance: '—', pet_policy: '欢迎携带宠物入住，需提前告知', bgColor:'#EFF6FF', iconColor:'#3B82F6', icon:'/images/ic-hotel.png', pet_fee: '免费' },
      { id: 'demo4', name: 'VET动物医院',    category: 'hospital',   address: '北京市朝阳区三里屯院区', rating: '4.8', distance: '—', pet_policy: '24小时急诊',           bgColor:'#FDF2F8', iconColor:'#EC4899', icon:'/images/ic-hospital.png', pet_fee: null   }
    ]
  },

  buildMarkers(pois) {
    return pois.filter(p => p.lat && p.lng).map((p, idx) => ({
      id: idx,
      latitude: p.lat,
      longitude: p.lng,
      title: p.name,
      width: 32, height: 32
    }))
  },

  onMarkerTap(e) {
    const poi = this.data.poiList[e.markerId]
    if (poi) wx.navigateTo({ url: `/pages/poidetail/poidetail?id=${poi.id}` })
  },

  onPOITap(e) {
    const poi = e.currentTarget.dataset.poi
    wx.navigateTo({ url: `/pages/poidetail/poidetail?id=${poi.id}` })
  },

  goToChat() {
    wx.navigateTo({ url: '/pages/chat/chat' })
  }
})
