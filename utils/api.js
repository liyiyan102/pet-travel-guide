/**
 * API 请求封装
 */
const { callCloudFunction, showToast } = require('./util')
const { CLOUD_FUNCTIONS } = require('./config')

/**
 * 获取POI列表
 * @param {Object} params 查询参数
 * @returns {Promise}
 */
function getPOIList(params = {}) {
  return callCloudFunction(CLOUD_FUNCTIONS.GET_POI_LIST, {
    latitude: params.latitude,
    longitude: params.longitude,
    category: params.category || 'all',
    petFriendlyOnly: params.petFriendlyOnly || false,
    keyword: params.keyword || '',
    page: params.page || 1,
    pageSize: params.pageSize || 20
  })
}

/**
 * AI生成旅行攻略
 * @param {Object} params 生成参数
 * @returns {Promise}
 */
function generateItinerary(params) {
  return callCloudFunction(CLOUD_FUNCTIONS.GENERATE_ITINERARY, {
    destination: params.destination,
    days: params.days,
    pets: params.pets,
    specialNeeds: params.specialNeeds || '',
    options: params.options || [],
    userId: params.userId
  })
}

/**
 * 保存攻略
 * @param {Object} data 攻略数据
 * @returns {Promise}
 */
function saveItinerary(data) {
  return callCloudFunction(CLOUD_FUNCTIONS.SAVE_ITINERARY, {
    itinerary_id: data.itinerary_id,
    itineraryData: data,
    action: data.itinerary_id ? 'update' : 'create'
  })
}

/**
 * 删除攻略
 * @param {string} itineraryId 攻略ID
 * @returns {Promise}
 */
function deleteItinerary(itineraryId) {
  return callCloudFunction(CLOUD_FUNCTIONS.SAVE_ITINERARY, {
    itinerary_id: itineraryId,
    action: 'delete'
  })
}

/**
 * 获取攻略详情
 * @param {string} itineraryId 攻略ID
 * @returns {Promise}
 */
function getItineraryDetail(itineraryId) {
  return callCloudFunction(CLOUD_FUNCTIONS.GET_ITINERARY_DETAIL, {
    itinerary_id: itineraryId
  })
}

/**
 * 保存用户宠物信息
 * @param {Object} petData 宠物数据
 * @returns {Promise}
 */
function saveUserPet(petData) {
  return callCloudFunction(CLOUD_FUNCTIONS.SAVE_USER_PET, {
    pet: petData
  })
}

/**
 * 删除用户宠物
 * @param {string} petId 宠物ID
 * @returns {Promise}
 */
function deleteUserPet(petId) {
  return callCloudFunction(CLOUD_FUNCTIONS.DELETE_USER_PET, {
    pet_id: petId
  })
}

/**
 * 上报POI纠错/反馈
 * @param {Object} reportData 反馈数据
 * @returns {Promise}
 */
function reportPOI(reportData) {
  return callCloudFunction(CLOUD_FUNCTIONS.REPORT_POI, {
    poi_id: reportData.poiId,
    type: reportData.type, // 'correct' | 'feedback'
    content: reportData.content,
    contact: reportData.contact // 可选联系方式
  })
}

// 导出API模块
module.exports = {
  getPOIList,
  generateItinerary,
  saveItinerary,
  deleteItinerary,
  getItineraryDetail,
  saveUserPet,
  deleteUserPet,
  reportPOI
}
