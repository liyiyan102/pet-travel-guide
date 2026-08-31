/**
 * API测试脚本
 * 用于验证Pet Travel Agent服务是否正常运行
 * 
 * 使用方法:
 *   npm test
 *   或直接运行: node test.js
 */

const http = require('http')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
}

function log(name, status, detail = '') {
  const icon = status === 'PASS' ? '✓' : '✗'
  const color = status === 'PASS' ? colors.green : colors.red
  console.log(`  ${color}${icon} ${name.padEnd(30)} ${status} ${colors.reset}${detail}`)
}

async function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout: 30000
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: JSON.parse(data || '{}')
        })
      })
    })
    
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
    
    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    
    req.end()
  })
}

async function runTests() {
  console.log('\n🐾 Pet Travel Agent API 测试')
  console.log('═'.repeat(50))
  console.log(`目标地址: ${BASE_URL}\n`)
  
  let passed = 0
  let failed = 0
  
  // 测试1: 健康检查
  try {
    const res = await request('/health')
    if (res.status === 200 && res.body.status === 'ok') {
      log('健康检查', 'PASS')
      passed++
    } else {
      log('健康检查', 'FAIL', `状态码: ${res.status}`)
      failed++
    }
  } catch (e) {
    log('健康检查', 'FAIL', e.message)
    failed++
  }
  
  // 测试2: 服务状态
  try {
    const res = await request('/api/status')
    if (res.status === 200 && res.body.success) {
      log('服务状态接口', 'PASS')
      passed++
    } else {
      log('服务状态接口', 'FAIL')
      failed++
    }
  } catch (e) {
    log('服务状态接口', 'FAIL', e.message)
    failed++
  }
  
  // 测试3: 文本对话
  try {
    const res = await request('/api/chat', {
      method: 'POST',
      body: {
        message: '你好',
        userId: 'test_user'
      }
    })
    if (res.status === 200 && res.body.success && res.body.data?.reply) {
      log('文本对话接口', 'PASS', `回复长度: ${res.body.data.reply.length}`)
      passed++
    } else {
      log('文本对话接口', 'FAIL', JSON.stringify(res.body).substring(0, 100))
      failed++
    }
  } catch (e) {
    log('文本对话接口', 'FAIL', e.message)
    failed++
  }
  
  // 测试4: 行程生成
  try {
    const res = await request('/api/chat', {
      method: 'POST',
      body: {
        message: '帮我规划杭州2天带狗旅行',
        userId: 'test_user'
      }
    })
    if (res.status === 200 && res.body.success) {
      log('行程生成接口', 'PASS', `意图: ${res.body.data?.intent}`)
      passed++
    } else {
      log('行程生成接口', 'FAIL')
      failed++
    }
  } catch (e) {
    log('行程生成接口', 'FAIL', e.message)
    failed++
  }
  
  // 测试5: 重置会话
  try {
    const res = await request('/api/reset', {
      method: 'POST',
      body: { sessionId: 'test_session' }
    })
    if (res.status === 200 && res.body.success) {
      log('重置会话接口', 'PASS')
      passed++
    } else {
      log('重置会话接口', 'FAIL')
      failed++
    }
  } catch (e) {
    log('重置会话接口', 'FAIL', e.message)
    failed++
  }
  
  // 测试6: 错误处理（缺少参数）
  try {
    const res = await request('/api/chat', {
      method: 'POST',
      body: {}
    })
    if (res.status === 400) {
      log('错误参数处理', 'PASS', '正确返回400')
      passed++
    } else {
      log('错误参数处理', 'FAIL', `应返回400，实际${res.status}`)
      failed++
    }
  } catch (e) {
    log('错误参数处理', 'FAIL', e.message)
    failed++
  }
  
  // 结果汇总
  console.log('\n' + '─'.repeat(50))
  console.log(`总计: ${passed + failed} 项测试`)
  console.log(`${colors.green}通过: ${passed}${colors.reset}  ${colors.red}失败: ${failed}${colors.reset}`)
  console.log('─'.repeat(50) + '\n')
  
  process.exit(failed > 0 ? 1 : 0)
}

runTests().catch(console.error)
