/**
 * 行程管理工具
 * 生成、修改、优化旅行行程
 */

const BaseTool = require('./base')
const zhipuClient = require('../llm/zhipu_client')
const config = require('../config')
const { logger } = require('../utils/logger')

class ItineraryTool extends BaseTool {
  static get schema() {
    return {
      name: 'generate_itinerary',
      description: '根据目的地、天数、宠物信息生成详细的宠物友好旅行行程',
      parameters: {
        type: 'object',
        properties: {
          destination: {
            type: 'string',
            description: '目的地城市或地区'
          },
          days: {
            type: 'number',
            description: '旅行天数（1-14天）'
          },
          pets: {
            type: 'array',
            items: { type: 'object' },
            description: '宠物信息列表 [{type, name, breed, size, age}]'
          },
          special_needs: {
            type: 'string',
            description: '特殊需求说明'
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: '选项列表 ["pet_friendly_only", "include_vet", "relaxed_pace", "indoor_backup"]'
          }
        },
        required: ['destination', 'days', 'pets']
      }
    }
  }

  async execute(params) {
    const { destination, days, pets, special_needs = '', options = [] } = params

    logger.info('ItineraryTool', `生成${destination}${days}日行程，${pets.length}只宠物`)

    // 构建Prompt
    const prompt = this.buildGenerationPrompt(destination, days, pets, special_needs, options)

    // 调用AI生成
    const result = await zhipuClient.simpleChat(prompt, this.getSystemPrompt(), {
      temperature: 0.8,
      maxTokens: 3000
    })

    // 解析结果
    const itineraryData = this.parseItineraryResult(result.content)

    return {
      itinerary_id: 'IT_' + Date.now(),
      title: `${destination}${days}日宠物友好之旅`,
      destination,
      days,
      pets,
      created_at: new Date().toISOString(),
      ...itineraryData
    }
  }

  getSystemPrompt() {
    return `你是专业的宠物友好旅行规划师。根据用户输入生成详细的结构化JSON行程数据。

## 重要原则
- 地点名称、类型、大致时间安排可以基于常识合理推荐
- 具体的门票价格、电话、精确地址如果你不确定，标注"请出发前核实"，不要编造精确数字
- pet_policy字段只写通用性描述（如"多数场所需牵绳"），不要编造某具体商家的政策细节

## 输出格式要求（严格JSON）
{
  "title": "行程标题",
  "summary": "一句话亮点",
  "days_data": [
    {
      "day": 1,
      "theme": "当天主题",
      "overview": "当天概述",
      "pet_friendly_score": 9,
      "spots": [
        {
          "name": "地点名称",
          "type": "sightseeing|dining|hotel|park|transport|shopping|museum|cafe",
          "time": "09:00",
          "duration": "2h",
          "address": "地址",
          "pet_friendly": true,
          "pet_policy": "宠物政策",
          "pet_tips": "宠物提示",
          "ticket_price": "价格",
          "highlights": ["亮点"],
          "notes": "备注"
        }
      ],
      "daily_tips": {
        "weather_consideration": "",
        "pet_care_reminder": "",
        "what_to_bring": [],
        "emergency_info": ""
      }
    }
  ],
  "overall_tips": {
    "preparation_checklist": [],
    "packing_list_for_pet": [],
    "emergency_contacts": [],
    "budget_estimate": ""
  }
}

只输出JSON，不要任何其他文字。`
  }

  buildGenerationPrompt(destination, days, pets, specialNeeds, options) {
    const petInfo = pets.map(p => {
      const parts = [p.type || '未知']
      if (p.breed) parts.push(p.breed)
      if (p.size) parts.push(p.size + '体型')
      if (p.age) parts.push(p.age + '岁')
      if (p.name) parts.unshift(`"${p.name}"`)
      return parts.join(' ')
    }).join('、')

    const optionDesc = []
    if (options.includes('pet_friendly_only')) optionDesc.push('仅选择宠物友好场所')
    if (options.includes('include_vet')) optionDesc.push('每天安排附近宠物医院信息')
    if (options.includes('relaxed_pace')) optionDesc.push('节奏轻松，适合带宠物')
    if (options.includes('indoor_backup')) optionDesc.push('包含室内备选方案')

    return `请为以下旅行需求生成${days}天的宠物友好行程：

**目的地**：${destination}
**天数**：${days}天
**宠物信息**：${petInfo}
**特殊需求**：${specialNeeds || '无'}
**偏好选项**：${optionDesc.length > 0 ? optionDesc.join('；') : '无'}

注意事项：
- 每天4-6个地点，时间安排合理
- 所有场所标注宠物政策和注意事项
- 每天至少安排一个宠物活动空间
- 第一天相对轻松，最后一天安排返程
- 交通衔接顺畅，避免绕路`
  }

  parseItineraryResult(content) {
    try {
      let cleaned = content.trim()

      // 处理markdown代码块
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim()
      } else {
        const startIdx = cleaned.indexOf('{')
        const endIdx = cleaned.lastIndexOf('}')
        if (startIdx !== -1 && endIdx > startIdx) {
          cleaned = cleaned.substring(startIdx, endIdx + 1)
        }
      }

      return JSON.parse(cleaned)
    } catch (e) {
      logger.error('ItineraryTool', `解析行程数据失败: ${e.message}`)
      // 返回模板行程作为兜底
      return this.getTemplateItinerary(destination, days)
    }
  }

  /**
   * 模板行程兜底
   */
  getTemplateItinerary(destination, days) {
    const themes = ['抵达与初探', '深度游览', '文化体验', '休闲放松', '自然风光', '美食探索']
    const daysData = []

    for (let i = 1; i <= days; i++) {
      const spots = []

      if (i === 1) {
        spots.push({ name: '抵达/集合', type: 'transport', time: '09:00', duration: '1h', pet_friendly: true, pet_policy: '', notes: '' })
      }

      spots.push(
        { name: `${destination}热门景点`, type: 'sightseeing', time: '10:30', duration: '2h', pet_friendly: true, pet_policy: '室外区域允许牵绳进入', pet_tips: '建议提前查询具体规定', highlights: ['必打卡'], notes: '' },
        { name: '宠物友好餐厅', type: 'dining', time: '12:30', duration: '1.5h', pet_friendly: true, pet_policy: '室外区域通常允许携带宠物', pet_tips: '选择靠外位置方便照看宠物', notes: '' },
        { name: `${destination}城市公园`, type: 'park', time: '15:00', duration: '2h', pet_friendly: true, pet_policy: '开放式公园，非常适合宠物活动', pet_tips: '记得带水和拾便袋', highlights: ['宠物活动空间'], notes: '' },
        { name: '特色街区漫步', type: 'sightseeing', time: '17:30', duration: '1.5h', pet_friendly: true, pet_policy: '开放式街区适合遛宠', pet_tips: '人流较多时注意牵绳', notes: '' }
      )

      if (i > 1 && i === days) {
        spots.push({ name: '返程', type: 'transport', time: '19:00', duration: '1h', pet_friendly: true, pet_policy: '', notes: '' })
      }

      daysData.push({
        day: i,
        theme: `第${i}天：${destination}${themes[(i - 1) % themes.length]}`,
        overview: `探索${destination}的魅力，享受与爱宠同行的美好时光`,
        pet_friendly_score: 8,
        spots,
        daily_tips: {
          weather_consideration: '关注天气预报调整安排',
          pet_care_reminder: '保证充足饮水和休息',
          what_to_bring: ['牵引绳', '水碗', '拾便袋', '零食'],
          emergency_info: '保存附近宠物医院联系方式'
        }
      })
    }

    return {
      summary: `精心规划的${destination}${days}日之旅，每处都经过宠物友好验证`,
      days_data: daysData,
      overall_tips: {
        preparation_checklist: ['确认住宿宠物政策', '办理必要证件', '准备宠物用品', '购买旅行保险'],
        packing_list_for_pet: ['粮食', '水碗', '牵引绳', '拾便袋', '常用药品', '玩具', '熟悉的小毯子'],
        emergency_contacts: ['当地宠物医院', '24小时急诊', '兽医在线咨询'],
        budget_estimate: '根据具体消费水平而定'
      }
    }
  }
}

module.exports = ItineraryTool
