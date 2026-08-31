// 云函数：获取POI列表
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { 
    latitude, 
    longitude, 
    category, 
    petFriendlyOnly, 
    keyword, 
    page = 1, 
    pageSize = 20 
  } = event
  
  try {
    // 构建查询条件
    let query = {}
    
    // 分类筛选
    if (category && category !== 'all') {
      query.category = category
    }
    
    // 宠物友好筛选
    if (petFriendlyOnly) {
      query.pet_policy = _.exists(true).and(_.neq(''))
    }
    
    // 关键词搜索
    if (keyword) {
      query.name = db.RegExp({
        regexp: keyword,
        options: 'i'
      })
    }
    
    // 查询数据库
    const collection = db.collection('pois')
    const countResult = await collection.where(query).count()
    const total = countResult.total
    
    // 分页查询
    const skip = (page - 1) * pageSize
    const result = await collection
      .where(query)
      .orderBy('verified', 'desc')
      .orderBy('last_updated', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get()
    
    // 如果有位置信息，计算距离并排序
    let poiList = result.data
    if (latitude && longitude) {
      poiList = poiList.map(poi => {
        const distance = calculateDistance(
          latitude, longitude,
          poi.lat, poi.lng
        )
        return {
          ...poi,
          distance: formatDistance(distance)
        }
      })
      
      // 按距离排序
      poiList.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
    }
    
    return {
      success: true,
      data: {
        list: poiList,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize)
      },
      message: '获取成功'
    }
    
  } catch (err) {
    console.error('获取POI列表失败:', err)
    return {
      success: false,
      error: err.message,
      message: '获取失败'
    }
  }
}

// 计算两点之间的距离（米）
function calculateDistance(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180
  const R = 6371000 // 地球半径（米）
  
  const dLat = (lat2 - lat1) * rad
  const dLng = (lng2 - lng1) * rad
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLng/2) * Math.sin(dLng/2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  
  return R * c
}

// 格式化距离显示
function formatDistance(meters) {
  if (meters < 1000) {
    return Math.round(meters) + 'm'
  } else {
    return (meters / 1000).toFixed(1) + 'km'
  }
}
