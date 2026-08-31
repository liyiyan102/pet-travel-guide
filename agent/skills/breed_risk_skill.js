/**
 * Skill 3：宠物品种出行风险评估
 * 输入品种 + 目的地 + 交通方式，输出风险等级和具体建议
 */

// ==================== 品种数据库 ====================

const BREED_DB = {
  // 短鼻/扁脸品种（呼吸风险高）
  法国斗牛犬: { size: 'small', snub_nose: true, banned_cities: [], weight: '8-14kg', height: '28-33cm', aka: ['法斗', '法牛'] },
  巴哥犬: { size: 'small', snub_nose: true, banned_cities: [], weight: '6-8kg', height: '25-30cm', aka: ['哈巴狗', '巴哥'] },
  波士顿梗: { size: 'small', snub_nose: true, banned_cities: [], weight: '4-11kg', height: '38-43cm', aka: ['波士顿'] },
  英国斗牛犬: { size: 'medium', snub_nose: true, banned_cities: ['上海', '北京', '深圳'], weight: '18-25kg', height: '30-40cm', aka: ['英斗', '老虎狗'] },
  北京犬: { size: 'small', snub_nose: true, banned_cities: [], weight: '3-6kg', height: '15-25cm', aka: ['京巴', '北京哈巴狗'] },
  // 大型犬
  金毛猎犬: { size: 'large', snub_nose: false, banned_in_districts: { 北京: '城六区（肩高约55-61cm，超过35cm限制）', 上海: '内环（肩高约55-61cm，超过35cm限制）' }, weight: '25-34kg', height: '51-61cm', aka: ['金毛', '金毛寻回犬'] },
  拉布拉多: { size: 'large', snub_nose: false, banned_in_districts: { 北京: '城六区', 上海: '内环' }, weight: '25-36kg', height: '54-62cm', aka: ['拉布'] },
  德国牧羊犬: { size: 'large', snub_nose: false, banned_cities: ['上海', '深圳', '广州', '南京'], weight: '22-40kg', height: '55-65cm', aka: ['德牧', '黑背'] },
  哈士奇: { size: 'large', snub_nose: false, banned_in_districts: { 北京: '城六区（肩高约50-60cm）', 上海: '内环' }, weight: '16-27kg', height: '50-60cm', aka: ['哈士奇', '二哈'] },
  萨摩耶: { size: 'large', snub_nose: false, banned_in_districts: { 北京: '城六区', 上海: '内环' }, weight: '16-30kg', height: '46-56cm', aka: ['萨摩'] },
  边境牧羊犬: { size: 'medium', snub_nose: false, weight: '12-20kg', height: '46-53cm', aka: ['边牧'] },
  柴犬: { size: 'small', snub_nose: false, weight: '8-11kg', height: '34-41cm', aka: [] },
  柯基: { size: 'small', snub_nose: false, weight: '10-14kg', height: '25-30cm', aka: ['威尔士柯基'] },
  泰迪: { size: 'small', snub_nose: false, weight: '3-5kg', height: '25-35cm', aka: ['玩具贵宾', '贵宾'] },
  比熊: { size: 'small', snub_nose: false, weight: '3-5kg', height: '23-30cm', aka: ['比熊犬'] },
  藏獒: { size: 'xlarge', snub_nose: false, banned_cities: ['北京', '上海', '深圳', '广州', '南京', '杭州', '成都', '西安'], weight: '45-90kg', height: '61-71cm', aka: [] },
  比特犬: { size: 'large', snub_nose: false, banned_cities: ['北京', '上海', '深圳', '广州', '南京', '杭州', '成都', '西安', '重庆'], weight: '16-30kg', height: '45-53cm', aka: ['美国比特'] },
  罗威纳犬: { size: 'large', snub_nose: false, banned_cities: ['北京', '上海', '深圳', '广州', '南京'], weight: '35-60kg', height: '56-69cm', aka: ['罗威纳'] },
  // 猫
  英国短毛猫: { size: 'small', snub_nose: true, species: 'cat', weight: '4-8kg', aka: ['英短'] },
  波斯猫: { size: 'small', snub_nose: true, species: 'cat', weight: '3-7kg', aka: [] },
  布偶猫: { size: 'medium', snub_nose: false, species: 'cat', weight: '4-9kg', aka: ['布偶'] },
  橘猫: { size: 'small', snub_nose: false, species: 'cat', weight: '3-6kg', aka: ['橘'] },
  中华田园犬: { size: 'medium', snub_nose: false, rural: true, weight: '10-25kg', height: '40-60cm', aka: ['土狗', '串串', '田园犬'] }
}

// ==================== 风险矩阵 ====================

const RISK_MATRIX = {
  // [品种特征][场景] = 风险等级
  snub_nose: {
    airplane_cargo: 'high',    // 货舱航空 - 高风险
    airplane_cabin: 'medium',  // 客舱 - 中风险（航司限制）
    high_speed_rail: 'low',    // 高铁托运 - 低风险（有专人看护）
    car: 'low',                // 自驾 - 低风险（可控）
    summer_outdoor: 'high',    // 夏季户外 - 高风险
    exercise: 'medium'         // 剧烈运动 - 中风险
  },
  large_dog: {
    airplane_cargo: 'medium',
    airplane_cabin: 'high',    // 通常不允许
    high_speed_rail: 'medium', // 肩高>40cm不允许托运
    restricted_city: 'high',   // 禁区城市
    car: 'low'
  },
  banned_breed: {
    any: 'high'                // 禁养品种任何出行都高风险（法律风险）
  }
}

// ==================== Skill 核心逻辑 ====================

class BreedRiskSkill {
  /**
   * 品种风险评估主入口
   */
  assess(question, params = {}) {
    const breedName = params.breed || this.extractBreed(question)
    const city = params.city || this.extractCity(question)
    const transport = params.transport || this.extractTransport(question)

    if (!breedName) {
      return { found: false, message: '请告诉我你的宠物品种，我来帮你评估出行风险。' }
    }

    const breed = this.getBreedInfo(breedName)
    if (!breed) {
      return {
        found: false,
        breed: breedName,
        message: `暂无"${breedName}"的品种数据库记录。\n\n建议：\n• 告诉我体重（kg）和肩高（cm），我帮你判断\n• 或直接联系目的地当地公安部门确认`
      }
    }

    return this.generateAssessment(breedName, breed, city, transport, question)
  }

  extractBreed(q) {
    for (const [name, info] of Object.entries(BREED_DB)) {
      const allNames = [name, ...(info.aka || [])]
      if (allNames.some(n => q.includes(n))) return name
    }
    return null
  }

  extractCity(q) {
    const cities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '西安', '南京', '厦门', '三亚', '大连', '昆明', '丽江']
    return cities.find(c => q.includes(c)) || null
  }

  extractTransport(q) {
    if (/飞机|航空|航班/.test(q)) return 'airplane'
    if (/高铁|火车|动车/.test(q)) return 'high_speed_rail'
    if (/自驾|开车/.test(q)) return 'car'
    if (/地铁|公交/.test(q)) return 'subway'
    return null
  }

  getBreedInfo(name) {
    if (BREED_DB[name]) return { ...BREED_DB[name], name }
    for (const [breedName, info] of Object.entries(BREED_DB)) {
      if ((info.aka || []).some(a => name.includes(a) || a.includes(name))) {
        return { ...info, name: breedName }
      }
    }
    return null
  }

  generateAssessment(breedName, breed, city, transport, question) {
    const risks = []
    const restrictions = []
    const suggestions = []
    let overallRisk = 'low'

    // 1. 禁养检查
    if (city && breed.banned_cities?.includes(city)) {
      risks.push({ level: 'high', msg: `${breedName} 在 ${city} 属于禁养犬种，携带前往违法` })
      overallRisk = 'high'
    }

    // 2. 区域禁养检查（大型犬在特定区域）
    if (city && breed.banned_in_districts?.[city]) {
      risks.push({ level: 'medium', msg: `${breedName} 在 ${city} ${breed.banned_in_districts[city]}` })
      restrictions.push(`建议选择 ${city} 郊区景点出行，避开限制区域`)
      if (overallRisk === 'low') overallRisk = 'medium'
    }

    // 3. 交通方式风险
    if (transport) {
      const transportRisks = this.assessTransport(breedName, breed, transport, city)
      risks.push(...transportRisks.risks)
      restrictions.push(...transportRisks.restrictions)
      suggestions.push(...transportRisks.suggestions)
      if (transportRisks.level === 'high' && overallRisk !== 'high') overallRisk = 'high'
      if (transportRisks.level === 'medium' && overallRisk === 'low') overallRisk = 'medium'
    }

    // 4. 短鼻犬特别提示
    if (breed.snub_nose) {
      const season = new Date().getMonth() + 1
      if (season >= 6 && season <= 9) {
        risks.push({ level: 'high', msg: '当前为夏季高温期，短鼻犬极易中暑，户外活动需严格控制时间' })
        overallRisk = 'high'
      }
      restrictions.push('避免剧烈运动，出行备好降温工具')
      suggestions.push('自驾出行最安全，可随时控制车内温度')
    }

    // 5. 农村犬特别提示
    if (breed.rural && city) {
      const ruralRestrictedCities = ['成都', '西安', '杭州']
      if (ruralRestrictedCities.includes(city)) {
        risks.push({ level: 'medium', msg: `中华田园犬在 ${city} 仍受管控，携带前请确认当地最新规定` })
        if (overallRisk === 'low') overallRisk = 'medium'
      }
    }

    // 默认建议
    if (suggestions.length === 0) suggestions.push('出行前携带疫苗证明和养犬登记证')
    suggestions.push('到达目的地后第一时间了解当地宠物政策')

    return {
      found: true,
      breed: breedName,
      city,
      transport,
      overallRisk,
      content: this.formatAssessment(breedName, breed, city, transport, overallRisk, risks, restrictions, suggestions)
    }
  }

  assessTransport(breedName, breed, transport, city) {
    const result = { risks: [], restrictions: [], suggestions: [], level: 'low' }

    if (transport === 'subway') {
      result.risks.push({ level: 'high', msg: '地铁不允许携带宠物（导盲犬除外）' })
      result.suggestions.push('建议选择出租车（需征得司机同意）或网约车')
      result.level = 'high'
    }

    if (transport === 'airplane') {
      if (breed.snub_nose) {
        result.risks.push({ level: 'high', msg: `${breedName} 属于短鼻犬种，多数航司货舱禁运，客舱需提前确认` })
        result.suggestions.push('强烈建议改为自驾出行')
        result.level = 'high'
      } else if (breed.size === 'large' || breed.size === 'xlarge') {
        result.risks.push({ level: 'medium', msg: '大型犬通常不允许进入客舱，货舱托运需确认航司政策' })
        result.suggestions.push('提前48小时联系航司确认，确保该航班有有氧舱')
        result.level = 'medium'
      }
    }

    if (transport === 'high_speed_rail') {
      const heightCm = parseInt(breed.height?.split('-')[1]) || 0
      if (heightCm > 40) {
        result.risks.push({ level: 'high', msg: `${breedName} 肩高约${breed.height}，超过高铁托运限制（≤40cm），无法托运` })
        result.suggestions.push('建议改为自驾出行')
        result.level = 'high'
      } else if (breed.banned_cities?.length > 0) {
        result.risks.push({ level: 'medium', msg: '该品种在部分城市禁养，到站时可能被查扣' })
        result.level = 'medium'
      } else {
        result.suggestions.push('提前在12306预约宠物托运，携带当日有效的动物检疫合格证明')
      }
    }

    return result
  }

  formatAssessment(breedName, breed, city, transport, overallRisk, risks, restrictions, suggestions) {
    const riskLabel = { low: '✅ 低风险', medium: '⚠️ 需注意', high: '🚫 高风险/不允许' }[overallRisk]
    const lines = []

    lines.push(`${breedName} 出行风险评估`)
    lines.push(`体型：${breed.size === 'small' ? '小型' : breed.size === 'medium' ? '中型' : breed.size === 'large' ? '大型' : '超大型'} | 体重：${breed.weight || '未知'} | 肩高：${breed.height || '未知'}`)
    lines.push('')
    lines.push(`总体风险：${riskLabel}`)
    lines.push('')

    if (risks.length > 0) {
      lines.push('风险详情：')
      risks.forEach(r => {
        const icon = r.level === 'high' ? '🚫' : '⚠️'
        lines.push(`${icon} ${r.msg}`)
      })
      lines.push('')
    }

    if (restrictions.length > 0) {
      lines.push('限制条件：')
      restrictions.forEach(r => lines.push(`• ${r}`))
      lines.push('')
    }

    lines.push('建议：')
    suggestions.forEach((s, i) => lines.push(`${i + 1}. ${s}`))

    return lines.join('\n')
  }

  /**
   * 获取所有已支持的品种列表
   */
  getSupportedBreeds() {
    return Object.keys(BREED_DB).map(name => ({
      name,
      aka: BREED_DB[name].aka || [],
      size: BREED_DB[name].size,
      snub_nose: BREED_DB[name].snub_nose || false
    }))
  }
}

module.exports = new BreedRiskSkill()
module.exports.BreedRiskSkill = BreedRiskSkill
