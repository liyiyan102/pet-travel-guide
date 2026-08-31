/**
 * 地点查询子Agent — POI Searcher
 * 
 * 当主Router识别到 search_poi 意图时，分发到这个子Agent处理
 * 
 * 核心功能：
 * 1. 接收用户输入（"北京有什么宠物友好酒店"、"推荐几个公园"）
 * 2. 提取关键信息（城市、品类、数量等）
 * 3. 双源检索：本地POI数据库 + 高德地图API
 * 4. 合并去重、分组排序
 * 5. 使用 poiSearchTemplate 格式化输出
 */

const { logger } = require('../../utils/logger')
const config = require('../../config')
const formatter = require('../../utils/formatter')

// 本地POI数据库
let localPoiDB = null

// 高德地图客户端
let amapClient = null

function _getLocalPoiDB() {
  if (!localPoiDB) {
    try {
      localPoiDB = require('../../../data/local_poi_db')
    } catch (e) {
      logger.warn('PoiSearcher', '本地POI数据库加载失败')
      localPoiDB = { search: () => ({ results: [] }), getCities: () => [], getCategories: () => [] }
    }
  }
  return localPoiDB
}

function _getAmapClient() {
  if (!amapClient) {
    try {
      amapClient = require('../../services/amap_service')
    } catch (e) {
      logger.warn('PoiSearcher', '高德地图服务加载失败')
      amapClient = { textSearch: async () => ({ pois: [] }) }
    }
  }
  return amapClient
}

class PoiSearcherAgent {
  constructor() {
    this.name = 'poi_searcher'
    this.version = '1.0.0'
    
    // 品类映射（用户关键词 → 标准品类）
    this.categoryMap = {
      // 住宿
      '酒店': ['酒店', '宾馆', '旅馆', '住宿'],
      '民宿': ['民宿', '公寓', '客栈', '农家乐'],
      // 餐饮
      '餐厅': ['餐厅', '饭店', '美食', '吃饭', '用餐'],
      '咖啡': ['咖啡', '咖啡馆', '奶茶', '甜品', '蛋糕'],
      // 户外/景点
      '公园': ['公园', '景区', '景点', '风景区', '旅游区'],
      '户外': ['露营', '露营地', '草坪', '沙滩', '户外'],
      // 宠物专属
      '宠物服务': ['宠物店', '宠物医院', '美容', '寄养', '用品'],
      '狗公园': ['狗公园', '宠物乐园', '遛狗', '宠物公园']
    }

    logger.info('PoiSearcher', `子Agent初始化完成: v${this.version}`)
  }

  /**
   * 主入口方法 — 处理地点查询请求
   */
  async process(request) {
    const timer = logger.time('poi_searcher')
    const { text: userMessage, sessionId = 'default', userId = 'anonymous', context = {} } = request

    logger.info('PoiSearcher', `收到请求: session=${sessionId}, msg="${userMessage.slice(0, 50)}"`)

    try {
      // Step 1: 提取关键信息
      const extracted = this._extractSearchInfo(userMessage)
      logger.info('PoiSearcher', `提取信息: city=${extracted.city}, category=${extracted.category}, count=${extracted.count}`)

      // Step 2: 并行检索双源数据
      const [localResults, amapResults] = await Promise.all([
        this._searchLocal(extracted),
        this._searchAmap(extracted)
      ])

      logger.info('PoiSearcher', `检索结果: local=${localResults.length}, amap=${amapResults.length}`)

      // Step 3: 合并去重
      const merged = this._mergeResults(localResults, amapResults, extracted.count)
      logger.info('PoiSearcher', `合并后: ${merged.length} 条`)

      // Step 4: 分组
      const groups = this._groupResults(merged, extracted)

      // Step 5: 使用模版格式化输出
      const result = formatter.poiSearchTemplate({
        city: extracted.city,
        category: extracted.category,
        groups,
        total: merged.length
      })

      timer.stop()
      return result

    } catch (error) {
      logger.error(`PoiSearcher处理失败: ${error.message}`)
      timer.stop()
      return formatter.getFallbackReply('error')
    }
  }

  /**
   * 提取搜索关键信息
   */
  _extractSearchInfo(message) {
    const result = {
      city: '',
      category: '',
      count: 6,  // 默认返回6个
      rawMessage: message
    }

    // 城市提取
    const cityPatterns = [
      /在([\u4e00-\u9fa5]{2,4})市?/,
      /([\u4e00-\u9fa5]{2,4})有什么/,
      /([\u4e00-\u9fa5]{2,4})推荐/,
      /去([\u4e00-\u9fa5]{2,4})的/,
      /([\u4e00-\u9fa5]{2,4})(酒店|公园|餐厅|景点|民宿|打卡)/,
    ]

    for (const pattern of cityPatterns) {
      const match = message.match(pattern)
      if (match) {
        result.city = match[1]
        break
      }
    }

    // 品类提取
    for (const [category, keywords] of Object.entries(this.categoryMap)) {
      for (const keyword of keywords) {
        if (message.includes(keyword)) {
          result.category = category
          break
        }
      }
      if (result.category) break
    }

    // 数量提取
    const countMatch = message.match(/(\d+)个?/)
    if (countMatch) {
      result.count = Math.min(parseInt(countMatch[1]), 20) // 最多20个
    }

    // 特殊数量词
    if (/几个/.test(message)) result.count = 6
    if (/一些/.test(message)) result.count = 10
    if (/全部|所有/.test(message)) result.count = 20

    return result
  }

  /**
   * 检索本地POI数据库
   */
  async _searchLocal(extracted) {
    try {
      const db = _getLocalPoiDB()
      
      // 构建搜索条件
      const query = {
        city: extracted.city || undefined,
        category: extracted.category || undefined,
        petFriendly: true,
        limit: extracted.count
      }

      const response = await db.search(query)
      return (response.results || []).map(poi => ({
        id: poi.id,
        name: poi.name,
        address: poi.address,
        category: poi.category,
        image: poi.image || poi.cover,
        rating: poi.rating,
        avgPrice: poi.avgPrice || poi.price,
        tags: poi.tags || [],
        reason: poi.petFriendly ? `${poi.petFriendlyTip || '宠物友好'}，${poi.reason || ''}` : '',
        source: 'local'
      }))
    } catch (error) {
      logger.error(`本地POI检索失败: ${error.message}`)
      return []
    }
  }

  /**
   * 检索高德地图API
   */
  async _searchAmap(extracted) {
    try {
      const amap = _getAmapClient()

      // 构建搜索关键词
      let keywords = ''
      if (extracted.category) {
        keywords += extracted.category
      }
      keywords += ' 宠物友好'

      // 构建搜索参数
      const params = {
        keywords,
        city: extracted.city || '',
        offset: extracted.count,
        extensions: 'all'
      }

      const response = await amap.textSearch(params)
      return (response.pois || []).map(poi => ({
        id: poi.id,
        name: poi.name,
        address: poi.address || `${poi.cityname}${poi.adname}`,
        category: poi.type || '',
        image: poi.photos?.[0]?.url || '',
        rating: poi.rating ? String(poi.rating) : '',
        avgPrice: poi.cost || '',
        tags: [],
        reason: poi.petFriendly ? '高德标注为宠物友好' : '',
        source: 'amap'
      }))
    } catch (error) {
      logger.error(`高德地图检索失败: ${error.message}`)
      return []
    }
  }

  /**
   * 合并去重结果
   */
  _mergeResults(localResults, amapResults, maxCount) {
    // 简单合并：优先本地数据，补充高德数据
    const merged = [...localResults]
    const localNames = new Set(localResults.map(r => r.name))

    for (const amap of amapResults) {
      if (!localNames.has(amap.name)) {
        merged.push(amap)
      }
    }

    // 限制数量
    return merged.slice(0, maxCount)
  }

  /**
   * 分组结果（按区域或品类）
   */
  _groupResults(results, extracted) {
    if (results.length === 0) {
      return [{ groupName: '暂无推荐', pois: [] }]
    }

    // 尝试按区域分组
    const groupsMap = new Map()

    for (const poi of results) {
      // 从地址中提取区域
      let region = '其他'
      if (poi.address) {
        const regionMatch = poi.address.match(/([\u4e00-\u9fa5]{2,3})区|([\u4e00-\u9fa5]{2,3})县|([\u4e00-\u9fa5]{2,3})市/)
        if (regionMatch) {
          region = regionMatch[0]
        }
      }

      if (!groupsMap.has(region)) {
        groupsMap.set(region, [])
      }
      groupsMap.get(region).push(poi)
    }

    // 如果只有一个组或组太少，改为按品类分
    if (groupsMap.size <= 1 && results.length > 3) {
      groupsMap.clear()
      for (const poi of results) {
        const cat = poi.category || extracted.category || '推荐'
        if (!groupsMap.has(cat)) {
          groupsMap.set(cat, [])
        }
        groupsMap.get(cat).push(poi)
      }
    }

    // 转换为数组格式
    const groups = []
    for (const [groupName, pois] of groupsMap.entries()) {
      groups.push({
        groupName,
        pois: pois.slice(0, 8) // 每组最多8个
      })
    }

    return groups
  }
}

// 导出单例
module.exports = new PoiSearcherAgent()
