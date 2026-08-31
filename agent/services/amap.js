/**
 * 高德地图 Web服务 API 模块
 *
 * 功能：
 * 1. POI搜索（关键词/周边搜索）
 * 2. 地理编码 / 逆地理编码
 * 3. 路线规划（驾车/步行/公交/骑行）
 *
 * 注意：高德坐标格式为 "经度,纬度"（与腾讯"纬度,经度"相反）
 */

const https = require('https')
const { logger } = require('../utils/logger')

const AMAP_KEY = process.env.AMAP_KEY || process.env.AMAP_API_KEY || ''
const BASE_URL = 'https://restapi.amap.com'

// ==================== HTTP 请求封装 ====================

function get(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error('JSON解析失败: ' + data.substring(0, 100))) }
      })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

// ==================== 高德地图服务 ====================

class AmapService {
  constructor() {
    this.key = AMAP_KEY
  }

  // ==================== POI 搜索 ====================

  /**
   * 关键词搜索 POI（按城市）
   * https://restapi.amap.com/v3/place/text
   */
  async searchPOIByCity(keyword, city, options = {}) {
    const { offset = 20, page = 1, extensions = 'base' } = options
    const url = `${BASE_URL}/v3/place/text?key=${this.key}&keywords=${encodeURIComponent(keyword)}&city=${encodeURIComponent(city)}&citylimit=true&offset=${offset}&page=${page}&extensions=${extensions}&output=JSON`

    logger.info('Amap', `POI关键词搜索: ${keyword} @ ${city}`)
    const res = await get(url)
    if (res.status !== '1') throw new Error(res.info || 'POI搜索失败')
    return this.formatPOIs(res.pois || [])
  }

  /**
   * 周边搜索 POI（按坐标+半径）
   * location 格式: "经度,纬度"
   */
  async searchPOINearby(keyword, location, options = {}) {
    const { radius = 5000, offset = 20, page = 1 } = options
    const url = `${BASE_URL}/v3/place/around?key=${this.key}&keywords=${encodeURIComponent(keyword)}&location=${location}&radius=${radius}&sortrule=distance&offset=${offset}&page=${page}&extensions=base&output=JSON`

    logger.info('Amap', `POI周边搜索: ${keyword} @ ${location}`)
    const res = await get(url)
    if (res.status !== '1') throw new Error(res.info || '周边POI搜索失败')
    return this.formatPOIs(res.pois || [])
  }

  /**
   * 宠物友好场所搜索（便捷方法，对应原 searchPetPOI）
   * @param {string} category - 分类 (restaurant/park/hotel/...)
   * @param {string} location - 城市名或"经度,纬度"坐标
   * @param {Object} options
   */
  async searchPetPOI(category, location, options = {}) {
    const keywords = this.getPetKeywords(category)
    const radius = options.radius || 5000
    const limit = options.limit || 20

    // 判断 location 是坐标还是城市名
    // 高德坐标格式：经度,纬度（如 121.47,31.23）
    const isCoord = /^-?\d+\.?\d*,-?\d+\.?\d*$/.test(location)

    let coord = null
    if (!isCoord) {
      try {
        const geo = await this.geocode(location)
        coord = geo.location  // "经度,纬度"
      } catch (e) {
        logger.warn('Amap', `地理编码失败，改用城市名搜索: ${e.message}`)
        // 地理编码失败时直接用城市名搜索（不需要坐标）
      }
    } else {
      coord = location
    }

    const allPois = []
    const seenIds = new Set()

    // 并行搜索多个宠物关键词
    const tasks = keywords.map(async kw => {
      try {
        let pois
        if (coord) {
          pois = await this.searchPOINearby(kw, coord, { radius, offset: Math.min(limit, 25) })
        } else {
          pois = await this.searchPOIByCity(kw, location, { offset: Math.min(limit, 25) })
        }
        return pois
      } catch (e) {
        logger.warn('Amap', `关键词"${kw}"搜索失败: ${e.message}`)
        return []
      }
    })

    const results = await Promise.allSettled(tasks)
    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const poi of r.value) {
          if (!seenIds.has(poi.id)) {
            seenIds.add(poi.id)
            allPois.push(poi)
          }
        }
      }
    }

    return {
      pois: allPois.slice(0, limit),
      total: allPois.length,
      source: 'amap'
    }
  }

  // ==================== 地理编码 ====================

  /**
   * 地理编码：地址 → 坐标
   * 返回 { address, location: "经度,纬度" }
   */
  async geocode(address) {
    const url = `${BASE_URL}/v3/geocode/geo?key=${this.key}&address=${encodeURIComponent(address)}&output=JSON`
    logger.info('Amap', `地理编码: ${address}`)
    const res = await get(url)
    if (res.status !== '1' || !res.geocodes?.length) throw new Error(res.info || '地理编码失败')
    const g = res.geocodes[0]
    return {
      address: g.formatted_address,
      location: g.location,  // "经度,纬度"
      city: g.city,
      adcode: g.adcode
    }
  }

  /**
   * ID 查询 POI 详情
   */
  async getPOIById(id) {
    const url = `${BASE_URL}/v3/place/detail?key=${this.key}&id=${id}&output=JSON`
    logger.info('Amap', `POI详情: ${id}`)
    const res = await get(url)
    if (res.status !== '1') throw new Error(res.info || 'POI详情查询失败')
    const pois = this.formatPOIs(res.pois || [])
    return pois[0] || null
  }

  /**
   * 逆地理编码：支持 (lat, lng) 两个参数或 "经度,纬度" 字符串
   */
  async reverseGeocode(latOrLocation, lng) {
    let location
    if (lng !== undefined) {
      // 兼容腾讯地图传参方式 (lat, lng)
      location = `${lng},${latOrLocation}`
    } else {
      location = latOrLocation
    }
    const url = `${BASE_URL}/v3/geocode/regeo?key=${this.key}&location=${location}&extensions=base&output=JSON`
    const res = await get(url)
    if (res.status !== '1') throw new Error(res.info || '逆地理编码失败')
    const r = res.regeocode
    return {
      address: r.formatted_address,
      city: r.addressComponent?.city,
      district: r.addressComponent?.district
    }
  }

  // ==================== 路线规划 ====================

  /**
   * 驾车路线
   * origin/destination 格式: "经度,纬度"
   */
  async drivingRoute(origin, destination, options = {}) {
    const [from, to] = await Promise.all([
      this._toCoord(origin),
      this._toCoord(destination)
    ])
    const strategy = options.strategy || 0
    const waypoints = options.waypoints || ''
    let url = `${BASE_URL}/v3/direction/driving?key=${this.key}&origin=${from}&destination=${to}&strategy=${strategy}&extensions=base&output=JSON`
    if (waypoints) url += `&waypoints=${waypoints}`
    logger.info('Amap', `驾车路线: ${from} → ${to}`)
    const res = await get(url)
    if (res.status !== '1') throw new Error(res.info || '驾车路线规划失败')
    return this.formatRoute(res.route, 'driving')
  }

  /**
   * 步行路线
   */
  async walkingRoute(origin, destination) {
    const [from, to] = await Promise.all([this._toCoord(origin), this._toCoord(destination)])
    const url = `${BASE_URL}/v3/direction/walking?key=${this.key}&origin=${from}&destination=${to}&output=JSON`
    logger.info('Amap', `步行路线: ${from} → ${to}`)
    const res = await get(url)
    if (res.status !== '1') throw new Error(res.info || '步行路线规划失败')
    return this.formatRoute(res.route, 'walking')
  }

  /**
   * 公交路线
   */
  async transitRoute(origin, destination, city) {
    const [from, to] = await Promise.all([this._toCoord(origin), this._toCoord(destination)])
    const url = `${BASE_URL}/v3/direction/transit/integrated?key=${this.key}&origin=${from}&destination=${to}&city=${encodeURIComponent(city || '')}&output=JSON`
    logger.info('Amap', `公交路线: ${from} → ${to}`)
    const res = await get(url)
    if (res.status !== '1') throw new Error(res.info || '公交路线规划失败')
    return this.formatTransit(res.route)
  }

  /**
   * 骑行路线
   */
  async bicyclingRoute(origin, destination) {
    const [from, to] = await Promise.all([this._toCoord(origin), this._toCoord(destination)])
    const url = `${BASE_URL}/v4/direction/bicycling?key=${this.key}&origin=${from}&destination=${to}&output=JSON`
    logger.info('Amap', `骑行路线: ${from} → ${to}`)
    const res = await get(url)
    if (res.errcode !== undefined && res.errcode !== 0) throw new Error(res.errmsg || '骑行路线规划失败')
    return this.formatRoute(res.data, 'bicycling')
  }

  // ==================== 辅助方法 ====================

  /** 将地址或坐标统一转为高德坐标 "经度,纬度" */
  async _toCoord(input) {
    if (/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(input)) return input
    const geo = await this.geocode(input)
    return geo.location
  }

  /** 宠物场所搜索关键词映射 */
  getPetKeywords(category) {
    const map = {
      restaurant: ['宠物友好餐厅', '允许带宠物餐厅', '宠物餐厅', '宠物友好咖啡'],
      hotel:      ['宠物友好酒店', '允许携带宠物酒店', '宠物民宿'],
      park:       ['遛狗公园', '宠物公园', '允许遛狗公园', '宠物友好公园'],
      hospital:   ['宠物医院', '动物医院', '24小时宠物医院'],
      grooming:   ['宠物美容', '宠物洗澡', '宠物SPA'],
      scenic:     ['宠物友好景区', '允许携宠景区', '宠物友好景点'],
      cafe:       ['猫咖', '宠物咖啡馆', '宠物友好咖啡'],
      pet_service:['宠物店', '宠物用品', '宠物寄养'],
      all:        ['宠物友好', '允许宠物', '可带宠物']
    }
    return map[category] || map.all
  }

  /** 格式化 POI 列表（统一为内部格式，包含完整详情） */
  formatPOIs(pois) {
    return pois.map(p => {
      const biz = p.biz_ext || {}
      const location = p.location || ''
      const coords = location.split(',')
      return {
        id: p.id,
        name: p.name,
        address: p.address || p.vicinity || '',
        category: p.type || '',
        // 坐标
        lat: parseFloat(coords[1]) || null,
        lng: parseFloat(coords[0]) || null,
        coordinate: location,
        distance: p.distance ? parseInt(p.distance) : null,
        // 联系方式
        tel: p.tel || p.contact?.tel?.[0] || p.contact?.phone || '',
        // 评分
        rating: biz.rating ? parseFloat(biz.rating) : null,
        // 营业时间
        opening_hours: biz.opening_hours || '',
        // 人均消费（元）
        avg_price: biz.cost ? parseInt(biz.cost) : null,
        // 宠物友好判断
        pet_friendly: this._isPetFriendly(p.name, p.type),
        pet_policy: '',
        // 其他有用信息
        typecode: p.typecode || '',
        photos: (p.photos || []).slice(0, 3).map(ph => ph.url),
        navi_location: p.navilocation || location,
        adname: p.adname || '',  // 行政区名
        cityname: p.cityname || ''
      }
    })
  }

  /** 格式化路线结果 */
  formatRoute(route, mode) {
    if (!route || !route.paths?.length) return { mode, routes: [] }
    const path = route.paths[0]
    return {
      mode,
      routes: [{
        distance: parseInt(path.distance),
        duration: parseInt(path.duration),
        steps: (path.steps || []).map(s => ({
          instruction: s.instruction,
          distance: parseInt(s.distance),
          duration: parseInt(s.duration),
          road: s.road
        }))
      }],
      summary: {
        total_distance: parseInt(path.distance),
        total_duration: parseInt(path.duration),
        distance_text: this._fmtDist(path.distance),
        duration_text: this._fmtTime(path.duration)
      }
    }
  }

  /** 格式化公交路线 */
  formatTransit(route) {
    if (!route || !route.transits?.length) return { mode: 'transit', routes: [] }
    return {
      mode: 'transit',
      routes: route.transits.slice(0, 3).map(t => ({
        duration: parseInt(t.duration),
        distance: parseInt(t.distance),
        walking_distance: parseInt(t.walking_distance || 0),
        cost: t.cost?.taxi_cost || 0,
        lines: (t.segments || []).map(seg => ({
          type: seg.bus?.buslines?.[0]?.type || 'walk',
          name: seg.bus?.buslines?.[0]?.name || '步行',
          departure_stop: seg.bus?.buslines?.[0]?.departure_stop?.name || '',
          arrival_stop: seg.bus?.buslines?.[0]?.arrival_stop?.name || ''
        }))
      }))
    }
  }

  _isPetFriendly(name = '', type = '') {
    const text = `${name} ${type}`.toLowerCase()
    return ['宠物', '狗', '猫', 'pet', '携宠', '萌宠'].some(k => text.includes(k))
  }

  _fmtDist(meters) {
    const m = parseInt(meters)
    return m >= 1000 ? (m / 1000).toFixed(1) + '公里' : m + '米'
  }

  _fmtTime(seconds) {
    const s = parseInt(seconds)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h > 0 ? `${h}小时${m > 0 ? m + '分钟' : ''}` : `${m}分钟`
  }
}

module.exports = new AmapService()
module.exports.AmapService = AmapService
