/**
 * 腾讯地图API服务模块
 * 
 * 功能：
 * 1. POI搜索（关键词搜索、周边搜索）
 * 2. 地点详情
 * 3. 路线规划（驾车/步行/公交）
 * 4. 地理编码/逆地理编码
 * 5. 关键词提示（自动完成）
 * 
 * API Key: CGQBZ-W5VCT-EHBXZ-VZNGB-PU2N7-ZLFG4
 */

const https = require('https')
const http = require('http')
const { logger } = require('../utils/logger')

// 腾讯地图API配置
const TENCENT_MAP_CONFIG = {
  key: 'TO7BZ-NEGKA-C5HKG-CSNZU-DONB6-5EBWM',
  baseUrl: 'apis.map.qq.com',
  // WebService API基础路径
  wsBaseUrl: 'https://apis.map.qq.com/ws',
}

/**
 * HTTP请求封装
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const req = protocol.get(url, {
      timeout: options.timeout || 10000,
      headers: options.headers || {}
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          resolve({ raw: data })
        }
      })
    })
    
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
  })
}

/**
 * POST请求封装（用于路线规划等POST接口）
 */
function httpPost(url, postData, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const protocol = urlObj.protocol === 'https:' ? https : http
    
    const data = typeof postData === 'string' ? postData : JSON.stringify(postData)
    
    const req = protocol.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...(options.headers || {})
      },
      timeout: options.timeout || 15000
    }, (res) => {
      let responseData = ''
      res.on('data', chunk => responseData += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData))
        } catch (e) {
          resolve({ raw: responseData })
        }
      })
    })
    
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
    
    req.write(data)
    req.end()
  })
}

class TencentMapService {
  constructor() {
    this.key = TENCENT_MAP_CONFIG.key
    this.baseUrl = TENCENT_MAP_CONFIG.wsBaseUrl
    this.mockMode = false  // 模拟模式开关（当API配额用尽时可启用）
  }

  /**
   * 启用/禁用模拟模式
   */
  setMockMode(enabled) {
    this.mockMode = enabled
    if (enabled) {
      console.log('[TencentMap] 已启用模拟模式，将返回模拟数据')
    }
  }

  // ==================== POI搜索 ====================

  /**
   * 关键词搜索POI
   * @param {Object} params - 搜索参数
   * @param {string} params.keyword - 搜索关键词
   * @param {string} params.boundary - 搜索范围（nearby/城市/矩形）
   * @param {string} params.location - 中心点坐标 "纬度,经度"
   * @param {number} params.radius - 搜索半径(米)，默认1000
   * @param {string} params.city - 限定城市
   * @param {number} params.page_index - 页码，默认1
   * @param {number} params.page_size - 每页条数，默认20
   */
  async searchPOI(params) {
    const {
      keyword,
      boundary = 'nearby',
      location,
      radius = 3000,
      city,
      page_index = 1,
      page_size = 20,
      category
    } = params

    if (!keyword && !category) {
      throw new Error('搜索关键词和类别不能同时为空')
    }

    // 构建搜索边界
    let boundaryParam = ''
    if (boundary === 'nearby' && location) {
      boundaryParam = `nearby(${location},${radius})`
    } else if (boundary === 'city' && city) {
      boundaryParam = `city(${city})`
    } else if (location) {
      boundaryParam = `nearby(${location},${radius})`
    }

    const searchKeyword = keyword || this.getCategoryName(category)
    
    const url = `${this.baseUrl}/place/v1/search?key=${this.key}&keyword=${encodeURIComponent(searchKeyword)}&boundary=${encodeURIComponent(boundaryParam)}&page_index=${page_index}&page_size=${page_size}`

    logger.info('TencentMap', `POI搜索: ${searchKeyword}`)
    
    const result = await httpRequest(url)
    
    if (result.status !== 0) {
      logger.error('TencentMap', `POI搜索失败: ${result.message}`)
      throw new Error(result.message || 'POI搜索失败')
    }

    return this.formatPOIResult(result.data)
  }

  /**
   * 搜索宠物相关POI（便捷方法）
   * @param {string} keyword - 搜索类型 (restaurant/hotel/park/hospital/grooming/scenic/cafe/pet_service)
   * @param {string} location - 位置坐标或城市名
   * @param {Object} options - 额外选项
   */
  async searchPetPOI(keyword, location, options = {}) {
    const petKeywords = this.getPetKeywords(keyword)
    const radius = options.radius || 5000
    
    // 判断location是坐标还是城市名
    let searchLocation = location
    let isCoordinate = /^-?\d+\.?\d*,-?\d+\.?\d*$/.test(location)
    
    // 如果是城市名，先获取城市中心坐标
    if (!isCoordinate) {
      try {
        const geoResult = await this.geocode(location)
        if (geoResult && geoResult.location) {
          searchLocation = `${geoResult.location.lat},${geoResult.location.lng}`
          isCoordinate = true
        }
      } catch (e) {
        // 地理编码失败，使用城市边界搜索
        logger.warn('TencentMap', `地理编码失败，使用城市搜索: ${e.message}`)
      }
    }

    const results = []
    
    // 并行搜索多个宠物相关关键词
    const searchPromises = petKeywords.map(async (kw) => {
      try {
        if (isCoordinate) {
          return await this.searchPOI({
            keyword: kw,
            location: searchLocation,
            radius: radius,
            page_size: 10
          })
        } else {
          return await this.searchPOI({
            keyword: kw,
            boundary: 'city',
            city: location,
            page_size: 10
          })
        }
      } catch (e) {
        return null
      }
    })

    const searchResults = await Promise.all(searchPromises)
    
    for (const result of searchResults) {
      if (result && result.pois) {
        results.push(...result.pois)
      }
    }

    // 去重（根据poi_id）
    const uniquePois = []
    const seenIds = new Set()
    for (const poi of results) {
      if (!seenIds.has(poi.id)) {
        seenIds.add(poi.id)
        uniquePois.push(poi)
      }
    }

    return {
      pois: uniquePois.slice(0, options.limit || 20),
      total: uniquePois.length,
      search_params: { keyword, location, radius },
      source: 'tencent_map'
    }
  }

  /**
   * 获取宠物相关搜索关键词
   */
  getPetKeywords(type) {
    const keywordMap = {
      restaurant: ['宠物友好餐厅', '允许带宠物餐厅', '宠物餐厅', '露天餐厅宠物'],
      hotel: ['宠物友好酒店', '允许携带宠物酒店', '宠物民宿', '携宠入住'],
      park: ['遛狗公园', '宠物公园', '允许遛狗公园', '狗公园', '宠物友好公园'],
      hospital: ['宠物医院', '动物医院', '24小时宠物医院', '兽医'],
      grooming: ['宠物美容', '宠物洗澡', '宠物SPA', '宠物美容店'],
      scenic: ['宠物友好景区', '允许携宠景区', '宠物友好公园景区'],
      cafe: ['猫咖', '宠物咖啡馆', '宠物友好咖啡', '狗友好咖啡'],
      pet_service: ['宠物店', '宠物用品', '宠物寄养', '宠物服务'],
      all: ['宠物友好', '允许宠物', '可带宠物', '携宠']
    }
    return keywordMap[type] || keywordMap.all
  }

  /**
   * 获取类别名称
   */
  getCategoryName(category) {
    const nameMap = {
      restaurant: '餐厅',
      hotel: '酒店',
      park: '公园',
      hospital: '医院',
      grooming: '美容',
      scenic: '景点',
      cafe: '咖啡馆',
      pet_service: '宠物服务'
    }
    return nameMap[category] || '宠物'
  }

  // ==================== 路线规划 ====================

  /**
   * 驾车路线规划
   * @param {string} from - 起点 "纬度,经度" 或 地址
   * @param {string} to - 终点 "纬度,经度" 或 地址
   * @param {Object} options - 选项
   */
  async drivingRoute(from, to, options = {}) {
    let fromCoord = from
    let toCoord = to

    // 如果不是坐标，先进行地理编码（支持正负坐标）
    if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(from)) {
      const fromGeo = await this.geocode(from)
      fromCoord = `${fromGeo.location.lat},${fromGeo.location.lng}`
    }
    if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(to)) {
      const toGeo = await this.geocode(to)
      toCoord = `${toGeo.location.lat},${toGeo.location.lng}`
    }

    let url = `${this.baseUrl}/direction/v1/driving/?key=${this.key}&from=${fromCoord}&to=${toCoord}`
    
    if (options.waypoints) {
      // 途经点
      url += `&waypoints=${options.waypoints}`
    }

    logger.info('TencentMap', `驾车路线: ${fromCoord} -> ${toCoord}`)
    
    const result = await httpRequest(url)
    
    if (result.status !== 0) {
      throw new Error(result.message || '路线规划失败')
    }

    // 腾讯地图返回数据在result字段中
    return this.formatRouteResult(result.result || result.data, 'driving')
  }

  /**
   * 步行路线规划
   */
  async walkingRoute(from, to) {
    let fromCoord = from
    let toCoord = to

    if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(from)) {
      const fromGeo = await this.geocode(from)
      fromCoord = `${fromGeo.location.lat},${fromGeo.location.lng}`
    }
    if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(to)) {
      const toGeo = await this.geocode(to)
      toCoord = `${toGeo.location.lat},${toGeo.location.lng}`
    }

    const url = `${this.baseUrl}/direction/v1/walking/?key=${this.key}&from=${fromCoord}&to=${toCoord}`
    
    logger.info('TencentMap', `步行路线: ${fromCoord} -> ${toCoord}`)
    
    const result = await httpRequest(url)
    
    if (result.status !== 0) {
      throw new Error(result.message || '步行路线规划失败')
    }

    return this.formatRouteResult(result.result || result.data, 'walking')
  }

  /**
   * 公交路线规划
   */
  async transitRoute(from, to, options = {}) {
    let fromCoord = from
    let toCoord = to

    if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(from)) {
      const fromGeo = await this.geocode(from)
      fromCoord = `${fromGeo.location.lat},${fromGeo.location.lng}`
    }
    if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(to)) {
      const toGeo = await this.geocode(to)
      toCoord = `${toGeo.location.lat},${toGeo.location.lng}`
    }

    let url = `${this.baseUrl}/direction/v1/transit/integrated/?key=${this.key}&from=${fromCoord}&to=${toCoord}`
    
    if (options.city) {
      url += `&city=${encodeURIComponent(options.city)}`
    }

    logger.info('TencentMap', `公交路线: ${fromCoord} -> ${toCoord}`)
    
    const result = await httpRequest(url)
    
    if (result.status !== 0) {
      throw new Error(result.message || '公交路线规划失败')
    }

    return this.formatTransitResult(result.result || result.data)
  }

  /**
   * 自行车路线规划
   */
  async bicyclingRoute(from, to) {
    let fromCoord = from
    let toCoord = to

    if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(from)) {
      const fromGeo = await this.geocode(from)
      fromCoord = `${fromGeo.location.lat},${fromGeo.location.lng}`
    }
    if (!/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(to)) {
      const toGeo = await this.geocode(to)
      toCoord = `${toGeo.location.lat},${toGeo.location.lng}`
    }

    const url = `${this.baseUrl}/direction/v1/bicycling/?key=${this.key}&from=${fromCoord}&to=${toCoord}`
    
    logger.info('TencentMap', `自行车路线: ${fromCoord} -> ${toCoord}`)
    
    const result = await httpRequest(url)
    
    if (result.status !== 0) {
      throw new Error(result.message || '自行车路线规划失败')
    }

    return this.formatRouteResult(result.result || result.data, 'bicycling')
  }

  // ==================== 多地点路线优化 ====================

  /**
   * 多地点路线规划（途经点顺序优化）
   * @param {Array} points - 地点数组 [{name, lat, lng} 或 坐标字符串]
   * @param {string} mode - 出行方式 driving/walking/bicycling
   * @returns {Object} 优化后的路线
   */
  async multiPointRoute(points, mode = 'driving') {
    if (points.length < 2) {
      throw new Error('至少需要2个地点')
    }

    // 将所有地址转换为坐标
    const coords = await Promise.all(points.map(async (p) => {
      if (typeof p === 'string') {
        if (/^-\d+\.?\d*,-?\d+\.?\d*$/.test(p)) {
          return p
        }
        const geo = await this.geocode(p)
        return `${geo.location.lat},${geo.location.lng}`
      }
      if (p.lat && p.lng) {
        return `${p.lat},${p.lng}`
      }
      if (p.location) {
        return p.location
      }
      const geo = await this.geocode(p.name || p.address)
      return `${geo.location.lat},${geo.location.lng}`
    }))

    // 计算所有两点之间的距离矩阵
    const n = coords.length
    const distanceMatrix = []
    
    for (let i = 0; i < n; i++) {
      distanceMatrix[i] = []
      for (let j = 0; j < n; j++) {
        if (i === j) {
          distanceMatrix[i][j] = 0
        } else {
          try {
            const route = await this.routeByMode(coords[i], coords[j], mode)
            distanceMatrix[i][j] = route.routes[0]?.distance || 0
          } catch (e) {
            distanceMatrix[i][j] = Infinity
          }
        }
      }
    }

    // 简单的最近邻算法进行路径优化
    const optimizedOrder = this.optimizeRoute(distanceMatrix, 0)
    
    // 构建优化后的路线详情
    const optimizedPoints = optimizedOrder.map(i => ({
      ...points[i],
      coordinate: coords[i],
      order: optimizedOrder.indexOf(i)
    }))

    // 获取完整路线
    const routeCoords = optimizedOrder.map(i => coords[i])
    let fullRoute = null
    try {
      fullRoute = await this.routeByMode(routeCoords[0], routeCoords[routeCoords.length - 1], mode, {
        waypoints: routeCoords.slice(1, -1).join(';')
      })
    } catch (e) {
      // 如果整体规划失败，分段获取
      fullRoute = { routes: [{ legs: [] }] }
      for (let i = 0; i < routeCoords.length - 1; i++) {
        try {
          const leg = await this.routeByMode(routeCoords[i], routeCoords[i + 1], mode)
          fullRoute.routes[0].legs.push(...(leg.routes[0]?.legs || []))
        } catch (e) {
          // 忽略单段失败
        }
      }
    }

    return {
      mode,
      original_order: points.map((p, i) => ({ ...p, index: i })),
      optimized_order: optimizedPoints,
      total_distance: this.calculateTotalDistance(distanceMatrix, optimizedOrder),
      total_time: fullRoute?.routes[0]?.duration || 0,
      route_details: fullRoute
    }
  }

  /**
   * 根据模式调用路线规划
   */
  async routeByMode(from, to, mode, options = {}) {
    switch (mode) {
      case 'driving':
        return this.drivingRoute(from, to, options)
      case 'walking':
        return this.walkingRoute(from, to)
      case 'bicycling':
        return this.bicyclingRoute(from, to)
      default:
        return this.drivingRoute(from, to, options)
    }
  }

  /**
   * 路线优化算法（最近邻启发式）
   */
  optimizeRoute(distMatrix, startIdx = 0) {
    const n = distMatrix.length
    const visited = new Set([startIdx])
    const order = [startIdx]
    let current = startIdx

    while (visited.size < n) {
      let nearestDist = Infinity
      let nearestIdx = -1
      
      for (let i = 0; i < n; i++) {
        if (!visited.has(i) && distMatrix[current][i] < nearestDist) {
          nearestDist = distMatrix[current][i]
          nearestIdx = i
        }
      }

      if (nearestIdx !== -1) {
        visited.add(nearestIdx)
        order.push(nearestIdx)
        current = nearestIdx
      } else {
        // 添加剩余未访问的点
        for (let i = 0; i < n; i++) {
          if (!visited.has(i)) {
            order.push(i)
            visited.add(i)
          }
        }
      }
    }

    return order
  }

  calculateTotalDistance(matrix, order) {
    let total = 0
    for (let i = 0; i < order.length - 1; i++) {
      total += matrix[order[i]][order[i + 1]]
    }
    return total
  }

  // ==================== 地理编码 ====================

  /**
   * 地理编码（地址 -> 坐标）
   */
  async geocode(address) {
    const url = `${this.baseUrl}/geocoder/v1/?key=${this.key}&address=${encodeURIComponent(address)}`
    
    logger.info('TencentMap', `地理编码: ${address}`)
    
    const result = await httpRequest(url)
    
    if (result.status !== 0) {
      throw new Error(result.message || '地理编码失败')
    }

    const loc = result.result.location
    return {
      address: result.result.address,
      location: { lat: loc.lat, lng: loc.lng },
      formatted: {
        lat: loc.lat,
        lng: loc.lng,
        latitude: loc.lat,
        longitude: loc.lng
      }
    }
  }

  /**
   * 逆地理编码（坐标 -> 地址）
   */
  async reverseGeocode(lat, lng) {
    const url = `${this.baseUrl}/geocoder/v1/?key=${this.key}&location=${lat},${lng}&get_poi=1`
    
    const result = await httpRequest(url)
    
    if (result.status !== 0) {
      throw new Error(result.message || '逆地理编码失败')
    }

    return {
      address: result.result.address,
      component: result.result.address_component,
      nearby_pois: (result.result.pois || []).map(poi => ({
        id: poi.id,
        name: poi.title,
        address: poi.address,
        location: { lat: poi.location.lat, lng: poi.location.lng },
        category: poi.category
      }))
    }
  }

  // ==================== 地点详情 ====================

  /**
   * 获取POI详情
   */
  async getPOIDetail(poiId) {
    const url = `${this.baseUrl}/place/v1/detail?key=${this.key}&id=${poiId}`
    
    logger.info('TencentMap', `POI详情: ${poiId}`)
    
    const result = await httpRequest(url)
    
    if (result.status !== 0) {
      throw new Error(result.message || '获取POI详情失败')
    }

    return this.formatPOIDetail(result.data)
  }

  // ==================== 结果格式化 ====================

  /**
   * 格式化POI搜索结果
   */
  formatPOIResult(data) {
    if (!data) return { pois: [], total: 0 }

    const pois = (data || []).map(item => ({
      id: item.id,
      name: item.title,
      address: item.address,
      category: item.category,
      location: {
        lat: item.location?.lat,
        lng: item.location?.lng
      },
      coordinate: item.location ? `${item.location.lat},${item.location.lng}` : null,
      distance: item._distance ? Math.round(item._distance) : null,
      tel: item.tel,
      rating: this.parseRating(item.rating),
      avg_price: item.avg_price,
      pet_friendly: this.isPetFriendly(item.title, item.category),
      ad_info: item.ad_info ? { 
        is_ad: !!item.ad_info.phase,
        ...item.ad_info 
      } : null
    }))

    return {
      pois,
      total: pois.length,
      source: 'tencent_map'
    }
  }

  /**
   * 格式化POI详情
   */
  formatPOIDetail(data) {
    if (!data || !data[0]) return null

    const item = data[0]
    return {
      id: item.id,
      name: item.title,
      address: item.address,
      category: item.category,
      type: item.type,
      location: {
        lat: item.location?.lat,
        lng: item.location?.lng
      },
      coordinate: item.location ? `${item.location.lat},${item.location.lng}` : null,
      tel: item.tel,
      rating: this.parseRating(item.rating),
      avg_price: item.avg_price,
      review_num: item.review_num,
      recommend: item.recommend,
      photo_list: (item.photo_list || []).map(p => ({
        url: p.photo_url,
        width: p.photo_width,
        height: p.photo_height
      })),
      business: item.business ? {
        type: item.business.type,
        time: item.business.time
      } : null,
      pet_friendly: this.isPetFriendly(item.title, item.category)
    }
  }

  /**
   * 格式化路线结果
   */
  formatRouteResult(data, mode) {
    if (!data || !data.routes || data.routes.length === 0) {
      return { routes: [], mode, message: '未找到可用路线' }
    }

    const route = data.routes[0]
    
    return {
      mode,
      routes: [{
        distance: route.distance,
        duration: route.duration,
        polyline: route.polyline,
        steps: (route.steps || []).map(step => ({
          instruction: step.instruction,
          distance: step.distance,
          duration: step.duration,
          road: step.road,
          polyline: step.polyline,
          turn: step.turn,
          start_location: step.start_location,
          end_location: step.end_location
        })),
        legs: (route.legs || []).map(leg => ({
          distance: leg.distance,
          duration: leg.duration,
          steps: (leg.steps || []).map(step => ({
            instruction: step.instruction,
            distance: step.distance,
            duration: step.duration,
            road: step.road,
            polyline: step.polyline
          }))
        })),
        tolls: route.tolls,
        taxi_cost: route.taxi_cost
      }],
      summary: {
        total_distance: route.distance,
        total_duration: route.duration,
        distance_text: this.formatDistance(route.distance),
        duration_text: this.formatDuration(route.duration)
      }
    }
  }

  /**
   * 格式化公交路线结果
   */
  formatTransitResult(data) {
    if (!data || !data.routes || data.routes.length === 0) {
      return { routes: [], mode: 'transit' }
    }

    return {
      mode: 'transit',
      routes: data.routes.map(route => ({
        fare: route.fare,
        distance: route.distance,
        duration: route.duration,
        lines: (route.lines || []).map(line => ({
          id: line.id,
          title: line.title,
          vehicle: line.vehicle,
          station_geton: {
            name: line.geton?.name,
            location: line.geton?.location,
            lat: line.geton?.lat,
            lng: line.geton?.lng
          },
          station_getoff: {
            name: line.getoff?.name,
            location: line.getoff?.location,
            lat: line.getoff?.lat,
            lng: line.getoff?.lng
          },
          distance: line.distance,
          duration: line.duration,
          stops: line.stops,
          stations: (line.stations || []).map(s => ({
            name: s.name,
            location: s.location
          }))
        }))
      }))
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 解析评分
   */
  parseRating(rating) {
    if (!rating) return null
    return parseFloat(rating) || 0
  }

  /**
   * 判断是否宠物友好
   */
  isPetFriendly(title, category) {
    const text = `${title} ${category}`.toLowerCase()
    const petKeywords = ['宠物', '狗', '猫', '萌宠', '携宠', '允许宠物', 'pet', '动物']
    return petKeywords.some(kw => text.includes(kw))
  }

  /**
   * 格式化距离
   */
  formatDistance(meters) {
    if (meters >= 1000) {
      return (meters / 1000).toFixed(1) + '公里'
    }
    return meters + '米'
  }

  /**
   * 格式化时间
   */
  formatDuration(seconds) {
    if (!seconds) return '0分钟'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (hours > 0) {
      return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`
    }
    return `${minutes}分钟`
  }

  /**
   * 获取地图静态图片URL
   */
  getStaticMapUrl(center, zoom = 15, markers = [], size = '600x400') {
    let url = `https://apis.map.qq.com/ws/staticmap/v2/?key=${this.key}&center=${center}&zoom=${zoom}&size=${size}`
    
    markers.forEach((m, i) => {
      url += `&markers=size:large|color:${m.color || 'red'}|label:${i + 1}|${m.coordinate}`
    })

    return url
  }
}

// 导出单例
module.exports = new TencentMapService()
module.exports.TencentMapService = TencentMapService
