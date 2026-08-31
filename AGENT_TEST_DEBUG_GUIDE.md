# PetTravelAgent v2.0 调试与测试方案文档

> **版本**: 1.0  
> **更新日期**: 2026-07-28  
> **适用项目**: 宠物友好旅行攻略 Agent (猫豆/爪爪)  
> **基于设计**: [AGENT_DESIGN.md](./AGENT_DESIGN.md)

---

## 目录

1. [概述](#1-概述)
2. [测试架构](#2-测试架构)
3. [环境准备](#3-环境准备)
4. [L1 基础API测试](#4-l1-基础api测试)
5. [L2 对话行为测试](#5-l2-对话行为测试)
6. [L3 端到端测试](#6-l3-端到端测试)
7. [L4 调试工具](#7-l4-调试工具)
8. [模块级单元测试](#8-模块级单元测试)
9. [性能测试](#9-性能测试)
10. [安全测试](#10-安全测试)
11. [常见问题排查](#11-常见问题排查)
12. [测试报告模板](#12-测试报告模板)

---

## 1. 概述

### 1.1 文档目的

本文档为 **PetTravelAgent v2.0** 提供完整的调试与测试方案，包括：

| 测试层级 | 目标 | 执行者 |
|---------|------|--------|
| L1 基础API | 验证服务基础功能可用性 | 开发/CI |
| L2 对话行为 | 验证AI正确调用工具、遵守规则 | 开发/QA |
| L3 端到端 | 验证完整业务场景全链路 | QA |
| L4 调试工具 | 单次请求深度分析 | 开发 |
| 模块单元测试 | 验证各模块独立正确性 | 开发 |
| 性能测试 | 验证响应时间、并发能力 | QA/运维 |
| 安全测试 | 验证输入安全、数据保护 | 安全团队 |

### 1.2 Agent 架构回顾

```
PetTravelAgent v2.0 ("猫豆")
├── 用户层: 微信小程序 (chat.js) → 云函数 (petAgent)
├── 服务层: Express HTTP Server (server.js, port 3000)
├── Agent核心
│   ├── core/index.js       -- 主入口 (PetTravelAgent 单例)
│   ├── core/router.js      -- 意图路由 (17种意图)
│   └── core/planner.js     -- 规划引擎 (8类处理器)
├── 工具层 (6个工具)
│   ├── VisionTool          -- 图片分析 (glm-4v)
│   ├── KnowledgeTool       -- RAG知识检索 (本地+联网)
│   ├── WebSearchTool       -- 实时搜索 (智谱WebSearch)
│   ├── POITool             -- 地点搜索 (腾讯地图)
│   ├── WeatherTool         -- 天气查询 (和风天气)
│   └── ItineraryTool       -- 行程生成 (LLM驱动)
├── LLM层: ZhiPuClient (glm-4-flash / glm-4-plus / glm-4v-flash)
├── 数据层: 知识库 (品种/食物安全/场所政策)
├── 记忆层: ContextManager (会话/历史/用户画像)
└── 输出层: Formatter (美化和emoji丰富)
```

### 1.3 测试覆盖范围

```
测试覆盖矩阵
┌─────────────────┬───────┬───────┬───────┬───────┬───────┐
│ 模块            │  L1   │  L2   │  L3   │  单元  │  性能 │
├─────────────────┼───────┼───────┼───────┼───────┼───────┤
│ HTTP 服务       │  ✓    │  ✓    │  ✓    │  -    │  ✓    │
│ 意图路由 Router │  -    │  ✓    │  ✓    │  ✓    │  -    │
│ 规划引擎 Planner│  -    │  ✓    │  ✓    │  ✓    │  ✓    │
│ VisionTool      │  -    │  ✓    │  ✓    │  ✓    │  ✓    │
│ KnowledgeTool   │  -    │  ✓    │  ✓    │  ✓    │  ✓    │
│ WebSearchTool   │  -    │  ✓    │  ✓    │  ✓    │  -    │
│ POITool         │  -    │  ✓    │  ✓    │  ✓    │  -    │
│ WeatherTool     │  -    │  ✓    │  ✓    │  ✓    │  -    │
│ ItineraryTool   │  -    │  ✓    │  ✓    │  ✓    │  ✓    │
│ 记忆系统        │  -    │  -    │  ✓    │  ✓    │  -    │
│ 输出格式化      │  -    │  ✓    │  ✓    │  ✓    │  -    │
└─────────────────┴───────┴───────┴───────┴───────┴───────┘
```

---

## 2. 测试架构

### 2.1 四层测试体系

```
                    ┌─────────────────────────┐
                    │     L4 调试工具          │
                    │  单次请求完整响应打印     │
                    │  耗时分析 + 日志保存     │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │     L3 端到端测试        │
                    │  完整行程生成             │
                    │  多轮对话上下文保持       │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │     L2 对话行为测试       │
                    │  POI搜索 / 知识检索       │
                    │  行程生成 / 天气查询       │
                    │  闲聊 / 无结果处理        │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │     L1 基础API测试       │
                    │  健康检查 / 服务状态      │
                    │  基本对话 / 会话重置      │
                    │  错误处理                │
                    └─────────────────────────┘
```

### 2.2 测试文件结构

```
旅行攻略/
├── test_agent.js              # 主测试入口（四层测试）
├── tests/                     # 扩展测试目录（建议）
│   ├── unit/                  # 单元测试
│   │   ├── router.test.js
│   │   ├── planner.test.js
│   │   ├── vision.test.js
│   │   ├── knowledge.test.js
│   │   └── formatter.test.js
│   ├── integration/           # 集成测试
│   │   ├── tools.test.js
│   │   ├── memory.test.js
│   │   └── api.test.js
│   ├── e2e/                   # 端到端测试
│   │   ├── itinerary.test.js
│   │   └── multi_turn.test.js
│   ├── performance/           # 性能测试
│   │   ├── load.test.js
│   │   └── latency.test.js
│   └── fixtures/              # 测试数据
│       ├── sample_images/     # 测试图片
│       ├── mock_responses/    # Mock响应
│       └── test_queries.json  # 测试用例集
└── debug_log.json             # 调试日志输出
```

---

## 3. 环境准备

### 3.1 本地开发环境

```bash
# 1. 进入项目目录
cd /Users/liyiyan/CodeBuddy/旅行攻略

# 2. 安装依赖
npm install

# 3. 配置环境变量（复制示例文件）
cp .env.example .env
# 编辑 .env，填入以下配置：

# 必需配置
ZHIPU_API_KEY=your_zhipu_api_key          # 智谱AI API密钥
TENCENT_MAP_KEY=your_tencent_map_key       # 腾讯地图API密钥
QWEATHER_KEY=your_qweather_key             # 和风天气API密钥

# 可选配置
PORT=3000                                  # 服务端口
LOG_LEVEL=DEBUG                            # 日志级别
NODE_ENV=development                       # 运行环境
```

### 3.2 启动服务

```bash
# 方式一：直接启动
node server.js

# 方式二：使用 nodemon（开发时自动重启）
npm install -g nodemon
nodemon server.js

# 方式三：Docker启动
docker-compose up -d

# 验证服务启动成功
curl http://127.0.0.1:3000/health
# 预期输出: {"status":"ok","service":"Pet Travel Agent","timestamp":...}
```

### 3.3 服务健康检查清单

| 检查项 | 命令 | 预期结果 |
|-------|------|---------|
| 服务状态 | `curl http://127.0.0.1:3000/health` | `{"status":"ok",...}` |
| Agent信息 | `curl http://127.0.0.1:3000/api/status` | 包含name, version |
| 端口监听 | `lsof -i :3000` | Node进程在监听 |
| 日志输出 | 查看控制台 | 无ERROR级别日志 |

---

## 4. L1 基础API测试

### 4.1 测试目标

验证 HTTP 服务的基础功能正常，**不需要 API Key** 即可运行。

### 4.2 测试用例

#### TC-L1-01: 健康检查端点

```javascript
// 测试文件: test_agent.js -> test_health_check()
// 用途: 验证服务是否正常运行

async function test_health_check() {
  const res = await request('/health')
  
  // 断言
  assert(res.status === 200, '应返回200')
  assert(res.data.status === 'ok', 'status应为ok')
  assert(res.data.service === 'Pet Travel Agent', 'service名称正确')
}
```

**验证点：**
- [ ] HTTP 状态码为 200
- [ ] 响应体包含 `status: "ok"`
- [ ] 响应体包含正确的 service 名称
- [ ] 响应时间 < 100ms

---

#### TC-L1-02: 服务状态端点

```javascript
// 测试文件: test_agent.js -> test_service_status()

async function test_service_status() {
  const res = await request('/api/status')
  
  assert(res.status === 200, '应返回200')
  assert(res.data.success === true, 'success应为true')
  assert(res.data.data.name !== undefined, '应包含agent名称')
}
```

**验证点：**
- [ ] HTTP 状态码为 200
- [ ] 包含 Agent 名称（如"猫豆"）
- [ ] 包含版本号
- [ ] 包含活跃会话数

---

#### TC-L1-03: 基本对话功能

```javascript
// 测试文件: test_agent.js -> test_chat_basic()

async function test_chat_basic() {
  await resetSession('test_basic')
  const res = await chat('你好，你是谁？', 'test_basic')
  
  assert(res.status === 200, '应返回200')
  assert(res.data.success === true, 'success应为true')
  const reply = getReply(res)
  assert(reply.length > 0, '回复不应为空')
}
```

**验证点：**
- [ ] 请求成功
- [ ] 回复内容非空
- [ ] 回复长度 > 10 字符
- [ ] 回复包含自我介绍相关内容

---

#### TC-L1-04: 图片参数处理

```javascript
// 测试文件: test_agent.js -> test_chat_with_images()

async function test_chat_with_images() {
  const res = await chat('', 'test_image')
  // 验证图片参数不会导致崩溃
  console.log(`状态: ${res.status}`)
}
```

**验证点：**
- [ ] 服务不因空图片列表而崩溃
- [ ] 返回合理的错误或默认响应

---

#### TC-L1-05: 会话重置功能

```javascript
// 测试文件: test_agent.js -> test_reset_session()

async function test_reset_session() {
  const res = await resetSession('test_reset')
  
  assert(res.status === 200, '应返回200')
  assert(res.data.success === true, '重置应成功')
}
```

**验证点：**
- [ ] 重置请求成功
- [ ] 重置后新会话无历史上下文残留

---

#### TC-L1-06: 错误处理

```javascript
// 测试文件: test_agent.js -> test_error_handling()

async function test_error_handling() {
  const res = request('/api/chat', {
    method: 'POST',
    body: {}  // 发送空请求体
  })
  
  // 应返回客户端错误状态码
  assert(
    res.status === 400 || 
    res.status === 422 || 
    res.status === 500,
    '应返回错误状态码'
  )
}
```

**验证点：**
- [ ] 空请求体返回错误状态码 (400/422/500)
- [ ] 错误响应包含有意义的错误信息
- [ ] 服务不会崩溃

---

### 4.3 执行L1测试

```bash
# 仅执行L1测试
node test_agent.js --unit

# 预期输出:
# ==================================================
#   L1 基础API测试
# ==================================================
#
# [健康检查]
#   状态码: 200
#   ✓ 健康检查通过
#
# [服务状态]
#   ✓ 服务状态通过 (Agent: 猫豆, 版本: 2.0.0)
# ...（更多测试项）
#
# 结果: 6 通过, 0 失败
```

---

## 5. L2 对话行为测试

### 5.1 测试目标

验证 AI 能否正确识别意图并调用相应工具，**需要有效的 API Key**。

### 5.2 测试用例

#### TC-L2-01: POI搜索功能

```javascript
// 测试文件: test_agent.js -> test_tool_calling_poi()

async function test_tool_calling_poi() {
  await resetSession('test_poi')
  
  const res = await chat('帮我找北京的宠物友好公园', 'test_poi')
  const reply = getReply(res)
  
  // 验证回复包含地点相关信息
  const hasParkInfo = reply.includes('公园') || 
                      reply.includes('park') || 
                      reply.includes('朝阳') ||
                      reply.includes('景点')
  
  return hasParkInfo
}
```

**输入：** "帮我找北京的宠物友好公园"

**预期行为：**
- [ ] Intent Router 识别为 `SEARCH_POI`
- [ ] 调用 POITool 搜索腾讯地图
- [ ] 回复包含具体的公园名称和位置
- [ ] 提及宠物相关政策（牵绳、禁区等）

**验证关键词：** `公园`, `park`, `朝阳`, `奥林匹克`, `景点`, `推荐`

---

#### TC-L2-02: 知识检索功能

```javascript
// 测试文件: test_agent.js -> test_knowledge_retrieval()

async function test_knowledge_retrieval() {
  await resetSession('test_knowledge')
  
  const res = await chat('金毛能坐飞机吗？有什么限制？', 'test_knowledge')
  const reply = getReply(res)
  
  // 验证专业知识覆盖
  const keywords = ['托运', '航空', '短鼻', '健康证明', '航空箱', '飞机']
  const hit = keywords.filter(k => reply.includes(k)).length
  
  return hit >= 2  // 至少命中2个专业词汇
}
```

**输入：** "金毛能坐飞机吗？有什么限制？"

**预期行为：**
- [ ] Intent Router 识别为 `KNOWLEDGE_QUERY` 或 `PET_ADVICE`
- [ ] 调用 KnowledgeTool 检索本地知识库
- [ ] 回复包含航空托运相关知识

**验证关键词：** `托运`, `航空箱`, `健康证明`, `短鼻犬`, `证件`, `IATA`

---

#### TC-L2-03: 行程生成功能

```javascript
// 测试文件: test_agent.js -> test_itinerary_generation()

async function test_itinerary_generation() {
  await resetSession('test_itinerary')
  
  const res = await chat(
    '我想带我的小狗去北京玩1天，帮我规划一下行程',
    'test_itinerary'
  )
  const reply = getReply(res)
  
  // 验证包含行程结构
  const hasDayInfo = reply.includes('天') || 
                     reply.includes('行程') ||
                     reply.includes('上午') ||
                     reply.includes('下午') ||
                     reply.includes('景点')
  
  return hasDayInfo
}
```

**输入：** "我想带我的小狗去北京玩1天，帮我规划一下行程"

**预期行为：**
- [ ] Intent Router 识别为 `GENERATE_ITINERARY`
- [ ] 调用 ItineraryTool 生成结构化行程
- [ ] 回复包含时间段安排（上午/下午/晚上）
- [ ] 包含宠物注意事项

**验证关键词：** `第一天`, `上午`, `下午`, `景点`, `行程`, `安排`, `注意`

---

#### TC-L2-04: 天气查询功能

```javascript
// 测试文件: test_agent.js -> test_weather_query()

async function test_weather_query() {
  await resetSession('test_weather')
  
  const res = await chat(
    '北京明天天气怎么样？带狗出行需要注意什么？',
    'test_weather'
  )
  const reply = getReply(res)
  
  // 验证包含天气信息
  const hasWeather = reply.includes('天气') || 
                     reply.includes('温度') ||
                     reply.includes('°') ||
                     reply.includes('晴') ||
                     reply.includes('雨')
  
  return hasWeather
}
```

**输入：** "北京明天天气怎么样？带狗出行需要注意什么？"

**预期行为：**
- [ ] Intent Router 识别为 `WEATHER_CHECK`
- [ ] 调用 WeatherTool 查询和风天气
- [ ] 回复包含当前/预报天气
- [ ] 包含宠物出行舒适度建议

**验证关键词：** `温度`, `°`, `晴`, `雨`, `舒适度`, `热`, `冷`, `注意`

---

#### TC-L2-05: 普通闲聊

```javascript
// 测试文件: test_agent.js -> test_general_chat()

async function test_general_chat() {
  await resetSession('test_chat')
  
  const res = await chat('你叫什么名字？你擅长什么？', 'test_chat')
  const reply = getReply(res)
  
  // 验证自我介绍
  const hasName = reply.includes('猫豆') || 
                  reply.includes('旅行') ||
                  reply.includes('宠物')
  
  return hasName || reply.length > 10
}
```

**输入：** "你叫什么名字？你擅长什么？"

**预期行为：**
- [ ] Intent Router 识别为 `CHIT_CHAT`
- [ ] 不调用任何外部工具
- [ ] 回复包含Agent名称和能力介绍

**验证关键词：** `猫豆`, `爪爪`, `宠物`, `旅行`, `规划`, `助手`

---

#### TC-L2-06: 无结果/无关问题处理

```javascript
// 测试文件: test_agent.js -> test_no_result_handling()

async function test_no_result_handling() {
  await resetSession('test_noresult')
  
  const res = await chat('量子物理的基本原理是什么？', 'test_noresult')
  const reply = getReply(res)
  
  // 验证友好降级
  return reply.length > 5 && 
         !reply.includes('error') && 
         !reply.includes('Error')
}
```

**输入：** "量子物理的基本原理是什么？"

**预期行为：**
- [ ] 不触发任何业务工具
- [ ] 给出友好的拒绝或引导回复
- [ ] 不暴露内部错误信息

---

### 5.3 执行L2测试

```bash
# 仅执行L2测试（需要API Key）
node test_agent.js --prompt

# 预期输出:
# ==================================================
#   L2 对话行为测试（需要 API key）
# ==================================================
#
# [POI搜索]
#   测试: 搜索北京宠物友好公园...
#   回复 (2345ms): 我为您找到了北京的几个宠物友好公园...
#   ✓ POI搜索功能正常（回复包含地点信息）
#
# [知识检索]
#   测试: 问'金毛能坐飞机吗'...
#   回复 (1892ms): 金毛是可以坐飞机的，但需要注意以下几点...
#   ✓ 知识检索正常（命中5个关键词）
# ...（更多测试项）
#
# 结果: 6 通过, 0 失败
```

---

## 6. L3 端到端测试

### 6.1 测试目标

验证完整业务场景的全链路正确性，模拟真实用户使用流程。

### 6.2 测试用例

#### TC-L3-01: 完整行程生成（携宠自驾）

```javascript
// 测试文件: test_agent.js -> test_e2e_full_itinerary()

async function test_e2e_full_itinerary() {
  await resetSession('e2e_test')
  
  const res = await chat(
    '我想带我的中型犬去北京玩2天1晚，自驾出行，喜欢自然风光和美食，请帮我规划详细行程',
    'e2e_test'
  )
  
  const reply = getReply(res)
  const resp = getResponse(res)
  
  // 多维度验证
  const checks = [
    { label: '回复非空', ok: reply.length > 10 },
    { label: '包含目的地', ok: reply.includes('北京') },
    { label: '包含天数/行程', ok: reply.includes('2天') || reply.includes('第一天') },
    { label: '包含宠物相关', ok: reply.includes('狗') || reply.includes('宠物') },
    { label: '包含出行方式', ok: reply.includes('自驾') || reply.includes('开车') },
    { label: '有类型标识', ok: resp.type !== undefined },
    { label: '有建议操作', ok: Array.isArray(resp.suggestions) && resp.suggestions.length > 0 },
  ]
  
  return checks.every(c => c.ok)
}
```

**输入：** "我想带我的中型犬去北京玩2天1晚，自驾出行，喜欢自然风光和美食，请帮我规划详细行程"

**验证检查项：**

| 检查项 | 验证方法 | 通过标准 |
|-------|---------|---------|
| 回复非空 | `reply.length > 10` | 内容长度 > 10字符 |
| 包含目的地 | `reply.includes('北京')` | 提及北京 |
| 包含天数 | 含"2天"/"两天"/"第一天"/"第二天" | 有明确时间划分 |
| 包含宠物相关 | 含"狗"/"宠物"/"犬"/emoji | 考虑宠物因素 |
| 包含出行方式 | 含"自驾"/"开车"/"车" | 符合用户偏好 |
| 有类型标识 | `resp.type !== undefined` | 响应有类型字段 |
| 有建议操作 | `resp.suggestions.length > 0` | 提供后续操作建议 |

**预期响应结构：**
```json
{
  "success": true,
  "response": {
    "type": "itinerary",
    "content": "详细行程文本...",
    "suggestions": [
      { "type": "view_itinerary", "text": "查看详情" },
      { "type": "modify_day", "label": "修改第N天" }
    ],
    "itineraryData": { ... },
    "metrics": { ... }
  }
}
```

---

#### TC-L3-02: 多轮对话上下文保持

```javascript
// 测试文件: test_agent.js -> test_e2e_multi_turn()

async function test_e2e_multi_turn() {
  await resetSession('e2e_multi')
  
  // 第1轮：设定上下文
  let res = await chat('我想带猫去上海玩3天', 'e2e_multi')
  console.log(`[第1轮] 助手: ${getReply(res).substring(0, 100)}...`)
  
  // 第2轮：基于上下文的追问
  res = await chat('有什么宠物友好的酒店推荐吗？', 'e2e_multi')
  const reply2 = getReply(res)
  console.log(`[第2轮] 助手: ${reply2.substring(0, 100)}...`)
  
  // 验证上下文保持
  const hasContext = reply2.includes('上海') || 
                     reply2.includes('猫') || 
                     reply2.includes('酒店')
  
  return hasContext
}
```

**对话流程：**

| 轮次 | 用户输入 | 预期上下文保持 |
|-----|---------|--------------|
| 1 | "我想带猫去上海玩3天" | 设定目的地=上海, 宠物=猫, 天数=3 |
| 2 | "有什么宠物友好的酒店推荐吗？" | 应理解是上海的、适合猫的酒店 |

**验证点：**
- [ ] 第2轮回复提及"上海"
- [ ] 第2轮回复考虑猫咪需求（非狗狗）
- [ ] 推荐的酒店确实是宠物友好型

---

### 6.3 执行L3测试

```bash
# 仅执行L3测试
node test_agent.js --e2e

# 预期输出:
# ==================================================
#   L3 端到端测试（需要 API key）
# ==================================================
#
# [完整行程生成]
#   测试: 完整生成北京2天1晚携宠自驾攻略...
#   总耗时: 8.7s
#
#   回复预览:
#                     ----------------------------------------
#   🎉 太棒了！带您的中型犬去北京自驾2天1晚，我来为您精心规划！
#   
#   ## 📋 行程概览
#   - **目的地**: 北京
#   - **时长**: 2天1晚
#   - **出行方式**: 自驾（对带宠物最友好！🚗）
#   ...
#                     ----------------------------------------
#
#   ✓ 回复非空
#   ✓ 包含目的地
#   ✓ 包含天数/行程
#   ✓ 包含宠物相关
#   ✓ 包含出行方式
#   ✓ 有类型标识
#   ✓ 有建议操作
#
#   ✓ 端到端测试通过 (8.7s)
#
# 结果: 2 通过, 0 失败
```

---

## 7. L4 调试工具

### 7.1 功能说明

L4 调试模式用于**单次请求的深度分析**，输出完整的请求/响应信息，便于定位问题。

### 7.2 使用方法

```bash
# 基本用法
node test_agent.js --debug "你的测试问题"

# 示例：调试行程生成
node test_agent.js --debug "帮我生成北京2天1晚带狗自驾的旅行攻略"

# 示例：调试POI搜索
node test_agent.js --debug "找一些杭州的宠物友好餐厅"

# 示例：调试知识问答
node test_agent.js --debug "巧克力对狗有毒吗"
```

### 7.3 输出内容

```
============================================================
  L4 调试模式
============================================================

输入: 帮我生成北京2天1晚带狗自驾的旅行攻略


============================================================
  完整响应 (8.7s)
============================================================

状态码: 200
成功: true

--- 基本信息 ---
类型: itinerary
回复长度: 1847 字符

--- 完整回复 ---
🎉 太棒了！带您的中型犬去北京自驾2天1晚，我来为您精心规划！

## 📋 行程概览
- **目的地**: 北京
...（完整回复内容）

--- 图片分析 ---
（无）

--- 信息来源 ---
（无）

--- 建议操作 ---
- [view_itinerary] 查看详情
- [modify_day] 修改第N天
- [save] 保存行程

--- 指标 ---
意图: generate_itinerary
工具使用: ["itinerary_tool"]
会话ID: debug_1680000000000
耗时: 8700ms

完整日志已保存: ./debug_log.json
```

### 7.4 日志文件格式

调试日志保存为 `debug_log.json`，包含完整的响应数据：

```json
{
  "success": true,
  "response": {
    "type": "itinerary",
    "content": "...",
    "imageAnalysis": null,
    "sources": null,
    "suggestions": [...],
    "actions": [],
    "itineraryData": {...},
    "poiList": null,
    "weatherData": null,
    "memoryUpdate": {...},
    "metrics": {
      "intent": "generate_itinerary",
      "toolsUsed": [],
      "latency": 8700,
      "hasImage": false,
      "sessionId": "debug_1680000000000"
    }
  }
}
```

### 7.5 调试技巧

| 问题现象 | 调试命令 | 关注点 |
|---------|---------|--------|
| 回复为空 | `--debug "你好"` | 检查 `content` 字段 |
| 意图识别错误 | `--debug "找餐厅"` | 检查 `metrics.intent` |
| 工具未调用 | `--debug "北京天气"` | 检查 `metrics.toolsUsed` |
| 响应慢 | `--debug "生成行程"` | 检查 `latency` 和各阶段耗时 |
| 格式异常 | `--debug "你是谁"` | 检查 `response.type` 结构 |

---

## 8. 模块级单元测试

### 8.1 意图路由器测试 (router.js)

```javascript
// tests/unit/router.test.js

const IntentRouter = require('../../agent/core/router')

describe('IntentRouter', () => {
  let router

  beforeEach(() => {
    router = new IntentRouter()
  })

  describe('文本意图识别', () => {
    test('应识别行程生成意图', () => {
      const result = router.route({ message: '帮我规划北京3日游' })
      expect(result.intent).toBe('generate_itinerary')
      expect(result.confidence).toBeGreaterThan(0.8)
    })

    test('应识别POI搜索意图', () => {
      const result = router.route({ message: '附近有宠物友好餐厅吗' })
      expect(result.intent).toBe('search_poi')
    })

    test('应识别天气查询意图', () => {
      const result = router.route({ message: '明天杭州天气怎么样' })
      expect(result.intent).toBe('weather_check')
    })

    test('应识别紧急求助意图', () => {
      const result = router.route({ message: '我的狗受伤了，附近有宠物医院吗' })
      expect(result.intent).toBe('emergency_help')
      expect(result.confidence).toBeGreaterThan(0.9)
    })
  })

  describe('图片意图识别', () => {
    test('有图片时应优先匹配图片意图', () => {
      const result = router.route({
        message: '这是什么品种',
        images: ['data:image/jpeg;base64,...']
      })
      expect(['pet_breed_recognition', 'image_analysis']).toContain(result.intent)
    })

    test('食物检测意图', () => {
      const result = router.route({
        message: '我家狗能吃这个吗',
        images: ['http://example.com/food.jpg']
      })
      expect(result.intent).toBe('food_detection')
    })
  })

  describe('边界情况', () => {
    test('空消息应返回chit_chat', () => {
      const result = router.route({ message: '' })
      expect(result.intent).toBe('chit_chat')
    })

    test('无关键词消息应返回chit_chat', () => {
      const result = router.route({ message: '今天心情不错' })
      expect(result.intent).toBe('chit_chat')
    })
  })
})
```

### 8.2 视觉工具测试 (vision.js)

```javascript
// tests/unit/vision.test.js

const VisionTool = require('../../agent/tools/vision')

describe('VisionTool', () => {
  describe('Schema定义', () => {
    test('应包含所有必需参数', () => {
      const schema = VisionTool.schema
      expect(schema.properties.image_url).toBeDefined()
      expect(schema.properties.task_type).toBeDefined()
      expect(schema.properties.task_type.enum).toContain('pet_breed')
      expect(schema.properties.task_type.enum).toContain('scene')
      expect(schema.properties.task_type.enum).toContain('food_safety')
    })
  })

  describe('Prompt构建', () => {
    test('品种识别Prompt应包含JSON格式要求', () => {
      const tool = new VisionTool()
      const prompt = tool.buildPrompt('pet_breed')
      expect(prompt).toContain('JSON')
      expect(prompt).toContain('品种')
    })

    test('食物检测Prompt应包含安全结论要求', () => {
      const tool = new VisionTool()
      const prompt = tool.buildPrompt('food_safety', null, 'dog')
      expect(prompt).toContain('安全')
      expect(prompt).toContain('狗狗')
    })
  })
})
```

### 8.3 知识库工具测试 (knowledge.js)

```javascript
// tests/unit/knowledge.test.js

const KnowledgeTool = require('../../agent/tools/knowledge')

describe('KnowledgeTool', () => {
  describe('本地检索', () => {
    test('食物安全查询应返回毒性信息', async () => {
      const tool = new KnowledgeTool()
      const result = await tool.execute({
        query: '巧克力对狗有毒吗',
        category: 'food_safety'
      })
      
      expect(result.results.length).toBeGreaterThan(0)
      expect(result.query).toBe('巧克力对狗有毒吗')
    })

    test('品种查询应返回旅行适应性评分', async () => {
      const tool = new KnowledgeTool()
      const result = await tool.execute({
        query: '金毛旅行适应性强吗',
        category: 'breed'
      })
      
      const hasScore = result.results.some(r => 
        r.travel_suitability && r.travel_suitability.score
      )
      expect(hasScore).toBeTruthy()
    })
  })

  describe('关键词提取', () => {
    test('应过滤停用词', () => {
      const tool = new KnowledgeTool()
      const keywords = tool.extractKeywords('什么是金毛犬的特点')
      
      expect(keywords).not.toContain('是')
      expect(keywords).not.toContain('的')
      expect(keywords).toContain('金毛')
    })
  })
})
```

### 8.4 输出格式化测试 (formatter.js)

```javascript
// tests/unit/formatter.test.js

const formatters = require('../../agent/utils/formatter')

describe('Formatter', () => {
  describe('Agent响应格式化', () => {
    test('成功响应应包含所有必需字段', () => {
      const response = formatters.agentResponse(true, {
        type: 'text',
        content: '测试回复',
        suggestions: []
      })
      
      expect(response.success).toBe(true)
      expect(response.response.type).toBe('text')
      expect(response.response.content).toBe('测试回复')
    })

    test('错误响应应包含fallback', () => {
      const fallback = { type: 'text', content: '兜底回复' }
      const response = formatters.agentResponse(false, {
        error: 'TestError',
        message: '测试错误',
        fallback
      })
      
      expect(response.success).toBe(false)
      expect(response.error).toBe('TestError')
      expect(response.response).toEqual(fallback)
    })
  })

  describe('Emoji注入', () => {
    test('行程内容应注入相关emoji', () => {
      const formatted = formatters.formatItinerary({
        destination: '北京',
        days: [{ spots: ['故宫'] }]
      })
      
      expect(formatted).toMatch(/🗺️|📅|📍/)
    })
  })
})
```

### 8.5 运行单元测试

```bash
# 安装测试框架（如果尚未安装）
npm install --save-dev jest

# 在 package.json 中添加脚本
# "test": "jest --verbose"

# 运行所有单元测试
npm test

# 运行特定测试文件
npx jest tests/unit/router.test.js --verbose

# 运行并生成覆盖率报告
npx jest --coverage
```

---

## 9. 性能测试

### 9.1 性能指标基准

| 操作类型 | 预期响应时间 | P99上限 | 说明 |
|---------|------------|--------|------|
| 健康检查 | < 50ms | 100ms | 本地操作 |
| 基本闲聊 | < 1500ms | 3000ms | 仅LLM调用 |
| POI搜索 | < 2000ms | 4000ms | LLM + 地图API |
| 知识检索 | < 1500ms | 3000ms | 本地知识库 |
| 行程生成 | < 10000ms | 15000ms | 复杂LLM推理 |
| 图片分析 | < 8000ms | 12000ms | 视觉模型调用 |
| 完整行程规划 | < 15000ms | 20000ms | 多工具协作 |

### 9.2 延迟测试脚本

```javascript
// tests/performance/latency.test.js

const http = require('http')
const BASE_URL = 'http://127.0.0.1:3000'

function request(path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data), latency: Date.now() - startTime }))
    })
    
    const startTime = Date.now()
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function runLatencyTest(query, iterations = 5) {
  const latencies = []
  
  for (let i = 0; i < iterations; i++) {
    // 重置会话
    await request('/api/reset', { userId: 'perf_test' })
    
    // 发送请求
    const start = Date.now()
    const res = await request('/api/chat', {
      message: query,
      userId: 'perf_test'
    })
    const latency = Date.now() - start
    
    latencies.push(latency)
    console.log(`  第${i + 1}次: ${latency}ms`)
  }
  
  // 统计
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
  const min = Math.min(...latencies)
  const max = Math.max(...latencies)
  const p99 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.99)]
  
  console.log(`\n统计结果 (${iterations}次):`)
  console.log(`  平均: ${avg.toFixed(0)}ms`)
  console.log(`  最小: ${min}ms`)
  console.log(`  最大: ${max}ms`)
  console.log(`  P99: ${p99}ms`)
  
  return { avg, min, max, p99, latencies }
}

// 使用
runLatencyTest('你好', 10)  // 测试基本闲聊延迟
runLatencyTest('帮我找北京的宠物友好公园', 5)  // 测试POI搜索延迟
runLatencyTest('帮我规划北京1日游行程', 3)  // 测试行程生成延迟
```

### 9.3 并发测试

```javascript
// tests/performance/load.test.js

const http = require('http')

async function concurrentRequest(count = 10) {
  const promises = Array(count).fill(null).map((_, i) => {
    return new Promise((resolve) => {
      const start = Date.now()
      const req = http.request('http://127.0.0.1:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          resolve({
            index: i,
            status: res.statusCode,
            latency: Date.now() - start,
            success: JSON.parse(data).success
          })
        })
      })
      req.write(JSON.stringify({ message: '你好', userId: `load_${i}` }))
      req.end()
    })
  })
  
  const results = await Promise.all(promises)
  
  // 分析结果
  const successCount = results.filter(r => r.success).length
  const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length
  
  console.log(`并发数: ${count}`)
  console.log(`成功率: ${successCount}/${count} (${(successCount/count*100).toFixed(1)}%)`)
  console.log(`平均延迟: ${avgLatency.toFixed(0)}ms`)
  
  return results
}

// 使用
concurrentRequest(5)   // 5并发
concurrentRequest(10)  // 10并发
concurrentRequest(20)  // 20并发
```

### 9.4 性能优化建议

| 问题 | 可能原因 | 优化方案 |
|-----|---------|---------|
| 首次请求慢 | Node.js懒加载/模块初始化 | 预热：启动后发送探测请求 |
| LLM调用慢 | 模型选择/网络延迟 | 使用更快的模型(glm-4-flash)；增加超时时间 |
| 并发失败率高 | API速率限制 | 实现请求队列/限流；增加重试机制 |
| 内存持续增长 | 内存泄漏/缓存无限增长 | 定期清理会话；限制缓存大小 |

---

## 10. 安全测试

### 10.1 输入验证测试

```javascript
// tests/security/input_validation.test.js

describe('输入验证', () => {
  test('应拒绝空消息', async () => {
    const res = await request('/api/chat', { method: 'POST', body: {} })
    expect([400, 422, 500]).toContain(res.status)
  })

  test('应拒绝超长消息 (>10000字符)', async () => {
    const longMessage = 'a'.repeat(10001)
    const res = await chat(longMessage)
    expect(res.data.success).toBeFalsy()
  })

  test('应处理XSS攻击向量', async () => {
    const xssPayload = '<script>alert("xss")</script>'
    const res = await chat(xssPayload)
    const reply = getReply(res)
    expect(reply).not.toContain('<script>')
  })

  test('应处理SQL注入尝试', async () => {
    const sqliPayload = "'; DROP TABLE users; --"
    const res = await chat(sqliPayload)
    expect(res.data.success).toBeTruthy()  // 不应导致错误
  })
})
```

### 10.2 敏感信息保护测试

| 测试项 | 方法 | 预期结果 |
|-------|------|---------|
| API Key泄露 | 检查响应头/体 | 不包含任何API Key |
| 错误信息泄露 | 触发内部错误 | 不暴露堆栈/路径信息 |
| 日志敏感信息 | 检查日志输出 | 不记录用户消息完整内容 |
| 图片路径遍历 | 上传 `../../../etc/passwd` | 拒绝访问 |

### 10.3 安全检查清单

- [ ] 所有外部输入经过验证器 (`validator.js`) 处理
- [ ] API Key仅存储在服务端环境变量
- [ ] 图片上传限制大小（当前限制10MB）和类型（JPG/PNG/GIF/WebP）
- [ ] 错误响应不包含内部堆栈信息
- [ ] HTTP响应头包含安全头（CSP、X-Content-Type-Options等）
- [ ] 支持HTTPS（生产环境）

---

## 11. 常见问题排查

### 11.1 问题诊断流程

```
用户报告问题
     │
     ▼
┌─────────────┐
│ 1. 复现问题  │ ← 使用 L4 调试模式
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 2. 检查日志  │ ← 查看 DEBUG 级别日志
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 3. 定位模块  │ ← 根据错误信息判断是哪个模块
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 4. 单元测试  │ ← 运行对应模块的单元测试
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 5. 修复验证  │ ← 修复后重新运行测试
└─────────────┘
```

### 11.2 常见问题及解决方案

#### 问题1：服务启动失败

**症状：** `node server.js` 启动后立即退出或报错

**排查步骤：**
```bash
# 1. 检查Node版本（需要 >= 16）
node --version

# 2. 检查端口占用
lsof -i :3000

# 3. 检查依赖安装
npm ls

# 4. 查看详细错误
node server.js 2>&1 | head -50
```

**常见原因：**
| 原因 | 解决方案 |
|-----|---------|
| 端口被占用 | `kill -9 $(lsof -t -i :3000)` 或修改 PORT |
| 缺少依赖 | `npm install` |
| .env文件缺失 | `cp .env.example .env` 并填写配置 |
| Node版本过低 | 安装 Node 16+ |

---

#### 问题2：API调用失败

**症状：** L2/L3测试全部失败，提示API错误

**排查步骤：**
```bash
# 1. 验证API Key有效性
curl -X POST https://open.bigmodel.cn/api/paas/v4/chat/completions \
  -H "Authorization: Bearer $ZHIPU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-4-flash","messages":[{"role":"user","content":"hi"}]}'

# 2. 检查余额
# 登录 https://open.bigmodel.cn/ 控制台查看

# 3. 检查网络连接
ping open.bigmodel.cn
```

**常见原因：**
| 原因 | 解决方案 |
|-----|---------|
| API Key无效 | 重新生成并更新 .env |
| 余额不足 | 充值智谱AI账户 |
| 网络不通 | 检查代理/防火墙设置 |
| 模型名称错误 | 检查 config.js 中的模型配置 |

---

#### 问题3：意图识别不准确

**症状：** 用户说"找餐厅"，但触发了行程生成

**排查步骤：**
```bash
# 使用调试模式查看实际识别的意图
node test_agent.js --debug "找一些杭州的宠物友好餐厅"

# 查看输出的 metrics.intent 字段
```

**解决方案：**

1. **调整路由规则权重** (`agent/core/router.js`)：
```javascript
// 增加 SEARCH_POI 的关键词
{ intent: SEARCH_POI, keywords: ['找', '搜索', '附近', '推荐', '哪里有', '餐厅', '酒店', '公园', '吃饭', '用餐'] }
```

2. **调整优先级**：确保具体意图优先于通用意图

3. **增加测试用例**：将误识别案例加入回归测试

---

#### 问题4：响应速度慢

**症状：** 单次请求耗时 > 15秒

**排查步骤：**
```bash
# 1. 使用调试模式测量各阶段耗时
node test_agent.js --debug "生成北京1日行程"

# 2. 检查网络延迟
time curl -X POST https://open.bigmodel.cn/api/paas/v4/chat/completions ...

# 3. 检查第三方API延迟
# 腾讯地图、和风天气等
```

**优化方案：**

| 瓶颈 | 优化措施 |
|-----|---------|
| LLM调用慢 | 切换到 glm-4-flash（更快）；启用流式输出 |
| 工具串行执行 | 改为并行执行独立工具（Promise.all） |
| 知识库检索慢 | 增加缓存；预加载常用数据 |
| 图片处理慢 | 压缩图片；限制图片尺寸 |

---

#### 问题5：多轮对话上下文丢失

**症状：** 第二轮提问时，Agent忘记之前的内容

**排查步骤：**
```bash
# 运行多轮对话测试
node test_agent.js --e2e

# 检查 ContextManager 是否正确工作
```

**解决方案：**

1. **检查会话ID一致性**：确保同一会话使用相同的 userId/sessionId

2. **检查上下文窗口大小** (`agent/memory/context.js`)：
```javascript
// 当前设置保留最近6条历史
getConversationHistory(sessionId, 6)

// 如需更长记忆，可调整为10-20条
```

3. **检查会话重置逻辑**：确认没有意外调用 resetSession

---

### 11.3 日志级别说明

| 级别 | 用途 | 示例 |
|-----|------|------|
| DEBUG | 详细调试信息 | API请求/响应完整内容 |
| INFO | 关键流程节点 | 收到用户消息、调用工具 |
| WARN | 可恢复的异常 | API限速、降级处理 |
| ERROR | 需要关注的错误 | API调用失败、参数验证失败 |

**开启DEBUG日志：**
```bash
# 环境变量设置
export LOG_LEVEL=DEBUG

# 或在 .env 中
LOG_LEVEL=DEBUG
```

---

## 12. 测试报告模板

### 12.1 测试执行报告

```markdown
# PetTravelAgent 测试报告

**测试日期**: 2026-07-28  
**测试人员**: [姓名]  
**测试版本**: v2.0.0  
**测试环境**: 本地开发 / 测试服务器  

## 1. 测试概览

| 测试层级 | 用例数 | 通过 | 失败 | 通过率 |
|---------|-------|------|------|-------|
| L1 基础API | 6 | 6 | 0 | 100% |
| L2 对话行为 | 6 | 5 | 1 | 83.3% |
| L3 端到端 | 2 | 2 | 0 | 100% |
| **合计** | **14** | **13** | **1** | **92.9%** |

## 2. 失效用例详情

| 用例ID | 名称 | 错误信息 | 严重程度 | 状态 |
|-------|------|---------|---------|------|
| TC-L2-02 | 知识检索 | 命中关键词不足 | 中 | 待修复 |

## 3. 性能数据

| 操作 | 平均延迟 | P99延迟 | 是否达标 |
|-----|---------|--------|---------|
| 基本闲聊 | 1200ms | 1800ms | ✅ |
| POI搜索 | 1800ms | 2500ms | ✅ |
| 行程生成 | 8500ms | 12000ms | ✅ |

## 4. 发现问题汇总

### Bug #001: 知识检索覆盖率不足
- **描述**: 航空托运相关问题命中关键词数量不稳定
- **重现步骤**: 运行 TC-L2-02
- **预期结果**: 命中 >= 2 个关键词
- **实际结果**: 偶尔只命中 1 个
- **优先级**: P2
- **建议修复**: 优化 KnowledgeTool 的 Prompt 或扩展关键词列表

## 5. 测试结论

[ ] 通过，可以发布
[ ] 有条件通过（需修复P0/P1问题）
[ ] 不通过，存在阻塞性问题

## 6. 签署

测试人员: _______________ 日期: ___________
审核人员: _______________ 日期: ___________
```

### 12.2 CI/CD集成示例

```yaml
# .github/workflows/test.yml

name: Agent Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      app:
        image: node:18-alpine
        ports:
          - 3000:3000
        
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Start server
        run: node server.js &
        run: sleep 5  # 等待服务启动
        
      - name: Run L1 Tests
        run: node test_agent.js --unit
        
      - name: Run Unit Tests
        run: npm test
        
      - name: Run L2/L3 Tests (with secrets)
        if: github.event_name == 'push'
        env:
          ZHIPU_API_KEY: ${{ secrets.ZHIPU_API_KEY }}
        run: node test_agent.js --all
```

---

## 附录A: 快速参考卡

### 常用命令速查

```bash
# 启动服务
node server.js

# 运行测试
node test_agent.js --unit       # L1 基础测试
node test_agent.js --prompt     # L2 行为测试
node test_agent.js --e2e        # L3 端到端测试
node test_agent.js --all        # 全部测试
node test_agent.js --debug "问句"  # 调试模式

# 单元测试
npm test                        # Jest单元测试
npx jest --coverage             # 带覆盖率

# 查看日志
tail -f logs/app.log            # 实时日志
```

### 关键文件索引

| 文件 | 功能 |
|-----|------|
| `agent/core/index.js` | Agent主入口 |
| `agent/core/router.js` | 意图路由 |
| `agent/core/planner.js` | 规划引擎 |
| `agent/tools/vision.js` | 图片处理 |
| `agent/tools/knowledge.js` | 知识检索 |
| `agent/tools/poi_tool.js` | POI搜索 |
| `agent/tools/weather_tool.js` | 天气查询 |
| `agent/tools/itinerary_tool.js` | 行程管理 |
| `agent/memory/context.js` | 上下文管理 |
| `agent/utils/formatter.js` | 输出格式化 |
| `server.js` | HTTP服务 |
| `test_agent.js` | 主测试入口 |
| `config.js` | 配置文件 |

### 状态码参考

| 状态码 | 含义 |
|-------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 422 | 参数验证失败 |
| 429 | 请求过于频繁（限流） |
| 500 | 服务器内部错误 |
| 502 | 上游服务（API）错误 |
| 503 | 服务暂时不可用 |

---

## 附录B: 更新日志

| 版本 | 日期 | 作者 | 变更内容 |
|-----|------|------|---------|
| 1.0 | 2026-07-28 | CodeBuddy | 初始版本，基于AGENT_DESIGN.md v2.0 |

---

> **文档维护**: 请在以下情况更新本文档：
> - 新增工具或模块时，补充对应的测试用例
> - 修改接口定义时，更新验证检查项
> - 发现新的常见问题时，添加到问题排查章节
> - 每次版本发布前，执行完整测试并更新报告
