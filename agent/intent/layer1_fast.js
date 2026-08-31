/**
 * Layer 1: 快速拦截层 (Fast Intercept Layer)
 * 
 * 设计原则：
 * - 零误判、极速响应（< 1ms）
 * - 覆盖高频确定性场景
 * - 命中后直接返回，跳过后续层
 */

const logger = require('../utils/logger')
const config = require('../config')

class Layer1FastIntercept {
  constructor() {
    // 紧急意图关键词（最高优先级）
    this.emergencyPatterns = [
      /急诊|急救|救命|快不行了|紧急/,
      /中毒|误食|吞了|吃错/,
      /出血|流血|伤口|抓伤|咬伤|撞伤|摔伤|骨折/,
      /抽搐|痉挛|晕倒|昏迷|休克|瘫痪|癫痫/,
      /吐血|拉血|便血|尿血|腹泻不止/,
      /呼吸困难|喘不过气|中暑|高烧/
    ]

    // 精确闲聊模式
    this.chitChatPatterns = [
      /^(你好|您好|hi|hello|嗨|嘿|hiya)$/i,
      /^(早上好|中午好|晚上好|晚安)$/i,
      /^(谢谢|谢谢你|感谢|多谢|谢了|thx|thanks)$/i,
      /^(再见|拜拜|bye|byebye|下次聊|回头聊)$/i,
      /^(在吗|在不在|有人吗|听得到吗)$/i,
      /^(你好啊|您好啊|哈喽|hello啊)$/i
    ]

    // Off-topic 快速排除模式
    this.offTopicPatterns = [
      /股票|基金|证券|期货|外汇|比特币|区块链|币圈/,
      /代码|编程|程序|开发|debug|API|接口|部署|服务器/,
      /政治|政府|国家领导人|党派|选举|投票/,
      /游戏攻略|游戏通关|装备搭配|技能加点/,
      /电影推荐|音乐推荐|歌曲推荐|综艺推荐/,
      /体育比分|比赛结果|球队|球员转会/,
      /作业|考试|论文|毕业|学校|老师|同学/,
      /相亲|约会|恋爱|分手|结婚|离婚/
    ]
  }

  /**
   * 执行快速拦截
   * @param {Object} input - 用户输入 { message, images, ... }
   * @returns {Object|null} 命中时返回结果，未命中返回 null
   */
  intercept(input) {
    const { message = '', images = [] } = input

    if (!message || typeof message !== 'string') {
      return null
    }

    const trimmedMessage = message.trim()

    // ── 1. 紧急意图检测（最高优先级）──
    const emergencyResult = this._checkEmergency(trimmedMessage)
    if (emergencyResult) {
      logger.info('Layer1', `紧急意图命中: ${emergencyResult.intent}`)
      return emergencyResult
    }

    // ── 2. 图片+明确指令检测 ──
    if (images && images.length > 0) {
      const imageIntentResult = this._checkImageIntent(trimmedMessage, images)
      if (imageIntentResult) {
        logger.info('Layer1', `图片意图命中: ${imageIntentResult.intent}`)
        return imageIntentResult
      }
    }

    // ── 3. 精确闲聊检测 ──
    const chitChatResult = this._checkChitChat(trimmedMessage)
    if (chitChatResult) {
      logger.debug('Layer1', `闲聊命中: ${trimmedMessage}`)
      return chitChatResult
    }

    // ── 4. Off-topic 快速排除 ──
    const offTopicResult = this._checkOffTopic(trimmedMessage)
    if (offTopicResult) {
      logger.debug('Layer1', `Off-topic 排除: ${trimmedMessage}`)
      return offTopicResult
    }

    // 未命中，放行到 Layer 2
    return null
  }

  // ══════════════════════════════════════════════════════════
  // 内部检测方法
  // ══════════════════════════════════════════════════════════

  /**
   * 检测紧急意图
   */
  _checkEmergency(message) {
    for (const pattern of this.emergencyPatterns) {
      if (pattern.test(message)) {
        return {
          intent: 'emergency_help',
          confidence: 1.0,
          source: 'layer1_emergency',
          skipLowerLayers: true,
          params: {
            urgencyLevel: 'high',
            rawMessage: message
          },
          reason: '紧急关键词匹配'
        }
      }
    }
    return null
  }

  /**
   * 检测图片相关意图
   */
  _checkImageIntent(message, images) {
    // 图片 + 品种识别问题
    if (this._matchImageQuestion(message, [
      '什么品种', '是什么狗', '是什么猫', '帮我看看我家宠物', '识别品种',
      '这是啥品种', '这是什么狗', '这是什么猫', '帮我鉴定', '看看是什么',
      '认不出来', '纯不纯', '是纯种的吗', '混血', '串串'
    ])) {
      return {
        intent: 'pet_breed_recognition',
        confidence: 0.98,
        source: 'layer1_image_breed',
        skipLowerLayers: true,
        params: { hasImage: true, imageCount: images.length },
        reason: '图片+品种识别问题'
      }
    }

    // 图片 + 场景/地点识别
    if (this._matchImageQuestion(message, [
      '这是哪里', '这个景点', '这个地方', '拍照地点', '识别场景',
      '在哪儿拍的', '这是哪个景区', '这个地方叫什么', '景点名称'
    ])) {
      return {
        intent: 'scene_recognition',
        confidence: 0.98,
        source: 'layer1_image_scene',
        skipLowerLayers: true,
        params: { hasImage: true, imageCount: images.length },
        reason: '图片+场景识别问题'
      }
    }

    // 图片 + 食物检测
    if (this._matchImageQuestion(message, [
      '能吃吗', '有毒吗', '安全吗', '可以吃', '可以喂',
      '狗狗能吃', '猫咪能吃', '宠物能吃', '有没有毒'
    ])) {
      return {
        intent: 'food_detection',
        confidence: 0.95,
        source: 'layer1_image_food',
        skipLowerLayers: true,
        params: { hasImage: true, imageCount: images.length },
        reason: '图片+食物安全问题'
      }
    }

    // 有图片但无明确问题 → 通用图片分析
    if (message.length === 0 || message === '[图片]' || message === '图片') {
      return {
        intent: 'image_analysis',
        confidence: 0.90,
        source: 'layer1_image_generic',
        skipLowerLayers: true,
        params: { hasImage: true, imageCount: images.length },
        reason: '纯图片上传，通用分析'
      }
    }

    return null
  }

  /**
   * 检测精确闲聊
   */
  _checkChitChat(message) {
    for (const pattern of this.chitChatPatterns) {
      if (pattern.test(message)) {
        return {
          intent: 'chit_chat',
          confidence: 0.99,
          source: 'layer1_chitchat',
          skipLowerLayers: true,
          params: {},
          reason: '精确闲聊短语匹配'
        }
      }
    }
    return null
  }

  /**
   * 检测 Off-topic
   */
  _checkOffTopic(message) {
    for (const pattern of this.offTopicPatterns) {
      if (pattern.test(message)) {
        return {
          intent: 'off_topic',
          confidence: 0.95,
          source: 'layer1_offtopic',
          skipLowerLayers: true,
          params: { blockedCategory: this._detectCategory(message, pattern) },
          reason: '明显无关话题快速排除'
        }
      }
    }
    return null
  }

  /**
   * 匹配图片相关问题
   */
  _matchImageQuestion(message, questionPatterns) {
    if (!message || message.length === 0) return false
    return questionPatterns.some(pattern => message.includes(pattern))
  }

  /**
   * 检测被拦截的话题类别
   */
  _detectCategory(message, matchedPattern) {
    if (/股票|基金|证券|期货/i.test(message)) return '金融投资'
    if (/代码|编程|程序|开发|API/i.test(message)) return '技术开发'
    if (/政治|政府|领导人|党派/i.test(message)) return '政治敏感'
    if (/游戏攻略|通关|装备|技能/i.test(message)) return '游戏娱乐'
    if (/电影|音乐|歌曲|综艺/i.test(message)) return '文娱内容'
    if (/体育比分|比赛|球队|球员/i.test(message)) return '体育竞技'
    if (/作业|考试|论文|毕业|学校/i.test(message)) return '教育学习'
    if (/相亲|约会|恋爱|分手|结婚/i.test(message)) return '情感关系'
    return '其他无关话题'
  }
}

// 单例导出
let instance = null
function getInstance() {
  if (!instance) {
    instance = new Layer1FastIntercept()
  }
  return instance
}

module.exports = {
  Layer1FastIntercept,
  getInstance
}
