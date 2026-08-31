/**
 * PetTravelAgent Eval Runner（按《评测体系方案.md》4.5/4.6/4.7 实现）
 *
 * 用法:
 *   node tests/eval/run_eval.js [--limit 20] [--skip 0] [--dataset v1.3]
 *
 * 流程（方案 4.5）:
 *   测试集 → 批量调用 Agent（含历史回放）→ Response + Trace 重建
 *   → L1 规则评测器（intent GT / 超时 / 禁入库 / 宠物遗漏启发）
 *   → L2 LLM Judge（4.6.2 Prompt，7 维打分，含 Trace 输入）
 *   → Hard Fail Detector（P0/P1/P2 合并定档）
 *   → 三档判定 PASS/REVIEW/FAIL（4.4.3）
 *   → 报告: tests/eval/reports/eval_summary_{date}.json
 */
const fs = require('fs')
const path = require('path')

// ── CLI ──
const args = process.argv.slice(2)
const getOpt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def }
const LIMIT = parseInt(getOpt('limit', '20'), 10)
const SKIP = parseInt(getOpt('skip', '0'), 10)
const DATASET = getOpt('dataset', 'v1.3')

const ROOT = path.join(__dirname, '../..')
const dataPath = path.join(ROOT, `tests/eval/datasets/${DATASET}_golden.json`)
const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

const bannedDb = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pet_banned_database.json'), 'utf8')) }
  catch { return { pois: [] } }
})()

// ── 4.4.1 7 维框架 + category 适用矩阵 ──
const DIMS = [
  ['intent_understanding', 15], ['constraint_satisfaction', 20], ['pet_scenario', 20],
  ['factuality', 15], ['planning_quality', 15], ['tool_usage', 5], ['response_quality', 10]
]
const APPLICABILITY = {
  itinerary_planning: null, // 全7维
  poi_search: ['intent_understanding', 'constraint_satisfaction', 'pet_scenario', 'factuality', 'tool_usage', 'response_quality'],
  policy_rules: ['intent_understanding', 'constraint_satisfaction', 'pet_scenario', 'factuality', 'response_quality'],
  pet_advice: ['intent_understanding', 'constraint_satisfaction', 'pet_scenario', 'factuality', 'response_quality'],
  pet_status_routing: ['intent_understanding', 'pet_scenario', 'response_quality'],
  multi_turn_complex: ['intent_understanding', 'constraint_satisfaction', 'pet_scenario', 'factuality', 'planning_quality', 'response_quality'],
  agent_interaction: ['intent_understanding', 'pet_scenario', 'response_quality'],
  off_topic_boundary: ['intent_understanding', 'pet_scenario', 'response_quality'],
  adversarial: ['pet_scenario', 'factuality', 'response_quality']
}
const evalActionMap = { // expected_action → agent intent 枚举（L1 GT 比对）
  greet_and_introduce: ['chit_chat'], acknowledge: ['chit_chat'], farewell: ['chit_chat'],
  introduce_self: ['chit_chat'], clarify_identity: ['chit_chat'], list_capabilities: ['chit_chat'],
  chit_chat: ['chit_chat'], answer_general_travel: ['chit_chat'],
  search_poi: ['search_poi'], generate_itinerary: ['generate_itinerary'],
  policy_check: ['policy_check'], breed_risk: ['breed_risk'],
  food_detection: ['food_detection'], travel_checklist: ['travel_checklist'],
  emergency_help: ['emergency_help'], weather_check: ['weather_check'],
  pet_advice: ['pet_advice', 'chit_chat'], off_topic: ['off_topic'],
  continue_with_context: ['generate_itinerary'], modify_itinerary: ['generate_itinerary'],
  verify_and_correct: ['chit_chat', 'policy_check', 'search_poi'],
  refuse_firmly: ['chit_chat', 'off_topic'], refuse_with_explanation: ['chit_chat', 'off_topic'],
  ignore_injection: ['chit_chat', 'off_topic'], maintain_identity: ['chit_chat', 'off_topic'],
  address_core_question: ['chit_chat'], point_out_contradiction: ['chit_chat', 'off_topic'],
  clarify_limitations: ['chit_chat', 'off_topic'], partial_comply_clarify: ['chit_chat', 'search_poi'],
  educate_reality: ['chit_chat', 'off_topic'], ignore_false_context: ['chit_chat', 'off_topic'],
  clarify_reality: ['chit_chat', 'off_topic'],
  clarify_pet_status: null // Agent 无此枚举：靠内容判（是否问了宠物）→ Judge/规则
}
const PET_WORDS = /带[^，。？]{0,10}(狗|猫|宠物)|携宠|宠物友好|毛孩子|宠物(进|入|同行)|(接受|允许)[^，。？]{0,12}(狗|猫)|的(狗|猫)|金毛|拉布拉多|哈士奇|泰迪|柯基|法斗|比熊|边牧|萨摩耶|柴犬|巴哥|德牧|布偶|英短|美短/

// ── Trace 重建（方案 4.5：metrics.toolsUsed 恒空，从响应字段推断）──
function buildTrace(res) {
  const trace = []
  const r = res.response || res
  if (r.poiList?.pois?.length || r.poiList?.length) trace.push({ tool: 'poi_search', note: `返回 ${r.poiList?.pois?.length || r.poiList.length} 条POI` })
  if (r.itineraryData) trace.push({ tool: 'itinerary_generation', note: `生成行程: ${r.itineraryData.destination || ''} ${r.itineraryData.days || '?'}天` })
  if (r.weatherData) trace.push({ tool: 'weather_query', note: '含天气数据' })
  if (r.sources?.length) trace.push({ tool: 'knowledge_search/web_search', note: `引用 ${r.sources.length} 条来源` })
  return trace
}

// ── L1 规则评测器 ──
function ruleEvaluate(c, agentRes, trace, latencyMs, agentError) {
  const codes = []
  let hardFail = null // {level, codes}
  const content = String(agentRes?.response?.content || agentRes?.content || '')

  // P0: 系统错误/超时
  if (agentError) {
    if (/超时|timeout/i.test(agentError)) return { codes: ['TIMEOUT'], hardFail: { level: 'P0', codes: ['TIMEOUT'] }, intentMatch: false }
    return { codes: ['SYSTEM_ERROR'], hardFail: { level: 'P0', codes: ['SYSTEM_ERROR'] }, intentMatch: false }
  }
  if (!agentRes?.success) return { codes: ['SYSTEM_ERROR'], hardFail: { level: 'P0', codes: ['SYSTEM_ERROR'] }, intentMatch: false }

  // P0: 超时（latency 硬限 30s）
  if (latencyMs > 30000) { hardFail = { level: 'P0', codes: ['TIMEOUT'] }; codes.push('TIMEOUT') }

  // L1: intent GT 比对
  const agentIntent = agentRes.metrics?.intent || agentRes.response?.metrics?.intent || 'unknown'
  const expectSet = evalActionMap[c.expected.expected_action]
  const intentMatch = expectSet ? expectSet.includes(agentIntent) : null // null=无映射交Judge
  if (intentMatch === false) codes.push('INTENT_MISS')

  // P1: 推荐禁入场所（禁入库 id/名称命中）
  const poiNames = []
  const pl = agentRes.response?.poiList?.pois || agentRes.response?.poiList || []
  if (Array.isArray(pl)) pl.forEach(p => poiNames.push(p.name || ''))
  let bannedHit = null
  for (const name of poiNames) {
    if (!name) continue
    const hit = bannedDb.pois.find(b => name.includes(b.name) || b.name.includes(name))
    if (hit) { bannedHit = hit; break }
  }
  if (bannedHit) { hardFail = hardFail || { level: 'P1', codes: [] }; hardFail.codes.push('POI_NOT_PET_FRIENDLY'); codes.push('POI_NOT_PET_FRIENDLY') }

  // P1: 宠物遗漏启发（query 明确带宠 + 响应是行程且足够长 + 全文无任何宠物词 → 疑似 PET_MISS，交Judge确认）
  let petMissSuspect = false
  if (PET_WORDS.test(c.query) && c.expected.context?.pet_status === 'with_pet' && content.length > 200 && !PET_WORDS.test(content) && !/宠物|狗|猫|毛孩子/.test(content)) {
    petMissSuspect = true; codes.push('PET_MISS_SUSPECT')
  }

  // L1: required 工具（POI类响应必须含 poiList）
  if (c.expected.expected_tools?.required?.includes('poi_search') && trace.length === 0 && !content.includes('没有找到') && !content.includes('暂无')) {
    codes.push('TOOL_MISS_SUSPECT')
  }

  // P1: clarify_pet_status 内容规则（unknown+决策：响应必须含询问宠物的话）
  if (c.expected.expected_action === 'clarify_pet_status') {
    const asked = /(带.{0,6}(宠物|狗|猫|毛孩子)|是否携带|带不带|要不要带)/.test(content)
    if (!asked) { hardFail = hardFail || { level: 'P1', codes: [] }; hardFail.codes.push('PET_CLARIFICATION_MISS'); codes.push('PET_CLARIFICATION_MISS') }
  }
  // 反向：明确状态/泛咨询不该问
  if (c.expected.context?.pet_status === 'no_pet' || c.expected.context?.pet_status === 'with_pet' || c.subcategory === 'general_info') {
    const overask = /(先确认一下.*带|这次.{0,4}带.{0,4}(宠物|狗|猫).{0,4}(吗|一起)|会带毛孩子)/.test(content)
    if (overask) codes.push('PET_STATUS_OVERASK')
  }

  return { codes, hardFail, intentMatch, agentIntent, petMissSuspect, bannedHit }
}

// ── L2 LLM Judge（4.6.2 Prompt）──
function buildJudgePrompt(c, agentRes, trace, ruleCodes) {
  const content = String(agentRes?.response?.content || agentRes?.content || '')
  const dims = APPLICABILITY[c.category]
  const runnerSuggest = (dims || DIMS.map(d => d[0]))
  const traceText = trace.length ? trace.map((t, i) => `${i + 1}. ${t.tool} — ${t.note}`).join('\n') : '（无工具调用记录）'
  return `你是宠物出行 Agent 的评测专家。根据【评测标准】和【Agent 实际表现】，按维度打分并输出 JSON。

## 评测标准
- Query：${c.query}
- 用户目标：${c.expected.goal}
- 背景（含宠物状态 pet_status=${c.expected.context?.pet_status || '无'}）：${JSON.stringify(c.expected.context || {})}
- 硬约束：${(c.expected.constraints || []).join('；') || '无'}
- 期望动作：${c.expected.expected_action}
- 期望工具：required=${JSON.stringify(c.expected.expected_tools?.required || [])} optional=${JSON.stringify(c.expected.expected_tools?.optional || [])}

## 事实核对清单（逐条判断 Agent 回答是否成立）
${(c.gold.facts || []).map((f, i) => `${i + 1}. ${f}`).join('\n')}

## 禁止项（出现任意一条即为违反）
${(c.negative || []).map((f, i) => `${i + 1}. ${f}`).join('\n')}

## Agent 实际表现
- 识别意图：${ruleCodes.agentIntent || 'unknown'}
- 最终回复：${content.slice(0, 2500)}
- 工具调用记录：${traceText}
- 规则评测器已标记的可疑信号：${ruleCodes.codes.length ? ruleCodes.codes.join(',') : '无'}

## 评测流程（严格两阶段，按顺序执行）

### 阶段一：先判断 Case 类型与适用维度（在打分之前完成）
根据 Query 与用户目标判断本 case 的性质，输出：
- case_type：如 greeting / identity_inquiry / capability_inquiry / poi_search / itinerary_planning / policy_qa / advice / clarification / off_topic / adversarial / multi_turn...
- pet_context_required：本 case 是否要求 Agent 理解/处理宠物场景（寒暄/身份/纯off_topic为 false；宠物相关/携宠路由为 true）
- planning_required：是否要求行程规划
- tool_required：是否要求调用工具
- factuality_required：是否有需核对的事实清单（无实质事实断言的寒暄类为 false）
- applicable_dimensions：由此推导出的适用维度列表（只能从 7 维中选）

判断示例（务必遵守）：
- "你好"/"谢谢"/"再见" → case_type=greeting，pet_context_required=false，pet_scenario 不适用 —— 不能因"没提宠物"扣 pet_scenario 分
- "你是谁" → identity_inquiry，适用 intent+pet_scenario(身份定位)+response_quality，planning/tool 不适用
- "帮我规划北京3日游"（未说明宠物）→ clarification，适用 intent+pet_scenario+response_quality，planning 不适用（Agent 应先问而非规划）
- "带狗去北京玩三天" → itinerary_planning，pet_context_required=true，全维度适用

### 阶段二：只对 applicable_dimensions 中的维度打分（其余维度 score 必须为 null）

维度与满分：${DIMS.map(([n, w]) => `${n} /${w}`).join('，')}

维度评分锚点（防过严/过宽）：
- 回复完全正确且贴合目标 → 该维度给满分或接近满分
- 回复正确但有轻微瑕疵（如略啰嗦/少一句引导）→ 扣 10-25% 分
- 明确错误或缺失 → 该维度一半以下

## 判定规则
- hard_fail（出现任一标记 level 与 codes）：
  P0：回答完全跑题(IRRELEVANT)/没完成用户要求(INCOMPLETE严重档)
  P1：明确带宠却忽略(PET_MISS)/推荐禁宠场所(POI_NOT_PET_FRIENDLY)/宠物政策错误(POLICY_ERROR)/该问宠物状态没问(PET_CLARIFICATION_MISS)
  P2：城市/天数/宠物类型/预算约束错误(LOCATION_ERROR/DATE_ERROR/CONSTRAINT_MISS/BUDGET_ERROR/PET_TYPE_MISS)
- 规则评测器的 PET_MISS_SUSPECT/TOOL_MISS_SUSPECT 请核实：确认则计入对应 error code，排除则忽略
- 无法确定标 uncertain: true
- missing_facts：清单中未覆盖的条目编号；negative_facts_violated：违反的禁止项编号

## 输出（严格 JSON，先输出阶段一，再输出阶段二）
{"stage1":{"case_type":"greeting|identity_inquiry|...","pet_context_required":false,"planning_required":false,"tool_required":false,"factuality_required":false,"applicable_dimensions":["intent_understanding","response_quality"]},
"dimensions":{"intent_understanding":{"score":n|null,"comment":"..."},"constraint_satisfaction":{"score":n|null,"comment":"..."},"pet_scenario":{"score":n|null,"comment":"..."},"factuality":{"score":n|null,"comment":"..."},"planning_quality":{"score":n|null,"comment":"..."},"tool_usage":{"score":n|null,"comment":"..."},"response_quality":{"score":n|null,"comment":"..."}},
"hard_fail":{"triggered":false,"level":null,"codes":[]},"missing_facts":[],"negative_facts_violated":[],"error_codes":[],"uncertain":false,"reason":"具体说明扣分点，如'Day3节奏偏赶，其余满足'（不要输出示例文字）"}`
}

function parseJudge(text) {
  try {
    const m = text.match(/\{[\s\S]*\}/)
    return m ? JSON.parse(m[0]) : null
  } catch { return null }
}

// ── 合成判定（4.4.3 三档；v1.1 两阶段：以 Judge 阶段一自判适用集为准，Runner 矩阵做差异检测）──
function verdict(c, ruleRes, judge) {
  const runnerMatrix = APPLICABILITY[c.category] || DIMS.map(d => d[0])
  // 阶段一自判的适用维度（合法校验：须是 7 维之一）
  const selfDetermined = (judge?.stage1?.applicable_dimensions || []).filter(d => DIMS.some(([n]) => n === d))
  // 评分依据：Judge 自判优先；自判缺失/非法时回退 Runner 矩阵
  const applicable = selfDetermined.length ? selfDetermined : runnerMatrix
  // 差异检测：自判与 Runner 矩阵不一致 → 记录（>2 个维度差异视为 Judge 阶段一可疑，标 uncertain 转人工）
  const diff = applicable.filter(d => !runnerMatrix.includes(d)).concat(runnerMatrix.filter(d => !applicable.includes(d)))
  const matrixDiscrepancy = selfDetermined.length ? diff : null
  const suspiciousStage1 = diff.length > 2

  let score = 0, max = 0
  for (const [name, w] of DIMS) {
    if (!applicable.includes(name)) continue
    max += w
    const s = judge?.dimensions?.[name]?.score
    if (typeof s === 'number' && s >= 0) score += Math.min(s, w)
  }
  const normalized = max ? Math.round(score / max * 100) : 0

  // Hard Fail 合并（L1 优先，L2 补充）
  const hfL1 = ruleRes.hardFail
  const hfL2 = judge?.hard_fail?.triggered ? { level: judge.hard_fail.level, codes: judge.hard_fail.codes || [] } : null
  const l1Rank = { P0: 3, P1: 2, P2: 1 }
  let hardFail = null
  if (hfL1 && hfL2) hardFail = (l1Rank[hfL1.level] || 0) >= (l1Rank[hfL2.level] || 0) ? hfL1 : hfL2
  else hardFail = hfL1 || hfL2

  const errorCodes = [...new Set([...(ruleRes.codes || []), ...(judge?.error_codes || []), ...(hardFail?.codes || [])])]
    .filter(x => !x.endsWith('_SUSPECT'))

  const uncertain = !!judge?.uncertain || suspiciousStage1
  let verdictT
  if (hardFail && hardFail.level !== 'P2') verdictT = 'FAIL'
  else if (normalized < 70 && !uncertain) verdictT = 'FAIL'
  else if (normalized < 85 || uncertain || (hardFail && hardFail.level === 'P2')) verdictT = 'REVIEW'
  else verdictT = 'PASS'
  // Judge 不可用（uncertain 且无分）→ 无法机器定档，转人工 REVIEW（不计 FAIL）
  if (uncertain && normalized === 0 && !hardFail) verdictT = 'REVIEW'

  return {
    score: normalized, max, verdict: verdictT, hardFail, errorCodes,
    applicable_dims: applicable, matrix_discrepancy: matrixDiscrepancy
  }
}

// ── 主流程 ──
async function main() {
  const zhipu = require(path.join(ROOT, 'agent/llm/zhipu_client'))
  const agent = require(path.join(ROOT, 'agent/core/index'))
  await agent.initialize()

  const cases = dataset.cases.slice(SKIP, SKIP + LIMIT)
  const results = []
  const outDir = path.join(ROOT, 'tests/eval/reports')
  fs.mkdirSync(outDir, { recursive: true })
  const checkpointPath = path.join(outDir, `eval_checkpoint_${DATASET}_skip${SKIP}.json`)

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]
    const sessionId = `eval_${c.case_id}`
    const t0 = Date.now()
    let agentRes = null, agentErr = null

    try {
      // 多轮历史回放（同 session 顺序发送）
      const history = c.expected.context?.history || []
      for (const h of history) {
        if (h.role === 'user') {
          await Promise.race([
            agent.run({ message: h.content, userId: 'eval', sessionId: sessionId + '_h' }),
            new Promise((_, rj) => setTimeout(() => rj(new Error('超时')), 45000))
          ])
        }
      }
      await Promise.race([
        agent.run({ message: c.query, userId: 'eval', sessionId }),
        new Promise((_, rj) => setTimeout(() => rj(new Error('agent超时')), 45000))
      ]).then(r => { agentRes = r })
    } catch (e) { agentErr = e.message }

    const latency = Date.now() - t0
    const trace = buildTrace(agentRes)
    const ruleRes = ruleEvaluate(c, agentRes, trace, latency, agentErr)

    // Judge
    let judge = null
    if (!agentErr) {
      try {
        const jr = await Promise.race([
          zhipu.chat({
            messages: [{ role: 'user', content: buildJudgePrompt(c, agentRes, trace, ruleRes) }],
            temperature: 0.1, maxTokens: 1200
          }),
          new Promise((_, rj) => setTimeout(() => rj(new Error('judge超时')), 30000))
        ])
        judge = parseJudge(jr.content || '')
      } catch (e) { judge = null }
    }
    if (!judge) judge = { uncertain: true, dimensions: {}, error_codes: [], reason: `Judge不可用: ${agentErr || '解析失败'}` }

    const v = verdict(c, ruleRes, judge)
    results.push({
      case_id: c.case_id, category: c.category, subcategory: c.subcategory, difficulty: c.difficulty,
      query: c.query,
      pet_status: c.expected.context?.pet_status || null,
      expected_action: c.expected.expected_action,
      agent_intent: ruleRes.agentIntent || 'unknown',
      intent_match: ruleRes.intentMatch,
      latency_ms: latency,
      response_excerpt: String(agentRes?.response?.content || agentErr || '').slice(0, 120),
      trace, rule_codes: ruleRes.codes,
      judge: {
        stage1: judge.stage1 || null, dimensions: judge.dimensions, hard_fail: judge.hard_fail || null,
        missing_facts: judge.missing_facts || [], negative_violated: judge.negative_facts_violated || [],
        uncertain: !!judge.uncertain, reason: judge.reason || ''
      },
      applicable_dims: v.applicable_dims, matrix_discrepancy: v.matrix_discrepancy,
      score: v.score, verdict: v.verdict, hard_fail: v.hardFail, error_codes: v.errorCodes
    })
    // 增量 checkpoint：中断后可用 --skip 续跑，已完成条不丢
    try {
      fs.writeFileSync(checkpointPath, JSON.stringify({
        dataset: `${DATASET}_golden.json`, skip: SKIP, done: results.length,
        absolute_range: `#${SKIP + 1}~#${SKIP + results.length}`,
        updatedAt: new Date().toISOString(), results
      }))
    } catch (e) { console.warn('[checkpoint] write failed:', e.message) }
    const abs = SKIP + i + 1
    console.log(`[${i + 1}/${cases.length}|#${abs}] ${c.case_id} ${v.verdict} ${v.score}分 ${v.errorCodes.length ? 'errors: ' + v.errorCodes.join(',') : ''} (${latency}ms)`)
  }

  // ── 汇总（方案 4.3 一级指标 + 4.7 Error Code）──
  const N = results.length
  const cnt = k => results.filter(r => r.verdict === k).length
  const petCases = results.filter(r => r.pet_status === 'with_pet' || ['policy_rules', 'pet_advice'].includes(r.category))
  const clarifyCases = results.filter(r => r.category === 'pet_status_routing' || ['itinerary_unknown_pet', 'poi_unknown_pet', 'itinerary_explicit_no_pet', 'poi_explicit_no_pet', 'general_info'].includes(r.subcategory))
  const hfCount = results.filter(r => r.hard_fail && r.hard_fail.level !== 'P2').length
  const errTop = {}
  results.forEach(r => r.error_codes.forEach(e => { errTop[e] = (errTop[e] || 0) + 1 }))

  const summary = {
    task_success_rate: +(cnt('PASS') / N * 100).toFixed(1),
    pet_scenario_success_rate: petCases.length ? +(petCases.filter(r => r.verdict === 'PASS').length / petCases.length * 100).toFixed(1) : null,
    hard_error_rate: +(hfCount / N * 100).toFixed(1),
    clarification_accuracy: clarifyCases.length ? +(clarifyCases.filter(r => !r.error_codes.some(e => e === 'PET_CLARIFICATION_MISS' || e === 'PET_STATUS_OVERASK')).length / clarifyCases.length * 100).toFixed(1) : null,
    avg_score: +(results.reduce((s, r) => s + r.score, 0) / N).toFixed(1),
    verdict_dist: { PASS: cnt('PASS'), REVIEW: cnt('REVIEW'), FAIL: cnt('FAIL') },
    top_error_codes: Object.entries(errTop).sort((a, b) => b[1] - a[1]),
    avg_latency_ms: +(results.reduce((s, r) => s + r.latency_ms, 0) / N).toFixed(0),
    judge_stage1_discrepancies: results.filter(r => r.matrix_discrepancy?.length).map(r => ({ case_id: r.case_id, diff: r.matrix_discrepancy }))
  }

  const report = {
    eval_version: '1.0', scheme: '评测体系方案.md v1.1 (4.4/4.5/4.6/4.7)',
    dataset: `${DATASET}_golden.json`, range: `#${SKIP + 1}~#${SKIP + N}`,
    judge_model: 'glm-4-flash', judge_prompt_version: '4.6.2',
    generatedAt: new Date().toISOString(), summary, results
  }
  const outPath = path.join(outDir, `eval_summary_${new Date().toISOString().slice(0, 10)}_skip${SKIP}.json`)
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))

  console.log('\n════════ 评测汇总 ════════')
  console.log(JSON.stringify(summary, null, 2))
  console.log(`报告: ${outPath}`)
  console.log(`checkpoint: ${checkpointPath}`)
  // 必须 exit：Agent/LLM 可能残留句柄导致 event loop 不退出，外层分批脚本无法推进
  process.exit(0)
}

main().catch(e => { console.error('Eval Runner 异常:', e); process.exit(1) })
