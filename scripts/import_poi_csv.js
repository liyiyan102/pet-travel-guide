/**
 * CSV 导入脚本：把 全国宠物友好POI库_带经纬度.csv 导入本地 JSON 数据库
 * 
 * 字段映射：
 *   name → name
 *   category → category
 *   city → city
 *   district → district（新增字段）
 *   address → address
 *   tel → phone
 *   pet_policy → pet_policy
 *   fee → fee（新增字段）
 *   notes → notes（新增字段）
 *   source → source（新增字段）
 *   last_updated → last_updated（新增字段）
 *   confidence → confidence
 *   friendliness_level → friendliness_level（1-4级）
 *   longitude → lng
 *   latitude → lat
 * 
 * friendliness_level 说明：
 *   1 级 — 官方允许：场所有明确的宠物友好政策
 *   2 级 — 默许/体验良好：官方无明确声明，但用户成功携带经验
 *   3 级 — 查得不严：官方禁止但实际执行较松
 *   4 级 — 严禁：官方禁止且执行严格
 */

const fs = require('fs')
const path = require('path')

const CSV_PATH = path.join(__dirname, '..', '全国宠物友好POI库_带经纬度.csv')
const DB_PATH = path.join(__dirname, '..', 'data', 'pet_poi_database.json')
const OUTPUT_CSV_REPORT = path.join(__dirname, '..', 'data', 'import_report.txt')

// 类别映射（CSV 中的 category → 系统内部 category）
const CATEGORY_MAP = {
  'hotel': 'hotel',
  'restaurant': 'restaurant',
  'park': 'park',
  'scenic': 'scenic_spot',
  '景点': 'scenic_spot',
  'hospital': 'hospital',
  'grooming': 'grooming',
  'cafe': 'cafe',
  'pet_service': 'pet_service',
  'mall': 'mall',
  'mall_shop': 'mall'
}

// 城市代码
const CITY_CODES = {
  '北京': 'BJ', '上海': 'SH', '广州': 'GZ', '深圳': 'SZ',
  '杭州': 'HZ', '成都': 'CD', '重庆': 'CQ', '西安': 'XA',
  '南京': 'NJ', '苏州': 'SZ2', '武汉': 'WH', '长沙': 'CS',
  '青岛': 'QD', '厦门': 'XM', '三亚': 'SY', '大连': 'DL',
  '天津': 'TJ', '昆明': 'KM', '贵阳': 'GY', '郑州': 'ZZ',
  '合肥': 'HF', '福州': 'FZ', '南昌': 'NC', '济南': 'JN',
  '珠海': 'ZH', '无锡': 'WX', '宁波': 'NB', '温州': 'WZ',
  '桂林': 'GL', '丽江': 'LJ', '大理': 'DL2', '张家界': 'ZJJ',
  '黄山': 'HS', '拉萨': 'LS', '乌鲁木齐': 'WLMQ',
  '呼和浩特': 'HHHT', '兰州': 'LZ', '西宁': 'XN',
  '银川': 'YC', '海口': 'HK'
}

/**
 * 解析 CSV 行（处理引号包裹的字段中的逗号）
 */
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

/**
 * 解析 CSV 文件
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  // 处理 BOM
  const cleanContent = content.replace(/^\uFEFF/, '')
  const lines = cleanContent.split('\n').filter(l => l.trim())
  
  if (lines.length < 2) {
    throw new Error('CSV 文件为空或只有表头')
  }
  
  const headers = parseCSVLine(lines[0])
  console.log('CSV 表头:', headers.join(' | '))
  
  const records = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const record = {}
    headers.forEach((h, idx) => {
      record[h] = values[idx] || ''
    })
    records.push(record)
  }
  
  return { headers, records }
}

/**
 * 转换 CSV 记录为 POI 对象
 */
function convertToPOI(record, index) {
  const city = record.city || '未知'
  const category = CATEGORY_MAP[record.category] || record.category || 'other'
  const cityCode = CITY_CODES[city] || 'OT'
  const categoryId = category.substring(0, 2).toUpperCase()
  
  // 生成唯一 ID
  const id = `${cityCode}${categoryId}${String(index + 1).padStart(4, '0')}`
  
  // 解析经纬度
  const lng = parseFloat(record.longitude) || 0
  const lat = parseFloat(record.latitude) || 0
  
  // 解析友好等级
  const friendlinessLevel = parseInt(record.friendliness_level) || 2
  
  // 解析置信度
  const confidence = record.confidence || '中'
  
  return {
    id,
    name: record.name || '',
    category,
    city,
    district: record.district || '',
    address: record.address || '',
    lat,
    lng,
    phone: record.tel || '',
    pet_friendly: true,  // CSV 库中都是友好场所
    pet_policy: record.pet_policy || '',
    friendliness_level: friendlinessLevel,  // 1-4级
    fee: record.fee || '',
    notes: record.notes || '',
    source: record.source || '',
    last_updated: record.last_updated || '',
    confidence,
    tags: generateTags(record),
    features: generateFeatures(record),
    rating: 0,
    price_level: guessPriceLevel(record),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    verified: friendlinessLevel === 1  // 1级标记为已验证
  }
}

/**
 * 根据记录生成标签
 */
function generateTags(record) {
  const tags = []
  if (record.pet_policy) {
    if (record.pet_policy.includes('免费')) tags.push('免费带宠')
    if (record.pet_policy.includes('收费')) tags.push('收费带宠')
    if (record.pet_policy.includes('猫')) tags.push('猫咪友好')
    if (record.pet_policy.includes('狗')) tags.push('狗狗友好')
    if (record.pet_policy.includes('房型')) tags.push('宠物房型')
  }
  if (record.category === 'park') tags.push('可遛狗')
  if (record.category === 'restaurant') tags.push('可携宠就餐')
  if (record.category === 'hotel') tags.push('可携宠入住')
  return tags
}

/**
 * 根据记录生成特色
 */
function generateFeatures(record) {
  const features = []
  if (record.pet_policy) {
    if (record.pet_policy.includes('免费')) features.push('免费携带宠物')
    if (record.pet_policy.includes('房型')) features.push('专属宠物房型')
  }
  if (record.fee && record.fee !== '未知' && record.fee !== '') {
    features.push(`费用：${record.fee}`)
  }
  if (record.notes) features.push(record.notes)
  return features
}

/**
 * 猜测价格等级
 */
function guessPriceLevel(record) {
  if (record.fee) {
    if (record.fee.includes('免费')) return 0
    if (record.fee.includes('收费') || record.fee.includes('押金')) return 2
  }
  if (record.category === 'hotel') return 3
  if (record.category === 'restaurant') return 2
  return 1
}

// ═══════════════════════════════════════════════════
// 主流程
// ═══════════════════════════════════════════════════

console.log('═══════════════════════════════════════')
console.log('  POI CSV 导入工具')
console.log('═══════════════════════════════════════\n')

// 1. 解析 CSV
console.log('[1/4] 解析 CSV 文件...')
const { headers, records } = parseCSV(CSV_PATH)
console.log(`  ✓ 共 ${records.length} 条记录`)
console.log(`  ✓ 字段: ${headers.join(', ')}\n`)

// 2. 转换为 POI 对象
console.log('[2/4] 转换数据格式...')
const pois = records.map((r, i) => convertToPOI(r, i))

// 统计
const stats = {
  total: pois.length,
  byCity: {},
  byCategory: {},
  byFriendliness: { 1: 0, 2: 0, 3: 0, 4: 0 },
  withCoordinates: 0,
  verified: 0
}

pois.forEach(poi => {
  stats.byCity[poi.city] = (stats.byCity[poi.city] || 0) + 1
  stats.byCategory[poi.category] = (stats.byCategory[poi.category] || 0) + 1
  if (stats.byFriendliness[poi.friendliness_level] !== undefined) {
    stats.byFriendliness[poi.friendliness_level]++
  }
  if (poi.lat && poi.lng) stats.withCoordinates++
  if (poi.verified) stats.verified++
})

console.log(`  ✓ 转换完成`)
console.log(`  ✓ 城市分布:`)
Object.entries(stats.byCity).sort((a, b) => b[1] - a[1]).forEach(([city, count]) => {
  console.log(`    ${city}: ${count} 条`)
})
console.log(`  ✓ 类别分布:`)
Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
  console.log(`    ${cat}: ${count} 条`)
})
console.log(`  ✓ 友好等级分布:`)
console.log(`    1级(官方允许): ${stats.byFriendliness[1]} 条`)
console.log(`    2级(默许/体验良好): ${stats.byFriendliness[2]} 条`)
console.log(`    3级(查得不严): ${stats.byFriendliness[3]} 条`)
console.log(`    4级(严禁): ${stats.byFriendliness[4]} 条`)
console.log(`  ✓ 有经纬度: ${stats.withCoordinates} 条`)
console.log(`  ✓ 已验证(1级): ${stats.verified} 条\n`)

// 3. 构建数据库结构
console.log('[3/4] 构建数据库...')
const database = {
  version: '2.0',
  description: '全国宠物友好POI数据库（含经纬度和友好等级）',
  lastUpdated: new Date().toISOString(),
  source: '全国宠物友好POI库_带经纬度.csv',
  stats: {
    total: pois.length,
    cities: Object.keys(stats.byCity).length,
    categories: Object.keys(stats.byCategory).length,
    friendlinessDistribution: stats.byFriendliness,
    withCoordinates: stats.withCoordinates
  },
  categories: {
    hotel: '酒店/民宿',
    restaurant: '餐厅',
    park: '公园',
    scenic_spot: '景点',
    hospital: '宠物医院',
    grooming: '宠物美容',
    cafe: '咖啡馆',
    pet_service: '宠物服务',
    mall: '商场'
  },
  cities: Object.keys(stats.byCity).sort(),
  pois
}

console.log(`  ✓ 数据库结构构建完成\n`)

// 4. 写入文件
console.log('[4/4] 写入数据库文件...')
const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}
fs.writeFileSync(DB_PATH, JSON.stringify(database, null, 2), 'utf-8')
console.log(`  ✓ 已写入: ${DB_PATH}`)
console.log(`  ✓ 文件大小: ${(fs.statSync(DB_PATH).size / 1024).toFixed(1)} KB\n`)

// 5. 生成导入报告
const report = `
═══════════════════════════════════════════════════════
  POI 数据库导入报告
  ${new Date().toLocaleString('zh-CN')}
═══════════════════════════════════════════════════════

数据源: 全国宠物友好POI库_带经纬度.csv
输出: data/pet_poi_database.json

统计:
  总记录数: ${stats.total}
  覆盖城市: ${Object.keys(stats.byCity).length} 个
  类别数: ${Object.keys(stats.byCategory).length} 种
  有经纬度: ${stats.withCoordinates} 条
  已验证(1级): ${stats.verified} 条

城市分布:
${Object.entries(stats.byCity).sort((a, b) => b[1] - a[1]).map(([c, n]) => `  ${c}: ${n} 条`).join('\n')}

类别分布:
${Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).map(([c, n]) => `  ${c}: ${n} 条`).join('\n')}

友好等级分布:
  1级(官方允许): ${stats.byFriendliness[1]} 条 (${(stats.byFriendliness[1]/stats.total*100).toFixed(0)}%)
  2级(默许/体验良好): ${stats.byFriendliness[2]} 条 (${(stats.byFriendliness[2]/stats.total*100).toFixed(0)}%)
  3级(查得不严): ${stats.byFriendliness[3]} 条
  4级(严禁): ${stats.byFriendliness[4]} 条

═══════════════════════════════════════════════════════
`
fs.writeFileSync(OUTPUT_CSV_REPORT, report, 'utf-8')
console.log(`✓ 导入报告已生成: ${OUTPUT_CSV_REPORT}`)
console.log('\n✅ 导入完成！')
