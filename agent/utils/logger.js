/**
 * 日志工具
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
}

let currentLevel = LOG_LEVELS.DEBUG

function setLevel(level) {
  currentLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO
}

function formatTime() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19)
}

function log(level, module, message, data) {
  if (level < currentLevel) return
  
  const prefix = `[${formatTime()}] [${level}] [${module}]`
  
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data)
  } else {
    console.log(`${prefix} ${message}`)
  }
}

const logger = {
  debug: (module, msg, data) => log(LOG_LEVELS.DEBUG, module, msg, data),
  info: (module, msg, data) => log(LOG_LEVELS.INFO, module, msg, data),
  warn: (module, msg, data) => log(LOG_LEVELS.WARN, module, msg, data),
  error: (module, msg, data) => log(LOG_LEVELS.ERROR, module, msg, data),
  
  // 计时器
  time: (label) => {
    const start = Date.now()
    return {
      end: () => {
        const duration = Date.now() - start
        logger.info('Timer', `${label}: ${duration}ms`)
        return duration
      }
    }
  }
}

module.exports = { logger, setLevel, LOG_LEVELS }

// 兼容：同时把 logger 的方法挂到 module.exports 上
// 这样 `const logger = require('./logger')` 和 `const { logger } = require('./logger')` 都能用
Object.assign(module.exports, logger)
