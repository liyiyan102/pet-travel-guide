// pages/profile/profile.js
const app = getApp()

Page({
  data: {
    // 用户信息
    userInfo: null,
    
    // 统计数据
    stats: {
      tripCount: 3,
      petCount: 1,
      visitCount: 2,
      favCount: 12,
      cityCount: 5
    },

    // 最近攻略
    recentTrips: [
      { id: 'g1', title: '北京3日携宠自驾游', days: 3, spotCount: 12, updatedAt: '7/24', status: 'saved', icon: '/images/ic-map.png', bgColor: '#E8F8F0', iconColor: '#00B86B' },
      { id: 'g2', title: '怀柔周末遛狗半日游', days: 1, spotCount: 4, updatedAt: '7/20', status: 'draft', icon: '/images/ic-leaf.png', bgColor: '#FFF3EA', iconColor: '#FF7A1A' }
    ],

    // 宠物列表
    pets: [],

    // 缓存大小
    cacheSize: '0KB',

    // 弹窗状态
    showPetPopup: false,
    editingPetIndex: -1,
    
    // 宠物表单
    petForm: {
      name: '',
      type: '',
      size: '',
      breed: '',
      gender: '',
      birthday: '',
      avatar: ''
    },
    
    // 选项
    petTypes: ['狗狗', '猫咪', '兔子', '仓鼠', '鸟类', '其他'],
    petSizes: ['小型', '中型', '大型'],
    petTypeIndex: -1,
    petSizeIndex: -1,
    petGenderIndex: -1,
    
    today: ''
  },

  onLoad(options) {
    // 检查是否从生成页面跳转来添加宠物
    if (options.mode === 'addPet') {
      this.setData({ showPetPopup: true })
    }
    
    // 设置今天的日期
    const now = new Date()
    this.setData({
      today: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    })
    
    this.initData()
  },

  onShow() {
    this.initData()
  },

  // 初始化数据
  initData() {
    // 获取用户信息
    const userInfo = app.globalData.userInfo || wx.getStorageSync('userInfo')
    this.setData({ userInfo })
    
    // 加载宠物数据
    this.loadPets()
    
    // 更新统计
    this.updateStats()
    
    // 计算缓存大小
    this.calculateCacheSize()
  },

  // 登录
  onLogin() {
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        const userInfo = res.userInfo
        
        // 保存到本地和全局
        wx.setStorageSync('userInfo', userInfo)
        app.globalData.userInfo = userInfo
        
        this.setData({ userInfo })
        
        wx.showToast({
          title: '登录成功',
          icon: 'success'
        })
      },
      fail: (err) => {
        console.log('获取用户信息失败', err)
      }
    })
  },

  // 点击头像
  onAvatarTap() {
    if (!this.data.userInfo) {
      this.onLogin()
    }
  },

  // 加载宠物列表
  loadPets() {
    const pets = app.globalData.pets || wx.getStorageSync('pets') || []
    this.setData({ 
      pets,
      'stats.petCount': pets.length
    })
  },

  // 更新统计数据
  updateStats() {
    const itineraries = wx.getStorageSync('itineraries') || []
    const pets = wx.getStorageSync('pets') || []
    
    this.setData({
      'stats.tripCount': itineraries.length,
      'stats.petCount': pets.length,
      'stats.visitCount': itineraries.reduce((total, t) => {
        return total + (t.days_data ? t.days_data.length : 0)
      }, 0)
    })
  },

  // 计算缓存大小
  calculateCacheSize() {
    try {
      const res = wx.getStorageInfoSync()
      const sizeKB = res.currentSize
      let sizeStr = ''
      
      if (sizeKB < 1024) {
        sizeStr = sizeKB + 'KB'
      } else {
        sizeStr = (sizeKB / 1024).toFixed(2) + 'MB'
      }
      
      this.setData({ cacheSize: sizeStr })
    } catch (e) {
      console.log('计算缓存失败', e)
    }
  },

  // 显示添加宠物弹窗
  showAddPetPopup() {
    this.setData({
      showPetPopup: true,
      editingPetIndex: -1,
      petForm: {
        name: '',
        type: '',
        size: '',
        breed: '',
        gender: '',
        birthday: '',
        avatar: ''
      },
      petTypeIndex: -1,
      petSizeIndex: -1,
      petGenderIndex: -1
    })
  },

  // 关闭宠物弹窗
  closePetPopup() {
    this.setData({ showPetPopup: false })
  },

  // 编辑宠物
  editPet(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const pet = this.data.pets[index]
    
    const petTypeIndex = this.data.petTypes.indexOf(pet.type)
    const petSizeIndex = this.data.petSizes.indexOf(pet.size)
    const petGenderIndex = pet.gender === '公' ? 0 : (pet.gender === '母' ? 1 : -1)
    
    this.setData({
      showPetPopup: true,
      editingPetIndex: index,
      petForm: { ...pet },
      petTypeIndex,
      petSizeIndex,
      petGenderIndex
    })
  },

  // 删除宠物
  deletePet(e) {
    const index = parseInt(e.currentTarget.dataset.index)
    const pet = this.data.pets[index]
    
    wx.showModal({
      title: '确认删除',
      content: `确定要删除${pet.name}吗？`,
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          const pets = [...this.data.pets]
          pets.splice(index, 1)
          
          // 保存到本地和全局
          wx.setStorageSync('pets', pets)
          app.globalData.pets = pets
          
          this.setData({ pets })
          this.updateStats()
          
          wx.showToast({
            title: '已删除',
            icon: 'success'
          })
        }
      }
    })
  },

  // 表单输入
  onPetFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({
      [`petForm.${field}`]: e.detail.value
    })
  },

  // 宠物类型选择
  onPetTypeChange(e) {
    const index = parseInt(e.detail.value)
    this.setData({
      petTypeIndex: index,
      'petForm.type': this.data.petTypes[index]
    })
  },

  // 宠物体型选择
  onPetSizeChange(e) {
    const index = parseInt(e.detail.value)
    this.setData({
      petSizeIndex: index,
      'petForm.size': this.data.petSizes[index]
    })
  },

  // 性别选择
  onPetGenderChange(e) {
    const index = parseInt(e.detail.value)
    this.setData({
      petGenderIndex: index,
      'petForm.gender': ['公', '母'][index]
    })
  },

  // 生日选择
  onBirthdayChange(e) {
    this.setData({
      'petForm.birthday': e.detail.value
    })
  },

  // 选择宠物头像
  choosePetAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({
          'petForm.avatar': tempFilePath
        })
      }
    })
  },

  // 保存宠物
  savePet() {
    const { petForm, petTypeIndex, petSizeIndex, editingPetIndex } = this.data
    
    // 验证必填字段
    if (!petForm.name.trim()) {
      wx.showToast({
        title: '请输入昵称',
        icon: 'none'
      })
      return
    }
    
    if (petTypeIndex < 0) {
      wx.showToast({
        title: '请选择类型',
        icon: 'none'
      })
      return
    }
    
    if (petSizeIndex < 0) {
      wx.showToast({
        title: '请选择体型',
        icon: 'none'
      })
      return
    }
    
    const newPet = {
      id: editingPetIndex >= 0 ? this.data.pets[editingPetIndex].id : 'PET_' + Date.now(),
      ...petForm
    }
    
    let pets = [...this.data.pets]
    
    if (editingPetIndex >= 0) {
      // 编辑现有宠物
      pets[editingPetIndex] = newPet
    } else {
      // 添加新宠物
      pets.push(newPet)
    }
    
    // 保存到本地和全局
    wx.setStorageSync('pets', pets)
    app.globalData.pets = pets
    
    this.setData({
      pets,
      showPetPopup: false
    })
    
    this.updateStats()
    
    wx.showToast({
      title: editingPetIndex >= 0 ? '修改成功' : '添加成功',
      icon: 'success'
    })
  },

  // 计算年龄
  calculateAge(birthday) {
    if (!birthday) return ''
    
    const birth = new Date(birthday)
    const now = new Date()
    const diffTime = Math.abs(now - birth)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 30) {
      return `${diffDays}天`
    } else if (diffDays < 365) {
      return `${Math.floor(diffDays / 30)}个月`
    } else {
      const years = Math.floor(diffDays / 365)
      const months = Math.floor((diffDays % 365) / 30)
      if (months > 0) {
        return `${years}岁${months}个月`
      }
      return `${years}岁`
    }
  },

  onTripTap(e) {
    const trip = e.currentTarget.dataset.trip
    if (trip?.id) wx.navigateTo({ url: `/pages/itinerary/itinerary?id=${trip.id}` })
  },

  goToFavorites() {
    wx.showToast({ title: '收藏功能即将上线', icon: 'none' })
  },

  // 跳转到我的攻略（mytrips不再是tab页，用navigateTo）
  goToMyTrips() {
    wx.navigateTo({
      url: '/pages/mytrips/mytrips'
    })
  },

  // 跳转设置
  goToSettings() {
    wx.showToast({
      title: '设置功能开发中',
      icon: 'none'
    })
  },

  // 意见反馈
  goToFeedback() {
    wx.showToast({
      title: '反馈功能开发中',
      icon: 'none'
    })
  },

  // 关于我们
  goToAbout() {
    wx.showModal({
      title: '宠物友好旅行',
      content: '版本：v1.0.0\n\n专为宠物主设计的智能旅行规划工具，帮助您和爱宠一起探索世界。\n\n© 2026 PetTravel Team',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  // 清除缓存
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有本地缓存数据吗？这不会删除您的账号信息。',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          try {
            // 清除特定缓存（保留用户信息和宠物档案）
            wx.removeStorageSync('itineraries')
            wx.removeStorageSync('previewItinerary')
            
            this.calculateCacheSize()
            this.updateStats()
            
            wx.showToast({
              title: '清除成功',
              icon: 'success'
            })
          } catch (e) {
            wx.showToast({
              title: '清除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 页面分享
  onShareAppMessage() {
    return {
      title: '宠物友好旅行 - 带着爱宠去旅行',
      path: '/pages/index/index'
    }
  }
})
