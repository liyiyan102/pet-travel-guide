/**
 * POI搜索工具
 * 对接腾讯地图API搜索宠物友好场所
 */

const BaseTool = require('./base')
const { logger } = require('../utils/logger')
const amap = require('../services/amap')
const localPOI = require('../services/local_poi')

class POITool extends BaseTool {
  static get schema() {
    return {
      name: 'search_poi',
      description: '搜索附近的宠物友好场所，包括餐厅、酒店、景点、公园、宠物医院、美容院等',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: '搜索关键词（如"餐厅"、"公园"、"宠物医院"）'
          },
          location: {
            type: 'string',
            description: '位置（城市名或"纬度,经度"格式）'
          },
          category: {
            type: 'string',
            enum: ['restaurant', 'hotel', 'park', 'scenic_spot', 'cafe', 'pet_service', 'hospital', 'grooming', 'shopping', 'all'],
            description: '场所类别'
          },
          radius: {
            type: 'number',
            description: '搜索半径（米），默认3000'
          },
          pet_type: {
            type: 'string',
            enum: ['dog', 'cat', 'any'],
            description: '宠物类型（用于筛选）'
          },
          pet_size: {
            type: 'string',
            enum: ['small', 'medium', 'large', 'any'],
            description: '宠物体型筛选'
          }
        },
        required: ['location']
      }
    }
  }

  async execute(params) {
    const { keyword, location, category = 'all', radius = 3000, limit = 10 } = params

    logger.info('POITool', `搜索: ${keyword || category}, 位置: ${location}, 半径: ${radius}m, 请求: ${limit}条`)

    const searchCategory = this.mapCategory(category)
    let apiPois = []
    let localPois = []

    // ① 并行召回：腾讯地图 + 本地数据库同时查
    const [apiResult, localResult] = await Promise.allSettled([
      amap.searchPetPOI(searchCategory, location, { radius, limit: Math.max(limit, 20) }),
      Promise.resolve(this.searchLocal(location, category, keyword, Math.max(limit, 10)))
    ])

    if (apiResult.status === 'fulfilled' && apiResult.value?.pois?.length > 0) {
      apiPois = apiResult.value.pois
      logger.info('POITool', `腾讯地图返回 ${apiPois.length} 条`)
    } else {
      logger.warn('POITool', `腾讯地图无结果: ${apiResult.reason?.message || '空结果'}`)
    }

    if (localResult.status === 'fulfilled' && localResult.value?.pois?.length > 0) {
      localPois = localResult.value.pois
      logger.info('POITool', `本地数据库返回 ${localPois.length} 条`)
    }

    // 保留禁入场所数据
    const bannedPois = localResult.value?.banned_pois || []

    // ② 合并去重（以 name+city 为唯一键，本地数据优先，API 结果补充）
    const merged = [...localPois]
    const localNames = new Set(localPois.map(p => p.name))

    for (const poi of apiPois) {
      if (!localNames.has(poi.name)) {
        merged.push(poi)
      }
    }

    // ③ 关键词过滤（不过滤短词，避免过严）
    let finalPois = merged
    if (keyword && keyword.trim() && keyword.trim().length <= 8) {
      const kw = keyword.trim().toLowerCase()
      const filtered = merged.filter(p =>
        `${p.name} ${p.address || ''} ${p.pet_policy || ''}`.toLowerCase().includes(kw)
      )
      if (filtered.length > 0) finalPois = filtered
    }

    // ④ 有结果直接返回（按用户请求的数量，上限20）
    if (finalPois.length > 0) {
      const maxReturn = Math.min(limit, 20)
      const result = finalPois.slice(0, maxReturn)
      const sources = []
      if (localPois.length > 0) sources.push(`本地数据库${localPois.length}条`)
      if (apiPois.length > 0) sources.push(`腾讯地图${apiPois.length}条`)
      return {
        pois: result,
        total: result.length,
        totalFound: finalPois.length,
        banned_pois: bannedPois,
        banned_total: bannedPois.length,
        search_params: params,
        source: sources.length > 1 ? 'merged' : (apiPois.length > 0 ? 'tencent_map_api' : 'local_database'),
        note: `数据来源：${sources.join(' + ')}，共找到${finalPois.length}条，展示${result.length}条`
      }
    }

    // ⑤ 双源都无结果，不返回假数据
    logger.info('POITool', '双源均无结果')
    return {
      pois: [],
      total: 0,
      search_params: params,
      source: 'none',
      note: '暂无该城市/分类的宠物友好场所数据'
    }
  }

  /**
   * 映射类别名称
   */
  mapCategory(category) {
    const categoryMap = {
      'restaurant': 'restaurant', 'hotel': 'hotel', 'park': 'park',
      'scenic_spot': 'scenic', 'scenic': 'scenic', 'cafe': 'cafe',
      'pet_service': 'pet_service', 'hospital': 'hospital',
      'grooming': 'grooming', 'shopping': 'all', 'all': 'all',
      // 中文映射
      '餐厅': 'restaurant', '饭店': 'restaurant', '美食': 'restaurant',
      '咖啡': 'cafe', '咖啡馆': 'cafe', '公园': 'park',
      '景点': 'scenic', '景区': 'scenic', '酒店': 'hotel', '住宿': 'hotel',
      '医院': 'hospital', '宠物医院': 'hospital',
      '美容': 'grooming', '宠物美容': 'grooming'
    }
    return categoryMap[category] || 'all'
  }

  /**
   * 模拟POI数据（开发阶段使用）
   */
  getMockPOIs(location, category, keyword) {
    const mockData = {
      restaurant: [
        { id: 'r1', name: '猫豆宠物友好餐厅', address: `${location}市中心步行街`, category: '餐厅', distance: '500m', rating: 4.8, pet_friendly: true, pet_policy: '室外区域允许携带宠物，提供宠物菜单', images: [] },
        { id: 'r2', name: '阳光花园露台餐厅', address: `${location}滨江路88号`, category: '西餐', distance: '800m', rating: 4.6, pet_friendly: true, pet_policy: '全露天场地，欢迎各类宠物', images: [] },
        { id: 'r3', name: '巷子深处的猫咖', address: `${location}文艺巷12号`, category: '咖啡馆', distance: '350m', rating: 4.9, pet_friendly: true, pet_policy: '猫咪天堂，狗狗也欢迎（需牵绳）', images: [] }
      ],
      park: [
        { id: 'p1', name: `${location}中央公园`, address: `${location}人民路1号`, category: '城市公园', distance: '600m', rating: 4.7, pet_friendly: true, pet_policy: '全天开放，需牵绳，有宠物粪便清理设施', images: [] },
        { id: 'p2', name: '滨江绿地', address: `${location}滨江大道`, category: '滨水公园', distance: '1200m', rating: 4.5, pet_friendly: true, pet_policy: '开放式公园，非常适合遛狗', images: [] }
      ],
      hospital: [
        { id: 'h1', name: '宠爱动物医院', address: `${location}健康路55号`, category: '宠物医院', distance: '1500m', rating: 4.9, pet_friendly: true, pet_policy: '24小时急诊，支持犬猫小动物', phone: '400-xxx-xxxx', images: [] },
        { id: 'h2', name: '萌宠诊所', address: `${location}幸福街22号`, category: '宠物诊所', distance: '2000m', rating: 4.6, pet_friendly: true, pet_policy: '预约制，全科诊疗', phone: '400-xxx-xxxx', images: [] }
      ],
      hotel: [
        { id: 'ht1', name: '宠物友好度假酒店', address: `${location}度假区大道99号`, category: '酒店', distance: '5000m', rating: 4.7, pet_friendly: true, pet_policy: '欢迎携带宠物，收取清洁费100元/晚，提供宠物床和餐具', images: [] },
        { id: 'ht2', name: '温馨民宿·携宠之家', address: `${location}古镇景区内`, category: '民宿', distance: '8000m', rating: 4.8, pet_friendly: true, pet_policy: '完全宠物友好，有独立院子，免费提供宠物用品', images: [] }
      ],
      scenic_spot: [
        { id: 's1', name: `${location}风景名胜区`, address: `${location}风景区`, category: '景区', distance: '15km', rating: 4.8, pet_friendly: true, pet_policy: '室外区域允许牵绳进入，缆车需确认', ticket_price: '80元', images: [] }
      ],
      grooming: [
        { id: 'g1', name: '汪星人美容会所', address: `${location}购物广场B1层`, category: '宠物美容', distance: '1000m', rating: 4.7, pet_friendly: true, pet_policy: '洗澡/美容/SPA，需预约', phone: '400-xxx-xxxx', images: [] }
      ],
      all: [] // 会从以上所有类别汇总
    }

    // 根据类别返回数据
    let results = []
    if (category === 'all') {
      for (const key of Object.keys(mockData)) {
        if (key !== 'all') results.push(...mockData[key])
      }
    } else {
      results = mockData[category] || []
    }

    // 保存未过滤的结果供回退使用（必须在过滤前保存）
    const allPoisBeforeFilter = [...results]

    // 如果有关键词，进行宽松过滤（拆分关键词，任一片段匹配即可）
    if (keyword && keyword.trim()) {
      // 将长关键词拆分为有意义的短片段
      const keywordParts = keyword.split(/[\s、，,。！？!?]/).filter(p => p.length >= 1)
      if (keywordParts.length > 0) {
        const filtered = results.filter(poi => {
          const searchText = `${poi.name} ${poi.category} ${poi.address}`.toLowerCase()
          return keywordParts.some(part => 
            part.length >= 1 && searchText.includes(part.toLowerCase())
          )
        })
        // 只有当过滤后仍有结果时才使用过滤结果，否则用全部结果
        if (filtered.length > 0) {
          results = filtered
        }
        // 如果过滤后为空，保持原来的results（allPoisBeforeFilter的副本）
      }
    }

    return {
      pois: results,
      allPois: allPoisBeforeFilter,
      total: results.length,
      search_params: { location, category, keyword },
      note: '当前为模拟数据，接入地图API后返回真实结果'
    }
  }

  /**
   * 搜索本地数据库
   */
  searchLocal(location, category, keyword, limit = 10) {
    const searchParams = { limit: Math.max(limit, 10) }
    
    const INVALID_LOCATIONS = ['当前位置', '附近', '这里', '我这里', '我附近']
    const CITIES = ['北京','上海','杭州','广州','深圳','成都','重庆','西安','南京','厦门','三亚','大连','昆明','丽江']

    // 1. 先从 location 提取城市（排除无效值）
    if (location && location.trim() && !INVALID_LOCATIONS.includes(location.trim())) {
      const loc = location.trim()
      for (const c of CITIES) {
        if (loc.includes(c)) { searchParams.city = c; break }
      }
      // 如果没匹配到城市，且是短字符串，当关键词
      if (!searchParams.city && loc.length < 8) {
        searchParams.keyword = loc
      }
    }

    // 2. 如果还没找到城市，从 keyword 中提取
    if (!searchParams.city && keyword) {
      const allText = (location || '') + ' ' + keyword
      for (const c of CITIES) {
        if (allText.includes(c)) { searchParams.city = c; break }
      }
    }
    
    // 3. 分类
    if (category && category.trim()) {
      searchParams.category = this.mapCategory(category)
    }
    
    // 4. 关键词：完整句子不作为关键词
    if (keyword && keyword.trim()) {
      const kw = keyword.trim()
      const isFullSentence = kw.length > 8 || /有什么|哪里|哪些|附近|推荐|找|搜索/.test(kw)
      if (!isFullSentence) {
        searchParams.keyword = kw
      }
    }
    
    const result = localPOI.search(searchParams)
    const pois = (result && result.data && result.data.pois) ? result.data.pois : []

    // 同时查询禁入场所，帮助用户规避
    let bannedPois = []
    if (searchParams.city) {
      const bannedResult = localPOI.searchBanned({
        city: searchParams.city,
        category: searchParams.category,
        limit: 10
      })
      bannedPois = (bannedResult && bannedResult.data && bannedResult.data.pois) ? bannedResult.data.pois : []
    }

    return {
      success: true,
      pois: pois,
      total: pois.length,
      banned_pois: bannedPois,
      banned_total: bannedPois.length,
      city: location || '全国',
      category: category,
      source: 'local_database',
      note: pois.length > 0
        ? `本地数据库找到 ${pois.length} 条友好场所${bannedPois.length > 0 ? `，${bannedPois.length} 处禁入场所需注意` : ''}`
        : `本地数据库暂无友好场所数据${bannedPois.length > 0 ? `，但发现 ${bannedPois.length} 处禁入场所` : ''}`
    }
  }
}

module.exports = POITool
