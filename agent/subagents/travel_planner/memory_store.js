/**
 * 长期记忆存储 — 用户偏好、历史查询、常去地点、宠物档案
 * 
 * 核心职责：
 * 1. 存储用户的长期偏好（预算范围、喜欢的景点类型、出行风格）
 * 2. 记录历史行程（去过的地方、评价、反馈）
 * 3. 维护宠物档案（品种、名字、年龄、特殊需求）
 * 4. 从小程序用户个人信息获取基础数据
 * 5. 记忆检索：根据当前请求召回相关记忆
 * 
 * 存储策略：
 * - 内存缓存（热数据）+ 文件持久化（冷数据）
 * - 支持后续升级为 Redis/MongoDB
 */

const fs = require('fs')
const path = require('path')
const { logger } = require('../../utils/logger')

// ═══════════════════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════════════════

const MEMORY_CONFIG = {
  // 数据存储目录
  dataDir: path.join(__dirname, '../../data/memories'),
  
  // 内存缓存最大用户数
  maxCachedUsers: 500,
  
  // 记忆保留天数
  retentionDays: 365,
  
  // 自动保存间隔（秒）
  autoSaveInterval: 300
}

// ═══════════════════════════════════════════════════════════
// 用户记忆 Schema
// ═══════════════════════════════════════════════════════════

const USER_MEMORY_SCHEMA = {
  // 基础信息
  userId: '',
  updatedAt: null,
  createdAt: null,

  // 宠物档案
  pets: [],           // [{ name, type, breed, age, weight, specialNeeds, photoUrl }]
  
  // 出行偏好
  preferences: {
    budgetRange: '',       // 如 "2000-4000"
    preferredTransport: '', // 自驾/高铁/飞机
    travelStyle: '',       // 舒适型/紧凑型/休闲型
    interests: [],         // [自然风光, 历史文化, 美食探店...]
    avoidances: [],        // 不喜欢/不能去的类型
    accommodationLevel: '' // 经济/舒适/豪华
  },

  // 历史记录
  history: {
    trips: [],             // [{ destination, days, date, rating, feedback }]
    searchedCities: [],    // 搜索过的城市列表
    favoritePois: []       // 收藏的地点
  },

  // 行为统计（用于优化推荐）
  stats: {
    totalQueries: 0,
    avgTripDays: 0,
    commonDestinations: [],
    activeHours: []        // 活跃时段
  }
}

class MemoryStore {
  constructor() {
    this.config = MEMORY_CONFIG
    this.cache = new Map()  // userId -> UserMemory
    this.dirtySet = new Set() // 需要保存的userId集合
    
    this._ensureDataDir()
    this._startAutoSave()
  }

  // ════════════════════════════════════════════════════════
  // 核心 API
  // ════════════════════════════════════════════════════════

  /**
   * 获取用户记忆
   */
  async getUserMemory(userId) {
    if (!userId) return this._emptyMemory()

    // 先查缓存
    if (this.cache.has(userId)) {
      return this.cache.get(userId)
    }

    // 从文件加载
    const memory = await this._loadFromFile(userId)
    if (memory) {
      this.cache.set(userId, memory)
      return memory
    }

    // 返回空记忆
    return this._emptyMemory(userId)
  }

  /**
   * 更新用户记忆（支持部分更新）
   */
  async updateMemory(userId, updates) {
    if (!userId) return

    let memory = await this.getUserMemory(userId)
    
    // 深度合并更新
    memory = this._deepMerge(memory, updates)
    memory.updatedAt = new Date().toISOString()

    this.cache.set(userId, memory)
    this.dirtySet.add(userId)

    logger.info('MemoryStore', `记忆更新: ${userId}, 字段: ${Object.keys(updates).join(', ')}`)

    return memory
  }

  /**
   * 记录宠物信息（重要！用户提到宠物时要调用）
   */
  async recordPetInfo(userId, petInfo) {
    const pets = Array.isArray(petInfo) ? petInfo : [petInfo]
    
    const existingMemory = await this.getUserMemory(userId)
    
    for (const newPet of pets) {
      // 查找是否已有同名同品种的宠物
      const existingIdx = existingMemory.pets.findIndex(
        p => (p.name === newPet.name || !newPet.name) && p.breed === newPet.breed
      )

      if (existingIdx >= 0) {
        // 更新已有宠物信息
        existingMemory.pets[existingIdx] = {
          ...existingMemory.pets[existingIdx],
          ...newPet,
          updatedAt: new Date().toISOString()
        }
      } else {
        // 新增宠物
        existingMemory.pets.push({
          ...newPet,
          id: `pet_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          addedAt: new Date().toISOString()
        })
      }
    }

    // 更新统计
    existingMemory.stats.totalQueries++

    return this.updateMemory(userId, { pets: existingMemory.pets, stats: existingMemory.stats })
  }

  /**
   * 记录一次行程规划（完成后调用）
   */
  async recordTrip(userId, tripData) {
    const memory = await this.getUserMemory(userId)

    // 添加到历史
    memory.history.trips.push({
      id: `trip_${Date.now()}`,
      ...tripData,
      plannedAt: new Date().toISOString()
    })

    // 只保留最近20条
    if (memory.history.trips.length > 20) {
      memory.history.trips = memory.history.trips.slice(-20)
    }

    // 更新搜索过的城市
    if (tripData.destination && !memory.history.searchedCities.includes(tripData.destination)) {
      memory.history.searchedCities.push(tripData.destination)
      // 只保留最近30个
      if (memory.history.searchedCities.length > 30) {
        memory.history.searchedCities = memory.history.searchedCities.slice(-30)
      }
    }

    // 更新平均天数
    const allDays = memory.history.trips.map(t => t.days).filter(Boolean)
    memory.stats.avgTripDays = allDays.length > 0 
      ? Math.round(allDays.reduce((a, b) => a + b, 0) / allDays.length * 10) / 10 
      : 0

    // 更新常见目的地
    const destCounts = {}
    memory.history.trips.forEach(t => {
      destCounts[t.destination] = (destCounts[t.destination] || 0) + 1
    })
    memory.stats.commonDestinations = Object.entries(destCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([dest]) => dest)

    return this.updateMemory(userId, {
      history: memory.history,
      stats: memory.stats
    })
  }

  /**
   * 记录用户反馈（用于优化后续推荐）
   */
  async recordFeedback(userId, tripId, feedback) {
    const memory = await this.getUserMemory(userId)
    const trip = memory.history.trips.find(t => t.id === tripId)

    if (trip) {
      trip.feedback = feedback
      trip.rating = feedback.rating
      trip.feedbackAt = new Date().toISOString()

      // 如果反馈提到偏好，更新偏好模型
      if (feedback.likedPois) {
        memory.preferences.interests = [...new Set([
          ...(memory.preferences.interests || []),
          ...feedback.likedPois
        ])]
      }

      if (feedback.dislikedPois) {
        preferences.avoidances = [...new Set([
          ...(memory.preferences.avoidances || []),
          ...feedback.dislikedPois
        ])]
      }

      return this.updateMemory(userId, memory)
    }

    return memory
  }

  /**
   * 检索相关记忆（根据当前请求上下文）
   */
  async recallRelevantMemories(userId, currentContext = {}) {
    const memory = await this.getUserMemory(userId)
    const relevant = {}

    // 1. 宠物信息（几乎总是相关）
    if (memory.pets.length > 0) {
      relevant.petInfo = {
        primaryPet: memory.pets[0],
        allPets: memory.pets,
        summary: `${memory.pets.map(p => p.breed || p.type).join('/')} x${memory.pets.length}`
      }
    }

    // 2. 如果提到了某个城市，查找历史记录
    if (currentContext.destination) {
      const cityHistory = memory.history.trips.filter(
        t => t.destination === currentContext.destination
      )
      if (cityHistory.length > 0) {
        relevant.cityHistory = cityHistory
      }
    }

    // 3. 用户偏好（总是提供）
    relevant.preferences = memory.preferences

    // 4. 常见目的地（可用于推荐）
    if (memory.stats.commonDestinations.length > 0) {
      relevant.commonDestinations = memory.stats.commonDestinations
    }

    // 5. 平均行程天数（可作为默认值建议）
    if (memory.stats.avgTripDays > 0) {
      relevant.suggestedDays = memory.stats.avgTripDays
    }

    return relevant
  }

  /**
   * 从小程序用户信息初始化记忆
   */
  async initFromUserProfile(userId, userProfile) {
    if (!userProfile) return null

    const updates = {}

    // 基础信息
    if (userProfile.nickName) {
      updates.nickName = userProfile.nickName
    }
    if (userProfile.city) {
      updates.homeCity = userProfile.city
    }

    // 宠物信息
    if (userProfile.pets && Array.isArray(userProfile.pets) && userProfile.pets.length > 0) {
      updates.pets = userProfile.pets.map(p => ({
        name: p.name || p.petName,
        type: p.type || p.species || p.petType,
        breed: p.breed || p.variety,
        age: p.age,
        weight: p.weight,
        gender: p.gender,
        photoUrl: p.avatarUrl || p.photoUrl || p.headImgUrl,
        specialNeeds: p.specialNeeds || []
      }))
    }

    if (Object.keys(updates).length > 0) {
      return this.updateMemory(userId, updates)
    }

    return null
  }

  // ════════════════════════════════════════════════════════
  // 持久化
  // ════════════════════════════════════════════════════════

  /**
   * 保存所有脏数据到文件
   */
  async saveAll() {
    let saved = 0
    for (const userId of this.dirtySet) {
      const memory = this.cache.get(userId)
      if (memory) {
        try {
          await this._saveToFile(userId, memory)
          saved++
        } catch (error) {
          logger.error('MemoryStore', `保存失败 ${userId}: ${error.message}`)
        }
      }
    }
    this.dirtySet.clear()
    if (saved > 0) {
      logger.info('MemoryStore', `批量保存完成: ${saved} 条`)
    }
    return saved
  }

  /**
   * 保存单个用户
   */
  async saveUser(userId) {
    const memory = this.cache.get(userId)
    if (memory) {
      await this._saveToFile(userId, memory)
      this.dirtySet.delete(userId)
    }
  }

  // ════════════════════════════════════════════════════════
  // 内部方法
  // ════════════════════════════════════════════════════════

  _emptyMemory(userId) {
    return {
      userId: userId || '',
      createdAt: new Date().toISOString(),
      updatedAt: null,
      pets: [],
      preferences: { interests: [], avoidances: [] },
      history: { trips: [], searchedCities: [], favoritePois: [] },
      stats: { totalQueries: 0, avgTripDays: 0, commonDestinations: [], activeHours: [] }
    }
  }

  _deepMerge(target, source) {
    const result = { ...target }
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null
      ) {
        result[key] = this._deepMerge(target[key], source[key])
      } else {
        result[key] = source[key]
      }
    }
    return result
  }

  _ensureDataDir() {
    const dir = this.config.dataDir
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      logger.info('MemoryStore', `创建数据目录: ${dir}`)
    }
  }

  _getFilePath(userId) {
    // 用userId的hash作为文件名，避免特殊字符
    const hash = Buffer.from(userId).toString('base64').replace(/[+/=]/g, '').slice(0, 24)
    return path.join(this.config.dataDir, `${hash}.json`)
  }

  async _saveToFile(userId, memory) {
    const filePath = this._getFilePath(userId)
    const data = JSON.stringify(memory, null, 2)
    await fs.promises.writeFile(filePath, data, 'utf-8')
  }

  async _loadFromFile(userId) {
    try {
      const filePath = this._getFilePath(userId)
      const data = await fs.promises.readFile(filePath, 'utf-8')
      const parsed = JSON.parse(data)

      // 检查是否过期
      const updatedAt = new Date(parsed.updatedAt || parsed.createdAt)
      const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)

      if (daysSinceUpdate > this.config.retentionDays) {
        logger.info('MemoryStore', `记忆已过期: ${userId}, ${Math.round(daysSinceUpdate)}天前更新`)
        return null
      }

      return parsed
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn('MemoryStore', `加载失败 ${userId}: ${error.message}`)
      }
      return null
    }
  }

  _startAutoSave() {
    setInterval(() => {
      this.saveAll().catch(e => 
        logger.error('MemoryStore', `自动保存错误: ${e.message}`)
      )
    }, this.config.autoSaveInterval * 1000)

    // 进程退出时也保存
    process.on('SIGTERM', () => this.saveAll())
    process.on('SIGINT', () => this.saveAll())
  }
}

module.exports = new MemoryStore()
