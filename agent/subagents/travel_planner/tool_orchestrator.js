/**
 * 工具编排器 — 决定调用哪些能力、如何组合、串行还是并行
 * 
 * 核心职责：
 * 1. 根据用户意图和已填充槽位，决定工具调用策略
 * 2. 构建执行计划（DAG：有向无环图）
 * 3. 并行调度无依赖的任务
 * 4. 串行执行有依赖关系的任务
 * 5. 整合多工具结果为统一输出
 */

const { logger } = require('../../utils/logger')

// ═══════════════════════════════════════════════════════════
// 工具能力注册表
// ═══════════════════════════════════════════════════════════

const TOOL_CAPABILITIES = {
  poi_search: {
    name: 'POI检索',
    toolName: 'search_poi',
    description: '搜索目的地的宠物友好场所（餐厅/公园/酒店/景点）',
    estimatedTime: 800,
    parallelizable: true,
    dependencies: [],
    requiredSlots: ['destination'],
    optionalSlots: ['preference', 'petType']
  },

  city_policy: {
    name: '城市政策查询',
    toolName: 'city_policy_skill',
    description: '查询目的地城市的养犬规定、公共场所政策等',
    estimatedTime: 300,
    parallelizable: true,
    dependencies: [],
    requiredSlots: ['destination'],
    optionalSlots: ['petType']
  },

  weather_query: {
    name: '天气查询',
    toolName: 'weather',
    description: '查询目的地天气情况，用于行程安排建议',
    estimatedTime: 500,
    parallelizable: true,
    dependencies: [],
    requiredSlots: ['destination'],
    optionalSlots: ['departureDate', 'days']
  },

  breed_risk_check: {
    name: '品种风险评估',
    toolName: 'breed_risk_skill',
    description: '评估特定品种出行的风险和注意事项',
    estimatedTime: 200,
    parallelizable: true,
    dependencies: [],
    requiredSlots: ['petType'],
    optionalSlots: ['destination', 'days']
  },

  travel_checklist: {
    name: '出行清单生成',
    toolName: 'travel_checklist_skill',
    description: '根据行程生成出行必备物品清单',
    estimatedTime: 400,
    parallelizable: true,
    dependencies: [],
    requiredSlots: ['destination', 'days', 'petType'],
    optionalSlots: ['travelMode']
  },

  itinerary_generation: {
    name: '行程生成(LLM)',
    toolName: 'llm_itinerary',
    description: '基于POI和政策数据，LLM生成每日详细行程',
    estimatedTime: 3000,
    parallelizable: false,
    dependencies: ['poi_search', 'city_policy'],
    requiredSlots: ['destination', 'days', 'petType'],
    optionalSlots: ['budget', 'preference', 'origin', 'travelMode', 'petCount']
  }
}

// ═══════════════════════════════════════════════════════════
// 策略模板
// ═══════════════════════════════════════════════════════════

const STRATEGY_TEMPLATES = {
  standard_itinerary: {
    phases: [
      { name: 'data_collection', type: 'parallel', tools: ['poi_search', 'city_policy', 'weather_query', 'breed_risk_check'] },
      { name: 'generation', type: 'serial', tools: ['itinerary_generation'] },
      { name: 'enhancement', type: 'parallel', tools: ['travel_checklist'] }
    ]
  },
  quick_itinerary: {
    phases: [
      { name: 'quick_data', type: 'parallel', tools: ['poi_search', 'city_policy'] },
      { name: 'generate', type: 'serial', tools: ['itinerary_generation'] }
    ]
  },
  full_itinerary: {
    phases: [
      { name: 'comprehensive_data', type: 'parallel', tools: ['poi_search', 'city_policy', 'weather_query', 'breed_risk_check'] },
      { name: 'generate', type: 'serial', tools: ['itinerary_generation'] },
      { name: 'enrichment', type: 'parallel', tools: ['travel_checklist'] }
    ]
  }
}

class ToolOrchestrator {
  constructor() {
    this.capabilities = TOOL_CAPABILITIES
    this.strategies = STRATEGY_TEMPLATES
  }

  /**
   * 根据槽位状态决定执行策略
   */
  buildExecutionPlan(slots, context = {}) {
    const timer = logger.time('orchestration')
    
    const strategy = this._selectStrategy(slots, context)
    const filteredPlan = this._filterPlanBySlots(strategy, slots)
    const estimatedTime = this._estimateTotalTime(filteredPlan)

    timer.end()
    logger.info('ToolOrchestrator', `策略: ${strategy}, 预计耗时: ${estimatedTime}ms`)

    return { strategy, ...filteredPlan, estimatedTime }
  }

  /**
   * 执行计划 — 按阶段串行/并行调度
   */
  async executePlan(plan, slots, context, toolExecutor) {
    const results = {
      phaseResults: {},
      finalOutput: null,
      errors: [],
      executionLog: []
    }

    for (let i = 0; i < plan.phases.length; i++) {
      const phase = plan.phases[i]
      logger.info(`ToolOrchestrator`, `阶段 ${i + 1}/${plan.phases.length}: ${phase.name} (${phase.type})`)

      try {
        let phaseResult

        if (phase.type === 'parallel') {
          phaseResult = await this._executeParallel(phase.tools, slots, context, toolExecutor)
        } else {
          phaseResult = await this._executeSerial(phase.tools, slots, context, toolExecutor)
        }

        results.phaseResults[phase.name] = phaseResult
        Object.assign(context.toolResults || {}, phaseResult)

        results.executionLog.push({
          phase: phase.name, type: phase.type, status: 'success', toolCount: phase.tools.length
        })
      } catch (error) {
        logger.error(`ToolOrchestrator`, `阶段 ${phase.name} 失败: ${error.message}`)
        results.errors.push({ phase: phase.name, error: error.message })
        
        if (phase.name === 'generation' || phase.name === 'generate') break
      }
    }

    results.finalOutput = this._assembleFinalOutput(results.phaseResults, slots)
    return results
  }

  // ════════════════════════════════════════════════════════

  _selectStrategy(slots) {
    if (slots.days <= 1) return 'quick_itinerary'
    if (slots.budget || (slots.preference && slots.preference.length >= 2)) return 'full_itinerary'
    return 'standard_itinerary'
  }

  _filterPlanBySlots(strategy, slots) {
    const template = this.strategies[strategy] || this.strategies.standard_itinerary
    
    return {
      ...template,
      phases: template.phases.map(phase => ({
        ...phase,
        tools: phase.tools.filter(toolId => {
          const cap = this.capabilities[toolId]
          return cap && cap.requiredSlots.every(s => slots[s])
        })
      })).filter(phase => phase.tools.length > 0)
    }
  }

  _estimateTotalTime(plan) {
    let total = 0
    for (const phase of plan.phases) {
      const phaseTime = phase.tools.reduce((sum, id) => sum + (this.capabilities[id]?.estimatedTime || 1000), 0)
      total += phase.type === 'parallel' ? Math.ceil(phaseTime / phase.tools.length * 1.5) : phaseTime
    }
    return total
  }

  async _executeParallel(toolIds, slots, context, executor) {
    const promises = toolIds.map(async (toolId) => {
      const cap = this.capabilities[toolId]
      try {
        logger.info(`ToolOrchestrator`, `[并行] ${cap.name}`)
        const start = Date.now()
        const result = await executor.execute(toolId, slots, context)
        logger.info(`ToolOrchestrator`, `[并行] 完成: ${cap.name} (${Date.now() - start}ms)`)
        return { [toolId]: result, success: true }
      } catch (error) {
        logger.error(`ToolOrchestrator`, `[并行] 失败: ${cap.name} - ${error.message}`)
        return { [toolId]: null, success: false, error: error.message }
      }
    })

    const allResults = await Promise.allSettled(promises)
    const merged = {}
    for (const r of allResults) {
      if (r.status === 'fulfilled' && r.value) Object.assign(merged, r.value)
    }
    return merged
  }

  async _executeSerial(toolIds, slots, context, executor) {
    const results = {}

    for (const toolId of toolIds) {
      const cap = this.capabilities[toolId]
      try {
        logger.info(`ToolOrchestrator`, `[串行] ${cap.name}`)
        const start = Date.now()
        
        const result = await executor.execute(toolId, slots, {
          ...context,
          toolResults: results
        })

        results[toolId] = result
        logger.info(`ToolOrchestrator`, `[串行] 完成: ${cap.name} (${Date.now() - start}ms)`)
      } catch (error) {
        logger.error(`ToolOrchestrator`, `[串行] 失败: ${cap.name} - ${error.message}`)
        results[toolId] = null
      }
    }

    return results
  }

  _assembleFinalOutput(phaseResults, slots) {
    // 提取各阶段的关键结果
    const output = {
      itinerary: phaseResults.generation?.itinerary_generation || phaseResults.generate?.itinerary_generation,
      pois: phaseResults.data_collection?.poi_search || phaseResults.quick_data?.poi_search || phaseResults.comprehensive_data?.poi_search,
      policy: phaseResults.data_collection?.city_policy || phaseResults.quick_data?.city_policy,
      weather: phaseResults.data_collection?.weather_query,
      checklist: phaseResults.enhancement?.travel_checklist,
      breedRisk: phaseResults.data_collection?.breed_risk_check,
      rawResults: phaseResults
    }

    return output
  }
}

module.exports = new ToolOrchestrator()
