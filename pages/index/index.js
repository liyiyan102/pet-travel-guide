// pages/index/index.js
const app = getApp()

Page({
  data: {
    // 热门城市
    hotCities: [
      { name: '北京', poiCount: 58, guideCount: 12, bgColor: '#0A0A0C' },
      { name: '上海', poiCount: 53, guideCount: 8,  bgColor: '#1a3a5c' },
      { name: '成都', poiCount: 32, guideCount: 5,  bgColor: '#3d2e1e' },
      { name: '杭州', poiCount: 28, guideCount: 4,  bgColor: '#2d4a3e' }
    ],
    // 热门攻略（mock 数据，后续从后端拉取）
    hotGuides: [
      {
        id: 'g1', title: '北京3日携宠自驾游', days: 3, spotCount: 12, favCount: '1.2k',
        tag1: '金毛友好', tag2: '自驾', icon: '/images/ic-map.png', bgColor: '#E8F8F0', iconColor: '#00B86B',
        destination: '北京',
        days_data: [
          { day: 1, theme: '胡同与公园初探', spots: [
            { name: '北海公园', type: 'park', time: '09:00', duration: '2h', pet_friendly: true, note: '北门区域可遛狗' },
            { name: '什刹海胡同', type: 'sightseeing', time: '12:00', duration: '2h', pet_friendly: true },
            { name: '故宫东华门外', type: 'sightseeing', time: '15:00', duration: '1h', pet_friendly: false, note: '仅外围可停留' },
            { name: '三里屯宠物友好餐厅', type: 'dining', time: '18:00', duration: '2h', pet_friendly: true, note: '提供宠物菜单' }
          ]},
          { day: 2, theme: '郊区自然风光', spots: [
            { name: '朝阳公园', type: 'park', time: '09:00', duration: '3h', pet_friendly: true, note: '指定区域可遛狗' },
            { name: '798艺术区', type: 'sightseeing', time: '13:00', duration: '2h', pet_friendly: true },
            { name: '蓝色港湾', type: 'shopping', time: '16:00', duration: '2h', pet_friendly: true, note: '户外区域可携带' }
          ]},
          { day: 3, theme: '怀柔郊游与返程', spots: [
            { name: '怀柔雁栖湖', type: 'park', time: '09:00', duration: '3h', pet_friendly: true, note: '环湖步道适合遛狗' },
            { name: '红螺寺外围', type: 'sightseeing', time: '13:00', duration: '1.5h', pet_friendly: false, note: '仅外围步道' },
            { name: '返程', type: 'transport', time: '16:00', duration: '1.5h' }
          ]}
        ]
      },
      {
        id: 'g2', title: '上海梧桐区携宠City Walk', days: 1, spotCount: 8, favCount: '856',
        tag1: '小型犬', tag2: '咖啡', icon: '/images/ic-park.png', bgColor: '#FFF3EA', iconColor: '#FF7A1A',
        destination: '上海',
        days_data: [
          { day: 1, theme: '梧桐区漫步', spots: [
            { name: '武康路历史文化街区', type: 'sightseeing', time: '10:00', duration: '2h', pet_friendly: true, note: '街道宽敞适合遛狗' },
            { name: 'BrewBear宠物友好咖啡', type: 'dining', time: '12:00', duration: '1.5h', pet_friendly: true, note: '提供宠物菜单' },
            { name: '安福路', type: 'sightseeing', time: '14:00', duration: '1.5h', pet_friendly: true },
            { name: '静安公园', type: 'park', time: '16:00', duration: '2h', pet_friendly: true, note: '有专门宠物活动区' },
            { name: '外滩源', type: 'sightseeing', time: '19:00', duration: '1.5h', pet_friendly: true }
          ]}
        ]
      },
      {
        id: 'g3', title: '成都宠物友好咖啡地图', days: 1, spotCount: 5, favCount: '643',
        tag1: '咖啡控', tag2: '室内', icon: '/images/ic-cafe.png', bgColor: '#FDF2F8', iconColor: '#EC4899',
        destination: '成都',
        days_data: [
          { day: 1, theme: '咖啡店巡礼', spots: [
            { name: '何日君再来宠物咖啡馆', type: 'dining', time: '10:00', duration: '2h', pet_friendly: true, note: '猫咪主题' },
            { name: '宽窄巷子', type: 'sightseeing', time: '13:00', duration: '2h', pet_friendly: true, note: '户外区域可携带' },
            { name: '人民公园', type: 'park', time: '15:30', duration: '2h', pet_friendly: true, note: '茶铺外可带宠物' },
            { name: '太古里', type: 'shopping', time: '18:00', duration: '2h', pet_friendly: true, note: '部分店铺允许' }
          ]}
        ]
      },
      {
        id: 'g4', title: '杭州西湖携宠2日游', days: 2, spotCount: 9, favCount: '932',
        tag1: '边牧友好', tag2: '户外', icon: '/images/ic-leaf.png', bgColor: '#E8F8F0', iconColor: '#00B86B',
        destination: '杭州',
        days_data: [
          { day: 1, theme: '西湖经典环线', spots: [
            { name: '断桥残雪', type: 'sightseeing', time: '09:00', duration: '1h', pet_friendly: true },
            { name: '白堤', type: 'sightseeing', time: '10:00', duration: '1h', pet_friendly: true, note: '湖边步道可遛狗' },
            { name: '苏堤春晓', type: 'sightseeing', time: '11:30', duration: '2h', pet_friendly: true },
            { name: '花港观鱼', type: 'park', time: '14:00', duration: '1.5h', pet_friendly: true },
            { name: '南山路宠物餐厅', type: 'dining', time: '17:00', duration: '2h', pet_friendly: true }
          ]},
          { day: 2, theme: '西溪湿地与返程', spots: [
            { name: '西溪湿地公园', type: 'park', time: '09:00', duration: '3h', pet_friendly: true, note: '部分区域允许宠物' },
            { name: '河坊街', type: 'shopping', time: '13:00', duration: '2h', pet_friendly: true },
            { name: '龙井村', type: 'sightseeing', time: '16:00', duration: '1.5h', pet_friendly: true }
          ]}
        ]
      },
      {
        id: 'g5', title: '广州周末携宠亲子游', days: 2, spotCount: 7, favCount: '521',
        tag1: '柯基', tag2: '亲子', icon: '/images/ic-compass.png', bgColor: '#EFF6FF', iconColor: '#3B82F6',
        destination: '广州',
        days_data: [
          { day: 1, theme: '城市公园日', spots: [
            { name: '越秀公园', type: 'park', time: '09:00', duration: '2h', pet_friendly: true },
            { name: '沙面岛', type: 'sightseeing', time: '12:00', duration: '2h', pet_friendly: true, note: '欧式建筑群，适合拍照' },
            { name: '珠江边步道', type: 'sightseeing', time: '15:00', duration: '2h', pet_friendly: true }
          ]},
          { day: 2, theme: '长隆周边与返程', spots: [
            { name: '大夫山森林公园', type: 'park', time: '09:00', duration: '3h', pet_friendly: true, note: '可骑行遛狗' },
            { name: '番禺宠物友好商场', type: 'shopping', time: '13:00', duration: '2h', pet_friendly: true }
          ]}
        ]
      },
      {
        id: 'g6', title: '大理环海携宠3日游', days: 3, spotCount: 10, favCount: '1.5k',
        tag1: '拉布拉多', tag2: '自驾', icon: '/images/ic-map.png', bgColor: '#FFF3EA', iconColor: '#FF7A1A',
        destination: '大理',
        days_data: [
          { day: 1, theme: '洱海东线', spots: [
            { name: '双廊古镇', type: 'sightseeing', time: '09:00', duration: '3h', pet_friendly: true },
            { name: '挖色镇', type: 'sightseeing', time: '13:00', duration: '2h', pet_friendly: true },
            { name: '小普陀', type: 'sightseeing', time: '16:00', duration: '1h', pet_friendly: true }
          ]},
          { day: 2, theme: '苍山与古城', spots: [
            { name: '苍山步道', type: 'park', time: '09:00', duration: '3h', pet_friendly: true, note: '感通索道下方步道' },
            { name: '大理古城', type: 'sightseeing', time: '13:00', duration: '3h', pet_friendly: true },
            { name: '人民路咖啡馆', type: 'dining', time: '17:00', duration: '2h', pet_friendly: true }
          ]},
          { day: 3, theme: '海西田园与返程', spots: [
            { name: '喜洲古镇', type: 'sightseeing', time: '09:00', duration: '2h', pet_friendly: true },
            { name: '海舌公园', type: 'park', time: '12:00', duration: '2h', pet_friendly: true, note: '洱海边绝佳遛狗地' },
            { name: '返程', type: 'transport', time: '15:00', duration: '2h' }
          ]}
        ]
      }
    ]
  },

  onLoad() {},

  onShow() {},

  // 前往搜索/找地点页
  goToSearch() {
    wx.switchTab({ url: '/pages/map/map' })
  },

  // 前往AI生成攻略页
  goToGenerate() {
    wx.switchTab({ url: '/pages/generate/generate' })
  },

  // 前往AI对话页
  goToChat() {
    wx.navigateTo({ url: '/pages/chat/chat' })
  },

  // 分类入口点击 - 进入找地点页并带分类参数
  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    wx.switchTab({ url: '/pages/map/map' })
    // 通过 globalData 传参
    app.globalData.mapCategory = category
  },

  // 城市卡片点击
  onCityTap(e) {
    const city = e.currentTarget.dataset.city
    wx.switchTab({ url: '/pages/map/map' })
    app.globalData.mapCity = city
  },

  // 热门攻略点击 → 跳转 editor 预览
  onGuideTap(e) {
    const guide = e.currentTarget.dataset.guide
    if (!guide) return
    // 构造预览数据
    const previewData = {
      itinerary_id: guide.id,
      title: guide.title,
      destination: guide.destination || guide.title,
      days: guide.days,
      days_data: guide.days_data || []
    }
    wx.setStorageSync('previewItinerary', previewData)
    wx.navigateTo({ url: `/pages/editor/editor?mode=preview&id=${guide.id}` })
  },

  goToCityList() {
    wx.switchTab({ url: '/pages/map/map' })
  },

  goToGuideList() {
    wx.navigateTo({ url: '/pages/mytrips/mytrips' })
  }
})

