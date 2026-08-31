/**
 * Skill 2：宠物出行清单生成
 * 根据目的地城市、宠物类型、交通方式，生成标准化出行清单
 */

// ==================== 清单数据库 ====================

const BASE_CHECKLIST = {
  documents: {
    title: '证件材料',
    items: [
      { name: '狂犬疫苗证明', required: true, note: '需在有效期内' },
      { name: '养犬登记证', required: true, note: '需与所在城市一致' },
      { name: '动物检疫合格证明', required: false, note: '跨省出行必备，须在当地动物卫生监督机构开具' }
    ]
  },
  essentials: {
    title: '出行必备',
    items: [
      { name: '牵引绳', required: true },
      { name: '拾便袋（10+个）', required: true },
      { name: '宠物水碗', required: true },
      { name: '宠物食物（足量）', required: true },
      { name: '宠物证件袋', required: true, note: '装好所有证件便于检查' }
    ]
  },
  health: {
    title: '健康护理',
    items: [
      { name: '常用药（肠胃药/止泻药）', required: true },
      { name: '驱蚊驱虫喷雾', required: false, note: '户外活动必备' },
      { name: '宠物专用消毒湿巾', required: true },
      { name: '急救包（纱布/碘伏）', required: false }
    ]
  }
}

const TRANSPORT_ITEMS = {
  airplane: {
    title: '飞机出行',
    items: [
      { name: '航空箱（IATA标准）', required: true, note: '需提前购买并让宠物适应' },
      { name: '纸尿裤（宠物专用）', required: true, note: '客舱全程需穿戴' },
      { name: '嘴套', required: true, note: '犬类全程佩戴' },
      { name: '动物健康证明（7天内开具）', required: true },
      { name: '疫苗注射证明', required: true },
      { name: '镇静剂', required: false, note: '焦虑型宠物可咨询兽医，客舱通常不建议使用' }
    ]
  },
  high_speed_rail: {
    title: '高铁出行',
    items: [
      { name: '符合标准的运输箱', required: true, note: '高铁托运专用规格，硬质带锁' },
      { name: '动物检疫合格证明（当日有效）', required: true, note: '需在出发地开具，须与乘车区间一致' },
      { name: '12306预约记录截图', required: true, note: '提前预约宠物托运服务' },
      { name: '宠物信息卡（姓名/主人联系方式）', required: true, note: '挂在运输箱上' }
    ]
  },
  car: {
    title: '自驾出行',
    items: [
      { name: '宠物安全带或航空箱', required: true, note: '防止行车中宠物乱跑' },
      { name: '车用宠物隔离网', required: false, note: '后排宠物隔离' },
      { name: '宠物防晕车药', required: false, note: '晕车宠物可提前咨询兽医' },
      { name: '车载宠物水杯', required: true }
    ]
  }
}

const SEASON_ITEMS = {
  summer: [
    { name: '宠物防暑降温喷雾', required: true, note: '短鼻犬尤其重要' },
    { name: '冰垫/散热垫', required: false },
    { name: '防蚊虫喷雾（宠物专用）', required: true }
  ],
  winter: [
    { name: '宠物保暖衣', required: false, note: '短毛犬/小型犬需要' },
    { name: '宠物防冻护爪膏', required: false }
  ]
}

const PET_TYPE_ITEMS = {
  snub_nose: {
    note: '短鼻犬种（法斗/巴哥/波士顿梗）特别注意',
    items: [
      { name: '便携式宠物氧气罐', required: false, note: '应急备用' },
      { name: '保冷袋', required: true, note: '避免高温，随时降温' }
    ],
    warnings: ['禁止在高温天气长时间户外活动', '航空托运高风险，建议自驾', '避免剧烈运动']
  },
  large_dog: {
    note: '大型犬出行注意',
    items: [
      { name: '防护嘴套', required: true, note: '公共场所必备' },
      { name: '加强型牵引绳', required: true }
    ],
    warnings: ['北京城六区/上海内环禁养，郊区出行', '高铁托运限肩高≤40cm']
  },
  cat: {
    note: '猫咪出行注意',
    items: [
      { name: '便携猫包/猫笼', required: true },
      { name: '便携猫砂盆', required: true },
      { name: '猫薄荷/安抚零食', required: false, note: '缓解出行焦虑' }
    ],
    warnings: ['出行前2小时禁食，减少晕车', '保持猫包遮蔽避免过度刺激']
  }
}

const DESTINATION_ITEMS = {
  海边: ['防晒宠物衣（选用）', '宠物脚垫保护膜（热沙地面）'],
  山地: ['宠物护爪蜡', '驱虫项圈'],
  城市: ['宠物推车（大型商场代步）'],
  郊野: ['驱虫项圈', '宠物急救包', '备足清水']
}

// ==================== Skill 核心逻辑 ====================

class TravelChecklistSkill {
  /**
   * 生成出行清单
   * @param {Object} params - { city, petType, transportMode, season, destination }
   * @param {string} question - 原始用户问题（用于提取参数）
   */
  generate(params = {}, question = '') {
    const city = params.city || this.extractCity(question)
    const petType = params.petType || this.extractPetType(question)
    const transport = params.transport || this.extractTransport(question)
    const season = params.season || this.getCurrentSeason()
    const destType = params.destType || this.extractDestType(question)

    const checklist = this.buildChecklist(city, petType, transport, season, destType)
    return this.formatChecklist(checklist, { city, petType, transport, season })
  }

  extractCity(q) {
    const cities = ['北京', '上海', '广州', '深圳', '杭州', '成都', '重庆', '西安', '南京', '厦门', '三亚', '大连', '昆明', '丽江']
    return cities.find(c => q.includes(c)) || null
  }

  extractPetType(q) {
    if (/法斗|法国斗牛|巴哥|波士顿梗|京巴|斗牛/.test(q)) return 'snub_nose'
    if (/金毛|拉布拉多|德牧|哈士奇|萨摩|阿拉斯加|大型犬/.test(q)) return 'large_dog'
    if (/猫|猫咪|喵/.test(q)) return 'cat'
    if (/狗|犬|泰迪|比熊|柯基|柴犬/.test(q)) return 'dog'
    return 'general'
  }

  extractTransport(q) {
    if (/飞机|航空|航班/.test(q)) return 'airplane'
    if (/高铁|火车|动车/.test(q)) return 'high_speed_rail'
    if (/自驾|开车|驾车/.test(q)) return 'car'
    return null
  }

  extractDestType(q) {
    if (/海边|海滩|沙滩|三亚|厦门/.test(q)) return '海边'
    if (/山|爬山|徒步|景区/.test(q)) return '山地'
    if (/郊外|郊野|野营|露营/.test(q)) return '郊野'
    return '城市'
  }

  getCurrentSeason() {
    const month = new Date().getMonth() + 1
    if (month >= 6 && month <= 9) return 'summer'
    if (month >= 11 || month <= 2) return 'winter'
    return 'other'
  }

  buildChecklist(city, petType, transport, season, destType) {
    const sections = []

    // 1. 基础证件（根据是否跨省调整）
    const docs = { ...BASE_CHECKLIST.documents }
    if (city) {
      docs.items = docs.items.map(item => {
        if (item.name === '动物检疫合格证明') {
          return { ...item, required: true, note: `前往${city}必备，在出发地动物卫生监督机构开具，当日有效` }
        }
        return item
      })
    }
    sections.push(docs)

    // 2. 交通专属物品
    if (transport && TRANSPORT_ITEMS[transport]) {
      sections.push(TRANSPORT_ITEMS[transport])
    }

    // 3. 基础必备
    sections.push(BASE_CHECKLIST.essentials)
    sections.push(BASE_CHECKLIST.health)

    // 4. 季节物品
    if (season === 'summer' || season === 'winter') {
      sections.push({
        title: season === 'summer' ? '夏季防暑' : '冬季保暖',
        items: SEASON_ITEMS[season]
      })
    }

    // 5. 宠物类型专属
    if (petType && PET_TYPE_ITEMS[petType]) {
      const petInfo = PET_TYPE_ITEMS[petType]
      sections.push({ title: petInfo.note, items: petInfo.items })
    }

    // 6. 目的地专属
    if (destType && DESTINATION_ITEMS[destType]) {
      sections.push({
        title: `${destType}出行特别准备`,
        items: DESTINATION_ITEMS[destType].map(name => ({ name, required: false }))
      })
    }

    return {
      sections,
      warnings: this.getWarnings(city, petType, transport, season),
      tips: this.getTips(city, petType, transport)
    }
  }

  getWarnings(city, petType, transport, season) {
    const warnings = []
    if (petType === 'snub_nose' && season === 'summer') warnings.push('⚠️ 短鼻犬高温天气风险极高，建议避开11:00-16:00出行')
    if (petType === 'snub_nose' && transport === 'airplane') warnings.push('⚠️ 短鼻犬多数航司禁运货舱，请提前确认航司政策')
    if (petType === 'large_dog' && (city === '北京' || city === '上海')) warnings.push(`⚠️ 大型犬在${city}市区受限，建议选择郊区活动`)
    if (petType === 'large_dog' && transport === 'high_speed_rail') warnings.push('⚠️ 高铁托运限肩高≤40cm，大型犬可能无法托运')
    return warnings
  }

  getTips(city, petType, transport) {
    const tips = ['出行前1-2天做好宠物的心理准备，减少陌生环境应激']
    if (transport === 'airplane') tips.push('提前48小时联系航司确认携宠服务，预留充足准备时间')
    if (transport === 'high_speed_rail') tips.push('至少提前1天在12306预约宠物托运，旺季建议提前3-5天')
    if (city) tips.push(`到达${city}后第一时间找好附近宠物医院，备用`)
    return tips
  }

  formatChecklist(data, params) {
    const { sections, warnings, tips } = data
    const lines = []

    const title = [
      params.city ? params.city : '',
      params.petType && params.petType !== 'general' ? `（${this.petTypeName(params.petType)}）` : '',
      params.transport ? this.transportName(params.transport) : '',
      '出行清单'
    ].filter(Boolean).join('').trim() || '宠物出行清单'

    lines.push(title)
    lines.push('')

    for (const section of sections) {
      lines.push(`【${section.title}】`)
      for (const item of section.items) {
        const req = item.required ? '✅' : '☑️'
        const note = item.note ? `  （${item.note}）` : ''
        lines.push(`${req} ${item.name}${note}`)
      }
      lines.push('')
    }

    if (warnings.length > 0) {
      lines.push('【特别注意】')
      warnings.forEach(w => lines.push(w))
      lines.push('')
    }

    if (tips.length > 0) {
      lines.push('【小贴士】')
      tips.forEach((t, i) => lines.push(`${i + 1}. ${t}`))
    }

    return {
      found: true,
      title,
      content: lines.join('\n'),
      params,
      rawData: data
    }
  }

  petTypeName(type) {
    return { snub_nose: '短鼻犬', large_dog: '大型犬', cat: '猫咪', dog: '犬', general: '宠物' }[type] || '宠物'
  }

  transportName(mode) {
    return { airplane: '飞机', high_speed_rail: '高铁', car: '自驾' }[mode] || ''
  }
}

module.exports = new TravelChecklistSkill()
module.exports.TravelChecklistSkill = TravelChecklistSkill
