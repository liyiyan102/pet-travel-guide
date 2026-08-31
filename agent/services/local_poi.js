/**
 * 本地POI检索服务
 * 基于本地数据库进行宠物友好场所搜索，支持：
 * - 按城市/类别/关键词检索
 * - 地理位置距离计算和排序
 * - POI增删改查管理
 * - 与腾讯地图API互补使用
 */

const fs = require('fs')
const path = require('path')
const { logger } = require('../utils/logger')

// 数据库文件路径
const DB_PATH = path.join(__dirname, '../../data/pet_poi_database.json')
const BANNED_DB_PATH = path.join(__dirname, '../../data/pet_banned_database.json')

class LocalPOIService {
  constructor() {
    this.database = null
    this.bannedDatabase = null
    this.loadDatabase()
  }

  /**
   * 加载数据库
   */
  loadDatabase() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const data = fs.readFileSync(DB_PATH, 'utf-8')
        this.database = JSON.parse(data)
        logger.info('LocalPOI', `友好POI数据库加载成功: ${this.database.pois.length} 条POI记录`)
      } else {
        logger.warn('LocalPOI', '友好数据库文件不存在，创建空数据库')
        this.database = this.createEmptyDatabase()
        this.saveDatabase()
      }
    } catch (error) {
      logger.error('LocalPOI', `加载友好数据库失败: ${error.message}`)
      this.database = this.createEmptyDatabase()
    }

    // 加载禁入场所数据库
    try {
      if (fs.existsSync(BANNED_DB_PATH)) {
        const data = fs.readFileSync(BANNED_DB_PATH, 'utf-8')
        this.bannedDatabase = JSON.parse(data)
        logger.info('LocalPOI', `禁入POI数据库加载成功: ${this.bannedDatabase.pois?.length || 0} 条记录`)
      } else {
        this.bannedDatabase = { pois: [] }
      }
    } catch (error) {
      logger.error('LocalPOI', `加载禁入数据库失败: ${error.message}`)
      this.bannedDatabase = { pois: [] }
    }
  }

  /**
   * 创建空数据库结构
   */
  createEmptyDatabase() {
    return {
      version: '1.0',
      description: '全国宠物友好POI数据库',
      lastUpdated: new Date().toISOString(),
      categories: {},
      cities: [],
      pois: []
    }
  }

  /**
   * 保存数据库到文件
   */
  saveDatabase() {
    try {
      // 确保目录存在
      const dir = path.dirname(DB_PATH)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      
      this.database.lastUpdated = new Date().toISOString()
      fs.writeFileSync(DB_PATH, JSON.stringify(this.database, null, 2), 'utf-8')
      return true
    } catch (error) {
      logger.error('LocalPOI', `保存数据库失败: ${error.message}`)
      return false
    }
  }

  // ==================== 检索功能 ====================

  /**
   * 搜索POI（核心方法）
   * @param {Object} params - 搜索参数
   * @param {string} params.city - 城市名称
   * @param {string} params.category - 类别
   * @param {string} params.keyword - 关键词
   * @param {boolean} params.petOnly - 仅返回宠物友好
   * @param {number} params.limit - 返回数量限制
   * @param {number} params.offset - 分页偏移
   * @param {Object} params.location - 用户位置 {lat, lng} 用于距离排序
   * @param {number} params.radius - 搜索半径(米)
   * @param {number} params.minFriendliness - 最低友好等级（1-4，默认1）
   * @param {boolean} params.sortByFriendliness - 按友好等级排序（默认true）
   */
  search(params = {}) {
    const {
      city,
      category,
      keyword,
      petOnly = true,
      limit = 20,
      offset = 0,
      location,
      radius,
      minFriendliness = 1,
      sortByFriendliness = true
    } = params

    let results = [...this.database.pois]

    // 1. 城市过滤
    if (city && city.trim()) {
      const cityClean = city.replace(/市$/, '')
      results = results.filter(poi => 
        poi.city === cityClean || 
        poi.city === city ||
        poi.city?.includes(cityClean) ||
        cityClean.includes(poi.city)
      )
    }

    // 2. 类别过滤
    if (category && category !== 'all') {
      results = results.filter(poi => poi.category === category)
    }

    // 3. 宠物友好过滤
    if (petOnly) {
      results = results.filter(poi => poi.pet_friendly === true)
    }

    // 4. 友好等级过滤（friendliness_level 1-4，数字越小越友好）
    if (minFriendliness > 1) {
      results = results.filter(poi => 
        (poi.friendliness_level || 2) <= minFriendliness
      )
    }

    // 5. 关键词搜索
    if (keyword && keyword.trim()) {
      const kw = keyword.toLowerCase().trim()
      results = results.filter(poi => {
        const searchText = [
          poi.name,
          poi.address,
          poi.district || '',
          ...(poi.tags || []),
          poi.category || '',
          poi.pet_policy || '',
          poi.notes || ''
        ].join(' ').toLowerCase()
        
        return searchText.includes(kw)
      })
    }

    // 6. 距离计算
    if (location && location.lat && location.lng) {
      results = results.map(poi => ({
        ...poi,
        distance: poi.lat && poi.lng 
          ? this.calculateDistance(location.lat, location.lng, poi.lat, poi.lng)
          : null
      }))

      // 半径过滤
      if (radius && radius > 0) {
        results = results.filter(poi => poi.distance != null && poi.distance <= radius)
      }
    }

    // 7. 排序：优先按友好等级，其次按距离/置信度
    results.sort((a, b) => {
      // 友好等级排序（1级最优先）
      if (sortByFriendliness) {
        const aLevel = a.friendliness_level || 2
        const bLevel = b.friendliness_level || 2
        if (aLevel !== bLevel) return aLevel - bLevel
      }
      // 距离排序
      if (a.distance != null && b.distance != null) {
        return a.distance - b.distance
      }
      // 已验证优先
      if (a.verified && !b.verified) return -1
      if (!a.verified && b.verified) return 1
      return 0
    })

    // 统计总数
    const total = results.length

    // 分页
    const paginatedResults = results.slice(offset, offset + limit)

    return {
      success: true,
      data: {
        pois: paginatedResults,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
        search_params: params,
        source: 'local_database',
        friendliness_stats: {
          level1: results.filter(p => p.friendliness_level === 1).length,
          level2: results.filter(p => p.friendliness_level === 2).length,
          level3: results.filter(p => p.friendliness_level === 3).length,
          level4: results.filter(p => p.friendliness_level === 4).length
        }
      },
      database_info: {
        total_records: this.database.pois.length,
        last_updated: this.database.lastUpdated,
        cities_count: this.database.cities?.length || 0
      }
    }
  }

  /**
   * 按城市获取所有宠物友好POI
   */
  getByCity(city, options = {}) {
    return this.search({ city, ...options })
  }

  /**
   * 按类别获取POI
   */
  getByCategory(category, options = {}) {
    return this.search({ category, ...options })
  }

  /**
   * 搜索附近POI（基于坐标）
   */
  getNearby(lat, lng, radius = 5000, options = {}) {
    return this.search({
      location: { lat, lng },
      radius,
      ...options
    })
  }

  /**
   * 关键词全文搜索
   */
  keywordSearch(keyword, options = {}) {
    return this.search({ keyword, ...options })
  }

  // ==================== 单条查询 ====================

  /**
   * 根据ID获取POI详情
   */
  getById(id) {
    const poi = this.database.pois.find(p => p.id === id)
    if (!poi) {
      return { success: false, error: '未找到该POI' }
    }
    return { success: true, data: poi }
  }

  /**
   * 根据名称模糊匹配
   */
  getByName(name, city) {
    let results = this.database.pois.filter(poi => 
      poi.name?.includes(name) || name?.includes(poi.name)
    )
    
    if (city) {
      results = results.filter(poi => poi.city === city)
    }

    return {
      success: true,
      data: results,
      total: results.length
    }
  }

  // ==================== 数据管理 ====================

  /**
   * 添加新POI
   */
  addPOI(poiData) {
    // 生成ID
    const cityCode = this.getCityCode(poiData.city || '未知')
    const categoryId = poiData.category?.substring(0, 2).toUpperCase() || 'XX'
    const id = `${cityCode}${categoryId}${String(Date.now()).slice(-6)}`
    
    const newPOI = {
      id,
      name: poiData.name,
      category: poiData.category,
      city: poiData.city,
      address: poiData.address,
      lat: poiData.lat,
      lng: poiData.lng,
      pet_friendly: poiData.pet_friendly !== false,
      pet_policy: poiData.pet_policy || '',
      features: poiData.features || [],
      rating: poiData.rating || 0,
      price_level: poiData.price_level || 1,
      phone: poiData.phone || '',
      tags: poiData.tags || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      verified: false  // 待审核
    }

    this.database.pois.push(newPOI)

    // 更新城市列表
    if (!this.database.cities.includes(newPOI.city)) {
      this.database.cities.push(newPOI.city)
    }

    this.saveDatabase()

    logger.info('LocalPOI', `新增POI: ${newPOI.name} (${newPOI.id})`)

    return { success: true, data: newPOI, message: '添加成功' }
  }

  /**
   * 更新POI信息
   */
  updatePOI(id, updateData) {
    const index = this.database.pois.findIndex(p => p.id === id)
    
    if (index === -1) {
      return { success: false, error: '未找到该POI' }
    }

    // 合并更新数据（保留不可变字段）
    const original = this.database.pois[index]
    this.database.pois[index] = {
      ...original,
      ...updateData,
      id: original.id,  // ID不可更改
      created_at: original.created_at,  // 创建时间不变
      updated_at: new Date().toISOString()
    }

    this.saveDatabase()

    logger.info('LocalPOI', `更新POI: ${this.database.pois[index].name}`)

    return { success: true, data: this.database.pois[index], message: '更新成功' }
  }

  /**
   * 删除POI
   */
  deletePOI(id) {
    const index = this.database.pois.findIndex(p => p.id === id)
    
    if (index === -1) {
      return { success: false, error: '未找到该POI' }
    }

    const deleted = this.database.pois.splice(index, 1)[0]
    this.saveDatabase()

    logger.info('LocalPOI', `删除POI: ${deleted.name}`)

    return { success: true, data: deleted, message: '删除成功' }
  }

  /**
   * 批量导入POI
   */
  batchImport(pois) {
    let imported = 0
    let skipped = 0

    pois.forEach(poi => {
      // 检查是否已存在（根据名称+城市）
      const exists = this.database.pois.some(p => 
        p.name === poi.name && p.city === poi.city
      )

      if (exists) {
        skipped++
        return
      }

      this.addPOI(poi)
      imported++
    })

    return {
      success: true,
      message: `批量导入完成`,
      stats: {
        imported,
        skipped,
        total: pois.length
      }
    }
  }

  // ==================== 禁入场所查询 ====================

  /**
   * 搜索禁入场所（宠物不可进入的地点）
   * @param {Object} params - { city, keyword, category, limit }
   */
  searchBanned(params = {}) {
    const { city, keyword, category, limit = 20 } = params

    let results = [...(this.bannedDatabase?.pois || [])]

    // 城市过滤
    if (city && city.trim()) {
      const cityClean = city.replace(/市$/, '')
      results = results.filter(p =>
        p.city === cityClean || p.city === city ||
        p.city?.includes(cityClean) || cityClean.includes(p.city)
      )
    }

    // 类别过滤
    if (category && category !== 'all') {
      results = results.filter(p => p.category === category)
    }

    // 关键词搜索
    if (keyword && keyword.trim()) {
      const kw = keyword.toLowerCase().trim()
      results = results.filter(poi => {
        const searchText = [
          poi.name, poi.address, poi.district || '',
          poi.ban_reason || '', poi.category || ''
        ].join(' ').toLowerCase()
        return searchText.includes(kw)
      })
    }

    const total = results.length
    return {
      success: true,
      data: {
        pois: results.slice(0, limit),
        total,
        source: 'local_banned_database'
      }
    }
  }

  /**
   * 检查某个场所是否禁入宠物
   * @param {string} venueName - 场所名称
   * @param {string} city - 城市
   * @returns {Object} { banned: boolean, reason: string, poi: object|null }
   */
  checkBanned(venueName, city = '') {
    if (!venueName) return { banned: false, reason: '', poi: null }

    const bannedPois = this.bannedDatabase?.pois || []
    const nameLower = venueName.toLowerCase()

    for (const poi of bannedPois) {
      // 精确匹配或包含匹配
      if (poi.name === venueName || poi.name.includes(nameLower) || nameLower.includes(poi.name)) {
        // 如果指定了城市，检查是否匹配
        if (city && poi.city && !poi.city.includes(city) && !city.includes(poi.city)) {
          continue
        }
        return {
          banned: true,
          reason: poi.ban_reason || '该场所禁止携带宠物进入',
          poi
        }
      }
    }

    return { banned: false, reason: '', poi: null }
  }

  /**
   * 获取禁入场所统计
   */
  getBannedStats() {
    const pois = this.bannedDatabase?.pois || []
    const stats = {
      total: pois.length,
      by_city: {},
      by_category: {}
    }
    pois.forEach(poi => {
      stats.by_city[poi.city] = (stats.by_city[poi.city] || 0) + 1
      stats.by_category[poi.category] = (stats.by_category[poi.category] || 0) + 1
    })
    return {
      success: true,
      data: stats
    }
  }

  // ==================== 统计分析 ====================

  /**
   * 获取统计信息
   */
  getStats() {
    const stats = {
      total: this.database.pois.length,
      by_city: {},
      by_category: {},
      by_friendliness: { 1: 0, 2: 0, 3: 0, 4: 0 },
      pet_friendly_count: 0,
      pet_unfriendly_count: 0,
      with_coordinates: 0,
      verified_count: 0
    }

    this.database.pois.forEach(poi => {
      // 按城市统计
      stats.by_city[poi.city] = (stats.by_city[poi.city] || 0) + 1
      
      // 按类别统计
      stats.by_category[poi.category] = (stats.by_category[poi.category] || 0) + 1
      
      // 按友好等级统计
      const level = poi.friendliness_level || 2
      if (stats.by_friendliness[level] !== undefined) {
        stats.by_friendliness[level]++
      }

      // 宠物友好统计
      if (poi.pet_friendly) {
        stats.pet_friendly_count++
      } else {
        stats.pet_unfriendly_count++
      }

      // 有坐标的
      if (poi.lat && poi.lng) {
        stats.with_coordinates++
      }

      // 已验证
      if (poi.verified) {
        stats.verified_count++
      }
    })

    return {
      success: true,
      data: stats,
      database_info: {
        version: this.database.version,
        last_updated: this.database.lastUpdated,
        cities_count: Object.keys(stats.by_city).length
      }
    }
  }

  /**
   * 获取所有支持的城市列表
   */
  getCities() {
    const cities = [...new Set(this.database.pois.map(p => p.city))]
    return {
      success: true,
      data: cities.sort(),
      count: cities.length
    }
  }

  /**
   * 获取所有类别及说明
   */
  getCategories() {
    return {
      success: true,
      data: this.database.categories
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 计算两点之间距离（米）- Haversine公式
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000 // 地球半径（米）
    const dLat = this.toRad(lat2 - lat1)
    const dLng = this.toRad(lng2 - lng1)
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2)
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c)
  }

  /**
   * 角度转弧度
   */
  toRad(deg) {
    return deg * Math.PI / 180
  }

  /**
   * 获取城市代码前缀
   */
  getCityCode(city) {
    const codes = {
      '北京': 'BJ', '上海': 'SH', '广州': 'GZ', '深圳': 'SZ',
      '杭州': 'HZ', '成都': 'CD', '重庆': 'CQ', '西安': 'XA',
      '南京': 'NJ', '苏州': 'SZ', '武汉': 'WH', '长沙': 'CS',
      '青岛': 'QD', '厦门': 'XM', '三亚': 'SY', '大连': 'DL',
      '天津': 'TJ', '昆明': 'KM', '贵阳': 'GY', '郑州': 'ZZ',
      '合肥': 'HF', '福州': 'FZ', '南昌': 'NC', '济南': 'JN',
      '珠海': 'ZH', '无锡': 'WX', '宁波': 'NB', '温州': 'WZ',
      '桂林': 'GL', '丽江': 'LJ', '大理': 'DL', '张家界': 'ZJJ',
      '黄山': 'HS', '拉萨': 'LS', '乌鲁木齐': 'WLMQ',
      '呼和浩特': 'HHHT', '兰州': 'LZ', '西宁': 'XN',
      '银川': 'YC', '海口': 'HK', '香港': 'HK', '澳门': 'MO'
    }
    return codes[city] || 'OT'
  }

  /**
   * 格式化距离显示
   */
  formatDistance(meters) {
    if (meters >= 1000) {
      return (meters / 1000).toFixed(1) + '公里'
    }
    return meters + '米'
  }
}

// 导出单例
module.exports = new LocalPOIService()
module.exports.LocalPOIService = LocalPOIService
