/**
 * 图片处理工具
 * 支持宠物品种识别、场景识别、食物安全检测、OCR等
 */

const BaseTool = require('./base')
const zhipuClient = require('../llm/zhipu_client')
const { logger } = require('../utils/logger')

// ==================== Vision Prompts ====================

const VISION_PROMPTS = {
  general: '请详细描述这张图片的内容，包括主要物体、场景、颜色等。用简洁但完整的中文回答。',

  pet_breed: `你是一位专业的宠物品种鉴定专家，拥有10年以上的宠物鉴定经验。
请仔细观察图片中的宠物，进行全面的品种分析。

## 分析要求
1. **品种识别**：主要品种是什么？如果无法100%确定，列出2-3个可能品种及概率
2. **外观特征**：年龄范围估计、体型大小、毛色毛质、特殊标记
3. **健康状况初步观察**：毛发状态、体态、眼神精神（仅外观观察，不能替代兽医诊断）
4. **性格推测**：基于品种特征的典型性格、活动量需求、社交性、训练难度
5. **旅行适应性评估**：是否适合旅行？出行注意事项？推荐交通方式？

请以结构化JSON格式返回：
{
  "breed": "品种名称",
  "confidence": 0.95,
  "alternatives": ["备选1", "备选2"],
  "age_range": "年龄范围",
  "size": "small|medium|large|xlarge",
  "coat_color": "毛色",
  "health_appearance": "健康外观描述",
  "personality_traits": ["性格1", "性格2"],
  "activity_level": "low|medium|high|very_high",
  "travel_suitability": {
    "score": 9,
    "pros": ["优点1", "优点2"],
    "cons": ["注意点1", "注意点2"],
    "special_needs": ["特殊需求"]
  }
}`,

  scene: `你是一位旅行目的地识别专家，同时是资深宠物旅行顾问。
请分析这张图片的场景信息：

## 识别任务
1. **地点识别**：哪个城市/地区？什么类型场所？具体名称？
2. **环境分析**：室内/室外？空间大小？人流密度？宠物设施？
3. **宠物友好度评估**：
   - 🟢 友好指标：空间开阔度、地面材质、绿植、安静程度
   - 🟡 需要注意：禁入标识、人流、潜在危险
   - 🔴 不推荐情况
4. **实用建议**：最佳来访时间、活动方式、携带物品、替代方案

请以JSON格式返回，包含 pet_friendly_score (1-10) 和详细建议。`,

  food_safety: `【紧急重要】你是宠物营养学和毒理学专家。
用户上传食物照片询问对宠物是否安全。这关系到生命安全！

## 分析任务
1. **食物识别**：名称、制作方式、份量、可见配料
2. **安全性判定**：
   - ✅ 安全：可以适量喂食
   - ⚠️ 限量：控制量
   - ❌ 危险：不能喂食
   - ☠️ 极危：可能有生命危险
3. **毒性成分分析**（如有毒）
4. **中毒症状清单**：早期/中期/晚期症状
5. **应急处理指南**：<2小时和>2小时的处理方法
6. **安全替代推荐**

请以JSON格式返回，必须包含 is_safe (boolean), risk_level (1-5), toxicity_details 等字段。`,

  ocr: '请准确提取图片中的所有文字内容，保持原有顺序和段落结构。如果文字模糊标注[模糊]。直接输出提取的文字。',

  compare: '请对比这两张图片，列出相同点和不同点，分析变化说明了什么。'
}

class VisionTool extends BaseTool {
  static get schema() {
    return {
      name: 'vision_analyze',
      description: '分析图片内容，支持宠物品种识别、场景识别、食物安全检测、OCR文字提取等',
      parameters: {
        type: 'object',
        properties: {
          image_url: {
            type: 'string',
            description: '图片URL或Base64编码'
          },
          images: {
            type: 'array',
            items: { type: 'string' },
            description: '多张图片URL数组（用于对比）'
          },
          task_type: {
            type: 'string',
            enum: ['general', 'pet_breed', 'scene', 'food_safety', 'ocr', 'compare'],
            description: '分析任务类型'
          },
          question: {
            type: 'string',
            description: '针对图片的问题（可选）'
          },
          pet_type: {
            type: 'string',
            enum: ['dog', 'cat', 'rabbit', 'bird', 'other'],
            description: '宠物类型（food_safety任务需要）'
          }
        },
        required: ['image_url', 'task_type']
      }
    }
  }

  async execute(params) {
    const { 
      image_url, 
      images, 
      task_type = 'general', 
      question = '', 
      pet_type = 'dog' 
    } = params

    // 校验图片URL（过滤无效/不可访问的URL）
    const blockedPatterns = [
      /qlogo\.cn/i,           // 微信头像CDN，服务端无法直接fetch
      /thirdwx\.qq\.com/i,    // 微信域名
      /avatar/i               // 头像类链接
    ]
    
    const urlToCheck = (images && images.length > 0 ? images[0] : image_url)
    if (urlToCheck && blockedPatterns.some(p => p.test(urlToCheck))) {
      return {
        success: false,
        error: '暂不支持分析微信头像图片，请选择相册中的实物照片'
      }
    }

    // 获取对应prompt
    let prompt = VISION_PROMPTS[task_type] || VISION_PROMPTS.general

    // 对于食物安全检测，注入宠物类型
    if (task_type === 'food_safety') {
      prompt = prompt.replace('宠物', pet_type === 'dog' ? '狗' : pet_type === 'cat' ? '猫' : '宠物')
    }

    // 处理图片输入
    const imageInput = images && images.length > 0 ? images : image_url

    logger.info('VisionTool', `执行${task_type}任务`)

    // 调用视觉API
    const result = await zhipuClient.visionAnalyze({
      image: imageInput,
      prompt,
      question,
      maxTokens: 1024  // glm-4v-flash 限制 max_tokens 范围 [1, 1024]
    })

    // 尝试解析JSON结果
    let parsedResult
    try {
      // 提取JSON
      let content = result.content.trim()
      
      // 处理markdown代码块包裹
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        content = jsonMatch[1].trim()
      } else {
        const startIdx = content.indexOf('{')
        const endIdx = content.lastIndexOf('}')
        if (startIdx !== -1 && endIdx > startIdx) {
          content = content.substring(startIdx, endIdx + 1)
        }
      }

      parsedResult = JSON.parse(content)
    } catch (e) {
      // JSON解析失败，保留原始文本
      logger.warn('VisionTool', 'JSON解析失败，使用原始文本')
      parsedResult = {
        raw_text: result.content,
        parse_error: true
      }
    }

    return {
      taskType: task_type,
      result: parsedResult,
      rawContent: result.content,
      usage: result.usage
    }
  }
}

module.exports = VisionTool
