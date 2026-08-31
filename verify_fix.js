/**
 * 验证 extractItineraryParams 修复效果
 * 运行: node verify_fix.js
 */

// 模拟修复后的正则表达式
function testExtractItineraryParams(message) {
  // 提取目的地 - 支持多种中文表达方式
  const destinationPatterns = [
    /去(\S+?)(?:玩|旅游|旅行|游玩|逛)/,           // 去北京玩
    /(\S+?)(?:之旅|攻略|行程|一日游|二日游|多日游)/, // 北京之旅/北京攻略
    /到(\S+?)(?:[，,、])/,                          // 到北京，
    /(?:规划|制定|安排|设计|做|生成)\S{0,4}?(北京|上海|广州|深圳|杭州|成都|重庆|西安|南京|苏州|武汉|长沙|青岛|厦门|三亚|大连|天津|昆明|贵阳|郑州|合肥|福州|南昌|济南|珠海|无锡|宁波|温州|桂林|丽江|大理|张家界|黄山|拉萨|乌鲁木齐|呼和浩特|兰州|西宁|银川|海口|三亚|香港|澳门|台北)(?:\S{0,3}?[天日]游)?/, // 规划一个北京3日游（常见城市直接匹配）
    /(\S{2,4})(?:\d+[天日]游|[天日]游)/             // 北京3日游（通用城市名+N日游）
  ]
  let destination = null
  for (const p of destinationPatterns) {
    const match = message.match(p)
    if (match && match[1]) { destination = match[1].replace(/[的给帮我一个]/g, ''); break }
  }

  // 提取天数 - 支持"天"和"日"两种表达
  const daysMatch = message.match(/(\d+)\s*[天日]/)
  const days = daysMatch ? parseInt(daysMatch[1]) : null

  const missing = []
  if (!destination) missing.push('destination')
  if (!days) missing.push('days')

  return {
    destination,
    days,
    complete: missing.length === 0,
    missingFields: missing
  }
}

// 测试用例
const testCases = [
  { input: '给我规划一个北京3日游', expectDest: '北京', expectDays: 3 },
  { input: '规划上海2天行程', expectDest: '上海', expectDays: 2 },
  { input: '想去杭州玩4天', expectDest: '杭州', expectDays: 4 },
  { input: '到成都，帮我做个攻略', expectDest: '成都', expectDays: null },
  { input: '生成西安一日游方案', expectDest: '西安', expectDays: 1 },
  { input: '三亚5日游怎么安排', expectDest: '三亚', expectDays: 5 },
  { input: '我想去旅游', expectDest: null, expectDays: null },  // 应该追问
  { input: '帮我制定厦门之旅', expectDest: '厦门', expectDays: null },
]

console.log('='.repeat(60))
console.log('extractItineraryParams 修复验证')
console.log('='.repeat(60))
console.log('')

let passCount = 0
let failCount = 0

for (const tc of testCases) {
  const result = testExtractItineraryParams(tc.input)
  
  const destOk = result.destination === tc.expectDest
  const daysOk = result.days === tc.expectDays
  
  if (destOk && daysOk) {
    console.log(`✅ "${tc.input}"`)
    console.log(`   目的地: ${result.destination}, 天数: ${result.days}, 完整: ${result.complete}`)
    passCount++
  } else {
    console.log(`❌ "${tc.input}"`)
    console.log(`   期望: dest=${tc.expectDest}, days=${tc.expectDays}`)
    console.log(`   实际: dest=${result.destination}, days=${result.days}`)
    failCount++
  }
  console.log('')
}

console.log('='.repeat(60))
console.log(`结果: ${passCount} 通过, ${failCount} 失败`)
console.log('='.repeat(60))
