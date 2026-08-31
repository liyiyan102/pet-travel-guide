/**
 * 阿里云部署 - Pet Travel Agent HTTP服务
 * 
 * 将Agent包装为REST API，支持：
 * - POST /api/chat        对话接口
 * - POST /api/reset       重置会话
 * - GET  /api/status      服务状态
 * - POST /api/upload      图片上传
 * - GET  /health          健康检查
 */

// 加载根目录 .env
(() => {
  try {
    const fs = require('fs')
    const path = require('path')
    const envPath = path.join(__dirname, '.env')
    if (!fs.existsSync(envPath)) return
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const s = line.trim()
      if (!s || s.startsWith('#')) continue
      const i = s.indexOf('=')
      if (i <= 0) continue
      const k = s.slice(0, i).trim()
      let v = s.slice(i + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (process.env[k] === undefined) process.env[k] = v
    }
  } catch {}
})()

const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { fileURLToPath } = require('url')

// 导入Agent
const agent = require('./agent/core/index')

// 导入腾讯地图服务
const amap = require('./agent/services/amap')

// 导入本地POI检索服务
const localPOI = require('./agent/services/local_poi')

// 导入法律法规合规检查服务
const lawCompliance = require('./agent/services/law_compliance')

const app = express()
const PORT = process.env.PORT || 3000

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 日志中间件
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`)
  })
  next()
})

// ==================== 权限校验中间件 ====================
// 数据库写操作（增/改/删）需要管理员密钥，防止未授权修改POI数据库/知识库
// 密钥从环境变量读取，未配置时默认拒绝所有写操作（安全默认值）
const ADMIN_KEY = process.env.ADMIN_KEY || ''
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey
  if (!ADMIN_KEY) {
    return res.status(403).json({
      success: false,
      error: '数据写操作未开放：管理员密钥未配置，服务器已禁用此接口'
    })
  }
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: '未授权：管理员密钥错误' })
  }
  next()
}

// ==================== 图片上传配置 ====================
const uploadDir = process.env.UPLOAD_DIR || './uploads'
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(uploadDir, req.body.userId || 'anonymous')
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }
    cb(null, userDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('不支持的文件类型，仅支持 JPG/PNG/GIF/WebP'))
    }
  }
})

// ==================== 路由 ====================

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Pet Travel Agent',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  })
})

/**
 * 服务状态
 */
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    data: agent.getStatus()
  })
})

/**
 * 对话接口（核心）
 * POST /api/chat
 * Body: { message, images?, userId?, sessionId? }
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, images = [], userId, sessionId } = req.body

    // 参数校验
    if (!message && (!images || images.length === 0)) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：message 或 images'
      })
    }

    console.log(`[Chat] 用户${userId || 'anonymous'}:`, message?.substring(0, 100) || '[图片消息]')

    // 调用Agent
    const result = await agent.run({
      message: message || '',
      images: images,
      userId: userId || 'anonymous',
      sessionId: sessionId || userId || 'default'
    })

    res.json(result)

  } catch (error) {
    console.error('[Chat Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      message: '服务暂时不可用，请稍后重试'
    })
  }
})

/**
 * 带图片的对话（multipart/form-data）
 * POST /api/chat/upload
 * Form: message, images[], userId, sessionId
 */
app.post('/api/chat/upload', upload.array('images', 5), async (req, res) => {
  try {
    const { message, userId, sessionId } = req.body
    const files = req.files || []

    // 处理上传的图片为base64或本地路径
    const imageUrls = files.map(file => {
      // 返回文件路径，Agent会处理
      return `file://${file.path}`
    })

    console.log(`[Chat Upload] 用户${userId || 'anonymous'}, 图片数: ${imageUrls.length}`)

    // 调用Agent
    const result = await agent.run({
      message: message || '',
      images: imageUrls,
      userId: userId || 'anonymous',
      sessionId: sessionId || userId || 'default'
    })

    res.json(result)

  } catch (error) {
    console.error('[Chat Upload Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      message: '服务暂时不可用，请稍后重试'
    })
  }
})

/**
 * 单独图片上传（返回URL）
 * POST /api/upload
 * Form: image, userId
 */
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请选择要上传的图片' })
    }

    const imageUrl = `/uploads/${req.file.userId || 'anonymous'}/${req.file.filename}`

    res.json({
      success: true,
      data: {
        url: imageUrl,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    })

  } catch (error) {
    console.error('[Upload Error]:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 重置会话
 * POST /api/reset
 * Body: { userId?, sessionId? }
 */
app.post('/api/reset', (req, res) => {
  try {
    const { sessionId, userId } = req.body
    const sid = sessionId || userId || 'default'

    const result = agent.resetSession(sid)
    res.json(result)

  } catch (error) {
    console.error('[Reset Error]:', error)
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 流式对话（SSE）
 * POST /api/chat/stream
 * Body: { message, userId?, sessionId? }
 */
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { message, userId, sessionId } = req.body

    // 设置SSE响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // 发送连接成功事件
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

    // 调用Agent（非流式，模拟流输出）
    const result = await agent.run({
      message: message || '',
      images: [],
      userId: userId || 'anonymous',
      sessionId: sessionId || userId || 'default'
    })

    // 分块发送结果
    if (result.success) {
      const content = result.data?.reply || ''
      const chunkSize = 20 // 每次发送的字符数
      
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize)
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
        // 模拟打字效果延迟
        await new Promise(r => setTimeout(r, 30))
      }

      // 发送完成事件（包含完整数据）
      res.write(`data: ${JSON.stringify({ type: 'done', data: result.data })}\n\n`)
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: result.error })}\n\n`)
    }

    res.end()

  } catch (error) {
    console.error('[Stream Error]:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
    res.end()
  }
})

/**
 * 攻略定制接口（直接调用攻略Agent，跳过意图识别）
 * POST /api/chat/itinerary
 * 
 * 用于前端"攻略定制"按钮直接触发，传入结构化参数，
 * 跳过意图识别层，直接分发到 TravelPlanner 子Agent。
 * 
 * Body:
 *   destination  - 目的地城市（必填），如 "北京"
 *   days         - 天数（必填），如 3
 *   petType      - 宠物类型（可选），如 "狗"/"猫"
 *   petBreed     - 宠物品种（可选），如 "金毛"
 *   budget       - 预算（可选），如 "3000-5000"
 *   preference   - 偏好（可选），如 "自然风光,美食"
 *   origin       - 出发地（可选），如 "上海"
 *   userId       - 用户ID（可选）
 *   sessionId    - 会话ID（可选）
 *   people       - 出行人数（可选），如 2
 *   style        - 旅行风格（可选），如 "休闲"/"紧凑"
 *   notes        - 额外备注（可选）
 */
app.post('/api/chat/itinerary', async (req, res) => {
  try {
    const {
      destination,
      days,
      petType = '',
      petBreed = '',
      budget = '',
      preference = '',
      origin = '',
      userId,
      sessionId,
      people = 1,
      style = '',
      notes = ''
    } = req.body

    // 参数校验
    if (!destination) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：destination（目的地城市）'
      })
    }

    if (!days || !Number.isInteger(days) || days < 1) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：days（天数，需为正整数）'
      })
    }

    // 构建自然语言消息
    let message = `帮我规划一个${destination}${days}日游`
    
    if (origin) {
      message += `，从${origin}出发`
    }
    
    if (petType) {
      message += `，带${petType}`
      if (petBreed) {
        message += `（${petBreed}）`
      }
      message += '出行'
    }
    
    if (people > 1) {
      message += `，${people}人同行`
    }
    
    if (preference) {
      message += `，偏好：${preference}`
    }
    
    if (style) {
      message += `，风格：${style}`
    }
    
    if (budget) {
      message += `，预算${budget}`
    }
    
    if (notes) {
      message += `。${notes}`
    }

    // 如果带了宠物，添加宠物友好要求
    if (petType) {
      message += '。需要推荐宠物友好的景点、酒店和餐厅'
    }

    console.log(`[Itinerary Direct] 用户${userId || 'anonymous'}: ${message.substring(0, 100)}`)

    // 直接调用攻略Agent（跳过意图识别）
    const result = await agent.run({
      message,
      images: [],
      userId: userId || 'anonymous',
      sessionId: sessionId || userId || `itinerary_${Date.now()}`,
      directAgent: 'generate_itinerary'
    })

    // 附加结构化参数到响应中，方便前端展示
    if (result.success && result.data) {
      result.data.structuredParams = {
        destination,
        days,
        petType,
        petBreed,
        budget,
        preference,
        origin,
        people,
        style
      }
    }

    res.json(result)

  } catch (error) {
    console.error('[Itinerary Direct Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      message: '攻略定制服务暂时不可用，请稍后重试'
    })
  }
})

// ==================== 腾讯地图API路由 ====================

/**
 * POI搜索接口
 * GET /api/map/poi/search
 * Query: keyword, location, category, radius
 */
app.get('/api/map/poi/search', async (req, res) => {
  try {
    const { keyword, location, category = 'all', radius = 5000 } = req.query
    
    if (!location) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：location'
      })
    }

    console.log(`[Map API] POI搜索: ${keyword || category}, 位置: ${location}`)
    
    const results = await amap.searchPetPOI(category, location, {
      radius: parseInt(radius),
      limit: 20
    })

    // 如果有特定关键词，进行过滤
    if (keyword && results.pois) {
      const kw = keyword.toLowerCase()
      const filtered = results.pois.filter(poi => {
        const searchText = `${poi.name || ''} ${poi.category || ''} ${poi.address || ''}`.toLowerCase()
        return searchText.includes(kw)
      })
      if (filtered.length > 0) {
        results.pois = filtered
        results.total = filtered.length
      }
    }

    res.json({
      success: true,
      data: results
    })

  } catch (error) {
    console.error('[Map POI Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'POI搜索失败'
    })
  }
})

/**
 * 地点详情接口
 * GET /api/map/poi/detail
 * Query: id (POI ID)
 */
app.get('/api/map/poi/detail', async (req, res) => {
  try {
    const { id } = req.query
    
    if (!id) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：id'
      })
    }

    console.log(`[Map API] POI详情: ${id}`)
    
    const detail = await amap.getPOIById(id)

    res.json({
      success: true,
      data: detail
    })

  } catch (error) {
    console.error('[Map Detail Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      message: '获取地点详情失败'
    })
  }
})

/**
 * 驾车路线规划
 * POST /api/map/route/driving
 * Body: { from, to, waypoints? }
 */
app.post('/api/map/route/driving', async (req, res) => {
  try {
    const { from, to, waypoints } = req.body
    
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：from, to'
      })
    }

    console.log(`[Map API] 驾车路线: ${from} -> ${to}`)
    
    const result = await amap.drivingRoute(from, to, { waypoints })

    res.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('[Map Route Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      message: '路线规划失败'
    })
  }
})

/**
 * 步行路线规划
 * POST /api/map/route/walking
 */
app.post('/api/map/route/walking', async (req, res) => {
  try {
    const { from, to } = req.body
    
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：from, to'
      })
    }

    console.log(`[Map API] 步行路线: ${from} -> ${to}`)
    
    const result = await amap.walkingRoute(from, to)

    res.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('[Map Walking Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      message: '步行路线规划失败'
    })
  }
})

/**
 * 公交路线规划
 * POST /api/map/route/transit
 */
app.post('/api/map/route/transit', async (req, res) => {
  try {
    const { from, to, city } = req.body
    
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：from, to'
      })
    }

    console.log(`[Map API] 公交路线: ${from} -> ${to}`)
    
    const result = await amap.transitRoute(from, to, { city })

    res.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('[Map Transit Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      message: '公交路线规划失败'
    })
  }
})

/**
 * 自行车路线规划
 * POST /api/map/route/bicycling
 */
app.post('/api/map/route/bicycling', async (req, res) => {
  try {
    const { from, to } = req.body
    
    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：from, to'
      })
    }

    console.log(`[Map API] 自行车路线: ${from} -> ${to}`)
    
    const result = await amap.bicyclingRoute(from, to)

    res.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('[Map Bicycling Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      message: '自行车路线规划失败'
    })
  }
})

/**
 * 多地点路线优化（途经点顺序优化）
 * POST /api/map/route/multi
 * Body: { points: [{name, lat, lng}], mode? }
 */
app.post('/api/map/route/multi', async (req, res) => {
  try {
    const { points, mode = 'driving' } = req.body
    
    if (!points || points.length < 2) {
      return res.status(400).json({
        success: false,
        error: '至少需要2个地点'
      })
    }

    console.log(`[Map API] 多点路线优化: ${points.length}个点`)
    
    const result = await amap.drivingRoute(points[0], points[points.length - 1], {
      waypoints: points.slice(1, -1).join(';')
    })

    res.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('[Map Multi Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      message: '多点路线规划失败'
    })
  }
})

/**
 * 地理编码（地址转坐标）
 * GET /api/map/geocode
 * Query: address
 */
app.get('/api/map/geocode', async (req, res) => {
  try {
    const { address } = req.query
    
    if (!address) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：address'
      })
    }

    const result = await amap.geocode(address)

    res.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('[Geocode Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * 逆地理编码（坐标转地址）
 * GET /api/map/reverse-geocode
 * Query: lat, lng
 */
app.get('/api/map/reverse-geocode', async (req, res) => {
  try {
    const { lat, lng } = req.query
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：lat, lng'
      })
    }

    const result = await amap.reverseGeocode(parseFloat(lat), parseFloat(lng))

    res.json({
      success: true,
      data: result
    })

  } catch (error) {
    console.error('[Reverse Geocode Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// ==================== 本地POI数据库API路由 ====================

/**
 * 本地POI搜索（核心接口）- 优先调用高德API获取实时数据
 * GET /api/local/poi/search
 * Query: city, category, keyword, petOnly, limit, offset, lat, lng, radius
 */
app.get('/api/local/poi/search', async (req, res) => {
  try {
    const { city, category, keyword, petOnly, limit, offset, lat, lng, radius } = req.query
    const params = {
      city,
      category,
      keyword,
      petOnly: petOnly !== 'false',
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0
    }

    // 如果有坐标，优先调用高德API获取真实POI数据（含营业时间、人均价格等）
    if (lat && lng) {
      const location = `${lng},${lat}` // 高德格式：经度,纬度
      console.log(`[Local POI] 使用高德API搜索: ${keyword || category || '全部'}, 坐标: ${location}`)

      try {
        const amapResult = await amap.searchPetPOI(category || 'all', location, {
          radius: parseInt(radius) || 5000,
          limit: params.limit
        })

        // 格式化返回数据，补充距离文本
        if (amapResult.pois) {
          amapResult.pois = amapResult.pois.map(poi => ({
            ...poi,
            distance_text: poi.distance ? (poi.distance < 1000 ? `${poi.distance}m` : `${(poi.distance / 1000).toFixed(1)}km`) : '',
            category: category || 'sightseeing'
          }))
        }

        return res.json({
          success: true,
          data: {
            pois: amapResult.pois || [],
            total: amapResult.total || 0,
            source: 'amap_realtime'
          }
        })
      } catch (amapError) {
        console.warn(`[Local POI] 高德API失败，回退本地数据库: ${amapError.message}`)
        // 高德失败时回退到本地数据库
      }
    }

    // 无坐标或高德失败时使用本地数据库
    if (lat && lng) {
      params.location = { 
        lat: parseFloat(lat), 
        lng: parseFloat(lng) 
      }
      if (radius) {
        params.radius = parseInt(radius)
      }
    }

    console.log(`[Local POI] 本地数据库搜索: ${keyword || '全部'}, 城市: ${city || '全部'}`)
    
    const result = localPOI.search(params)

    // 格式化距离
    if (result.data.pois && params.location) {
      result.data.pois = result.data.pois.map(poi => ({
        ...poi,
        distance_text: localPOI.formatDistance(poi.distance),
        distance: poi.distance
      }))
    }

    res.json(result)

  } catch (error) {
    console.error('[Local POI Search Error]:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

/**
 * 获取POI详情
 * GET /api/local/poi/:id (放在最后，避免匹配到stats/cities等)
 */
app.get('/api/local/poi/:id', (req, res) => {
  try {
    const { id } = req.params
    // 排除特定路径
    if (['stats', 'cities', 'categories', 'search', 'batch'].includes(id)) {
      return res.status(404).json({ success: false, error: '接口不存在' })
    }
    const result = localPOI.getById(id)
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 添加新POI
 * POST /api/local/poi
 */
app.post('/api/local/poi', requireAdmin, (req, res) => {
  try {
    const result = localPOI.addPOI(req.body)
    res.status(201).json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 更新POI
 * PUT /api/local/poi/:id
 */
app.put('/api/local/poi/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params
    const result = localPOI.updatePOI(id, req.body)
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 删除POI
 * DELETE /api/local/poi/:id
 */
app.delete('/api/local/poi/:id', requireAdmin, (req, res) => {
  try {
    const { id } = req.params
    const result = localPOI.deletePOI(id)
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 批量导入POI
 * POST /api/local/poi/batch
 */
app.post('/api/local/poi/batch', requireAdmin, (req, res) => {
  try {
    const { pois } = req.body
    if (!Array.isArray(pois)) {
      return res.status(400).json({
        success: false,
        error: 'pois必须是数组'
      })
    }
    const result = localPOI.batchImport(pois)
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== 统计和管理接口（放在:id路由之后但通过排除列表处理） ====================

/**
 * 获取统计信息 - 使用独立路径避免冲突
 * GET /api/local/stats
 */
app.get('/api/local/stats', (req, res) => {
  try {
    const result = localPOI.getStats()
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 获取城市列表 - 使用独立路径避免冲突
 * GET /api/local/cities
 */
app.get('/api/local/cities', (req, res) => {
  try {
    const result = localPOI.getCities()
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 获取类别列表 - 使用独立路径避免冲突
 * GET /api/local/categories
 */
app.get('/api/local/categories', (req, res) => {
  try {
    const result = localPOI.getCategories()
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// ==================== 法律法规合规检查API ====================

/**
 * 合规性检查 - 检查用户问题/场景是否合规
 * POST /api/law/check
 * Body: { question, city?, petType? }
 */
app.post('/api/law/check', (req, res) => {
  try {
    const { question, city, petType } = req.body
    
    if (!question) {
      return res.status(400).json({ success: false, error: '缺少必要参数: question' })
    }
    
    const result = lawCompliance.checkCompliance(question, { city, petType })
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 搜索法律法规
 * GET /api/law/search?keyword=xxx
 */
app.get('/api/law/search', (req, res) => {
  try {
    const { keyword } = req.query
    if (!keyword) {
      return res.status(400).json({ success: false, error: '缺少参数: keyword' })
    }
    
    const results = lawCompliance.searchLaws(keyword)
    res.json({ 
      success: true, 
      data: results,
      total: results.length
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 获取所有法律法规摘要
 * GET /api/law/list
 */
app.get('/api/law/list', (req, res) => {
  try {
    const laws = lawCompliance.getAllLawsSummary()
    res.json({ 
      success: true, 
      data: laws,
      total: laws.length
    })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

/**
 * 获取城市养犬规定
 * GET /api/law/city/:city
 */
app.get('/api/law/city/:city', (req, res) => {
  try {
    const { city } = req.params
    const regulations = lawCompliance.getCityFullRegulations(city)
    
    if (!regulations) {
      return res.json({ 
        success: true, 
        data: null,
        message: `暂无 ${city} 的专门规定，可查看全国对比表`
      })
    }
    
    res.json({ success: true, data: regulations })
  } catch (error) {
    res.status(500).json({ success: false, error: error.message })
  }
})

// 静态文件服务（已上传的图片）
app.use('/uploads', express.static(path.resolve(uploadDir)))

// 静态文件服务（HTML页面等）— 放在所有API路由之后、404之前
app.use(express.static(path.resolve(__dirname)))

// 根路径重定向到调试页面
app.get('/', (req, res) => {
  res.redirect('/debug.html')
})

// 健康检查与状态接口已经在前方定义

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err)
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: '文件上传错误: ' + err.message
    })
  }
  
  res.status(500).json({
    success: false,
    error: err.message || '服务器内部错误'
  })
})

// 404处理 — 只对API路径返回JSON，HTML由静态文件中间件处理
app.use((req, res, next) => {
  // 如果是API请求，返回JSON 404
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
    return res.status(404).json({
      success: false,
      error: `接口不存在: ${req.method} ${req.path}`
    })
  }
  // 非API请求交给静态文件中间件处理（已在前方注册）
  // 如果到这里说明文件不存在
  res.status(404).send('Page not found')
})

// 启动服务
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔══════════════════════════════════════════════╗
║     🐾 Pet Travel Agent Server Started       ║
║──────────────────────────────────────────────║
║  Port:     ${PORT.toString().padEnd(32)}║
║  Env:      ${(process.env.NODE_ENV || 'development').padEnd(32)}║
║  Time:     ${new Date().toISOString().padEnd(32)}║
║──────────────────────────────────────────────║
║  Endpoints:                                  ║
║    GET  /health         健康检查             ║
║    POST /api/chat         对话接口             ║
║    POST /api/chat/itinerary 攻略定制(直达)      ║
║    POST /api/chat/upload  带图对话             ║
║    POST /api/chat/stream  流式对话             ║
║    POST /api/upload       图片上传             ║
║    POST /api/reset        重置会话             ║
║    GET  /api/status       服务状态             ║
║──────────────────────────────────────────────║
║  腾讯地图API:                                ║
║    GET  /api/map/poi/search       POI搜索     ║
║    GET  /api/map/poi/detail       地点详情     ║
║    POST /api/map/route/driving   驾车路线     ║
║    POST /api/map/route/walking   步行路线     ║
║    POST /api/map/route/transit   公交路线     ║
║    POST /api/map/route/bicycling 骑行路线     ║
║    POST /api/map/route/multi      多点优化    ║
║    GET  /api/map/geocode         地理编码     ║
║    GET  /api/map/reverse-geocode 逆地理编码   ║
║──────────────────────────────────────────────║
║  本地POI数据库:                              ║
║    GET  /api/local/poi/search   POI检索       ║
║    GET  /api/local/poi/:id      POI详情       ║
║    POST /api/local/poi          新增POI        ║
║    PUT  /api/local/poi/:id      更新POI        ║
║    DELETE /api/local/poi/:id    删除POI        ║
║    POST /api/local/poi/batch    批量导入       ║
║    GET  /api/local/stats        统计信息       ║
║    GET  /api/local/cities       城市列表       ║
║    GET  /api/local/categories   类别列表       ║
║──────────────────────────────────────────────║
║  法律法规合规检查:                            ║
║    POST /api/law/check       合规性检查        ║
║    GET  /api/law/search      搜索法规          ║
║    GET  /api/law/list        法规列表          ║
║    GET  /api/law/city/:city  城市规定          ║
╚══════════════════════════════════════════════╝`)
})

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('\n[Server] 收到 SIGTERM 信号，正在关闭...')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('\n[Server] 收到 SIGINT 信号，正在关闭...')
  process.exit(0)
})

module.exports = app
