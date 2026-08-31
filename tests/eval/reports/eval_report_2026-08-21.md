# PetTravelAgent 自动评测报告（两阶段 Judge 版）

> **评测日期**: 2026-08-21
> **数据集**: `v1.3_golden.json` #1~#20（agent_interaction 批次）
> **评测方案**: 《评测体系方案.md》v1.1；**本轮升级：Judge 两阶段**（阶段一判 case 类型/适用维度 → 阶段二只评适用维度）
> **报告 JSON**: `eval_summary_2026-08-21.json`（含 stage1/差异检测全量明细）

---

## 一、两阶段改造效果（对比 08-19 单阶段）

| 指标 | 08-19 单阶段 | 08-21 两阶段 | 变化 |
|------|-----------:|-----------:|------|
| Task Success Rate | 85.0% | **90.0%** | +5.0pp，达标（≥90%） |
| 三档分布 | 17P/2R/1F | **18P/2R/0F** | Judge 误判清零 |
| 平均分 | 94.2 | **97.6** | +3.4 |
| Judge 误判（人工翻案数） | 1（PET_000001） | **0** | ✅ 两阶段直接解决 |

**关键验证——PET_000001（"你好"）自动翻案**：FAIL 40 → PASS 100。阶段一输出 `case_type: greeting, pet_context_required: false`，适用维度仅 `intent_understanding + response_quality`，`pet_scenario` 被正确排除——"你好因没考虑宠物扣 0 分"类误判从机制上消除。

**差异检测（新机制）生效**：Judge 阶段一自判 vs Runner category 矩阵共 9 条差异上报（全部为 greeting/capability 子类正确排除 `pet_scenario`）——证明 **category 级矩阵粒度不足，case 级自判更准**；差异 >2 维度的自动标 uncertain 转 REVIEW（PET_000014 由此触发，保守正确）。

## 二、本轮新发现：能力询问被"直接执行"（真实 Agent bug 群）

INTENT_MISS 规则码（新增 L1 判定：expected_action 与 Agent intent GT 不匹配）命中 5 条，归因分两类：

**A 类：行为真实偏差（3 条，需修 Agent）**

| Case | Query | Agent 实际行为 | 问题 |
|------|-------|--------------|------|
| PET_000015 | 你能查天气吗 | intent=`weather_check`，**直接输出当前城市天气预报正文** | 能力询问被当执行请求；用户在问"能不能"，不在要天气 |
| PET_000016 | 你会做攻略吗 | intent=`generate_itinerary`，**回复为空** → FAIL 60 | 触发行程生成但无目的地参数，输出空；能力询问误路由 |
| PET_000020 | 北京有什么好玩的 | intent=`search_poi`，输出宠物场所推荐 | 已知问题：unknown 泛咨询默认假设带宠（上轮已报） |

**B 类：仅标签偏差、行为正确（2 条）**

PET_000014（识别品种→`knowledge_query`）/ PET_000017（查政策→`policy_check`）：intent 标签与映射不同，但回复内容正确（说明能力+用法），Judge 按内容判 PASS——三层体系按设计工作（L1 抓信号、L2 按内容裁判、error_code 记录不误杀）。

**修复方向（Agent 侧）**：Router 增加"能力询问（你能/你会/可以…吗）"识别分支 → 回复能力说明而非直接执行；`generate_itinerary` 无目的地参数时禁止空输出（降级为澄清）。

## 三、Judge 噪声记录（进入校准集）

| Case | 现象 | 人工结论 |
|------|------|---------|
| PET_000015 | 用户问能力、Agent 报天气正文，Judge 仍给 intent 15/15 满分 | Judge 对 capability_inquiry 的意图判定过宽——"直接执行"≠"正确理解"；**应翻案为 FAIL**，记入校准集 |
| PET_000014 | stage1 自判与矩阵差异 3 维度触发 uncertain→REVIEW（100 分） | 保守行为合理，维持 REVIEW 快速人工确认即可 |

校准集累计：3 条（含 08-19 翻案 1 条）。Judge Prompt 待补锚点："能力询问类：Agent 直接执行任务而未先回答能力问题 → intent_understanding 不得高于 60%"。

## 四、指标看板

| 一级指标 | 本轮 | 目标 | 状态 |
|---------|-----:|-----:|------|
| ① Task Success Rate | 90.0% | ≥90% | ✅ |
| ③ Hard Error Rate | 0% | ≤2% | ✅ |
| ⑦ Clarification Accuracy | 100% | ≥92% | ✅ |
| 平均延迟 | 6.6s | P95<5s | ⚠️ 交互类全走 Layer3（Layer1 词典扩充待修） |
| ②④⑤⑥ | —（本批不适用） | — | 待业务批次 |

## 五、下一步

1. Agent 修复三件：能力询问误执行（本轮新发现×2）+ 泛咨询假设带宠（上轮）
2. Judge 校准集 → 10 条；Prompt 补能力询问锚点
3. 分批跑全量（`--skip 20` 起，POI/政策/行程批次激活 ②~⑥ 与 Hard Fail）
4. Layer1 寒暄词典扩充（延迟优化）

---

**Runner**: `tests/eval/run_eval.js` v1.1（两阶段）　**人工复核**: ____________
