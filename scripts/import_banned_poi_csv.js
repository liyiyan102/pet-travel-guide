/**
 * CSV 导入脚本：把 全国宠物禁入POI库.csv 导入本地 JSON 数据库
 * 
 * 字段：name, category, city, district, address, ban_reason, source, last_updated
 * friendliness_level = 4（严禁）
 */

const fs = require('fs')
const path = require('path')

const CSV_PATH = path.join(__dirname, '..', '全国宠物禁入POI库.csv')
const DB_PATH = path.join(__dirname, '..', 'data', 'pet_banned_database.json')

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') { inQuotes = !inQuotes }
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = '' }
    else { current += char }
  }
  result.push(current.trim())
  return result
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')
  const lines = content.split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('CSV 文件为空')
  const headers = parseCSVLine(lines[0])
  const records = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const record = {}
    headers.forEach((h, idx) => { record[h] = values[idx] || '' })
    records.push(record)
  }
  return { headers, records }
}

function convertToBannedPOI(record, index) {
  const city = record.city || '未知'
  const category = record.category || 'other'
  const id = `BAN${String(index + 1).padStart(4, '0')}`
  return {
    id,
    name: record.name || '',
    category,
    city,
    district: record.district || '',
    address: record.address || '',
    pet_friendly: false,
    friendliness_level: 4,  // 严禁
    ban_reason: record.ban_reason || '',
    source: record.source || '',
    last_updated: record.last_updated || '',
    verified: true
  }
}

// 主流程
console.log('═══════════════════════════════════════')
console.log('  禁入POI CSV 导入工具')
console.log('═══════════════════════════════════════\n')

console.log('[1/3] 解析 CSV...')
const { headers, records } = parseCSV(CSV_PATH)
console.log(`  ✓ 共 ${records.length} 条记录\n`)

console.log('[2/3] 转换数据...')
const bannedPois = records.map((r, i) => convertToBannedPOI(r, i))
const stats = { total: bannedPois.length, byCity: {}, byCategory: {} }
bannedPois.forEach(p => {
  stats.byCity[p.city] = (stats.byCity[p.city] || 0) + 1
  stats.byCategory[p.category] = (stats.byCategory[p.category] || 0) + 1
})
console.log(`  ✓ 城市: ${Object.keys(stats.byCity).length} 个`)
console.log(`  ✓ 类别: ${Object.keys(stats.byCategory).length} 种`)
console.log('  城市分布:')
Object.entries(stats.byCity).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
  console.log(`    ${c}: ${n} 条`)
})
console.log('  类别分布:')
Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => {
  console.log(`    ${c}: ${n} 条`)
})

console.log('\n[3/3] 写入数据库...')
const database = {
  version: '1.0',
  description: '全国宠物禁入POI数据库',
  lastUpdated: new Date().toISOString(),
  source: '全国宠物禁入POI库.csv',
  stats: { total: bannedPois.length, cities: Object.keys(stats.byCity).length },
  cities: Object.keys(stats.byCity).sort(),
  pois: bannedPois
}
const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(DB_PATH, JSON.stringify(database, null, 2), 'utf-8')
console.log(`  ✓ 已写入: ${DB_PATH}`)
console.log(`  ✓ 文件大小: ${(fs.statSync(DB_PATH).size / 1024).toFixed(1)} KB`)
console.log('\n✅ 导入完成！')
