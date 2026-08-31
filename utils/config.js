/**
 * 应用配置文件
 */

// 环境配置
const ENV = {
  // 开发环境
  development: {
    envId: 'your-dev-env-id', // 开发环境云开发环境ID
    apiBase: '', // API基础地址
    debug: true
  },
  
  // 生产环境
  production: {
    envId: 'your-prod-env-id', // 生产环境云开发环境ID
    apiBase: '',
    debug: false
  }
}

// 当前环境（根据条件切换）
const currentEnv = ENV.development

// 云函数名称
const CLOUD_FUNCTIONS = {
  GET_POI_LIST: 'getPOIList',
  GENERATE_ITINERARY: 'generateItinerary',
  SAVE_ITINERARY: 'saveItinerary',
  GET_ITINERARY_DETAIL: 'getItineraryDetail',
  DELETE_ITINERARY: 'deleteItinerary',
  SAVE_USER_PET: 'saveUserPet',
  DELETE_USER_PET: 'deleteUserPet',
  REPORT_POI: 'reportPOI'
}

// POI分类配置
const POI_CATEGORIES = [
  { id: 'all', name: '全部', icon: '/images/category-all.png' },
  { id: 'hotel', name: '酒店', icon: '/images/category-hotel.png' },
  { id: 'restaurant', name: '餐厅', icon: '/images/category-restaurant.png' },
  { id: 'cafe', name: '咖啡厅', icon: '/images/category-cafe.png' },
  { id: 'park', name: '公园', icon: '/images/category-park.png' },
  { id: 'hospital', name: '医院', icon: '/images/category-hospital.png' },
  { id: 'grooming', name: '美容', icon: '/images/category-grooming.png' }
]

// 宠物类型配置
const PET_TYPES = ['狗狗', '猫咪', '兔子', '仓鼠', '鸟类', '其他']

// 宠物体型配置
const PET_SIZES = ['小型', '中型', '大型']

// 地点类型映射
const SPOT_TYPE_MAP = {
  sightseeing: '景点',
  dining: '餐厅',
  hotel: '酒店',
  park: '公园',
  transport: '交通',
  shopping: '购物',
  hospital: '医院',
  museum: '博物馆',
  cafe: '咖啡厅',
  other: '其他'
}

// 可信度配置
const CONFIDENCE_LEVELS = {
  high: { text: '高可信度', color: '#52c41a', bg: '#f6ffed' },
  medium: { text: '中等', color: '#faad14', bg: '#fffbe6' },
  low: { text: '待核实', color: '#ff4d4f', bg: '#fff2f0' }
}

// 数据来源配置
const SOURCE_MAP = {
  official: '官方数据',
  user_reported: '用户上报',
  ai_extracted: 'AI提取',
  partner: '合作伙伴'
}

// 页面路由配置
const ROUTES = {
  INDEX: '/pages/index/index',
  GENERATE: '/pages/generate/generate',
  MY_TRIPS: '/pages/mytrips/mytrips',
  EDITOR: '/pages/editor/editor',
  PROFILE: '/pages/profile/profile',
  POI_DETAIL: '/pages/poidetail/poidetail'
}

// 分页配置
const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50
}

// AI生成配置
const AI_CONFIG = {
  MAX_DAYS: 7,
  MIN_DAYS: 1,
  DEFAULT_OPTIONS: [
    { id: 'pet_friendly_only', label: '仅宠物友好场所', selected: true },
    { id: 'include_vet', label: '包含附近宠物医院', selected: false },
    { id: 'relaxed_pace', label: '节奏轻松（适合带宠）', selected: true },
    { id: 'indoor_backup', label: '含室内备选方案', selected: false }
  ]
}

// 导出配置
module.exports = {
  ENV,
  currentEnv,
  CLOUD_FUNCTIONS,
  POI_CATEGORIES,
  PET_TYPES,
  PET_SIZES,
  SPOT_TYPE_MAP,
  CONFIDENCE_LEVELS,
  SOURCE_MAP,
  ROUTES,
  PAGINATION,
  AI_CONFIG
}
