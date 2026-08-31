App({
  globalData: {
    userInfo: null,
    pets: [],
    currentLocation: null,
    selectedPet: null,
    // 后端 Agent 服务地址（开发时用本地地址，上线时替换为正式域名）
    serverUrl: 'https://daitto.site'
  },

  onLaunch() {
    // 初始化云开发环境（必须在最前面）
    wx.cloud.init({
      env: 'your-env-id',  // TODO: 替换为你的云开发环境ID
      traceUser: true
    })
    
    // 检查登录状态
    this.checkLoginStatus()
    // 获取用户位置
    this.getUserLocation()
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
      // 加载宠物档案
      this.loadPets()
    }
  },

  // 获取用户位置
  getUserLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.globalData.currentLocation = {
          latitude: res.latitude,
          longitude: res.longitude
        }
      },
      fail: (err) => {
        console.log('获取位置失败', err)
        // 默认位置（北京市中心）
        this.globalData.currentLocation = {
          latitude: 39.9042,
          longitude: 116.4074
        }
      }
    })
  },

  // 加载宠物档案
  loadPets() {
    const pets = wx.getStorageSync('pets') || []
    this.globalData.pets = pets
  },

  // 保存宠物档案
  savePets(pets) {
    wx.setStorageSync('pets', pets)
    this.globalData.pets = pets
  }
})
