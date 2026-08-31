/**
 * 云函数：宠物旅行攻略Agent
 * 
 * 入口函数，接收小程序端调用，返回Agent处理结果
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 导入Agent
const agent = require('../../agent/core/index')

/**
 * 云函数主入口
 * @param {Object} event - 小程序传入参数
 * @param {string} event.action - 操作类型: chat | reset | status
 * @param {string} event.message - 用户消息
 * @param {Array} event.images - 图片列表（临时路径）
 * @param {string} event.userId - 用户ID
 * @param {string} event.sessionId - 会话ID
 */
exports.main = async (event, context) => {
  const { action = 'chat', ...params } = event

  console.log('[petAgent] 收到请求:', action, JSON.stringify(params).substring(0, 200))

  try {
    switch (action) {
      case 'chat':
        return await handleChat(params)
      
      case 'reset':
        return handleReset(params)
      
      case 'status':
        return handleStatus()
      
      default:
        return { success: false, message: `未知操作: ${action}` }
    }

  } catch (error) {
    console.error('[petAgent] 错误:', error)
    return {
      success: false,
      error: error.message,
      message: '服务暂时不可用，请稍后重试'
    }
  }
}

/**
 * 处理聊天请求
 */
async function handleChat(params) {
  const { message, images = [], userId, sessionId } = params

  // 处理图片：如果是临时文件路径，需要转换为可用URL
  let processedImages = []
  if (images && images.length > 0) {
    processedImages = await Promise.all(
      images.map(async (img) => {
        // 如果是临时文件路径，上传到云存储获取永久URL
        if (img.startsWith('http://tmp/') || img.startsWith('wxfile://')) {
          try {
            const uploadResult = await cloud.uploadFile({
              cloudPath: `agent/images/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`,
              filePath: img
            })
            return uploadResult.fileID
          } catch (e) {
            console.warn('[petAgent] 图片上传失败，使用原路径:', e.message)
            return img
          }
        }
        return img
      })
    )
  }

  // 调用Agent
  const result = await agent.run({
    message: message || '',
    images: processedImages,
    userId: userId || 'anonymous',
    sessionId: sessionId || userId || 'default'
  })

  return result
}

/**
 * 重置会话
 */
async function handleReset(params) {
  const { sessionId, userId } = params
  const sid = sessionId || userId || 'default'
  
  return agent.resetSession(sid)
}

/**
 * 获取状态
 */
async function handleStatus() {
  return {
    success: true,
    data: agent.getStatus()
  }
}
