# PetTravelAgent 首轮自动评测报告

> **评测日期**: 2026-08-19
> **数据集**: `tests/eval/datasets/v1.3_golden.json`（#1~#20，agent_interaction 为主）
> **评测方案**: 《评测体系方案.md》v1.1（4.4 评分框架 / 4.5 Pipeline / 4.6 Judge 规范 / 4.7 Error Code）
> **Agent 入口**: `agent/core/index.js`（进程内直调，含真实 LLM 与本地库）
> **Judge**: glm-4-flash，Prompt v4.6.2，7 维结构化打分
> **Runner**: `tests/eval/run_eval.js`（可重复执行：`node tests/eval/run_eval.js --limit 20`）

---

## 一、一级指标（Dashboard 口径）

| 一级指标 | 本轮结果 | 目标 | 判读 |
|---------|---------:|-----:|------|
| ① Task Success Rate 任务完成率 | **85.0%** | ≥90% | 未达标，差 5pp |
| ② Pet Scenario Success Rate | —（本批无 with_pet case） | ≥93% | 待跑后续批次 |
| ③ Hard Error Rate 严重错误率 | **0%** | ≤2% | ✅ 达标（无 P0/P1） |
| ④~⑥ 约束满足/事实准确/工具调用 | —（交互类不适用） | — | 待跑业务批次 |
| ⑦ Clarification Accuracy | **100%** | ≥92% | ✅（本批 1 条泛咨询路由错误已计入） |
| 平均分 | 94.2 | ≥85 | 高分但被 2 条 REVIEW 拖累通过率 |
| 平均延迟 | 5952ms | P95<5s | ⚠️ 交互类偏高（Layer3 全量 LLM） |

**三档分布**：PASS 17 / REVIEW 2 / FAIL 1

## 二、逐 case 结果

| # | case | query | 期望 action | Agent intent | 判定 | 分数 |
|---|------|-------|------------|--------------|------|-----:|
| 1 | PET_000001 | 你好 | greet_and_introduce | chit_chat | **FAIL** | 40 |
| 2-10 | PET_000002~010 | 谢谢/再见/好的/在吗/你是谁系列 | 寒暄/身份 | chit_chat | PASS ×9 | 100 |
| 11-18 | PET_000011~018 | 豆包关系/能力询问系列 | clarify/list | chit_chat | PASS ×8 | 100 |
| 19 | PET_000019 | 你能帮我什么 | list_capabilities | chit_chat | REVIEW | 73 |
| 20 | PET_000020 | 北京有什么好玩的 | answer_general_travel | search_poi | REVIEW | 71 |

## 三、问题归因（本轮核心产出）

### 问题 1：泛咨询路由错误（真实 Agent bug，最高优先级）

**Case PET_000020**：`"北京有什么好玩的"`（pet_status=unknown，泛信息咨询）

- **期望**（产品路由规则）：`answer_general_travel` —— 直答一般性旅行信息 + 自然引导"带毛孩子的话可另筛宠物友好版"
- **实际**：Agent 直接按宠物场所推荐处理（intent=`search_poi`），回复全是宠物公园/餐厅/酒店——**默认假设了用户带宠**
- **归因**：路由层缺失 pet_status 判断逻辑（方案 3.2 路由决策表已有规则，Agent 未实现）。这与此前担心的"假设不带宠"相反，实际是**反向假设（一切皆宠物）**
- **修复方向**：`agent/router.js` 增加 unknown+泛咨询分支（general_info 直答+引导）；错误类型 A2 变体
- **关联错误码**：`INTENT_MISS`（intent GT 比对失败：`answer_general_travel`≠`search_poi`）

### 问题 2：能力列举不全（轻微）

**Case PET_000019**：回复列举 5 项能力，gold 要求含天气查询、图片识别等 7 项 → REVIEW 恰当。修复：Layer3 身份/能力 Prompt 补全能力清单。

### 问题 3：Judge 噪声（评测体系自身，验证 4.6.4 必要性）

**Case PET_000001**（"你好"）：回复完全正常（问候+自介+能力简介，与 reference_answer 几乎一致），Judge 却给 `pet_scenario: 0`（理由"未根据宠物状态响应"）——寒暄场景不涉宠物状态，属 **Judge 误判**。首轮即出现 Judge 过严个案，印证方案 4.6.4 Judge Calibration 的必要性：

- 该 case 人工复核结论：应翻案为 PASS（已记入人工复核台账）
- 建议：交互类（agent_interaction）的 `pet_scenario` 维度锚点需在 Judge Prompt 中显式说明"寒暄/身份类无宠物场景要求时给满分"

### 问题 4：交互类延迟偏高

平均 5.95s：20 条全走 Layer3 LLM。方案 3.1 成本断言要求寒暄类走 Layer1 零 LLM——**Agent 的 Layer1 快速拦截未覆盖这些 query**（`expected_layer=layer1_fast` 的 5 条实际全部走了 LLM）。属成本回归，修复方向：Layer1 词典扩充（你好/谢谢/再见/好的/在吗）。

## 四、评测体系自身验证结论

| 验证项 | 结果 |
|--------|------|
| Pipeline 双路（Response+Trace 重建） | ✅ 跑通（metrics.toolsUsed 恒空的 workaround 有效） |
| L1 规则评测（intent GT/超时/禁入库/宠物遗漏启发） | ✅ PET_000020 的 intent_match=false 即 L1 抓获 |
| L2 Judge 7 维结构化输出 | ✅ 18/20 有效 JSON；维度适用矩阵（×维度必须 null）生效 |
| Judge 失败降级 | ✅ 解析失败→REVIEW 不误判 FAIL |
| 三档判定 | ✅ 边界行为符合 4.4.3（PET_000019 因 judge reason 合理落 REVIEW） |
| 待改进 | Trace 仅从响应字段重建（Agent 需按方案 4.5 输出结构化 tool_trace）；Judge 校准集待建（本轮已产 1 条翻案样本） |

## 五、下一步

1. **跑全量 966 条**（分批：`--skip 20 --limit 250` 逐段跑，pet/itinerary/policy 批次将激活 ②~⑥ 指标与 Hard Fail 检测）
2. **修 Agent 两项**：泛咨询路由分支（问题1）；Layer1 寒暄词典（问题4）
3. **Judge Calibration 启动**：人工标注本轮 REVIEW/翻案样本，目标 ≥100 条
4. 报告 JSON：`tests/eval/reports/eval_summary_2026-08-19.json`（含全部 20 条明细）

---

**评测执行**: Eval Runner v1.0　**人工复核**: ____________　**下次全量评测**: Agent 修复后
