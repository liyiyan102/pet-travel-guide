# 小D Agent 枚举值文档

> 本文档记录了宠物出行AI助手（小D）的所有意图、来源、类型枚举值，供调试和开发参考。

---

## 一、意图 (Intent) 枚举

意图表示用户想要完成的任务类型，由三层意图识别器（Layer1/Layer2/Layer3）共同识别。

### 1.1 意图列表

共 **22 个意图**，定义在 `agent/config.js` 的 `intents` 对象中。

| 意图值 | 常量名 | 中文名 | 优先级 | 需图片 | Skill | 说明 |
|--------|--------|--------|--------|--------|-------|------|
| `emergency_help` | EMERGENCY_HELP | 紧急求助 | P10 | 否 | - | 中毒/受伤/急救/骨折等紧急医疗 |
| `pet_breed_recognition` | PET_BREED_RECOGNITION | 宠物品种识别 | P10 | ✅ | - | 识别狗/猫品种 |
| `scene_recognition` | SCENE_RECOGNITION | 场景识别 | P10 | ✅ | - | 识别景点/地点 |
| `generate_itinerary` | GENERATE_ITINERARY | 生成行程规划 | P9 | 否 | - | 核心功能，多日行程 |
| `modify_itinerary` | MODIFY_ITINERARY | 修改行程 | P9 | 否 | - | 增删景点/改天数 |
| `breed_risk` | BREED_RISK | 品种风险评估 | P9 | 否 | Skill 3 | 品种能否入城/乘交通 |
| `travel_checklist` | TRAVEL_CHECKLIST | 出行清单生成 | P8 | 否 | Skill 2 | 证件/物品/装备清单 |
| `search_poi` | SEARCH_POI | POI搜索 | P8 | 否 | - | 餐厅/酒店/公园/景点 |
| `policy_check` | POLICY_CHECK | 城市宠物政策 | P8 | 否 | Skill 1 | 养犬规定/禁养/地铁 |
| `food_detection` | FOOD_DETECTION | 食物安全检测 | P8 | 否 | - | 能否吃/有毒吗 |
| `transport_guide` | TRANSPORT_GUIDE | 交通出行指南 | P7 | 否 | - | 飞机/高铁流程 |
| `pet_advice` | PET_ADVICE | 宠物出行建议 | P7 | 否 | - | 注意事项/防护 |
| `weather_check` | WEATHER_CHECK | 天气查询 | P6 | 否 | - | 温度/降雨/预报 |
| `realtime_search` | REALTIME_SEARCH | 实时信息搜索 | P6 | 否 | - | 最新/开放时间/价格 |
| `knowledge_query` | KNOWLEDGE_QUERY | 知识问答 | P5 | 否 | - | 兜底知识类问题 |
| `chit_chat` | CHIT_CHAT | 闲聊 | P1 | 否 | - | 问候/感谢/告别 |
| `image_analysis` | IMAGE_ANALYSIS | 通用图片分析 | - | ✅ | - | 纯图片上传 |
| `image_qa` | IMAGE_QA | 图片问答 | - | ✅ | - | 图片+具体问题 |
| `travel_tips` | TRAVEL_TIPS | 旅行攻略分享 | - | 否 | - | 经验/避坑指南 |
| `city_policy` | CITY_POLICY | 城市政策(内部) | - | 否 | - | policy_check 内部用 |
| `off_topic` | OFF_TOPIC | 无关问题拦截 | - | 否 | - | 股票/编程/政治等 |

### 1.2 意图识别优先级

```
Layer 1 (快速拦截, <1ms)
  ├─ emergency_help    (P10, 紧急关键词)
  ├─ 图片意图          (P10, 需有图片)
  │   ├─ pet_breed_recognition
  │   ├─ scene_recognition
  │   ├─ food_detection (图片+食物)
  │   └─ image_analysis (纯图片)
  ├─ chit_chat         (P1, 精确短语)
  └─ off_topic         (快速排除)

Layer 2 (规则评分, <5ms)
  ├─ 按 priority 排序
  ├─ 关键词 + 正则 + 实体 + 句式 加权评分
  └─ 置信度 > 0.75 直接分发

Layer 3 (LLM语义, ~200-500ms)
  ├─ Layer2 置信度不足时触发
  ├─ 调用智谱 GLM-4-flash
  └─ Few-shot 示例引导
```

### 1.3 意图与处理器映射

| 意图 | 处理器方法 | 响应类型 |
|------|-----------|---------|
| `emergency_help` | handleKnowledgeQuery | knowledge_answer |
| `pet_breed_recognition` | handleVisionTask | image_analysis |
| `scene_recognition` | handleVisionTask | image_analysis |
| `image_analysis` | handleVisionTask | image_analysis |
| `food_detection` (有图) | handleVisionTask | image_analysis |
| `food_detection` (无图) | handleKnowledgeQuery | knowledge_answer |
| `generate_itinerary` | 子Agent / handleItineraryGeneration | itinerary |
| `modify_itinerary` | handleComplexQuery | text |
| `search_poi` | handlePOISearch / 子Agent | poi_list |
| `weather_check` | handleWeatherQuery | weather |
| `knowledge_query` | handleCityPolicySkill → handleKnowledgeQuery | knowledge_answer |
| `policy_check` | handleCityPolicySkill → handleKnowledgeQuery | policy_answer |
| `pet_advice` | handleKnowledgeQuery | knowledge_answer |
| `travel_checklist` | handleChecklistSkill | checklist |
| `breed_risk` | handleBreedRiskSkill | breed_risk |
| `realtime_search` | handleRealtimeSearch | knowledge_answer |
| `transport_guide` | handleBreedRiskSkill → handleComplexQuery | text |
| `travel_tips` | handleBreedRiskSkill → handleComplexQuery | text |
| `chit_chat` | handleGeneralChat | text |
| `off_topic` | handleOffTopic | off_topic |

---

## 二、来源 (Source) 枚举

来源表示意图识别结果由哪一层产生，反映识别路径。

### 2.1 Layer 1 来源

| source 值 | 说明 | 触发条件 |
|-----------|------|---------|
| `layer1_emergency` | Layer1 紧急关键词 | 匹配中毒/受伤/急救等 |
| `layer1_image_breed` | Layer1 图片+品种识别 | 有图片+问品种 |
| `layer1_image_scene` | Layer1 图片+场景识别 | 有图片+问地点 |
| `layer1_image_food` | Layer1 图片+食物检测 | 有图片+问食物安全 |
| `layer1_image_generic` | Layer1 纯图片分析 | 有图片但无明确问题 |
| `layer1_chitchat` | Layer1 闲聊短语 | 精确匹配"你好/谢谢/再见" |
| `layer1_offtopic` | Layer1 无关话题 | 匹配股票/编程/政治等 |

### 2.2 Layer 2 来源

| source 值 | 说明 | 触发条件 |
|-----------|------|---------|
| `layer2` | Layer2 规则直接分发 | 置信度 > 0.75，无需 LLM |

### 2.3 Layer 3 来源

| source 值 | 说明 | 触发条件 |
|-----------|------|---------|
| `layer3_llm` | Layer3 LLM 正常识别 | LLM 调用成功 |
| `layer3_cache` | Layer3 缓存命中 | 相同消息曾识别过 |
| `layer3_timeout_fallback` | Layer3 超时降级 | LLM 8秒未响应 |
| `layer3_fallback_layer2` | Layer3 失败降级到 Layer2 | LLM 调用异常 |
| `layer3_fallback_chitchat` | Layer3 失败降级到闲聊 | LLM + Layer2 均不可用 |

### 2.4 其他来源

| source 值 | 说明 | 触发条件 |
|-----------|------|---------|
| `fallback` | 所有层均不可用 | 识别器初始化失败 |
| `error` | 识别异常 | 识别过程抛出异常 |
| `unknown` | 未知来源 | source 字段缺失 |
| `planner` | 来自规划引擎 | planner.plan() 返回结果 |
| `direct_call` | 直接调用子Agent | 跳过意图识别，直达子Agent |

### 2.5 来源与置信度关系

| 来源 | 置信度范围 | 可信度 |
|------|-----------|--------|
| `layer1_*` | 0.85 ~ 1.0 | ⭐⭐⭐⭐⭐ 极高 |
| `layer2` | 0.75 ~ 0.95 | ⭐⭐⭐⭐ 高 |
| `layer3_llm` | 0.40 ~ 0.95 | ⭐⭐⭐ 中 |
| `layer3_cache` | 同首次识别 | ⭐⭐⭐ 中 |
| `layer3_timeout_fallback` | 0.25 ~ 0.85 | ⭐⭐ 低 |
| `layer3_fallback_layer2` | 0.30 ~ 0.85 | ⭐⭐ 低 |
| `layer3_fallback_chitchat` | 0.20 ~ 0.25 | ⭐ 极低 |
| `fallback` / `error` | 0.05 ~ 0.10 | ❌ 不可信 |

---

## 三、类型 (Type) 枚举

类型表示响应内容的结构形式，决定了前端如何渲染。

### 3.1 响应类型列表

| type 值 | 中文名 | 说明 | 典型意图 |
|---------|--------|------|---------|
| `text` | 纯文本 | 通用文本回复 | chit_chat, transport_guide |
| `image_analysis` | 图片分析 | 包含图片识别结果 | pet_breed_recognition, image_analysis |
| `clarification` | 澄清追问 | 需用户补充信息 | generate_itinerary (缺参数) |
| `itinerary` | 行程规划 | 完整多日行程 | generate_itinerary |
| `poi_list` | POI列表 | 场所搜索结果 | search_poi |
| `weather` | 天气 | 天气查询结果 | weather_check |
| `knowledge_answer` | 知识问答 | 知识库检索回答 | knowledge_query, food_detection |
| `policy_answer` | 政策回答 | 政策查询结果 | policy_check |
| `checklist` | 清单 | 出行准备清单 | travel_checklist |
| `breed_risk` | 品种风险 | 风险评估结果 | breed_risk |
| `off_topic` | 无关话题 | 拦截无关问题 | off_topic |
| `compound` | 复合结果 | 多意图合并 | 复合意图 |
| `error` | 错误 | 处理失败 | 异常情况 |

### 3.2 类型与字段对应

| type | 必有字段 | 可选字段 |
|------|---------|---------|
| `text` | content | suggestions, actions |
| `image_analysis` | content, imageAnalysis | suggestions, actions |
| `clarification` | content, missingFields | suggestions |
| `itinerary` | content, itineraryData | suggestions, actions |
| `poi_list` | content, poiList | suggestions, actions |
| `weather` | content, weatherData | suggestions |
| `knowledge_answer` | content, sources | suggestions |
| `policy_answer` | content, sources | suggestions |
| `checklist` | content | suggestions |
| `breed_risk` | content | suggestions |
| `off_topic` | content | suggestions |
| `compound` | content, primaryIntent, subIntents | suggestions, actions |
| `error` | content | - |

---

## 四、建议/操作类型 (Suggestion Type) 枚举

### 4.1 跳转型建议

点击后触发对应意图：

| type 值 | 说明 |
|---------|------|
| `generate_itinerary` | 跳转行程规划 |
| `search_poi` | 跳转POI搜索 |
| `policy_check` | 跳转政策查询 |
| `travel_checklist` | 跳转清单生成 |
| `knowledge_query` | 跳转知识问答 |
| `transport_guide` | 跳转交通指南 |
| `breed_risk` | 跳转品种风险评估 |

### 4.2 操作型建议

| type 值 | 说明 |
|---------|------|
| `action` | 通用操作 |
| `follow_up` | 追问 |
| `view_detail` | 查看详情 |
| `view_poi_detail` | 查看POI详情 |
| `modify_day` | 修改行程 |
| `new_image` | 上传新图片 |
| `ask_followup` | 继续追问 |
| `new_question` | 换个问题 |
| `image_upload` | 上传图片 |
| `example` | 示例 |
| `retry` | 重试 |
| `new_chat` | 新对话 |
| `reset` | 重置 |
| `save` | 保存 |
| `share` | 分享 |

---

## 五、调试参考

### 5.1 调试台字段说明

调试台右侧"最近请求"面板显示的关键字段：

```
metrics.intent      → 意图（如 chit_chat, food_detection）
metrics.source      → 来源（如 layer1_chitchat, layer3_llm）
metrics.confidence  → 置信度（0.0~1.0）
metrics.latency     → 耗时（ms）
metrics.directCall  → 是否直接调用子Agent
response.type       → 响应类型（如 text, knowledge_answer）
```

### 5.2 常见问题排查

| 现象 | 可能原因 | 排查方法 |
|------|---------|---------|
| intent 显示 `text` | result.intent 未正确传递 | 检查 planner.js 是否附加 intent |
| source 显示 `planner` | 未从 routingResult 获取 source | 检查 planner.js 的 result.source |
| source 显示 `error` | 识别过程抛异常 | 查看完整错误信息 |
| source 显示 `layer3_fallback_chitchat` | LLM 失败且 Layer2 无候选 | 检查网络/API Key |
| intent 显示 `off_topic` | Layer1 误拦截或 LLM 误判 | 检查 offTopicPatterns |
| confidence 为 0.05 | 识别异常降级 | 查看 error 字段 |

### 5.3 测试用例期望结果

| 输入 | 期望 intent | 期望 source | 期望 type |
|------|------------|------------|-----------|
| "你好" | chit_chat | layer1_chitchat | text |
| "你是谁？" | chit_chat | layer3_llm | text |
| "狗狗能吃巧克力吗？" | food_detection | layer3_llm | knowledge_answer |
| "我想去杭州玩3天" | generate_itinerary | layer3_llm | itinerary |
| "附近有什么宠物友好餐厅" | search_poi | layer2 | poi_list |
| "北京地铁能带狗吗" | policy_check | layer2 | policy_answer |
| "法斗能坐飞机吗" | breed_risk | layer2 | breed_risk |
| "带狗出行需要准备什么" | travel_checklist | layer2 | checklist |
| "今天天气怎么样" | weather_check | layer1_chitchat 或 layer2 | weather |
| "股票今天涨了没" | off_topic | layer1_offtopic | off_topic |

---

## 六、文件索引

| 文件 | 作用 |
|------|------|
| `agent/config.js` | 意图定义 + 路由规则 + 关键词 |
| `agent/intent/index.js` | 三层识别器主入口 |
| `agent/intent/layer1_fast.js` | Layer1 快速拦截 |
| `agent/intent/layer2_enhanced.js` | Layer2 规则评分 |
| `agent/intent/layer3_llm.js` | Layer3 LLM 语义 |
| `agent/intent/feature_extractor.js` | 特征提取 + 关键词匹配 |
| `agent/intent/entity_recognizer.js` | 实体识别（城市/品种/食物） |
| `agent/intent/prompts/classify_prompt.js` | LLM 分类 Prompt |
| `agent/core/router.js` | 意图路由器 |
| `agent/core/planner.js` | 规划引擎（意图→处理器） |
| `agent/core/index.js` | Agent 主入口 |

---

*文档更新时间: 2026-08-12*
*Agent 版本: v1.0.0*
*Agent 名称: 小D*
