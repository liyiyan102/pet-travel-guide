# PetTravelAgent 完整设计文档 v2.2

> **版本**: v2.2 (三层意图识别 + 双子Agent架构)
> **更新日期**: 2026-08-11
> **状态**: 已实现
> **维护**: 随代码同步更新

---

## 目录

- [一、系统概述](#一系统概述)
- [二、技术架构](#二技术架构)
- [三、三层意图识别模型](#三三层意图识别模型)
- [四、双子Agent架构](#四双子agent架构)
- [五、工具系统](#五工具系统)
- [六、知识库/RAG模块](#六知识库rag模块)
- [七、图片处理模块](#七图片处理模块)
- [八、Prompt Engineering](#八prompt-engineering)
- [九、Memory System](#九memory-system)
- [十、完整数据流](#十完整数据流)
- [十一、文件结构](#十一文件结构)
- [十二、关键接口定义](#十二关键接口定义)
- [十三、配置说明](#十三配置说明)
- [十四、错误处理与降级](#十四错误处理与降级)
- [十五、监控与日志](#十五监控与日志)

---

## 一、系统概述

### 1.1 产品定位

**PetTravelAgent（小D）** 是一个专注于宠物友好旅行规划的 AI 智能助手，帮助用户解决带宠物出行过程中的各类问题：

| 能力 | 说明 |
|------|------|
| 🗺️ 行程规划 | 生成多日宠物友好旅行行程（支持同城市/跨城多日游模版） |
| 🔍 场所搜索 | 查找附近的宠物友好餐厅/酒店/公园（双源检索） |
| 📋 政策查询 | 城市养犬规定、禁养名单、交通规则 |
| ⚠️ 风险评估 | 特定品种能否入城/乘交通工具 |
| 🧾 出行清单 | 按场景生成的准备物品清单 |
| 🍽️ 食物安全 | 判断食物对宠物是否安全 |
| 🖼️ 图片分析 | 品种识别、场景识别、食物检测 |

### 1.2 服务对象

| 宠物类型 | 覆盖范围 |
|---------|---------|
| 犬类 | 全品种（小型/中型/大型/烈性犬） |
| 猫类 | 全品种 |
| 其他 | 鸟类/兔子/仓鼠/乌龟等 |

---

## 二、技术架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户端 (微信小程序)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ 聊天页面  │  │ 行程页   │  │ 地图页   │  │ 攻略定制  │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
└───────┼─────────────┼─────────────┼─────────────┼───────────────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                              │
                       HTTP / WebSocket
                              │
┌─────────────────────────────────────────────────────────────────────┐
│                           后端服务 (Node.js)                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      server.js (入口)                       │   │
│  │              POST /api/chat → agent.run()                   │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                            │                                       │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │                    Agent Core (核心)                         │   │
│  │  ┌──────────┐   ┌──────────────┐   ┌────────────────────┐  │   │
│  │  │ RouterV2 │ → │  PlannerV2   │ → │    执行引擎         │  │   │
│  │  │(意图路由) │   │(规划调度)    │   │ (Skill/Tool调用)   │  │   │
│  │  └────┬─────┘   └──────┬───────┘   └────────▲───────────┘  │   │
│  │       │                │                    │               │   │
│  │  ┌────▼────────────────▼────────────────────┴───────────┐  │   │
│  │  │              Intent Recognizer (三层意图识别)          │  │   │
│  │  │  Layer1(快速拦截) → Layer2(规则增强) → Layer3(LLM语义)│  │   │
│  │  └─────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            │                                       │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │                    子Agents (双子架构)                         │   │
│  │  ┌────────────────────┐  ┌────────────────────────────┐    │   │
│  │  │ TravelPlanner      │  │ PoiSearcher                 │    │   │
│  │  │ (行程规划Agent)     │  │ (地点查询Agent)             │    │   │
│  │  │ • 多日游模版        │  │ • 本地POI数据库            │    │   │
│  │  │ • 跨城游模版        │  │ • 高德地图API              │    │   │
│  │  │ • 槽位填充/澄清     │  │ • 分组展示                 │    │   │
│  │  └────────────────────┘  └────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            │                                       │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │                      Skills + Tools                          │   │
│  │  Skills: 城市政策 | 出行清单 | 品种风险评估                  │   │
│  │  Tools:  行程生成 | POI搜索 | 知识检索 | 视觉分析 | 天气    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                            │                                       │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │                    LLM Client (智谱)                         │   │
│  │       glm-4-flash(快速) | glm-4-plus(高质量) | glm-4v(视觉)  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心模块说明

| 模块 | 文件路径 | 职责 |
|------|---------|------|
| **Server 入口** | `server.js` | HTTP 服务、请求处理、流式响应 |
| **Agent 核心** | `agent/core/index.js` | Agent 主入口、生命周期管理 |
| **路由器 V2** | `agent/core/router.js` | 三层意图识别调度 + 子Agent分发 |
| **规划器 V2** | `agent/core/planner.js` | 意图分发、复合意图处理、结果整合 |
| **意图识别** | `agent/intent/index.js` | 三层意图识别主入口 |
| **Layer 1** | `agent/intent/layer1_fast.js` | 快速拦截层（紧急/图片/闲聊/off-topic）|
| **Layer 2** | `agent/intent/layer2_enhanced.js` | 规则增强层（多维特征评分）|
| **Layer 3** | `agent/intent/layer3_llm.js` | LLM 语义层（智谱 API）|
| **特征提取** | `agent/intent/feature_extractor.js` | 关键词/正则/实体/句式特征提取 |
| **实体识别** | `agent/intent/entity_recognizer.js` | 城市/品种/食物等实体词典匹配 |

---

## 三、三层意图识别模型

### 3.1 设计理念

```
用户输入 → Layer 1(极速 <1ms) → Layer 2(精准 <5ms) → Layer 3(智能 ~300ms) → 最终意图
            ↓ 命中返回            ↓ 命中返回           ↓ 兜底裁决
```

**核心原则**：
- **规则优先，LLM 兜底**：70%~80% 的请求在 Layer 1/2 解决，零成本
- **逐层递进**：每层只处理自己擅长的场景，不确定的交给下一层
- **性能与准确度平衡**：用最少的计算资源达到最高的准确率

### 3.2 Layer 1: 快速拦截层

**定位**：零误判、极速响应（< 1ms）

| 类别 | 示例 | 处理方式 |
|------|------|---------|
| 🚨 紧急意图 | "我家狗吐血了" | 直接路由 emergency_help |
| 📸 图片+明确问题 | "这是什么品种" [图片] | 直接路由 pet_breed_recognition |
| 💬 精确闲聊 | "你好"、"谢谢" | 直接路由 chit_chat |
| 🚫 明显 Off-topic | "股票今天涨了没" | 直接路由 off_topic |

**命中后行为**：设置 `skipLowerLayers: true`，直接返回，不进入后续层。

### 3.3 Layer 2: 规则增强层

**定位**：多维特征加权评分（< 5ms）

| 维度 | 权重 | 说明 |
|------|------|------|
| 关键词匹配 | 40% | 扩展后的关键词库（751个关键词）|
| 实体识别 | 25% | 城市/品种/食物/交通等实体 |
| 正则模式 | 20% | 时长/数量/句式/领域相关模式 |
| 上下文关联 | 10% | 对话历史消歧 |
| 句式分析 | 5% | 疑问/祈使/陈述判断 |

**评分公式**：
```
score = 0.40 × keywordScore + 0.25 × entityScore + 0.20 × patternScore 
      + 0.10 × contextScore + 0.05 × sentenceScore
```

**输出格式**：
```javascript
{
  candidates: [
    { intent: 'generate_itinerary', confidence: 0.82 },
    { intent: 'search_poi', confidence: 0.45 }
  ],
  bestCandidate: { intent: 'generate_itinerary', confidence: 0.82 },
  needsLLM: false,  // 置信度 > 0.75 且领先 > 0.12 → 不需要 LLM
  isCompound: true,
  subIntents: ['search_poi', 'travel_checklist']
}
```

### 3.4 Layer 3: LLM 语义层

**定位**：复杂语义理解（~200-500ms）

**触发条件**：
- Layer 2 最高置信度 < 0.75
- Top-2 候选差距 < 0.12（冲突）
- Layer 2 无候选结果
- 短文本且置信度低 (< 0.6)

**技术方案**：
- 模型：`glm-4-flash`（快速免费）
- Prompt：结构化分类模板 + 15 个 Few-shot 示例
- 输出：严格 JSON 格式 `{ intent, confidence, params, reason }`
- 缓存：相似问题复用（编辑距离 > 0.85），TTL 1小时

### 3.5 性能与成本预估

| 层级 | 调用占比 | 平均耗时 | 成本 |
|------|---------|---------|------|
| Layer 1 | ~35% | < 1ms | 免费 |
| Layer 2 | ~45% | < 5ms | 免费 |
| Layer 3 | ~20% | ~300ms | ~0元 (glm-4-flash 免费) |

### 3.6 完整意图列表（21个）

| # | 意图标识 | 名称 | 优先级 | 子Agent |
|---|---------|------|--------|---------|
| 1 | `emergency_help` | 紧急求助 | P10 | - |
| 2 | `pet_breed_recognition` | 品种识别 | P10 | - |
| 3 | `scene_recognition` | 场景识别 | P10 | - |
| 4 | `generate_itinerary` | 行程规划 | P9 | ✅ TravelPlanner |
| 5 | `modify_itinerary` | 行程修改 | P9 | ✅ TravelPlanner |
| 6 | `breed_risk` | 品种风险评估 | P9 | - |
| 7 | `travel_checklist` | 出行清单 | P8 | - |
| 8 | `search_poi` | POI搜索/地点查询 | P8 | ✅ PoiSearcher |
| 9 | `policy_check` | 政策查询 | P8 | - |
| 10 | `food_detection` | 食物检测 | P8 | - |
| 11 | `transport_guide` | 交通指南 | P7 | - |
| 12 | `pet_advice` | 出行建议 | P7 | - |
| 13 | `weather_check` | 天气查询 | P6 | - |
| 14 | `realtime_search` | 实时搜索 | P6 | - |
| 15 | `knowledge_query` | 知识问答 | P5 | - |
| 16 | `chit_chat` | 闲聊 | P1 | - |
| 17-21 | `image_*` / `off_topic` 等 | 其他 | - | - |

---

## 四、双子Agent架构

### 4.1 旅行攻略规划Agent (TravelPlanner)

#### 设计动机

`generate_itinerary` 是系统最复杂的核心意图，涉及：
1. **多轮槽位填充**：用户很少一次提供所有信息，需要逐步澄清
2. **复杂工具编排**：需要同时调用 POI搜索/政策查询/天气/LLM生成等多个工具
3. **会话状态维护**：需要追踪多轮对话中的槽位变化
4. **长期记忆**：记住用户的宠物信息、偏好、历史行程

#### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│              TravelPlannerAgent (子Agent)                    │
│                                                              │
│  用户输入: "帮我规划北京3天带金毛的行程"                       │
│       ↓                                                      │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │SlotManager │→ │Clarification  │→ │ ToolOrchestrator    │   │
│  │(槽位提取)   │  │Engine        │  │ (工具编排)          │   │
│  │• 正则提取   │  │• 缺失反问    │  │• 并行调度           │   │
│  │• LLM辅助   │  │• 冲突提示    │  │• 串行依赖           │   │
│  └────────────┘  └──────────────┘  └────────▲───────────┘   │
│         ↑                                  │                  │
│  ┌──────┴──────┐                ┌─────────┴──────────┐      │
│  │SessionManager│                │   MemoryStore       │      │
│  │(会话管理)   │                │  (长期记忆)         │      │
│  └─────────────┘                └─────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

#### 核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| **SlotManager** | `slot_manager.js` | 槽位定义与提取（城市/天数/宠物/预算等） |
| **ClarificationEngine** | `clarification.js` | 澄清策略（缺失反问/冲突检测/歧义消解） |
| **ToolOrchestrator** | `tool_orchestrator.js` | 工具编排（并行/串行调度） |
| **SessionManager** | `session_manager.js` | 会话状态管理（生命周期/场景切换） |
| **MemoryStore** | `memory_store.js` | 长期记忆（宠物档案/用户偏好/历史行程） |

#### 回答模版

**模版1: 多日同城市游**
```
触发: "规划 X 日游"、"X 天怎么玩"

【对话气泡】"给你规划了[城市][天数]日游..."

Day1 / Day2 / Day3  ← Tab切换
  1. 景点名 ⭐评分
     💡 推荐理由
     📍 地址
     📋 人均 ¥XX | ⏰ 营业时间
```

**模版2: 跨城多日游**
```
触发: "X 地 + Y 地怎么玩"、多城市 query

【对话气泡】"给你规划了[城市A]+[城市B]的X日游..."

城市A / 城市B  ← Tab切换
  Day1: 游玩安排
    1. 景点名...

━━━ 🚅 城际交通建议 ━━━
• 北京 → 上海: 🚄 高铁(约2-3小时)
```

#### 槽位定义

| 槽位名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `origin` | city | ✅ | 出发城市 | "上海" |
| `destination` | city_or_attraction | ✅ | 目的地 | "北京"/"西湖" |
| `days` | duration | ✅ | 游玩天数 | "3" |
| `petType` | pet_category | ✅ | 宠物类型 | "狗"/"猫" |
| `petCount` | number | ✅ | 宠物数量 | "1" (默认值) |
| `budget` | price_range | 可选 | 预算 | "2000-3000元" |
| `preference` | preference_list | 可选 | 偏好 | ["自然风光","美食"] |

---

### 4.2 地点查询Agent (PoiSearcher) 【v2.1新增】

#### 设计动机

当用户询问地点推荐类问题时（如"北京有什么宠物友好酒店"），需要：
1. **双源检索**：同时查询本地POI数据库和高德地图API
2. **智能分组**：按区域或品类分组展示
3. **独立推荐理由**：每个POI有专门的推荐理由

#### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    POI Searcher Agent                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户输入                                                   │
│  "北京有什么宠物友好酒店" / "推荐几个公园" / "打卡地合集"     │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────┐                                            │
│  │ 信息提取器   │ ← 提取城市、品类、数量                     │
│  └──────┬──────┘                                            │
│         │                                                    │
│    ┌────┴────┐                                              │
│    ▼         ▼                                              │
│  ┌──────┐ ┌────────┐                                       │
│  │本地POI│ │高德地图│  ← 双源并行检索                        │
│  │数据库 │ │ API   │                                       │
│  └──┬───┘ └───┬────┘                                       │
│     │         │                                             │
│     └────┬────┘                                             │
│          ▼                                                  │
│  ┌─────────────┐                                            │
│  │ 结果融合器   │ ← 去重、排序、限制数量                      │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                            │
│  │ 智能分组器   │ ← 按区域/品类分组                          │
│  └──────┬──────┘                                            │
│         │                                                    │
│         ▼                                                    │
│  ┌─────────────┐                                            │
│  │ 模版格式化   │ ← poiSearchTemplate 输出                   │
│  └─────────────┘                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 触发场景

```javascript
// 城市品类查询
'北京有什么宠物友好酒店'
'上海有什么适合遛狗的公园'

// 推荐类
'推荐几个打卡地'
'推荐一些好去处'

// 打卡地合集
'北京宠物友好打卡地合集'
'TOP10 宠物友好酒店'
```

#### 回答模版

```
【对话气泡】"给你推荐6个北京宠物友好酒店，带毛孩子放心去～🐾"

━━━ 📍 朝阳区 ━━━  ← 分组横滑列表

🏷️ 瑞吉酒店 ⭐4.8        ← 独立POI卡片
💡 豪华五星级酒店，提供宠物专属服务  ← 独立推荐理由
📍 北京市朝阳区建国门外大街
📋 人均 ¥1200 | 🖼️ [图片]

🏷️ 康莱德酒店 ⭐4.7
💡 允许携带中小型犬，提供宠物欢迎礼包
📍 北京市朝阳区东三环北路
📋 人均 ¥980 | 🖼️ [图片]

━━━ 📍 海淀区 ━━━
...
```

---

## 五、工具系统

### 5.1 工具注册表

| 工具ID | 名称 | 耗时 | 并行 | 依赖 | 必需槽位 |
|--------|------|------|------|------|---------|
| `poi_search` | POI检索 | ~800ms | ✅ | 无 | destination |
| `city_policy` | 政策查询 | ~300ms | ✅ | 无 | destination |
| `weather_query` | 天气查询 | ~500ms | ✅ | 无 | destination |
| `breed_risk_check` | 品种评估 | ~200ms | ✅ | 无 | petType |
| `travel_checklist` | 出行清单 | ~400ms | ✅ | 无 | dest,days,petType |
| `itinerary_generation` | 行程生成(LLM) | ~3000ms | ❌ | poi,policy | dest,days,petType |
| `vision_analyze` | 图片分析 | ~2000ms | ❌ | image | - |
| `knowledge_search` | 知识检索 | ~500ms | ✅ | 无 | query |

### 5.2 执行策略模板

```
标准行程 (standard_itinerary):
  Phase 1 [并行]: POI搜索 + 政策查询 + 天气 + 品种评估
  Phase 2 [串行]: LLM行程生成 (依赖Phase1结果)
  Phase 3 [并行]: 出行清单生成

快速攻略 (quick_itinerary):  ≤1天的简化版
深度攻略 (full_itinerary): 有预算或偏好的完整版
```

### 5.3 并行优化效果

```
无并行: 800+300+500+200+3000+400 = 5200ms
有并行: max(800,300,500,200) + 3000 + max(400) ≈ 4200ms
节省: ~20%
```

---

## 六、知识库/RAG模块

### 6.1 架构设计

```
用户问题
    │
    ▼
┌─────────────┐
│  Query      │ ← 问题理解、关键词提取
│  Analyzer   │
└──────┬──────┘
       │
  ┌────┴────┬──────────────┐
  ▼         ▼              ▼
┌──────┐ ┌────────┐ ┌──────────┐
│本地   │ │ 联网   │ │ 结构化   │
│向量库│ │ 搜索   │ │ 知识库   │
│检索  │ │ 引擎   │ │ 查询     │
└──┬───┘ └───┬────┘ └────┬─────┘
   │         │          │
   └────┬────┴──────────┘
        ▼
┌─────────────┐
│  Result     │ ← 结果融合、排序、去重
│  Merger     │
└─────────────┘
```

### 6.2 本地知识库结构

```javascript
const KNOWLEDGE_BASE = {
  pet_breeds: { dogs: [...], cats: [...] },      // 宠物品种知识
  place_policies: { scenic_spots: [...], ... },   // 场所宠物政策
  food_safety: { toxic_for_dogs: [...], ... },    // 食物安全知识
  checklists: { short_trip: [...], ... },         // 出行准备清单
  emergency_guides: { heatstroke: {...}, ... },    // 应急处理指南
  faq: [...]                                      // FAQ常见问题
}
```

### 6.3 实体词典规模

| 实体类型 | 数量 | 示例 |
|---------|------|------|
| 城市 | 58 | 北京/上海/成都/杭州... |
| 犬类品种 | 80+ | 泰迪/金毛/哈士奇/法斗... |
| 猫类品种 | 25 | 英短/布偶/波斯/暹罗... |
| 危险食物 | 70+ | 巧克力/葡萄/洋葱/木糖醇... |
| 安全食物 | 50+ | 鸡肉/胡萝卜/苹果/三文鱼... |
| **总计** | **~370+** | |

---

## 七、图片处理模块

### 7.1 支持的任务类型

| 任务 | 说明 | Prompt示例 |
|------|------|-----------|
| `general` | 通用描述 | 详细描述图片内容 |
| `pet_breed` | 宠物品种识别 | 判断品种/年龄/体型/纯种or混血 |
| `scene` | 场景/景点识别 | 识别地点+是否适合带宠物 |
| `food_safety` | 食物安全检测 | 判断对宠物是否安全+应急处理 |
| `ocr` | 文字识别 | 提取图片中所有文字 |
| `compare` | 图片对比 | 列出相同点和不同点 |

### 7.2 使用场景

```
场景1：宠物品种识别
用户：[上传狗狗照片] + "帮我看看这是什么品种？"
→ VisionTool(task_type='pet_breed')
→ 返回：{ breed: '金毛寻回犬', confidence: 0.95 }

场景2：景点识别
用户：[上传风景照] + "这是哪里？能带狗去吗？"
→ VisionTool(task_type='scene') + KnowledgeTool(policy_check)
→ 返回：{ place: '杭州西湖', pet_friendly: true }

场景3：食物安全检测
用户：[上传食物照片] + "我家狗能吃这个吗？"
→ VisionTool(task_type='food_safety', pet_type='dog')
→ 返回：{ food: '葡萄', safe: false, action: '立即催吐并就医' }
```

---

## 八、Prompt Engineering

### 8.1 System Prompt 核心内容

```
你是一位专业的「宠物友好旅行规划师AI助手」，名字叫"爪爪"。

## 你的身份
- 精通各类宠物的习性和出行需求
- 熟悉全国各地的宠物友好政策、场所和服务
- 擅长根据宠物特点制定最优行程
- 具备图片理解能力和丰富知识库

## 你的核心能力
🗺️ 行程规划 | 🔍 场所推荐 | 👁️ 图片理解 | 📚 知识问答
🌤️ 实时建议 | 🆘 应急指导

## 回复原则
- 始终优先考虑宠物的安全和舒适
- 提供具体可操作的建议
- 使用温暖友好的语气，适当使用emoji
- 安全问题特别强调【⚠️】标记
```

### 8.2 输出格式约定

| 类型 | 标记 |
|------|------|
| 重要提示 | 【⚠️】 |
| 地点 | 【📍】 |
| 图片分析 | 【📷】 |
| 知识引用 | 【📚】 |
| 联网信息 | 【🌐】 |

---

## 九、Memory System

### 9.1 会话记忆结构

```javascript
sessionMemory = {
  conversationHistory: [],    // 对话历史（包含图片记录）
  currentItinerary: null,     // 当前规划的行程
  userContext: {
    pets: [],                 // 本次提到的宠物
    destination: '',          // 目的地
    dates: {},                // 出行日期
    constraints: [],          // 约束条件
    preferences: []           // 实时偏好
  },
  pendingTasks: [],           // 待完成任务
  recentImages: [],           // 最近处理的图片
  searchHistory: []           // 搜索历史
}
```

### 9.2 长期记忆结构

```javascript
longTermMemory = {
  userId: '',
  profile: {
    petProfiles: [],          // 宠物档案（含品种识别历史）
    travelHistory: [],        // 历史行程
    preferences: {},          // 长期偏好
    imageGallery: [],         // 用户上传过的图片记录
  },
  feedbackHistory: [],        // 反馈记录
  knowledgeInteractions: []   // 知识查询历史
}
```

---

## 十、完整数据流

### 10.1 标准请求流程（行程规划）

```
用户发送: "帮我规划3天北京带金毛的行程"
    ↓
【前端】POST /api/chat { message, images, userInfo }
    ↓
【后端】server.js → agent.run(userInput)
    ↓
【Router V2】→ intentRecognizer.recognize()
    ↓
【Layer 1】非紧急/非图片/非闲聊 → 放行
【Layer 2】特征评分: generate_itinerary = 0.87 (> 0.75) → 直接返回
    ↓
【Planner V2】检测到 requiresSubAgent('generate_itinerary')
    ↓
【Router】dispatchToSubAgent('generate_itinerary', request)
    ↓
【TravelPlanner】
  Step 1: SessionManager.getSession()
  Step 2: SlotManager.extractSlots() → { dest:"北京", days:3, pet:"金毛" }
  Step 3: ClarificationEngine → isReady: true
  Step 4: ToolOrchestrator.buildExecutionPlan()
    Phase1[并行]: POI搜索 + 政策查询 + 天气 + 品种评估
    Phase2[串行]: LLM行程生成
    Phase3[并行]: 出行清单
  Step 5: executePlan() → 整合结果
  Step 6: _formatMultiDaySameCity() → 多日游模版输出
    ↓
【响应】{
  type: "multi_day_same_city",
  bubble: "给你规划了北京3日游...",
  content: "...",
  actions: ["重新生成", "修改行程", "分享攻略"]
}
```

### 10.2 地点查询流程

```
用户发送: "北京有什么宠物友好酒店"
    ↓
【Layer 2】search_poi = 0.82 → 直接返回
    ↓
【Planner V2】检测到 requiresSubAgent('search_poi')
    ↓
【Router】dispatchToSubAgent('search_poi', request)
    ↓
【PoiSearcher】
  Step 1: _extractSearchInfo() → { city:"北京", category:"酒店", count:6 }
  Step 2: 并行检索
    ├── _searchLocal() → 本地POI数据库 → 4条结果
    └── _searchAmap() → 高德地图API → 8条结果
  Step 3: _mergeResults() → 去重后 10条
  Step 4: _groupResults() → 按区域分3组
  Step 5: formatter.poiSearchTemplate() → 格式化输出
    ↓
【响应】{
  type: "poi_search",
  bubble: "给你推荐6个北京宠物友好酒店...",
  content: "...",
  actions: ["筛选", "地图查看", "查看更多"]
}
```

---

## 十一、文件结构

```
旅行攻略/
├── server.js                          # 服务入口
├── AGENT_DESIGN.md                    # 本文档
│
├── agent/
│   ├── config.js                      # 配置（751个关键词 + 意图定义）
│   │
│   ├── core/
│   │   ├── index.js                   # Agent 主入口
│   │   ├── router.js                  # V2 三层调度路由器 + 子Agent分发
│   │   └── planner.js                 # V2 复合意图规划器
│   │
│   ├── intent/                        # 三层意图识别模块
│   │   ├── index.js                   # 意图识别主入口
│   │   ├── layer1_fast.js             # Layer 1: 快速拦截层
│   │   ├── layer2_enhanced.js         # Layer 2: 规则增强层
│   │   ├── layer3_llm.js              # Layer 3: LLM 语义层
│   │   ├── feature_extractor.js       # 多维特征提取器
│   │   ├── entity_recognizer.js       # 轻量级实体识别器
│   │   ├── intent_cache.js            # LLM 结果缓存
│   │   └── prompts/
│   │       └── classify_prompt.js     # LLM 分类 Prompt 模板
│   │
│   ├── subagents/                     # 子Agent模块
│   │   ├── travel_planner/            # 旅行攻略规划子Agent
│   │   │   ├── index.js               # 子Agent主入口
│   │   │   ├── slot_manager.js        # 槽位定义与提取器
│   │   │   ├── clarification.js       # 澄清策略引擎
│   │   │   ├── tool_orchestrator.js   # 工具编排器
│   │   │   ├── session_manager.js     # 会话状态管理
│   │   │   └── memory_store.js        # 长期记忆存储
│   │   │
│   │   └── poi_searcher/              # 地点查询子Agent 【v2.1新增】
│   │       └── index.js               # POI Searcher 主入口
│   │
│   ├── skills/
│   │   ├── city_policy_skill.js       # Skill 1: 城市政策查询
│   │   ├── travel_checklist_skill.js  # Skill 2: 出行清单
│   │   └── breed_risk_skill.js        # Skill 3: 品种风险评估
│   │
│   ├── tools/
│   │   ├── registry.js                # 工具注册中心
│   │   ├── itinerary_tool.js          # 行程生成工具
│   │   ├── poi_tool.js                # POI 搜索工具
│   │   ├── knowledge.js               # 知识库检索工具
│   │   ├── vision_tool.js             # 图片分析工具
│   │   ├── weather_tool.js            # 天气查询工具
│   │   └── web_search_tool.js         # 联网搜索工具
│   │
│   ├── utils/
│   │   ├── formatter.js               # 回答模版引擎（含3种攻略模版）
│   │   ├── logger.js                  # 日志工具
│   │   └── helpers.js                 # 通用辅助函数
│   │
│   └── services/
│       ├── llm_client.js              # LLM 客户端（智谱）
│       ├── amap_service.js            # 高德地图服务
│       └── memory_service.js          # 记忆服务
│
├── data/
│   ├── knowledge_base.js              # 结构化知识库
│   ├── entity_dict.js                 # 实体词典
│   ├── local_poi_db.js                # 本地POI数据库
│   └── prompts/
│       ├── system_prompt.js           # System Prompt
│       ├── itinerary_prompt.js        # 行程生成 Prompt
│       └── clarification_prompts.js   # 澄清话术 Prompt
│
├── tests/
│   ├── unit/
│   │   ├── intent.test.js             # 意图识别测试
│   │   ├── slot_extraction.test.js    # 槽位提取测试
│   │   └── template.test.js           # 模版输出测试
│   │
│   └── integration/
│       ├── e2e_flow.test.js           # 端到端流程测试
│       └── subagent.test.js           # 子Agent测试
│
├── .env.example                       # 环境变量示例
├── package.json                       # 项目配置
└── DEPLOY_GUIDE.md                    # 部署指南
```

---

## 十二、关键接口定义

### 12.1 主聊天接口

```typescript
POST /api/chat
Content-Type: application/json

Request:
{
  message: string                    // 用户消息
  images?: string[]                  // Base64 图片数组
  sessionId: string                  // 会话ID
  userId?: string                    // 用户ID
  context?: {
    location?: { lat, lng }          // 地理位置
    time: string                     // 当前时间
    platform: string                 // 平台信息
  }
}

Response:
{
  success: boolean
  reply: {
    type: 'text' | 'itinerary' | 'poi_list' | 'card' | 'image_analysis'
    content: string                  // 显示内容
    bubble?: string                  // 对话气泡文字（可选）
    structured?: object              // 结构化数据（前端渲染用）
    actions?: Action[]               // 可操作按钮
  }
  metadata: {
    intent: string                   // 识别到的意图
    confidence: number               // 置信度
    processingTime: number           // 处理耗时(ms)
    modelUsed: string                // 使用的模型
    toolsInvoked: string[]           // 调用的工具列表
  }
  sessionId: string
}
```

### 12.2 流式接口

```typescript
POST /api/chat/stream
Content-Type: application/json

// Request 同上

// Response: Server-Sent Events (SSE)
event: start
data: {"intent":"generate_itinerary","confidence":0.87}

event: thinking
data: {"content":"正在为您规划北京3天带金毛的行程..."}

event: tool_call
data: {"tool":"poi_search","status":"calling"}

event: tool_result
data: {"tool":"poi_search","result":{...}}

event: content
data: {"content":"Day1: ..."}  // 流式输出

event: done
data: {"processingTime":3200,"tools":["poi_search","policy","llm"]}
```

### 12.3 子Agent分发接口

```typescript
// Router 内部调用
interface SubAgentDispatch {
  intent: string                    // 意图标识
  request: {
    text: string                    // 用户原始输入
    sessionId: string
    userId?: string
    context?: Record<string, any>
  }
  options?: {
    timeout?: number                // 超时时间(ms)，默认 10000
    fallbackReply?: string          // 失败时的兜底回复
  }
}

interface SubAgentResponse {
  success: boolean
  reply: ReplyObject                // 统一的回复对象
  metadata: {
    subAgent: string                // 子Agent名称
    processingTime: number
    error?: string
  }
}
```

---

## 十三、配置说明

### 13.1 环境变量

```bash
# .env 配置
ZHIPU_API_KEY=your_api_key          # 智谱AI API Key
AMAP_KEY=your_amap_key              # 高德地图 API Key
PORT=3000                           # 服务端口
NODE_ENV=development                # 环境: development | production
LOG_LEVEL=info                      # 日志级别: debug | info | warn | error
ENABLE_CACHE=true                   # 是否启用缓存
CACHE_TTL=3600                      # 缓存过期时间(秒)
MAX_SESSION_AGE=86400000            # 会话最大存活时间(ms), 默认24h
```

### 13.2 意图配置 (config.js)

```javascript
module.exports = {
  // 三层意图识别配置
  intentRecognition: {
    layer1: {
      enabled: true,
      emergencyPatterns: ['吐血', '抽搐', '中毒', '骨折'],  // 紧急关键词
      chitChatPatterns: ['你好', '谢谢', '再见'],            // 闲聊关键词
      offTopicPatterns: ['股票', '基金', '政治']              // Off-topic关键词
    },
    layer2: {
      enabled: true,
      keywordWeight: 0.40,           // 关键词权重
      entityWeight: 0.25,            // 实体权重
      patternWeight: 0.20,           // 正则权重
      contextWeight: 0.10,           // 上下文权重
      sentenceWeight: 0.05,          // 句式权重
      confidenceThreshold: 0.75,     // 置信度阈值
      conflictThreshold: 0.12        // 冲突阈值
    },
    layer3: {
      enabled: true,
      model: 'glm-4-flash',          // 使用的模型
      cacheEnabled: true,            // 是否缓存
      cacheTTL: 3600000,             // 缓存TTL (1小时)
      similarityThreshold: 0.85      // 相似度阈值
    }
  },

  // 子Agent配置
  subAgents: {
    travel_planner: {
      enabled: true,
      maxTurns: 10,                  // 最大澄清轮次
      timeout: 30000,                // 超时时间(ms)
      defaultDays: 3,                // 默认天数
      maxDays: 15                    // 最大天数
    },
    poi_searcher: {
      enabled: true,
      timeout: 10000,                // 超时时间(ms)
      maxResults: 20,                // 最大返回数量
      defaultCount: 6                // 默认返回数量
    }
  },

  // 21个意图定义（含751个关键词）
  intents: [
    { intent: 'emergency_help', priority: 10, keywords: [...] },
    { intent: 'generate_itinerary', priority: 9, keywords: [...] },
    // ... 共21个意图
  ]
}
```

---

## 十四、错误处理与降级

### 14.1 错误分级

| 级别 | 类型 | 处理方式 | 示例 |
|------|------|---------|------|
| L1 | 用户输入无效 | 即时反馈 | "请告诉我你想去哪个城市" |
| L2 | 工具调用失败 | 降级处理 | POI搜索失败 → 用知识库兜底 |
| L3 | LLM调用失败 | 缓存/简化回复 | glm-4-plus失败 → 降级glm-4-flash |
| L4 | 子Agent超时 | 返回部分结果 | 返回已生成的部分行程 |
| L5 | 系统异常 | 兜底回复 | "抱歉，请稍后再试" |

### 14.2 降级策略

```javascript
// 工具降级链
const TOOL_FALLBACK_CHAIN = {
  poi_search: ['local_db', 'amap_api', 'knowledge_base'],
  weather: ['amap_api', 'cache', 'default_response'],
  llm: ['glm-4-plus', 'glm-4-flash', 'template_fallback']
}

// 子Agent降级
const SUBAGENT_FALLBACK = {
  travel_planner: {
    timeout: '返回已有槽位的简化行程',
    error: '使用静态行程模版'
  },
  poi_searcher: {
    timeout: '返回本地数据库结果',
    error: '返回热门POI列表'
  }
}
```

---

## 十五、监控与日志

### 15.1 日志规范

```javascript
// 日志格式
logger.info('Module', 'message', { key: value })
logger.warn('Module', 'warning message', { key: value })
logger.error('Module', 'error message', error)

// 关键日志节点
logger.info('Router', `意图识别完成: intent=${intent}, confidence=${confidence}, layer=${layer}`)
logger.info('TravelPlanner', `槽位提取: ${JSON.stringify(slots)}`)
logger.info('PoiSearcher', `检索结果: local=${local.length}, amap=${amap.length}`)
logger.info('ToolOrchestrator', `执行计划: Phase1耗时=${t1}ms, Phase2耗时=${t2}ms`)
```

### 15.2 性能指标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| P50 响应时间 | < 500ms | 简单查询 |
| P99 响应时间 | < 5000ms | 复杂行程规划 |
| 意图识别准确率 | > 92% | Layer 1+2 覆盖率 |
| LLM 调用占比 | < 20% | 大部分走规则 |
| 工具成功率 | > 95% | 含降级后 |

---

## 附录

### A. 版本历史

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v1.0 | 2026-03 | 初始版本，单层意图识别 |
| v2.0 | 2026-07 | 重构为三层意图识别 + TravelPlanner子Agent |
| v2.1 | 2026-08-11 | 新增 PoiSearcher 子Agent + 3种回答模版 |
| v2.2 | 2026-08-11 | 文档整合重构，合并技术设计文档 |

### B. 相关文档

- `DEPLOY_GUIDE.md` - 部署指南
- `AGENT_TECH_DESIGN.md` - 技术细节（已合并至本文档）

### C. 联系方式

如有问题或建议，请联系开发团队。
