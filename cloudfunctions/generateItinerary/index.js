// 云函数：AI生成旅行攻略（调用智谱大模型）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 智谱AI配置
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || ''
const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const MODEL = 'glm-4-flash'  // 使用GLM-4-flash（免费快速）

exports.main = async (event, context) => {
  const {
    destination,
    days,
    pets,
    specialNeeds,
    options = [],
    userId
  } = event

  try {
    // 1. 验证输入参数
    if (!destination || !days || !pets || pets.length === 0) {
      return { success: false, message: '缺少必要参数：目的地、天数或宠物信息' }
    }

    // 2. 调用智谱AI生成行程
    const itineraryData = await callZhipuAI(destination, days, pets, specialNeeds, options)

    // 3. 保存到数据库
    const saveResult = await db.collection('itineraries').add({
      data: {
        user_id: userId || 'anonymous',
        title: `${destination}${days}日宠物友好之旅`,
        destination,
        days,
        input_params: { pets, specialNeeds, options },
        days_data: itineraryData.days_data,
        created_at: new Date(),
        updated_at: new Date()
      }
    })

    return {
      success: true,
      data: {
        itinerary_id: saveResult._id,
        title: `${destination}${days}日宠物友好之旅`,
        destination,
        days,
        input_params: { pets, specialNeeds, options },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        days_data: itineraryData.days_data
      },
      message: '生成成功'
    }

  } catch (err) {
    console.error('生成攻略失败:', err)
    return { success: false, error: err.message, message: '生成失败：' + err.message }
  }
}

// 调用智谱AI生成行程
async function callZhipuAI(destination, days, pets, specialNeeds, options) {
  // 构建宠物信息描述
  const petInfo = pets.map(p => {
    const type = p.type || '未知'
    const size = p.size || '中型'
    const breed = p.breed || ''
    const age = p.age ? `${p.age}岁` : ''
    return `${type}${breed ? '(' + breed + ')' : ''}，${size}体型${age ? '，' + age : ''}`
  }).join('、')

  // 构建选项描述
  const optionDesc = []
  if (options.includes('pet_friendly_only')) optionDesc.push('仅选择宠物友好场所')
  if (options.includes('include_vet')) optionDesc.push('每天安排附近宠物医院')
  if (options.includes('relaxed_pace')) optionDesc.push('节奏轻松，适合带宠物出行')
  if (options.includes('indoor_backup')) optionDesc.push('包含室内备选方案（应对恶劣天气）')
  const needsStr = specialNeeds ? `特殊需求：${specialNeeds}` : ''

  // 构建系统提示词
  const systemPrompt = `你是一位专业的宠物友好旅行规划师。你擅长为携带宠物的旅行者规划详细、实用的行程攻略。

你的任务是根据用户输入的目的地、天数、宠物信息和偏好，生成结构化的JSON格式行程数据。

输出要求：
1. 必须是严格的JSON格式，不要有任何其他文字说明
2. 每天安排4-5个地点/活动
3. 所有场所必须标注是否允许携带宠物（pet_friendly字段）
4. 时间安排要合理，考虑宠物需求（如遛狗时间、休息时间）
5. 包含具体的宠物相关注意事项`

  // 构建用户提示词
  const userPrompt = `请为以下旅行需求生成${days}天的宠物友好行程攻略：

**目的地**：${destination}
**天数**：${days}天
**宠物信息**：${petInfo}
**选项**：${optionDesc.length > 0 ? optionDesc.join('；') : '无'}
${needsStr}

请直接返回JSON格式数据，格式如下：
{
  "days_data": [
    {
      "day": 1,
      "theme": "第1天：主题描述",
      "spots": [
        {
          "name": "地点名称",
          "type": "sightseeing|dining|hotel|park|transport|shopping|museum",
          "time": "09:00",
          "duration": "2h",
          "pet_friendly": true,
          "note": "宠物相关注意事项"
        }
      ]
    }
  ]
}

注意事项：
- type类型：sightseeing(景点)、dining(餐厅)、hotel(酒店)、park(公园)、transport(交通)、shopping(购物)、museum(博物馆)
- 第一天第一个spot应该是抵达/出发的交通节点
- 最后一天最后一个spot应该是返程
- 每天至少安排一个park类型的地点供宠物活动
- 餐厅优先选择有室外区域或明确允许携带宠物的
- note字段要写明具体的宠物政策或建议`

  console.log('调用智谱AI生成攻略...')

  // 调用智谱API
  const response = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ZHIPU_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      max_tokens: 4096,
      top_p: 0.9
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`智谱API请求失败: ${response.status} - ${errorText}`)
  }

  const result = await response.json()

  if (result.error) {
    throw new Error(`智谱API错误: ${result.error.message || JSON.stringify(result.error)}`)
  }

  // 提取AI回复内容
  let content = result.choices?.[0]?.message?.content || ''

  // 清理内容，提取JSON
  content = content.trim()

  // 尝试提取JSON（处理可能的markdown代码块包裹）
  let jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    content = jsonMatch[1].trim()
  } else {
    // 尝试找到JSON对象开始和结束
    const startIdx = content.indexOf('{')
    const endIdx = content.lastIndexOf('}')
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      content = content.substring(startIdx, endIdx + 1)
    }
  }

  // 解析JSON
  let parsedData
  try {
    parsedData = JSON.parse(content)
  } catch (parseErr) {
    console.error('AI返回内容解析失败:', content.substring(0, 500))
    // 如果解析失败，使用模板兜底
    return generateTemplateItinerary(destination, days, pets)
  }

  // 验证并补全数据结构
  if (!parsedData.days_data || !Array.isArray(parsedData.days_data)) {
    throw new Error('AI返回的数据格式不正确')
  }

  // 确保每个spot都有必要字段
  parsedData.days_data.forEach((day, dayIndex) => {
    day.day = day.day || (dayIndex + 1)
    day.theme = day.theme || `第${day.day}天：探索${destination}`
    day.spots = day.spots || []

    day.spots.forEach((spot, spotIndex) => {
      spot.type = spot.type || 'sightseeing'
      spot.time = spot.time || ''
      spot.duration = spot.duration || '2h'
      spot.pet_friendly = spot.pet_friendly !== false  // 默认为true
      spot.note = spot.note || ''
    })

    // 如果没有spots，添加默认
    if (day.spots.length === 0) {
      day.spots = [
        { name: `${destination}景点`, type: 'sightseeing', time: '10:00', duration: '2h', pet_friendly: true, note: '' },
        { name: '宠物友好餐厅', type: 'dining', time: '12:30', duration: '1.5h', pet_friendly: true, note: '室外区域可携带宠物' },
        { name: `${destination}公园`, type: 'park', time: '15:00', duration: '2h', pet_friendly: true, note: '适合宠物活动' }
      ]
    }
  })

  console.log('AI生成成功，共', parsedData.days_data.length, '天行程')
  return parsedData
}

// 基于模板生成行程（当AI调用失败时兜底）
function generateTemplateItinerary(destination, days, pets) {
  const themes = ['抵达与初探', '深度游览', '文化体验', '休闲放松', '自然风光', '美食探索', '购物娱乐']
  const daysData = []

  for (let i = 1; i <= days; i++) {
    const spots = []

    // 第一天加抵达
    if (i === 1) {
      spots.push({ name: '抵达/出发', type: 'transport', time: '09:00', duration: '1h', pet_friendly: true, note: '' })
    }

    spots.push(
      { name: `${destination}热门景点`, type: 'sightseeing', time: '10:00', duration: '2h', pet_friendly: true, note: '建议提前查询宠物政策' },
      { name: '宠物友好餐厅', type: 'dining', time: '12:30', duration: '1.5h', pet_friendly: true, note: '室外区域通常允许携带宠物' },
      { name: `${destination}城市公园`, type: 'park', time: '15:00', duration: '2h', pet_friendly: true, note: '适合宠物活动和休息' },
      { name: '特色街区漫步', type: 'sightseeing', time: '17:30', duration: '1.5h', pet_friendly: true, note: '开放式街区适合遛宠' }
    )

    // 最后一天加返程
    if (i > 1 && i === days) {
      spots.push({ name: '返程', type: 'transport', time: '19:00', duration: '1h', pet_friendly: true, note: '' })
    }

    daysData.push({
      day: i,
      theme: `第${i}天：${destination}${themes[(i - 1) % themes.length]}`,
      spots
    })
  }

  return {
    itinerary_id: 'TEMPLATE_' + Date.now(),
    title: `${destination}${days}日宠物友好之旅`,
    destination,
    days,
    days_data: daysData
  }
}
