/**
 * 工具函数库
 */

/**
 * 格式化日期
 * @param {Date|string} date 日期对象或字符串
 * @param {string} format 格式类型：'full', 'date', 'time', 'relative'
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date, format = 'date') {
  if (!date) return ''
  
  const d = new Date(date)
  const now = new Date()
  
  if (format === 'relative') {
    // 相对时间格式
    const diff = now - d
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 7) return `${days}天前`
    if (days < 30) return `${Math.floor(days / 7)}周前`
    if (days < 365) return `${Math.floor(days / 30)}个月前`
    return `${Math.floor(days / 365)}年前`
  }
  
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours24 = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  
  switch (format) {
    case 'full':
      return `${year}-${month}-${day} ${hours24}:${minutes}`
    case 'time':
      return `${hours24}:${minutes}`
    case 'date':
    default:
      return `${year}-${month}-${day}`
  }
}

/**
 * 计算两点之间的距离（米）
 * @param {number} lat1 起点纬度
 * @param {number} lng1 起点经度
 * @param {number} lat2 终点纬度
 * @param {number} lng2 终点经度
 * @returns {number} 距离（米）
 */
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

/**
 * 格式化距离显示
 * @param {number} meters 距离（米）
 * @returns {string} 格式化后的距离字符串
 */
function formatDistance(meters) {
  if (!meters || meters < 0) return '未知'
  if (meters < 1000) {
    return Math.round(meters) + 'm'
  } else {
    return (meters / 1000).toFixed(1) + 'km'
  }
}

/**
 * 防抖函数
 * @param {Function} func 要防抖的函数
 * @param {number} delay 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, delay = 300) {
  let timer = null
  return function(...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      func.apply(this, args)
    }, delay)
  }
}

/**
 * 节流函数
 * @param {Function} func 要节流的函数
 * @param {number} interval 时间间隔（毫秒）
 * @returns {Function} 节流后的函数
 */
function throttle(func, interval = 300) {
  let lastTime = 0
  return function(...args) {
    const now = Date.now()
    if (now - lastTime >= interval) {
      lastTime = now
      func.apply(this, args)
    }
  }
}

/**
 * 生成唯一ID
 * @param {string} prefix 前缀
 * @returns {string} 唯一ID
 */
function generateId(prefix = '') {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substr(2, 9)
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`
}

/**
 * 深拷贝对象
 * @param {*} obj 要拷贝的对象
 * @returns {*} 拷贝后的对象
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime())
  if (obj instanceof Array) return obj.map(item => deepClone(item))
  if (obj instanceof Object) {
    const clonedObj = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key])
      }
    }
    return clonedObj
  }
}

/**
 * 显示加载提示
 * @param {string} title 提示文字
 * @param {boolean} mask 是否显示透明蒙层
 */
function showLoading(title = '加载中...', mask = true) {
  wx.showLoading({ title, mask })
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  wx.hideLoading()
}

/**
 * 显示消息提示
 * @param {string} title 提示文字
 * @param {string} icon 图标类型：'success', 'error', 'loading', 'none'
 * @param {number} duration 显示时长
 */
function showToast(title, icon = 'none', duration = 2000) {
  wx.showToast({ title, icon, duration })
}

/**
 * 显示确认对话框
 * @param {string} content 内容
 * @param {Object} options 配置选项
 * @returns {Promise}
 */
function showModal(content, options = {}) {
  return new Promise((resolve) => {
    wx.showModal({
      title: options.title || '提示',
      content,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      confirmColor: options.confirmColor || '#4A90D9',
      success: (res) => {
        resolve(res.confirm)
      },
      fail: () => resolve(false)
    })
  })
}

/**
 * 调用云函数
 * @param {string} name 云函数名称
 * @param {Object} data 参数
 * @returns {Promise}
 */
function callCloudFunction(name, data = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        const result = res.result
        if (result.success) {
          resolve(result.data || result)
        } else {
          reject(new Error(result.message || '操作失败'))
        }
      },
      fail: (err) => {
        console.error(`云函数${name}调用失败:`, err)
        reject(err)
      }
    })
  })
}

/**
 * 存储数据到本地
 * @param {string} key 键名
 * @param {*} value 值
 */
function setStorage(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.error('存储失败:', e)
    return false
  }
}

/**
 * 从本地读取数据
 * @param {string} key 键名
 * @param {*} defaultValue 默认值
 * @returns {*}
 */
function getStorage(key, defaultValue = null) {
  try {
    const value = wx.getStorageSync(key)
    return value !== '' ? value : defaultValue
  } catch (e) {
    console.error('读取失败:', e)
    return defaultValue
  }
}

/**
 * 从本地删除数据
 * @param {string} key 键名
 */
function removeStorage(key) {
  try {
    wx.removeStorageSync(key)
    return true
  } catch (e) {
    console.error('删除失败:', e)
    return false
  }
}

// 导出模块
module.exports = {
  formatDate,
  calculateDistance,
  formatDistance,
  debounce,
  throttle,
  generateId,
  deepClone,
  showLoading,
  hideLoading,
  showToast,
  showModal,
  callCloudFunction,
  setStorage,
  getStorage,
  removeStorage
}
