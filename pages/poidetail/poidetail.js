// pages/poidetail/poidetail.js
const app = getApp()
const serverUrl = () => app.globalData.serverUrl || 'http://localhost:3000'

const CATEGORY_HERO_ICON = {
  restaurant: 'restaurant', cafe: 'cafe', park: 'park',
  hotel: 'hotel', hospital: 'hospital', scenic: 'compass',
  grooming: 'settings', default: 'paw'
}

const CATEGORY_LABEL = {
  restaurant: '餐厅', cafe: '咖啡厅', park: '公园',
  hotel: '酒店', hospital: '宠物医院', scenic: '景区',
  grooming: '美容', default: '地点'
}

const PRICE_LABELS = { 1: '免费', 2: '¥', 3: '¥¥', 4: '¥¥¥', 5: '¥¥¥¥' }

Page({
  data: {
    statusBarHeight: 20,
    poiId: '',
    poi: {},
    heroIcon: 'paw',
    confidenceText: '高',
    loading: true
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sys.statusBarHeight })
    const id = options.id || options.poi_id || ''
    const name = options.name ? decodeURIComponent(options.name) : ''
    this.setData({ poiId: id })
    if (id) {
      this.loadPOIDetail(id)
    } else if (name) {
      this.searchPOIByName(name)
    } else {
      this.setData({ loading: false })
    }
  },

  // 按名称搜索 POI
  async searchPOIByName(name) {
    this.setData({ loading: true })
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${serverUrl()}/api/local/poi/search?keyword=${encodeURIComponent(name)}&limit=1`,
          timeout: 8000,
          success: resolve,
          fail: reject
        })
      })
      if (res.statusCode === 200 && res.data?.success && res.data?.data?.pois?.length > 0) {
        const raw = res.data.data.pois[0]
        const poi = this.formatPOI(raw)
        const heroIcon = CATEGORY_HERO_ICON[raw.category] || CATEGORY_HERO_ICON.default
        this.setData({ poi, heroIcon, loading: false })
      } else {
        // 没找到精确匹配，用名称构造一个基本信息
        this.setData({
          poi: this.formatPOI({ name, address: '', category: 'park', pet_friendly: true }),
          heroIcon: 'paw',
          loading: false
        })
      }
    } catch (e) {
      console.warn('搜索POI失败', e)
      this.setData({
        poi: this.formatPOI({ name, address: '', category: 'park', pet_friendly: true }),
        heroIcon: 'paw',
        loading: false
      })
    }
  },

  async loadPOIDetail(id) {
    this.setData({ loading: true })
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${serverUrl()}/api/local/poi/${id}`,
          timeout: 8000,
          success: resolve,
          fail: reject
        })
      })

      if (res.statusCode === 200 && res.data && res.data.success && res.data.data) {
        const raw = res.data.data
        const poi = this.formatPOI(raw)
        const heroIcon = CATEGORY_HERO_ICON[raw.category] || CATEGORY_HERO_ICON.default
        this.setData({ poi, heroIcon, loading: false })
      } else {
        wx.showToast({ title: '未找到该地点', icon: 'none' })
        this.setData({ loading: false })
      }
    } catch (e) {
      console.warn('加载POI详情失败', e)
      wx.showToast({ title: '加载失败，请检查服务', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  formatPOI(raw) {
    const addrParts = (raw.address || '').split('市')
    const afterCity = addrParts[addrParts.length - 1] || raw.address || ''
    const districtMatch = afterCity.match(/^([\u4e00-\u9fa5]+区)/)
    const district = districtMatch ? districtMatch[1] : (raw.city || '')
    const streetAddr = afterCity.replace(district, '') || raw.address || ''

    const policy = raw.pet_policy || ''
    const policy_carry = policy.includes('允许') || policy.includes('可') ? '允许，需牵绳' : (policy || '请咨询')
    const sizeMatch = policy.match(/小型|中小型|大型/)
    const policy_size = sizeMatch ? sizeMatch[0] + '犬' : '无限制'
    const policy_fee = raw.price_level === 1 ? '免费' : '可能收费'
    const policy_booking = policy.includes('预约') || policy.includes('提前') ? '需提前预约' : '无需'
    const policy_notice = raw.features && raw.features.length ? raw.features[0] : '文明遛狗'

    return {
      poi_id: raw.id,
      name: raw.name,
      category: raw.category,
      categoryLabel: CATEGORY_LABEL[raw.category] || CATEGORY_LABEL.default,
      district: district,
      address: streetAddr,
      full_address: raw.address,
      lat: raw.lat,
      lng: raw.lng,
      tel: raw.phone || '',
      pet_friendly: raw.pet_friendly !== false,
      pet_policy: raw.pet_policy || '',
      features: raw.features || [],
      rating: raw.rating,
      tags: raw.tags || [],
      price_label: PRICE_LABELS[raw.price_level] || '免费',
      open_time: this.guessOpenTime(raw.category),
      transit: this.guessTransit(raw.address),
      policy_carry: policy_carry,
      policy_size: policy_size,
      policy_fee: policy_fee,
      policy_booking: policy_booking,
      policy_notice: policy_notice,
      last_updated: '2026-07-30',
      confidence: 'high'
    }
  },

  guessOpenTime(category) {
    const defaults = {
      park: '全天', hospital: '24小时', hotel: '全天',
      restaurant: '10:00-22:00', cafe: '10:00-22:00',
      scenic: '08:00-18:00', grooming: '10:00-20:00'
    }
    return defaults[category] || '全天'
  },

  guessTransit(address) {
    if (!address) return '-'
    if (address.includes('三里屯')) return '三里屯站'
    if (address.includes('朝阳')) return '朝阳门站'
    if (address.includes('海淀')) return '海淀黄庄站'
    if (address.includes('西城')) return '西单站'
    if (address.includes('东城')) return '东四站'
    if (address.includes('石景山')) return '八宝山站'
    return '附近站点'
  },

  goBack() { wx.navigateBack() },

  callPhone() {
    if (this.data.poi.tel) {
      wx.makePhoneCall({ phoneNumber: this.data.poi.tel })
    } else {
      wx.showToast({ title: '暂无电话', icon: 'none' })
    }
  },

  startNavigation() {
    const { poi } = this.data
    if (poi.lat && poi.lng) {
      wx.openLocation({
        latitude: poi.lat, longitude: poi.lng,
        name: poi.name, address: poi.full_address, scale: 18
      })
    } else {
      wx.showToast({ title: '位置信息不完整', icon: 'none' })
    }
  },

  openMap() { this.startNavigation() },

  addToItinerary() {
    const { poi } = this.data
    wx.showModal({
      title: '加入攻略',
      content: `将"${poi.name}"添加到行程？`,
      confirmText: '选择行程',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({ url: `/pages/mytrips/mytrips?mode=select&poi_id=${poi.poi_id}` })
        }
      }
    })
  },

  goToChat() {
    wx.navigateTo({ url: '/pages/chat/chat' })
  },

  onShareAppMessage() {
    return {
      title: `${this.data.poi.name} - 宠物友好场所`,
      path: `/pages/poidetail/poidetail?id=${this.data.poi.poi_id}`
    }
  }
})
