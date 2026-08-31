/**
 * 知识库/RAG检索工具
 * 支持本地知识库 + 联网搜索混合检索
 */

const BaseTool = require('./base')
const zhipuClient = require('../llm/zhipu_client')
const config = require('../config')
const { logger } = require('../utils/logger')

// 加载本地知识数据
const petBreedsData = require('../knowledge/pet_breeds')
const foodSafetyData = require('../knowledge/food_safety')
const placePoliciesData = require('../knowledge/place_policies')

class KnowledgeTool extends BaseTool {
  static get schema() {
    return {
      name: 'knowledge_search',
      description: '搜索宠物旅行相关知识，支持本地知识库和联网搜索。涵盖宠物品种、场所政策、食物安全、交通指南、急救常识等。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜索问题或关键词'
          },
          category: {
            type: 'string',
            enum: ['breed', 'policy', 'food_safety', 'transport', 'emergency', 'general'],
            description: '知识类别（可选，加速检索）'
          },
          use_web_search: {
            type: 'boolean',
            description: '是否启用联网搜索获取最新信息（默认false）'
          },
          top_k: {
            type: 'number',
            description: '返回结果数量（默认5）'
          }
        },
        required: ['query']
      }
    }
  }

  async execute(params) {
    const { 
      query, 
      category, 
      use_web_search = false, 
      top_k = 5 
    } = params

    logger.info('KnowledgeTool', `搜索: ${query}, 类别: ${category || 'all'}, 联网: ${use_web_search}`)

    // 并行执行本地检索和联网搜索
    const [localResults, webResults] = await Promise.all([
      this.searchLocal(query, category, top_k),
      use_web_search ? this.searchWeb(query, top_k) : []
    ])

    // 结果融合
    const mergedResults = this.mergeAndRank(localResults, webResults)

    return {
      query,
      results: mergedResults,
      sources: {
        local: localResults.length,
        web: webResults.length
      },
      hasAnswer: mergedResults.length > 0
    }
  }

  /**
   * 本地知识库检索
   */
  async searchLocal(query, category, topK) {
    const results = []
    const keywords = this.extractKeywords(query)
    const queryLower = query.toLowerCase()

    // 如果指定了类别，优先在该类别搜索
    if (category) {
      const categoryResults = await this.searchInCategory(category, query, keywords, topK)
      results.push(...categoryResults)
    } else {
      // 全类别搜索
      const categories = ['breed', 'food_safety', 'policy', 'transport', 'emergency']
      
      for (const cat of categories) {
        const catResults = await this.searchInCategory(cat, query, keywords, Math.ceil(topK / categories.length))
        results.push(...catResults)
      }

      // 搜索FAQ
      const faqResults = this.searchFAQ(query, keywords)
      results.push(...faqResults)
    }

    // 按相关性排序
    results.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))

    return results.slice(0, topK)
  }

  /**
   * 在指定类别中搜索
   */
  async searchInCategory(category, query, keywords, limit) {
    const results = []

    switch (category) {
      case 'breed':
        results.push(...this.searchPetBreeds(query, keywords))
        break
      case 'food_safety':
        results.push(...this.searchFoodSafety(query, keywords))
        break
      case 'policy':
        results.push(...this.searchPlacePolicies(query, keywords))
        break
      case 'transport':
        results.push(...this.searchTransportPolicy(query, keywords))
        break
      case 'emergency':
        results.push(...this.searchEmergencyInfo(query, keywords))
        break
      default:
        // 搜索所有类别
        results.push(
          ...this.searchPetBreeds(query, keywords),
          ...this.searchFoodSafety(query, keywords),
          ...this.searchPlacePolicies(query, keywords),
          ...this.searchTransportPolicy(query, keywords),
          ...this.searchEmergencyInfo(query, keywords)
        )
    }

    return results.slice(0, limit)
  }

  /**
   * 搜索宠物品种信息
   */
  searchPetBreeds(query, keywords) {
    const results = []
    const allPets = [...petBreedsData.dogs, ...petBreedsData.cats]
    
    for (const pet of allPets) {
      const score = this.calculateMatchScore(query, keywords, [pet.name, ...(pet.aliases || []), ...(pet.characteristics || [])])
      
      if (score > 0.1) {
        results.push({
          title: `${pet.name}（${pet.size === 'variable' ? '多体型' : pet.size}，${pet.temperament}）`,
          snippet: `旅行适应性评分: ${pet.travel_suitability.score}/10\n优点: ${(pet.travel_suitability.pros || []).join('、')}\n注意: ${(pet.travel_suitability.cons || []).join('、')}\n特殊需求: ${(pet.travel_suitability.special_needs || []).join('；')}`,
          source_type: 'local',
          category: 'breed',
          relevance_score: score,
          detail: pet
        })
      }
    }

    return results
  }

  /**
   * 搜索食物安全信息
   */
  searchFoodSafety(query, keywords) {
    const results = []
    const queryLower = query.toLowerCase()
    
    // 判断用户问的是有毒还是安全的食物
    const isAskingToxic = /有毒|危险|不能吃|中毒|toxic|不能喂/.test(queryLower)
    const isAskingSafe = /能吃|可以吃|安全|safe|推荐|零食/.test(queryLower)

    if (isAskingToxic || !isAskingSafe) {
      for (const food of foodSafetyData.toxic_for_dogs) {
        const score = this.calculateMatchScore(query, keywords, [food.name, food.toxic_component, ...(food.symptoms || [])])
        
        if (score > 0.1) {
          results.push({
            title: `⚠️ ${food.name} - 危险！`,
            snippet: `毒性等级: ${food.toxicity === 'critical' ? '☠️ 极危' : food.toxicity === 'high' ? '🔴 高危' : '🟡 中等'}\n症状: ${(food.symptoms || []).slice(0, 3).join('、')}\n处理: ${food.treatment?.substring(0, 100)}...`,
            source_type: 'local',
            category: 'food_safety',
            relevance_score: score,
            danger_level: food.toxicity,
            detail: food
          })
        }
      }
    }

    if (isAskingSafe || !isAskingToxic) {
      for (const food of foodSafetyData.safe_for_dogs) {
        const score = this.calculateMatchScore(query, keywords, [food.name])
        
        if (score > 0.05) {
          results.push({
            title: `✅ ${food.name}`,
            snippet: `食用建议: ${food.notes}\n频率: ${food.frequency}`,
            source_type: 'local',
            category: 'food_safety',
            relevance_score: score,
            is_safe: true,
            detail: food
          })
        }
      }
    }

    return results
  }

  /**
   * 搜索场所政策
   */
  searchPlacePolicies(query, keywords) {
    const results = []

    for (const place of placePoliciesData.scenic_spots) {
      const searchableText = [
        place.name,
        place.location,
        JSON.stringify(place.pet_policy)
      ].join(' ')
      
      const score = this.calculateMatchScore(query, keywords, [place.name, place.location])

      if (score > 0.1) {
        results.push({
          title: `📍 ${place.name}（${place.location}）`,
          snippet: `宠物友好度: ${place.pet_policy.allowed === true ? '✅ 允许' : place.pet_policy.allowed === false ? '❌ 不允许' : '⚠️ 部分允许'}\n政策: ${place.pet_policy.conditions}\n提示: ${place.pet_policy.tips?.substring(0, 80)}...`,
          source_type: 'local',
          category: 'policy',
          relevance_score: score,
          pet_friendly_score: place.pet_friendly_score,
          detail: place
        })
      }
    }

    return results
  }

  /**
   * 搜索交通政策
   */
  searchTransportPolicy(query, keywords) {
    const results = []
    const transportData = placePoliciesData.transport_policies

    // 同义词扩展映射
    const synonyms = {
      subway: ['地铁', '轨道交通', '地铁站', '乘地铁', '坐地铁', '公交', '公共交通'],
      airplane: ['飞机', '航空', '乘飞机', '坐飞机', '航班', '托运'],
      high_speed_rail: ['高铁', '火车', '动车', '高速铁路', '12306', '托运'],
      car_travel: ['自驾', '开车', '驾车', '汽车', '自驾游']
    }

    for (const [mode, info] of Object.entries(transportData)) {
      const modeNames = { airplane: '飞机', high_speed_rail: '高铁', subway: '地铁', car_travel: '自驾' }
      const matchFields = [
        modeNames[mode] || mode,
        ...(synonyms[mode] || []),
        info.summary,
        info.tip || '',
        ...(info.exceptions || [])
      ]
      const score = this.calculateMatchScore(query, keywords, matchFields)

      if (score > 0.1) {
        const tip = info.tip || (Array.isArray(info.tips) ? info.tips[0] : info.tips) || ''
        results.push({
          title: `${modeNames[mode] || mode}出行指南`,
          snippet: info.summary + (tip ? '\n建议：' + tip : ''),
          source_type: 'local',
          category: 'transport',
          relevance_score: score,
          detail: info
        })
      }
    }

    return results
  }

  /**
   * 搜索急救信息
   */
  searchEmergencyInfo(query, keywords) {
    const results = []
    const emergencyKeywords = ['急救', '医院', '急诊', '生病', '受伤', '中毒', '呕吐', '腹泻', '中暑']

    const hasEmergencyKeyword = emergencyKeywords.some(kw => keywords.includes(kw))

    if (hasEmergencyKeyword) {
      // 从食物安全数据中提取处理方法
      for (const food of foodSafetyData.toxic_for_dogs.slice(0, 3)) {
        results.push({
          title: `🆘 ${food.name}中毒应急`,
          snippet: `症状: ${(food.symptoms || []).slice(0, 3).join('、')}\n处理: ${food.treatment}`,
          source_type: 'local',
          category: 'emergency',
          relevance_score: 0.6,
          detail: food
        })
      }

      // 通用急救建议
      results.push({
        title: '🆘 宠物紧急情况通用处理原则',
        snippet: '1. 保持冷静，确保自身安全\n2. 迅速评估状况(呼吸/意识/出血)\n3. 联系最近的宠物医院\n4. 不要自行喂药(除非明确知道剂量)\n5. 记录症状发生时间和可能原因',
        source_type: 'local',
        category: 'emergency',
        relevance_score: 0.4
      })
    }

    return results
  }

  /**
   * FAQ搜索
   */
  searchFAQ(query, keywords) {
    // 内置常见FAQ
    const faqs = [
      { q: '坐高铁可以带宠物吗', a: '目前中国高铁不支持随身携带宠物，需办理托运或使用专列。部分线路在试点宠物专列服务，建议出发前查询12306最新规定。', tags: ['高铁', '托运'] },
      { q: '带狗出国需要什么手续', a: '1. 芯片植入 2. 狂犬疫苗抗体检测(血清滴度测试) 3. 健康证书 4. 出境检疫证明 5. 目的国入境许可。建议提前2-3个月开始准备，咨询专业宠物出境代理。', tags: ['出国', '出境', '国际'] },
      { q: '狗狗晕车怎么办', a: '预防：出发前4小时禁食，逐渐习惯乘车环境，使用车载航空箱固定。途中：开窗通风，停靠休息。药物：可咨询兽医开具晕车药。严重者考虑其他交通方式。', tags: ['晕车', '乘车', '自驾'] },
      { q: '夏天带狗出门要注意什么', a: '1. 避开10-16点高温时段 2. 随身携带充足饮水和水碗 3. 注意地面温度(手背测试法) 4. 观察喘气频率(过快需降温) 5. 准备湿毛巾降温 6. 绝对不要留在车内！', tags: ['夏季', '防暑', '高温'] },
      { q: '宠物酒店怎么选', a: '1. 提前电话确认宠物政策 2. 了解清洁费标准 3. 确认周边是否有适合遛宠的空间 4. 查看评价中关于宠物的反馈 5. 推荐选择亚朵、民宿等宠物友好型住宿', tags: ['酒店', '住宿', '旅行'] },
      { q: '第一次带猫出门怎么让它不害怕', a: '1. 提前1-2周让猫适应航空箱/背包 2. 使用费洛蒙喷雾减少焦虑 3. 带上熟悉的毯子或玩具 4. 出发前不要喂太饱 5. 途中用布遮盖箱子减少视觉刺激 6. 保持安静温和的语气安抚', tags: ['猫咪', '出门', '应激'] }
    ]

    return faqs
      .filter(faq => {
        const score = this.calculateMatchScore(query, keywords, [faq.q, ...(faq.tags || [])])
        return score > 0.15
      })
      .map(faq => ({
        title: `Q: ${faq.q}`,
        snippet: faq.a,
        source_type: 'local_faq',
        category: 'general',
        relevance_score: this.calculateMatchScore(query, keywords, [faq.q, ...(faq.tags || [])])
      }))
  }

  /**
   * 联网搜索
   */
  async searchWeb(query, numResults) {
    try {
      logger.info('KnowledgeTool', `联网搜索: ${query}`)

      // 使用智谱GLM-4-plus的联网能力
      const result = await zhipuClient.simpleChat(
        `请搜索以下信息，返回最新的相关结果（包含来源URL）：\n${query}\n\n请以JSON数组格式返回，每个元素包含{title, snippet, url, date}字段。如果无法获取具体URL，url字段留空。`,
        '你是一个搜索引擎助手。根据用户查询返回最新的相关信息。',
        {
          enableWebSearch: true,
          maxTokens: 2000,
          model: config.zhipu.textModelPro
        }
      )

      // 尝试解析返回的结果
      let parsedResults = []
      try {
        let content = result.content.trim()
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch) {
          content = jsonMatch[1].trim()
        } else {
          const startIdx = content.indexOf('[')
          const endIdx = content.lastIndexOf(']')
          if (startIdx !== -1 && endIdx > startIdx) {
            content = content.substring(startIdx, endIdx + 1)
          }
        }
        parsedResults = JSON.parse(content)
      } catch (e) {
        // 解析失败，将整个回复作为单个结果
        parsedResults = [{
          title: '联网搜索结果',
          snippet: result.content.substring(0, 500),
          url: '',
          date: new Date().toISOString()
        }]
      }

      return (Array.isArray(parsedResults) ? parsedResults : [parsedResults]).slice(0, numResults).map(r => ({
        ...r,
        source_type: 'web',
        is_realtime: true,
        relevance_score: 0.8
      }))

    } catch (error) {
      logger.error('KnowledgeTool', `联网搜索失败: ${error.message}`)
      return []
    }
  }

  /**
   * 结果融合与排序
   */
  mergeAndRank(localResults, webResults) {
    const seen = new Set()
    const merged = []

    // 本地结果优先（更可靠）
    for (const item of localResults) {
      const key = this.generateDedupKey(item)
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(item)
      }
    }

    // 补充联网结果
    for (const item of webResults) {
      const key = this.generateDedupKey(item)
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(item)
      }
    }

    return merged
  }

  /**
   * 关键词提取
   */
  extractKeywords(query) {
    const stopWords = new Set(['的', '是', '在', '了', '和', '与', '或', '怎么', '如何', '什么',
      '哪', '吗', '呢', '啊', '吧', '可以', '能', '会', '需要', '有没有', '能不能'])

    const base = query
      .replace(/[？?！!，。、]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.has(w))
      .map(w => w.toLowerCase())

    // 对3字以上的词进一步拆成2字子词，提高召回率
    const expanded = new Set(base)
    for (const w of base) {
      if (w.length >= 3) {
        for (let i = 0; i <= w.length - 2; i++) {
          const sub = w.slice(i, i + 2)
          if (!stopWords.has(sub)) expanded.add(sub)
        }
      }
    }

    return [...expanded]
  }

  /**
   * 计算匹配分数
   */
  calculateMatchScore(query, keywords, targetTexts) {
    if (!Array.isArray(targetTexts)) targetTexts = [targetTexts]
    const combinedText = targetTexts.join(' ').toLowerCase()
    const queryLower = query.toLowerCase()

    let score = 0

    // 完全匹配
    for (const kw of keywords) {
      if (combinedText.includes(kw)) {
        score += 0.5
      }
    }

    // 包含匹配（部分关键词）
    const matchedKeywords = keywords.filter(kw => combinedText.includes(kw))
    score += matchedKeywords.length * 0.2

    // 标题/名称完全匹配加分
    for (const text of targetTexts) {
      if (text && queryLower.includes(text.toLowerCase()) || text.toLowerCase().includes(queryLower)) {
        score += 0.3
      }
    }

    return Math.min(score, 1.0)
  }

  /**
   * 生成去重key
   */
  generateDedupKey(item) {
    return (item.title || '').substring(0, 30)
  }
}

module.exports = KnowledgeTool
