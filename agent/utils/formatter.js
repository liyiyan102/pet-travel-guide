/**
 * 格式化输出工具
 * 负责清理Markdown、回复模板、排版优化
 */

const formatters = {

  // ==================== Emoji资源库 ====================
  emoji: {
    greeting: ['👋', '🐾', '✨', '💚'],
    success: ['✅', '🌟'],
    warning: ['⚠️', '💡', '📌'],
    danger: ['🚨', '❌', '🛑'],
    pet: ['🐕', '🐈', '🐾'],
    travel: ['🗺️', '✈️', '🚄', '🚗', '🏨'],
    food: ['🍖', '🥕', '🍗'],
    weather: ['☀️', '🌤️', '⛅', '🌧️', '❄️'],
    location: ['📍'],
    time: ['📅', '⏰'],
    tip: ['💡', '📝'],
    heart: ['💚'],
    action: ['👉', '➡️']
  },

  randomEmoji(category) {
    const list = this.emoji[category] || this.emoji.greeting
    return list[Math.floor(Math.random() * list.length)]
  },

  // ==================== 文本清理 ====================

  cleanMarkdown(text) {
    if (!text) return ''
    return text
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```[\s\S]*?```/g, m => m.replace(/```\w*\n?/g, '').replace(/```/g, ''))
      .replace(/^\|?[\s\-:|]+\|?\s*$/gm, '')
      .replace(/^\|(.+)\|\s*$/gm, (_, c) => c.split('|').map(x => x.trim()).join('  '))
      .replace(/^[\s]*[-*+]\s+/gm, '• ')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      .replace(/^>\s+/gm, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  },

  beautify(text, options = {}) {
    if (!text) return this.getFallbackReply(options.fallbackType)
    let result = this.cleanMarkdown(text)
    result = result.replace(/([。！？!？])(?=[^\n])/g, '$1\n')
    result = result.replace(/\n{3,}/g, '\n\n')
    return result.trim()
  },

  // ==================== 回复模板 ====================

  /**
   * POI搜索结果模板
   * @param {Array} pois - POI列表
   * @param {string} city - 城市
   * @param {string} category - 分类
   */
  poiResultTemplate(pois, city = '', category = '', totalCount = null, bannedPois = []) {
    if (!pois || pois.length === 0) {
      return this.getFallbackReply('no_results')
    }

    const categoryName = {
      restaurant: '餐厅', hotel: '酒店', park: '公园',
      scenic: '景点', cafe: '咖啡馆', hospital: '宠物医院',
      grooming: '美容店'
    }[category] || '场所'

    const cityText = city && city !== '当前位置' ? `${city}` : '附近'
    const displayPois = pois.slice(0, 20)
    const shown = displayPois.length

    const header = totalCount && totalCount > shown
      ? `📍 为你找到 ${totalCount} 个${cityText}宠物友好${categoryName}，先展示前 ${shown} 个：`
      : `📍 为你找到 ${shown} 个${cityText}宠物友好${categoryName}：`

    const items = displayPois.map((poi, i) => {
      const rating = poi.rating ? `⭐ ${poi.rating}分` : ''
      const policy = poi.pet_policy || poi.petFriendlyDesc || ''
      const address = poi.address || ''
      const friendLevel = poi.friendliness_level
      const levelIcon = friendLevel === 1 ? '✅' : friendLevel === 2 ? '🟡' : '📍'

      let item = `\n${i + 1}. ${levelIcon} ${poi.name}`
      if (address) item += `\n   📌 ${address}`
      if (rating) item += `\n   ${rating}`
      if (policy) item += `\n   🐾 ${policy}`
      return item
    }).join('\n')

    // 禁入场所提示
    let bannedSection = ''
    if (bannedPois && bannedPois.length > 0) {
      const bannedItems = bannedPois.slice(0, 5).map((poi, i) =>
        `\n${i + 1}. ${poi.name} — ${poi.ban_reason || '禁止携带宠物'}`
      ).join('\n')
      bannedSection = `\n\n⚠️ ${cityText}以下场所禁止携带宠物：${bannedItems}`
    }

    return header + items + bannedSection
  },

  /**
   * 法规查询结果模板
   * @param {Object} result - 合规检查结果
   * @param {string} question - 用户问题
   */
  lawResultTemplate(result, question = '') {
    if (!result) return this.getFallbackReply('no_results')

    const riskIcon = { high: '🚫', medium: '⚠️', low: '✅' }[result.riskLevel] || '💡'
    const riskText = { high: '不允许', medium: '需注意', low: '允许' }[result.riskLevel] || '需确认'

    let text = `${riskIcon} ${riskText}\n`

    if (result.warnings && result.warnings.length > 0) {
      text += '\n注意事项：\n'
      result.warnings.forEach(w => {
        // 去掉重复的 emoji 前缀
        const clean = w.replace(/^[⚠️🚫✅💡🐾\s]+/, '').trim()
        text += `• ${clean}\n`
      })
    }

    if (result.suggestions && result.suggestions.length > 0) {
      text += '\n建议：\n'
      result.suggestions.forEach(s => {
        text += `• ${s}\n`
      })
    }

    if (result.citySpecificRules?.keyPoints?.length > 0) {
      text += `\n当地规定要点：\n`
      result.citySpecificRules.keyPoints.forEach(p => {
        text += `• ${p}\n`
      })
    }

    return text.trim()
  },

  /**
   * 知识问答结果模板
   * @param {string} answer - 答案正文
   * @param {Array} sources - 来源
   */
  knowledgeTemplate(answer, sources = []) {
    if (!answer) return this.getFallbackReply('no_results')

    let text = this.beautify(answer)

    if (sources && sources.length > 0) {
      const validSources = sources.filter(s => s.title && s.title.trim())
      if (validSources.length > 0) {
        text += '\n\n📚 参考：\n'
        validSources.slice(0, 3).forEach(s => {
          text += `• ${s.title}\n`
        })
      }
    }

    return text.trim()
  },

  /**
   * 无结果/错误兜底模板
   */
  getFallbackReply(type = 'general') {
    const replies = {
      no_results: [
        `暂时没找到相关信息。\n\n你可以试试：\n• 换个关键词\n• 告诉我更多细节（比如城市、宠物类型）`,
        `这个问题暂时没有找到匹配内容。\n\n• 试试联网搜索最新信息\n• 或者换个方式提问`
      ],
      error: [
        `出了一点小问题，请稍后再试。\n\n你也可以：\n• 重新发送问题\n• 换个简单的问题`,
        `抱歉，请求处理失败了。\n\n请稍后重试，或换个方式提问。`
      ],
      general: [
        `你好！我是小D 🐾，你的专属宠物出行AI助手！\n\n我可以帮你：\n• 查找宠物友好餐厅、公园、酒店\n• 规划带宠物的旅行攻略（支持多天详细行程）\n• 解答宠物出行法规政策\n• 高铁/飞机携宠完整指南\n• 判断宠物食物是否安全\n• 评估特定品种的出行风险\n• 查询目的地实时天气\n• 回答关于我自己的任何问题\n\n直接输入你的问题吧～`,
        `你好！有什么关于宠物出行的问题可以问我。\n\n比如：\n• "上海有什么宠物友好餐厅"\n• "带法斗坐飞机需要注意什么"\n• "北京养大型犬有什么规定"\n• "你是谁？你能做什么？"`
      ],
      clarification: [
        `我来帮你，还需要你提供一些信息：\n\n{missing_info}\n\n告诉我这些，马上给你答案。`,
        `好问题！为了更准确地回答，请告诉我：\n\n{missing_info}`
      ]
    }

    const pool = replies[type] || replies.general
    return pool[Math.floor(Math.random() * pool.length)]
  },

  // ==================== 攻略专属模版 ====================

  /**
   * 模版0: 地点查询/POI推荐
   * 触发: "北京有什么宠物友好酒店"、"推荐几个公园"、"打卡地合集"
   *
   * @param {Object} params
   * @param {string} params.city - 城市名
   * @param {string} params.category - 品类（酒店/公园/餐厅等）
   * @param {Array} params.groups - 分组数据 [{ groupName, pois: [{ name, image, reason, address, avgPrice, rating, tags }] }]
   * @param {number} params.total - 总数量
   */
  poiSearchTemplate(params) {
    const { city, category, groups, total } = params
    if (!groups || groups.length === 0) {
      return this.getFallbackReply('no_results')
    }

    // 对话气泡
    const bubble = `给你推荐${total || groups.reduce((s, g) => s + (g.pois?.length || 0), 0)}个${city || ''}${category || '好去处'}，带毛孩子放心去～🐾`

    let content = bubble

    // 分组横滑列表（按区域/品类分组）
    groups.forEach((group, idx) => {
      content += `\n\n━━━ 📍 ${group.groupName || `分组${idx + 1}`} ━━━`

      if (group.pois && group.pois.length > 0) {
        group.pois.forEach(poi => {
          content += `\n\n`
          // POI 名称 + 评分
          content += `🏷️ ${poi.name}`
          if (poi.rating) content += ` ⭐ ${poi.rating}`
          // 独立推荐理由
          if (poi.reason) {
            content += `\n💡 ${poi.reason}`
          }
          // 地址
          if (poi.address) {
            content += `\n📍 ${poi.address}`
          }
          // 人均价格 + 标签
          const infoParts = []
          if (poi.avgPrice) infoParts.push(`人均 ¥${poi.avgPrice}`)
          if (poi.tags && poi.tags.length > 0) infoParts.push(poi.tags.join(' '))
          if (infoParts.length > 0) {
            content += `\n📋 ${infoParts.join(' | ')}`
          }
          // 图片标识
          if (poi.image) {
            content += `\n🖼️ [图片]`
          }
        })
      } else {
        content += '\n   （暂无推荐）'
      }
    })

    return {
      type: 'poi_search',
      bubble,
      content,
      structured: {
        city,
        category,
        groups,
        total: total || groups.reduce((s, g) => s + (g.pois?.length || 0), 0)
      },
      actions: [
        { type: 'filter', label: '筛选' },
        { type: 'map_view', label: '地图查看' },
        { type: 'more', label: '查看更多' },
        { type: 'share', label: '分享列表' }
      ]
    }
  },

  /**
   * 模版1: 多日同城市游
   * 触发: "规划 X 日游"、"X 天怎么玩"、"城市+天数"
   *
   * @param {Object} params
   * @param {string} params.city - 城市名
   * @param {number} params.days - 天数
   * @param {Array} params.daysData - 每日数据 [{ day, theme, pois: [{ name, image, reason, avgPrice, hours, order }] }]
   */
  multiDaySameCityTemplate(params) {
    const { city, days, daysData } = params
    if (!city || !days || !daysData || daysData.length === 0) {
      return this.getFallbackReply('no_results')
    }

    // 对话气泡
    const bubble = `给你规划了${city}${days}日游，每天带你和毛孩子玩不一样的～🐾`

    // Day Tab 切换 + POI 列表
    let daysSection = ''
    daysData.forEach((dayData, idx) => {
      const dayNum = idx + 1
      daysSection += `\n\n━━━ Day${dayNum} ${dayData.theme || ''} ━━━`

      if (dayData.pois && dayData.pois.length > 0) {
        dayData.pois.forEach(poi => {
          daysSection += `\n`
          // 顺序序号 + 名称
          daysSection += `${poi.order || (dayData.pois.indexOf(poi) + 1)}. ${poi.name}`
          // 图片（如有）
          if (poi.image) {
            daysSection += ` 🖼️`
          }
          // 推荐理由
          if (poi.reason) {
            daysSection += `\n   💡 ${poi.reason}`
          }
          // 人均 / 营业时间
          const infoParts = []
          if (poi.avgPrice) infoParts.push(`人均 ¥${poi.avgPrice}`)
          if (poi.hours) infoParts.push(`⏰ ${poi.hours}`)
          if (infoParts.length > 0) {
            daysSection += `\n   ${infoParts.join(' | ')}`
          }
        })
      } else {
        daysSection += '\n   （暂无景点安排）'
      }
    })

    return {
      type: 'multi_day_same_city',
      bubble,
      content: bubble + daysSection,
      structured: {
        city,
        days,
        daysData
      },
      actions: [
        { type: 'regenerate', label: '重新生成' },
        { type: 'modify', label: '修改行程' },
        { type: 'share', label: '分享攻略' }
      ]
    }
  },

  /**
   * 模版2: 跨城多日游
   * 触发: "X 地 + Y 地怎么玩"、多城市 query
   *
   * @param {Object} params
   * @param {Array} params.cities - 城市列表 ['北京', '上海']
   * @param {number} params.totalDays - 总天数
   * @param {Array} params.cityPlans - 每城市计划 [{ city, days, daysData, transport }]
   * @param {Object} params.interCityTransport - 城际交通建议 { from, to, method, duration, price, tips }
   */
  multiCityTemplate(params) {
    const { cities, totalDays, cityPlans, interCityTransport } = params
    if (!cities || cities.length < 2 || !cityPlans || cityPlans.length === 0) {
      return this.getFallbackReply('no_results')
    }

    // 对话气泡
    const cityList = cities.join('+')
    const bubble = `给你规划了${cityList}的${totalDays || cities.reduce((s, c) => s + (cityPlans.find(cp => cp.city === c)?.days || 0), 0)}日游，跨城带宠出行必备攻略～🗺️`

    let content = bubble

    // 城市 Tab + 每城市下的 Day
    cityPlans.forEach((plan, idx) => {
      content += `\n\n━━━ 🏙️ ${plan.city} (${plan.days || 1}天) ━━━`

      if (plan.daysData && plan.daysData.length > 0) {
        plan.daysData.forEach((dayData, dayIdx) => {
          const dayNum = dayIdx + 1
          content += `\n\n   Day${dayNum}: ${dayData.theme || '游玩安排'}`

          if (dayData.pois && dayData.pois.length > 0) {
            dayData.pois.forEach(poi => {
              content += `\n   ${poi.order || (dayData.pois.indexOf(poi) + 1)}. ${poi.name}`
              if (poi.reason) content += `\n      💡 ${poi.reason}`
              const infoParts = []
              if (poi.avgPrice) infoParts.push(`人均 ¥${poi.avgPrice}`)
              if (poi.hours) infoParts.push(`⏰ ${poi.hours}`)
              if (infoParts.length > 0) content += `\n      ${infoParts.join(' | ')}`
            })
          }
        })
      }

      // 该城市的交通建议
      if (plan.transport) {
        content += `\n\n   🚄 市内交通: ${plan.transport}`
      }
    })

    // 城际交通建议
    if (interCityTransport) {
      content += `\n\n━━━ 🚅 城际交通建议 ━━━\n`
      if (Array.isArray(interCityTransport)) {
        interCityTransport.forEach(t => {
          const icon = {高铁: '🚄', 飞机: '✈️', 自驾: '🚗', 大巴: '🚌'}[t.method] || '🚀'
          content += `\n• ${t.from} → ${t.to}: ${icon} ${t.method}${t.duration ? `(${t.duration})` : ''}${t.price ? ` 约${t.price}` : ''}`
          if (t.tips) content += `\n  💡 ${t.tips}`
        })
      } else {
        const icon = {高铁: '🚄', 飞机: '✈️', 自驾: '🚗', 大巴: '🚌'}[interCityTransport.method] || '🚀'
        content += `\n• ${interCityTransport.from || cities[0]} → ${interCityTransport.to || cities[1]}: ${icon} ${interCityTransport.method}${interCityTransport.duration ? `(${interCityTransport.duration})` : ''}`
        if (interCityTransport.tips) content += `\n💡 ${interCityTransport.tips}`
      }
    }

    return {
      type: 'multi_city',
      bubble,
      content,
      structured: {
        cities,
        totalDays,
        cityPlans,
        interCityTransport
      },
      actions: [
        { type: 'regenerate', label: '重新生成' },
        { type: 'modify', label: '修改行程' },
        { type: 'transport', label: '查看交通详情' },
        { type: 'share', label: '分享攻略' }
      ]
    }
  },

  // ==================== 业务数据格式化 ====================

  itinerary(itineraryData) {
    if (!itineraryData || !itineraryData.days_data) return null
    return {
      title: itineraryData.title || '未命名行程',
      destination: itineraryData.destination || '',
      days: itineraryData.days || 0,
      summary: itineraryData.summary || '',
      days_data: itineraryData.days_data.map(day => ({
        day: day.day,
        theme: day.theme || '',
        overview: day.overview || '',
        pet_friendly_score: day.pet_friendly_score || 8,
        spots: (day.spots || []).map(spot => ({
          name: spot.name,
          type: spot.type,
          time: spot.time || '',
          duration: spot.duration || '',
          address: spot.address || '',
          pet_friendly: spot.pet_friendly !== false,
          pet_policy: spot.pet_policy || '',
          pet_tips: spot.pet_tips || '',
          ticket_price: spot.ticket_price || '',
          highlights: spot.highlights || [],
          notes: spot.notes || ''
        })),
        daily_tips: day.daily_tips || {}
      })),
      overall_tips: itineraryData.overall_tips || {}
    }
  },

  knowledgeAnswer(result) {
    if (!result) return null
    return {
      query: result.query || '',
      answer: this.beautify(result.answer || ''),
      sources: (result.results || []).map(r => ({
        title: r.title || r.question || '',
        snippet: r.snippet || r.answer || '',
        source_type: r.source_type || 'local',
        is_realtime: r.is_realtime || false,
        url: r.url || ''
      })),
      suggestions: result.suggestions || []
    }
  },

  imageAnalysis(analysis) {
    if (!analysis) return null
    return {
      taskType: analysis.taskType || 'general',
      result: analysis.result || {},
      confidence: analysis.confidence || 0,
      description: this.beautify(analysis.description || '')
    }
  },

  poiList(pois) {
    if (!pois || !Array.isArray(pois)) return []
    return pois.map(poi => ({
      id: poi.id || poi.poiId || '',
      name: poi.name || poi.title || '',
      address: poi.address || '',
      category: poi.category || poi.type || '',
      distance: poi.distance || '',
      pet_friendly: poi.pet_friendly !== false,
      pet_policy: poi.pet_policy || poi.petFriendlyDesc || '',
      rating: poi.rating || poi.score || 0,
      images: poi.images || [],
      location: poi.location || poi.latlng || null
    }))
  },

  agentResponse(success, params = {}) {
    const response = { success, timestamp: new Date().toISOString() }

    if (success) {
      let content = params.content || ''
      if (content && typeof content === 'string') {
        content = this.beautify(content, { skipEmoji: params.skipEmoji, fallbackType: params.fallbackType })
      }
      Object.assign(response, {
        response: {
          type: params.type || 'text',
          content,
          imageAnalysis: params.imageAnalysis || null,
          sources: params.sources || null,
          suggestions: params.suggestions || [],
          actions: params.actions || []
        },
        memoryUpdate: params.memoryUpdate || {},
        metrics: params.metrics || {}
      })
    } else {
      Object.assign(response, {
        error: params.error || '未知错误',
        message: this.beautify(params.message || '操作失败'),
        fallback: params.fallback || null
      })
    }

    return response
  },

  truncate(text, maxLength = 500, suffix = '...') {
    if (!text || text.length <= maxLength) return text
    return text.substring(0, maxLength) + suffix
  },

  formatTimestamp(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
  }
}

module.exports = formatters
