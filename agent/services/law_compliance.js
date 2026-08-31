/**
 * 宠物出行法律法规合规检查服务
 * 
 * 功能：
 * 1. 加载法律法规知识库
 * 2. 根据用户问题/场景进行合规性检查
 * 3. 返回合规建议和风险提示
 */

const fs = require('fs')
const path = require('path')

class LawComplianceService {
  constructor() {
    this.laws = []
    this.loaded = false
    this.loadLaws()
  }

  /**
   * 加载法律法规知识库
   */
  loadLaws() {
    try {
      const dbPath = path.resolve(__dirname, '../../宠物出行法律法规知识库.json')
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
      
      // 处理JSON格式（可能是数组格式）
      if (Array.isArray(data)) {
        this.laws = data
      } else if (data && Array.isArray(data.laws)) {
        this.laws = data.laws
      } else {
        console.warn('LawCompliance: 无法解析法律数据库格式')
        this.laws = []
      }
      
      this.loaded = true
      console.log(`LawCompliance: 已加载 ${this.laws.length} 条法律法规`)
    } catch (error) {
      console.error('LawCompliance: 加载法律数据库失败', error.message)
      this.laws = []
    }
  }

  /**
   * 检查用户问题的合规性
   * @param {string} question - 用户问题
   * @param {object} context - 上下文信息（城市、宠物类型等）
   * @returns {object} 合规检查结果
   */
  checkCompliance(question, context = {}) {
    const result = {
      compliant: true,           // 是否基本合规
      riskLevel: 'low',          // 风险等级: low/medium/high
      warnings: [],              // 警告列表
      suggestions: [],           // 建议列表
      relevantLaws: [],          // 相关法条
      citySpecificRules: null,   // 城市特定规则
      petTypeAdvice: null        // 宠物类型建议
    }

    const q = question.toLowerCase()
    const city = context.city || ''
    const petType = context.petType || ''

    // ========== 1. 城市特定规则检查 ==========
    if (city) {
      const cityRules = this.getCityRules(city)
      if (cityRules) {
        result.citySpecificRules = cityRules
        result.relevantLaws.push(...cityRules.lawIds)
      }
    }

    // ========== 2. 宠物类型风险检查 ==========
    if (petType) {
      const petAdvice = this.getPetTypeAdvice(petType)
      result.petTypeAdvice = petAdvice
      
      if (petAdvice.riskLevel === 'high') {
        result.riskLevel = 'high'
        result.compliant = false
        result.warnings.push(petAdvice.warning)
      } else if (petAdvice.riskLevel === 'medium' && result.riskLevel === 'low') {
        result.riskLevel = 'medium'
        result.warnings.push(petAdvice.warning)
      }
    }

    // ========== 3. 场景合规性检查 ==========
    
    // 3.1 公共交通相关
    if (q.includes('地铁') || q.includes('公交') || q.includes('火车') || q.includes('高铁')) {
      const transitCheck = this.checkTransitCompliance(q, petType)
      result.warnings.push(...transitCheck.warnings)
      result.suggestions.push(...transitCheck.suggestions)
      if (!transitCheck.compliant) result.compliant = false
    }

    // 3.2 航空出行相关
    if (q.includes('飞机') || q.includes('航空') || q.includes('托运')) {
      const airCheck = this.checkAirCompliance(q, petType)
      result.warnings.push(...airCheck.warnings)
      result.suggestions.push(...airCheck.suggestions)
      if (transitCheck.compliant === false) result.compliant = false
    }

    // 3.3 公园/景区相关
    if (q.includes('公园') || q.includes('景区') || q.includes('景点') || q.includes('景点')) {
      const parkCheck = this.checkParkCompliance(q, city)
      result.warnings.push(...parkCheck.warnings)
      result.suggestions.push(...parkCheck.suggestions)
    }

    // 3.4 餐厅/酒店相关
    if (q.includes('餐厅') || q.includes('饭店') || q.includes('酒店') || q.includes('民宿')) {
      const venueCheck = this.checkVenueCompliance(q)
      result.suggestions.push(...venueCheck.suggestions)
    }

    // 3.5 烈性犬/禁养犬检查
    if (q.includes('烈性犬') || q.includes('藏獒') || q.includes('比特') || 
        q.includes('禁养') || q.includes('杜高') || q.includes('罗威纳')) {
      const dangerousDogCheck = this.checkDangerousDog(q, city)
      result.warnings.push(...dangerousDogCheck.warnings)
      result.suggestions.push(...dangerousDogCheck.suggestions)
      result.compliant = false
      result.riskLevel = 'high'
    }

    // 3.6 牵绳/安全措施检查
    if (q.includes('不牵绳') || q.includes('不牵') || q.includes('放开') || q.includes('散放')) {
      result.warnings.push('⚠️ 法律要求携犬出户必须牵绳，违规可能面临罚款或拘留')
      result.suggestions.push('请使用长度1.5-2米内的牵引绳')
      result.compliant = false
      result.riskLevel = 'medium'
    }

    // ========== 4. 生成最终建议 ==========
    if (result.suggestions.length === 0) {
      result.suggestions.push(
        '出行前请确认目的地宠物政策',
        '携带养犬登记证和疫苗证明',
        '自备牵引绳、拾便袋、宠物水碗'
      )
    }

    // 去重
    result.warnings = [...new Set(result.warnings)]
    result.suggestions = [...new Set(result.suggestions)]
    result.relevantLaws = [...new Set(result.relevantLaws)]

    return result
  }

  /**
   * 获取城市特定养犬规定
   */
  getCityRules(city) {
    const cityLawMap = {
      '北京': { lawIds: ['law_002'], keyPoints: ['重点区限养1只', '禁养41种烈性犬', '体高>35cm禁养', '牵绳≤1.5米'] },
      '上海': { lawIds: ['law_003'], keyPoints: ['内环限体高>35cm', '需植入电子标识', '禁养烈性犬目录'] },
      '深圳': { lawIds: ['law_004'], keyPoints: ['禁养38种烈性犬', '5级体型分类', '公园禁止入内', '牵绳按体型分级'] },
      '广州': { lawIds: ['law_005'], keyPoints: ['禁养35种烈性犬', '体高>71cm禁养', '中华田园犬已解禁'] },
      '南京': { lawIds: ['law_008'], keyPoints: ['禁养30种', '体高>61cm禁养'] },
      '成都': { lawIds: ['law_008'], keyPoints: ['中华田园犬仍在管控'] },
      '西安': { lawIds: ['law_008'], keyPoints: ['中华田园犬仍在管控'] },
      '杭州': { lawIds: ['law_008'], keyPoints: ['中华田园犬仍在管控'] },
    }

    // 模糊匹配城市
    for (const [key, rules] of Object.entries(cityLawMap)) {
      if (city.includes(key)) {
        return { city: key, ...rules }
      }
    }
    return null
  }

  /**
   * 获取宠物类型建议
   */
  getPetTypeAdvice(petType) {
    const type = petType.toLowerCase()
    
    // 烈性犬/危险犬种
    const dangerousDogs = ['藏獒', '比特', '杜高', '罗威纳', '德牧', '土佐', '菲勒', '阿根廷杜高']
    if (dangerousDogs.some(d => type.includes(d))) {
      return {
        riskLevel: 'high',
        warning: '⚠️ 该犬种属于烈性犬，多数城市禁养，禁止进入公共场所',
        suggestion: '请查询当地具体禁养名录，此类犬种通常不得出户遛犬'
      }
    }

    // 短鼻犬种
    const shortNoseDogs = ['法斗', '斗牛', '巴哥', '波士顿梗', '英斗']
    if (shortNoseDogs.some(d => type.includes(d))) {
      return {
        riskLevel: 'medium',
        warning: '⚠️ 短鼻犬种航空托运风险高，夏季易中暑',
        suggestion: '建议自驾出行，避免高温时段和航空托运'
      }
    }

    // 大型犬
    if (type.includes('大型犬') || type.includes('金毛') || type.includes('拉布拉多') || 
        type.includes('阿拉斯加') || type.includes('哈士奇')) {
      return {
        riskLevel: 'medium',
        warning: '⚠️ 大型犬在部分城市重点区域受限（如北京城六区、上海内环）',
        suggestion: '建议选择郊区或自然景区出行，自驾为最佳方式'
      }
    }

    return { riskLevel: 'low', warning: null, suggestion: null }
  }

  /**
   * 检查交通合规性
   */
  checkTransitCompliance(question, petType) {
    const result = { warnings: [], suggestions: [], compliant: true }

    if (question.includes('地铁') || question.includes('公交')) {
      result.warnings.push('🚫 除导盲犬外，宠物通常不允许乘坐地铁和公交车')
      result.suggestions.push('如需公共交通，可考虑出租车（需征得驾驶员同意）')
      result.compliant = false
    }

    if (question.includes('高铁') || question.includes('火车')) {
      result.suggestions.push('✅ 高铁提供宠物托运服务（2026年已覆盖126座车站）')
      result.suggestions.push('限制：体重≤15kg，肩高≤40cm，需提前通过12306预约')
      result.suggestions.push('价格：558-1258元（按里程），购票旅客享7折')
      
      if (petType && (petType.includes('大型犬') || petType.includes('阿拉斯加'))) {
        result.warnings.push('⚠️ 大型犬可能超过高铁托运限制（肩高>40cm）')
        result.compliant = false
      }
    }

    return result
  }

  /**
   * 检查航空合规性
   */
  checkAirCompliance(question, petType) {
    const result = { warnings: [], suggestions: [], compliant: true }

    result.suggestions.push('航空托运需准备：动物健康证明（7天内有效）、疫苗注射证明')
    result.suggestions.push('需提前48小时向航司申请，确认有氧舱')

    // 短鼻犬检查
    const shortNoseDogs = ['法斗', '斗牛', '巴哥', '波士顿梗']
    if (shortNoseDogs.some(d => petType && petType.includes(d))) {
      result.warnings.push('🚫 短鼻犬种多数航司拒运或限制托运（呼吸健康风险）')
      result.suggestions.push('强烈建议选择自驾或其他交通方式')
      result.compliant = false
    }

    // 季节检查
    if (question.includes('夏天') || question.includes('高温') || question.includes('7月') || question.includes('8月')) {
      result.warnings.push('⚠️ 夏季高温期航空托运风险增加，部分航司暂停宠物托运')
      result.suggestions.push('如必须托运，选择早晚航班')
    }

    return result
  }

  /**
   * 检查公园/景区合规性
   */
  checkParkCompliance(question, city) {
    const result = { warnings: [], suggestions: [] }

    result.warnings.push('⚠️ 多数城市公园禁止宠物入内（导盲犬除外）')
    
    // 宠物友好公园示例
    const petFriendlyParks = {
      '北京': ['大兴狼垡城市森林公园'],
      '上海': ['部分郊野公园'],
      '杭州': ['部分景区允许携宠（需提前确认）'],
    }

    if (city && petFriendlyParks[city]) {
      result.suggestions.push(`✅ ${city}宠物友好选项：${petFriendlyParks[city].join('、')}`)
    }

    result.suggestions.push('出行前务必查询目标景区的官方宠物政策')
    result.suggestions.push('部分景区允许携宠但需牵绳/购票/使用宠物推车')

    return result
  }

  /**
   * 检查餐厅/酒店合规性
   */
  checkVenueCompliance(question) {
    const result = { suggestions: [] }

    if (question.includes('餐厅') || question.includes('饭店')) {
      result.suggestions.push('餐厅宠物政策由商家自行决定，无全国统一规定')
      result.suggestions.push('建议选择明确标注"宠物友好"的餐厅')
      result.suggestions.push('进入前请主动询问工作人员')
    }

    if (question.includes('酒店') || question.includes('民宿')) {
      result.suggestions.push('预订前务必电话确认宠物政策（平台标签可能过期）')
      result.suggestions.push('确认事项：是否收费/清洁费、体型限制、品种限制、是否需要押金')
      result.suggestions.push('民宿通常比酒店更宽松，途家/小猪平台有"可带宠物"标签')
    }

    return result
  }

  /**
   * 检查危险犬种
   */
  checkDangerousDog(question, city) {
    const result = { warnings: [], suggestions: [] }

    result.warnings.push('🚫 该犬种属于烈性犬/禁养犬种')
    
    if (city) {
      result.warnings.push(`${city}有明确的禁养规定，违规饲养将面临处罚`)
    }

    result.suggestions.push('请查阅当地公安机关发布的最新禁养犬名录')
    result.suggestions.push('违规饲养可能面临罚款、没收犬只甚至行政拘留')

    return result
  }

  /**
   * 根据关键词搜索相关法律法规
   */
  searchLaws(keyword) {
    if (!this.loaded) this.loadLaws()

    const kw = keyword.toLowerCase()
    return this.laws.filter(law => {
      const searchText = `${law.title} ${law.tags.join(' ')} ${law.content}`.toLowerCase()
      return searchText.includes(kw)
    })
  }

  /**
   * 获取所有法律法规摘要
   */
  getAllLawsSummary() {
    if (!this.loaded) this.loadLaws()

    return this.laws.map(law => ({
      id: law.id,
      title: law.title,
      tags: law.tags,
      summary: law.content.substring(0, 100) + '...'
    }))
  }

  /**
   * 获取指定城市的完整养犬规定
   */
  getCityFullRegulations(city) {
    const cityLawIdMap = {
      '北京': 'law_002',
      '上海': 'law_003',
      '深圳': 'law_004',
      '广州': 'law_005',
    }

    for (const [key, lawId] of Object.entries(cityLawIdMap)) {
      if (city.includes(key)) {
        return this.laws.find(law => law.id === lawId)
      }
    }

    // 返回对比表
    if (city.includes('对比') || city.includes('全部')) {
      return this.laws.find(law => law.id === 'law_008')
    }

    return null
  }
}

// 导出单例
module.exports = new LawComplianceService()
