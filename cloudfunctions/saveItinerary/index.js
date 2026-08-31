// 云函数：保存/更新攻略
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const { itinerary_id, itineraryData, action = 'create' } = event
  
  try {
    const collection = db.collection('itineraries')
    
    if (action === 'update' && itinerary_id) {
      // 更新现有攻略
      const result = await collection.doc(itinerary_id).update({
        data: {
          ...itineraryData,
          updated_at: new Date()
        }
      })
      
      return {
        success: true,
        data: { updated: result.stats.updated },
        message: '更新成功'
      }
    } else if (action === 'delete' && itinerary_id) {
      // 删除攻略
      const result = await collection.doc(itinerary_id).remove()
      
      return {
        success: true,
        data: { deleted: result.stats.removed },
        message: '删除成功'
      }
    } else {
      // 创建新攻略
      const result = await collection.add({
        data: {
          ...itineraryData,
          created_at: new Date(),
          updated_at: new Date()
        }
      })
      
      return {
        success: true,
        data: { 
          _id: result._id,
          message: '创建成功'
        }
      }
    }
    
  } catch (err) {
    console.error('操作失败:', err)
    
    // 处理特定错误
    if (err.errCode === -1) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: '攻略不存在'
      }
    }
    
    return {
      success: false,
      error: err.message,
      message: '操作失败'
    }
  }
}
