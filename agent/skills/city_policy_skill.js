/**
 * Skill 1：城市宠物政策查询
 * 结构化查询各城市养犬规定、禁养名单、交通政策等
 * 精确查表，不走 LLM，杜绝编造
 */

// ==================== 城市政策数据库 ====================

const CITY_POLICIES = {
  北京: {
    alias: ['北京市', 'beijing'],
    dog_limit: '每户限养1只（重点管理区，即城六区）',
    size_limit: '体高超过35cm的大型犬禁止在城六区饲养',
    banned_breeds_count: 41,
    banned_breeds_sample: ['藏獒', '比特犬', '杜高犬', '罗威纳犬', '德国牧羊犬'],
    leash_rule: '1.5米以内牵引绳，大型犬需佩戴嘴套',
    elevator_rule: '避开高峰时段（多数小区规定7:00-9:00、17:00-19:00），装入犬笼或犬袋',
    subway_rule: '不允许（导盲犬除外）',
    park_rule: '部分公园允许牵绳遛狗，如朝阳公园、大兴狼垡城市森林公园等，进入前需确认',
    registration: '需办理养犬登记证',
    rural_dog: '中华田园犬未禁养',
    note: '金毛、拉布拉多等肩高>35cm犬种在城六区属禁养，建议郊区出行'
  },
  上海: {
    alias: ['上海市', 'shanghai'],
    dog_limit: '重点管理区每户限养1只',
    size_limit: '内环以内限制体高超过35cm的犬种',
    banned_breeds_sample: ['藏獒', '罗威纳犬', '德国牧羊犬', '英国斗牛犬', '德国杜宾犬'],
    leash_rule: '须使用牵引绳，公共场所需牵绳',
    elevator_rule: '需将犬装入犬袋或犬笼',
    subway_rule: '不允许（导盲犬除外）',
    park_rule: '部分公园允许，需牵绳并清理粪便',
    registration: '需植入电子标识并办理养犬登记证',
    rural_dog: '中华田园犬未禁养',
    note: '内环以内大型犬受限，携大型犬出行建议选择郊区'
  },
  深圳: {
    alias: ['深圳市', 'shenzhen'],
    dog_limit: '每户限养1只',
    size_limit: '按5级体型分类管理，超大型犬（肩高>70cm）限制更严',
    banned_breeds_count: 38,
    banned_breeds_sample: ['藏獒', '比特犬', '卡斯罗犬', '罗威纳犬', '土佐犬'],
    leash_rule: '超小型/小型犬链≤2米，中型及以上≤1.5米',
    elevator_rule: '收紧犬链，使犬只紧贴牵领人腿部',
    subway_rule: '不允许（导盲犬和扶助犬除外）',
    park_rule: '公园内禁止携犬（深圳市规定），部分开放绿地允许',
    registration: '犬龄满3个月必须登记，30日内植入电子标签',
    rural_dog: '中华田园犬2019年12月解禁',
    note: '深圳对公共场所管控较严，公园明确禁止携犬'
  },
  广州: {
    alias: ['广州市', 'guangzhou'],
    dog_limit: '严格管理区每户限养1只',
    size_limit: '体高超过71cm大型犬禁养',
    banned_breeds_count: 35,
    banned_breeds_sample: ['藏獒', '比特犬', '杜高犬', '巴西菲勒犬', '日本土佐犬'],
    leash_rule: '出户须牵绳',
    subway_rule: '不允许（导盲犬除外）',
    park_rule: '部分公园划定宠物活动区，需牵绳',
    registration: '需办理养犬登记',
    rural_dog: '中华田园犬2025年1月解禁',
    note: '广州体型限制为71cm，比北京上海宽松'
  },
  南京: {
    alias: ['南京市', 'nanjing'],
    size_limit: '体高超过61cm大型犬禁养',
    banned_breeds_count: 30,
    leash_rule: '须使用牵引绳',
    subway_rule: '不允许（导盲犬除外）',
    park_rule: '部分公园允许，需牵绳',
    registration: '需办理养犬登记',
    rural_dog: '中华田园犬管控中，建议确认当地最新规定'
  },
  杭州: {
    alias: ['杭州市', 'hangzhou'],
    dog_limit: '市区限养1只',
    size_limit: '限制大型犬在市区饲养',
    leash_rule: '须使用牵引绳，嘴套视情况佩戴',
    subway_rule: '不允许（导盲犬除外）',
    park_rule: '部分公园设有宠物专区，西湖景区核心区禁止携犬',
    registration: '需办理养犬登记',
    rural_dog: '中华田园犬仍在管控中',
    note: '西湖景区对宠物限制较多，建议选择郊区景点'
  },
  成都: {
    alias: ['成都市', 'chengdu'],
    dog_limit: '市区每户限养1只',
    size_limit: '限制大型犬',
    leash_rule: '须使用牵引绳',
    subway_rule: '不允许（导盲犬除外）',
    park_rule: '部分公园允许，需牵绳',
    registration: '需办理养犬登记',
    rural_dog: '中华田园犬仍在管控中',
    note: '成都宠物文化浓厚，宠物友好餐厅和公园较多'
  },
  重庆: {
    alias: ['重庆市', 'chongqing'],
    dog_limit: '限养规定参照各区',
    leash_rule: '须使用牵引绳',
    subway_rule: '不允许（导盲犬除外）',
    park_rule: '部分公园允许，需牵绳',
    registration: '需办理养犬登记',
    note: '洪崖洞等室内商业景区不允许携带宠物'
  },
  西安: {
    alias: ['西安市', "xi'an"],
    dog_limit: '市区每户限养1只',
    leash_rule: '须使用牵引绳',
    subway_rule: '不允许（导盲犬除外）',
    park_rule: '部分公园允许，需牵绳',
    registration: '需办理养犬登记',
    rural_dog: '中华田园犬仍在管控中'
  },
  厦门: {
    alias: ['厦门市', 'xiamen'],
    dog_limit: '限养规定参照各区',
    leash_rule: '须使用牵引绳',
    subway_rule: '不允许（导盲犬除外）',
    park_rule: '部分公园允许，鼓浪屿岛上有专项规定',
    registration: '需办理养犬登记',
    note: '鼓浪屿为步行岛，建议提前确认宠物携带规定'
  },
  三亚: {
    alias: ['三亚市', 'sanya'],
    leash_rule: '须使用牵引绳',
    subway_rule: '三亚暂无地铁',
    park_rule: '部分海滩和公园允许宠物',
    registration: '需办理养犬登记',
    note: '热带气候，夏季需注意宠物防暑，短鼻犬慎带'
  }
}

// ==================== 全国通用规定 ====================

const GENERAL_RULES = {
  subway: '全国几乎所有城市地铁均不允许携带宠物，导盲犬和扶助犬除外。出租车可携带，但需征得驾驶员同意。',
  high_speed_rail: '高铁提供宠物托运服务（2026年覆盖126座车站），仅限猫和犬，体重≤15kg，肩高≤40cm，需提前在12306预约并携带当日有效的动物检疫合格证明。',
  airplane: '航空携宠规定因航司而异，短鼻犬种（法斗、巴哥等）多数航司禁运，建议提前48小时联系航司确认。',
  registration: '全国各城市均需办理养犬登记，通常需要：宠物照片、狂犬疫苗证明、主人身份证。',
  leash: '全国各地均要求出户牵绳，违反可处警告或罚款（2026年治安管理处罚法第89条）。'
}

// ==================== Skill 核心逻辑 ====================

class CityPolicySkill {
  /**
   * 主入口：根据用户问题返回精确政策信息
   * @param {string} question - 用户问题
   * @param {Object} params - { city, topic }
   */
  query(question, params = {}) {
    const city = params.city || this.extractCity(question)
    const topic = params.topic || this.extractTopic(question)

    // 无法识别城市时返回通用规定
    if (!city) {
      return this.getGeneralAnswer(topic, question)
    }

    const policy = this.getCityPolicy(city)
    if (!policy) {
      return {
        found: false,
        city,
        message: `暂无 ${city} 的详细养宠规定。\n\n建议：\n• 查询 ${city} 市政务服务网\n• 联系当地公安局治安支队\n• 拨打12345政务热线咨询`
      }
    }

    return this.formatAnswer(city, policy, topic, question)
  }

  /**
   * 从问题中提取城市
   */
  extractCity(question) {
    for (const [city, info] of Object.entries(CITY_POLICIES)) {
      const names = [city, ...(info.alias || [])]
      if (names.some(n => question.includes(n))) return city
    }
    return null
  }

  /**
   * 从问题中提取查询主题
   */
  extractTopic(question) {
    const topicMap = [
      { topic: 'subway',        keywords: ['地铁', '公交', '公共交通', '轨道交通'] },
      { topic: 'banned_breeds', keywords: ['禁养', '哪些狗', '哪些犬', '禁止养', '能养', '可以养', '允许养'] },
      { topic: 'size_limit',    keywords: ['大型犬', '体型', '体高', '多大', '多重', '金毛', '拉布拉多', '德牧', '哈士奇'] },
      { topic: 'leash',         keywords: ['牵绳', '牵引绳', '嘴套', '遛狗'] },
      { topic: 'park',          keywords: ['公园', '景区', '景点', '能进', '可以进'] },
      { topic: 'registration',  keywords: ['登记', '证件', '手续', '办理', '养犬证'] },
      { topic: 'elevator',      keywords: ['电梯', '乘梯'] },
      { topic: 'rural_dog',     keywords: ['中华田园犬', '土狗', '串串', '田园犬'] }
    ]
    for (const { topic, keywords } of topicMap) {
      if (keywords.some(k => question.includes(k))) return topic
    }
    return 'general'
  }

  getCityPolicy(cityName) {
    if (CITY_POLICIES[cityName]) return CITY_POLICIES[cityName]
    for (const [city, info] of Object.entries(CITY_POLICIES)) {
      if ((info.alias || []).some(a => cityName.includes(a) || a.includes(cityName))) {
        return info
      }
    }
    return null
  }

  /**
   * 格式化城市+主题回答
   */
  formatAnswer(city, policy, topic, question) {
    const answers = []

    switch (topic) {
      case 'subway':
        answers.push(`${city}地铁：${policy.subway_rule || GENERAL_RULES.subway}`)
        if (policy.note) answers.push(`备注：${policy.note}`)
        break

      case 'banned_breeds':
        if (policy.banned_breeds_sample) {
          answers.push(`${city}禁养犬种（共${policy.banned_breeds_count || '若干'}种）：`)
          answers.push(`包括：${policy.banned_breeds_sample.join('、')}等`)
        }
        if (policy.size_limit) answers.push(`体型限制：${policy.size_limit}`)
        if (policy.rural_dog) answers.push(`中华田园犬：${policy.rural_dog}`)
        break

      case 'size_limit':
        if (policy.size_limit) answers.push(`${city}体型限制：${policy.size_limit}`)
        if (policy.banned_breeds_sample) answers.push(`同时禁养：${policy.banned_breeds_sample.slice(0, 3).join('、')}等烈性犬`)
        if (policy.note) answers.push(`注意：${policy.note}`)
        break

      case 'leash':
        answers.push(`${city}牵绳规定：${policy.leash_rule || '须使用牵引绳'}`)
        if (policy.elevator_rule) answers.push(`电梯规定：${policy.elevator_rule}`)
        break

      case 'park':
        answers.push(`${city}公园携宠：${policy.park_rule || '需提前确认各公园具体规定'}`)
        if (policy.note) answers.push(`注意：${policy.note}`)
        break

      case 'registration':
        answers.push(`${city}养犬登记：${policy.registration || '需办理养犬登记证'}`)
        answers.push(`通常需要：宠物照片、狂犬疫苗证明、主人身份证`)
        break

      case 'elevator':
        answers.push(`${city}电梯规定：${policy.elevator_rule || '需将宠物装入犬袋或犬笼'}`)
        break

      case 'rural_dog':
        answers.push(`${city}中华田园犬规定：${policy.rural_dog || '请咨询当地主管部门'}`)
        break

      default: {
        // 返回完整摘要
        const parts = []
        if (policy.dog_limit) parts.push(`限养：${policy.dog_limit}`)
        if (policy.size_limit) parts.push(`体型：${policy.size_limit}`)
        if (policy.leash_rule) parts.push(`牵绳：${policy.leash_rule}`)
        if (policy.subway_rule) parts.push(`地铁：${policy.subway_rule}`)
        if (policy.registration) parts.push(`登记：${policy.registration}`)
        if (policy.rural_dog) parts.push(`田园犬：${policy.rural_dog}`)
        answers.push(...parts)
        if (policy.note) answers.push(`提示：${policy.note}`)
      }
    }

    return {
      found: true,
      city,
      topic,
      content: answers.join('\n\n'),
      policy,
      source: '本地结构化政策库'
    }
  }

  /**
   * 没有城市时返回通用规定
   */
  getGeneralAnswer(topic, question) {
    const rule = GENERAL_RULES[topic]
    if (rule) {
      return { found: true, city: null, topic, content: rule, source: '全国通用规定' }
    }
    return { found: false, city: null, topic, content: null }
  }

  /**
   * 获取所有城市列表
   */
  getCityList() {
    return Object.keys(CITY_POLICIES)
  }
}

module.exports = new CityPolicySkill()
module.exports.CityPolicySkill = CityPolicySkill
