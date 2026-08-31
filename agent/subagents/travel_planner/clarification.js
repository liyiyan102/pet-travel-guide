/**
 * 澄清策略引擎 — 决定何时以及如何向用户反问
 * 
 * 核心职责：
 * 1. 必填槽位缺失 → 反问缺失项
 * 2. 槽位冲突 → 友好提示并请求确认
 * 3. 槽位歧义 → 提供选项让用户选择
 * 4. 多轮澄清管理 → 避免重复问同一个问题
 * 
 * 设计原则：
 * - 一次最多问 2-3 个问题，避免信息过载
 * - 优先级高的槽位优先询问
 * - 结合上下文智能推断，减少不必要的提问
 * - 语气自然友好，像真人对话
 */

const { logger } = require('../../utils/logger')

// ═══════════════════════════════════════════════════════════
// 澄清策略配置
// ═══════════════════════════════════════════════════════════

const CLARIFICATION_CONFIG = {
  // 单次最多询问的槽数量（V2.5：最多2个，避免信息过载）
  maxQuestionsPerTurn: 2,
  
  // 各槽位的优先级权重
  slotPriority: {
    destination: 100,  // P0
    petType: 90,       // P0
    days: 80,          // P1
    origin: 70,        // P1
    transport: 60,     // P1
    petCount: 40,      // P2 有默认值
    budget: 30,        // P2
    departureDate: 25, // P2
    preference: 20     // P2
  },

  // Readiness 阈值（≥70 直接规划，不进入澄清）
  readinessThreshold: 70,

  // 智能推断规则
  inferenceRules: [
    {
      condition: (slots) => slots.departureDate && /周末/.test(slots.departureDate),
      inference: { days: 2 },
      skipAsk: true
    },
    {
      condition: (slots) => !slots.petCount,
      inference: { petCount: 1 },
      skipAsk: true
    },
    {
      condition: (slots) => !slots.transport,
      inference: { transport: '未指定' },
      skipAsk: true
    }
  ]
}

// ═══════════════════════════════════════════════════════════
// 澄清模板库
// ═══════════════════════════════════════════════════════════

const TEMPLATES = {
  singleSlot: {
    destination: [
      '您想去哪里玩呢？可以说城市或者具体景点～',
      '这次旅行的目的地是哪里呀？',
      '有什么心仪的目的地吗？'
    ],
    days: [
      '计划玩几天呢？',
      '行程安排几天比较合适？',
      '大概玩多久？'
    ],
    origin: [
      '您从哪个城市出发？',
      '从哪里出发去呢？'
    ],
    petType: [
      '带什么宠物出门呀？🐶🐱',
      '是带狗狗还是猫咪去玩？'
    ],
    petCount: [
      '一共带几只宠物？',
      '几只小伙伴一起出发？'
    ]
  },

  combined: {
    'destination+days': [
      '想去哪里玩？计划几天呢？',
      '告诉我目的地和行程天数就好啦～'
    ],
    'origin+destination': [
      '从哪里出发，要去哪里呀？',
      '出发地和目的地分别是？'
    ],
    'origin+destination+days': [
      '从哪出发、去哪玩、玩几天？这三点告诉我就可以开始规划啦！',
      '简单说下出发地、目的地和天数就行～'
    ]
  },

  conflict: {
    unreasonable_days: [
      '{days}天玩这么多景点可能会有点赶哦，建议适当延长行程或精简景点，您觉得呢？'
    ],
    insufficient_budget: [
      '预算{budget}对于{days}天的行程可能会有些紧张哦，最少可能需要{suggested}左右呢。'
    ],
    general: ['温馨提示：{message}']
  },

  ambiguity: [
    '您说的"{value}"有好几个地方呢，请问是指：\n{options}'
  ],

  ready: [
    '好的，信息都齐了！正在为您生成攻略...',
    '收到！马上为您规划{destination}{days}日游攻略～',
    '完美！开始为您定制专属行程✨'
  ]
}

class ClarificationEngine {
  constructor() {
    this.config = CLARIFICATION_CONFIG
    this.templates = TEMPLATES
    this.askedSlots = new Map()
  }

  /**
   * 核心方法：分析是否需要澄清（V2.5 升级）
   * @param extractionResult 槽位提取结果（已经过 Slot Merge）
   * @param sessionId 会话ID
   * @param readinessScore Planning Readiness Score（0-100）
   */
  analyze(extractionResult, sessionId = 'default', readinessScore = 0) {
    const { slots, missing, conflicts, ambiguities } = extractionResult

    if (!this.askedSlots.has(sessionId)) {
      this.askedSlots.set(sessionId, new Set())
    }
    const sessionAsked = this.askedSlots.get(sessionId)

    const decision = {
      needClarify: false,
      type: null,
      questions: [],
      suggestions: [],
      isReady: false,
      askedSlotNames: [],
      readinessScore
    }

    // Readiness >= 70：直接进入规划，不澄清
    if (readinessScore >= this.config.readinessThreshold) {
      decision.isReady = true
      decision.needClarify = false
      logger.info('ClarificationEngine', `Readiness ${readinessScore} >= ${this.config.readinessThreshold}，直接规划`)
      return decision
    }

    // 处理冲突
    if (conflicts.length > 0) {
      this._handleConflicts(conflicts, decision)
    }

    // 处理歧义
    if (ambiguities.length > 0) {
      this._handleAmbiguities(ambiguities, decision)
    }

    // 处理缺失（V2.5：只询问 P0/P1 缺失，P2 有默认值不问）
    const p0p1Missing = missing.filter(m => {
      const def = SLOT_DEFINITIONS[m.name]
      return def && (def.level === 'P0' || def.level === 'P1') && !sessionAsked.has(m.name)
    })

    if (p0p1Missing.length > 0) {
      this._applyInference(slots, p0p1Missing)
      const stillMissing = p0p1Missing.filter(m => !slots[m.name] && m.name !== 'transport')

      if (stillMissing.length > 0) {
        this._handleMissingSlots(stillMissing, decision, sessionAsked)
      }
    }

    decision.isReady = readinessScore >= this.config.readinessThreshold
    decision.needClarify = !decision.isReady || decision.questions.length > 0

    logger.info('ClarificationEngine', `readiness=${readinessScore}, needClarify=${decision.needClarify}, questions=${decision.questions.length}`)

    return decision
  }

  /**
   * 生成澄清回复
   */
  generateResponse(decision, extractionResult) {
    if (decision.isReady && decision.questions.length === 0) {
      const template = this._pickTemplate(this.templates.ready)
      return {
        type: 'ready',
        content: template
          .replace('{destination}', extractionResult.slots.destination || '')
          .replace('{days}', extractionResult.slots.days || ''),
        shouldProceed: true
      }
    }

    const parts = []

    if (decision.suggestions.length > 0) {
      parts.push(decision.suggestions.join('\n'))
    }

    if (decision.questions.length > 0) {
      const missingQuestions = decision.questions.filter(q => q.type === 'missing')
      
      if (missingQuestions.length === 1) {
        parts.push(missingQuestions[0].content)
      } else if (missingQuestions.length > 1) {
        const comboKey = missingQuestions.map(q => q.slot).sort().join('+')
        const comboTemplate = this.templates.combined[comboKey]
        parts.push(comboTemplate 
          ? this._pickTemplate(comboTemplate) 
          : missingQuestions.map(q => q.content).join(' '))
      }

      const ambiguityQ = decision.questions.find(q => q.type === 'ambiguity')
      if (ambiguityQ) parts.push(ambiguityQ.content)
    }

    return {
      type: decision.type || 'clarification',
      content: parts.join('\n\n'),
      shouldProceed: false,
      askedSlots: decision.askedSlotNames
    }
  }

  resetSession(sessionId) {
    this.askedSlots.delete(sessionId)
  }

  markAsAsked(sessionId, slotName) {
    if (this.askedSlots.has(sessionId)) {
      this.askedSlots.get(sessionId).add(slotName)
    }
  }

  // ════════════════════════════════════════════════════════

  _handleConflicts(conflicts, decision) {
    for (const conflict of conflicts) {
      const template = this.templates.conflict[`${conflict.slot}_${conflict.type}`] ||
                       this.templates.conflict.general
      
      const msg = this._pickTemplate(template)
        .replace(/{(\w+)}/g, (_, key) => conflict[key] || conflict.message)
      
      decision.suggestions.push(msg)
      if (conflict.type === 'critical') {
        decision.type = decision.type ? 'mixed' : 'conflict'
      }
    }
  }

  _handleAmbiguities(ambiguities, decision) {
    for (const ambiguity of ambiguities) {
      const optionsText = ambiguity.candidates
        .map((c, i) => `${i + 1}. ${c}`)
        .join('\n')
      
      const template = this._pickTemplate(this.templates.ambiguity)
      decision.questions.push({
        slot: ambiguity.slot,
        type: 'ambiguity',
        content: template.replace('{value}', ambiguity.value).replace('{options}', optionsText),
        candidates: ambiguity.candidates
      })
      decision.type = decision.type ? 'mixed' : 'ambiguity'
    }
  }

  /**
   * 处理缺失槽位（V2.5：聚合缺失，一次性询问最多2个）
   * 文档建议：
   * - 缺1个关键字段 → 问1个
   * - 缺2个字段 → 一次性询问两个，不逐个追问
   * - 缺3个及以上 → 进入结构化澄清，但避免超过2轮
   */
  _handleMissingSlots(missing, decision, sessionAsked) {
    const sorted = [...missing].sort((a, b) => {
      return (this.config.slotPriority[b.name] || 50) - (this.config.slotPriority[a.name] || 50)
    })

    // 最多问 2 个（V2.5 限制）
    const toAsk = sorted.slice(0, this.config.maxQuestionsPerTurn)

    // 一次性聚合询问（根据数量选择不同话术）
    if (toAsk.length >= 2) {
      const key = toAsk.map(s => s.name).join('+')
      const combinedTemplate = this.templates.combined[key] || this.templates.combined['origin+destination'] ||
        [`还需要两个信息才能帮您规划：\n① ${this._getPrompt(toAsk[0])}\n② ${this._getPrompt(toAsk[1])}`]

      decision.questions.push({
        slot: toAsk.map(s => s.name),
        type: 'missing_combined',
        content: this._pickTemplate(combinedTemplate)
      })
      toAsk.forEach(s => {
        decision.askedSlotNames.push(s.name)
        sessionAsked.add(s.name)
      })
    } else if (toAsk.length === 1) {
      const slotDef = toAsk[0]
      const template = this.templates.singleSlot[slotDef.name] ||
                       [`${this._getPrompt(slotDef)}`]
      decision.questions.push({
        slot: slotDef.name,
        type: 'missing',
        content: this._pickTemplate(template)
      })
      decision.askedSlotNames.push(slotDef.name)
      sessionAsked.add(slotDef.name)
    }

    if (toAsk.length > 0) {
      decision.type = decision.type ? 'mixed' : 'missing'
    }
  }

  _getPrompt(slotDef) {
    const def = SLOT_DEFINITIONS[slotDef.name]
    return slotDef.prompt || def?.clarificationPrompt || `请提供${slotDef.name}信息`
  }

  _applyInference(slots, missing) {
    for (const rule of this.config.inferenceRules) {
      try {
        if (rule.condition(slots)) {
          Object.assign(slots, rule.inference)
          logger.info('ClarificationEngine', `智能推断: ${JSON.stringify(rule.inference)}`)
        }
      } catch (e) {
        // ignore
      }
    }
  }

  _checkRequiredFilled(slots) {
    // V2.5：只检查 P0 核心槽位（destination + petType）
    return ['destination', 'petType'].every(s => slots[s])
  }

  _pickTemplate(arr) {
    return arr[Math.floor(Math.random() * arr.length)]
  }
}

// 访问 SLOT_DEFINITIONS（从 slot_manager 引入）
let SLOT_DEFINITIONS = {}
try {
  SLOT_DEFINITIONS = require('./slot_manager').SLOT_DEFINITIONS || {}
} catch (e) {
  // fallback：内联定义
}

module.exports = new ClarificationEngine()
