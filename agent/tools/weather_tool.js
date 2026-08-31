/**
 * 天气查询工具
 */

const BaseTool = require('./base')
const { logger } = require('../utils/logger')

class WeatherTool extends BaseTool {
  static get schema() {
    return {
      name: 'get_weather',
      description: '查询天气预报信息，并给出宠物出行舒适度建议',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description: '城市名称'
          },
          days: {
            type: 'number',
            description: '预报天数（1-7天），默认3天'
          },
          include_pet_index: {
            type: 'boolean',
            description: '是否计算宠物出行舒适度指数（默认true）'
          }
        },
        required: ['city']
      }
    }
  }

  async execute(params) {
    const { city, days = 3, include_pet_index = true } = params

    logger.info('WeatherTool', `查询${city}天气，${days}天`)

    try {
      // 尝试调用真实天气API
      const realData = await this.callWeatherAPI(city, days)
      if (realData) {
        return this.formatWeatherResult(realData, include_pet_index)
      }
    } catch (e) {
      logger.warn('WeatherTool', `API失败，使用模拟数据: ${e.message}`)
    }

    // 返回模拟天气数据
    return this.getMockWeather(city, days, include_pet_index)
  }

  async callWeatherAPI(city, days) {
    // TODO: 接入和风天气或其他天气API
    return null
  }

  /**
   * 模拟天气数据
   */
  getMockWeather(city, days, includePetIndex) {
    const weatherTypes = ['晴', '多云', '阴', '小雨', '阵雨', '雷阵雨']
    const now = new Date()
    const forecasts = []

    for (let i = 0; i < days; i++) {
      const date = new Date(now)
      date.setDate(date.getDate() + i)
      
      const tempLow = 18 + Math.floor(Math.random() * 10)
      const tempHigh = tempLow + 5 + Math.floor(Math.random() * 8)
      const weather = weatherTypes[Math.floor(Math.random() * (i < 2 ? 3 : weatherTypes.length))]
      const humidity = 40 + Math.floor(Math.random() * 40)
      const wind = 1 + Math.floor(Math.random() * 5)

      // 计算宠物舒适度
      let petComfortLevel, petComfortScore, petTips
      
      if (includePetIndex) {
        const comfortResult = this.calcPetComfortIndex(tempHigh, weather, humidity, wind)
        petComfortLevel = comfortResult.level
        petComfortScore = comfortResult.score
        petTips = comfortResult.tips
      }

      forecasts.push({
        date: date.toISOString().split('T')[0],
        weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()],
        weather,
        temp_low: tempLow,
        temp_high: tempHigh,
        humidity: `${humidity}%`,
        wind: wind <= 3 ? `${wind}级 微风` : `${wind}级 ${wind >= 5 ? '' : '和风'}`,
        pet_comfort: includePetIndex ? {
          level: petComfortLevel,
          score: petComfortScore,
          tips: petTips
        } : null
      })
    }

    return {
      city,
      update_time: new Date().toISOString(),
      forecasts,
      data_source: 'simulation'
    }
  }

  /**
   * 计算宠物出行舒适度指数
   */
  calcPetComfortIndex(maxTemp, weather, humidity, windLevel) {
    let score = 10
    const tips = []

    // 温度因素
    if (maxTemp >= 35) {
      score -= 4
      tips.push('☀️ 高温预警！避免户外活动，如必须外出选择清晨/傍晚')
    } else if (maxTemp >= 30) {
      score -= 2
      tips.push('🌡️ 温度较高，缩短户外时间，多休息补水')
    } else if (maxTemp >= 22 && maxTemp <= 28) {
      tips.push('✅ 温度适宜，非常适合户外活动')
    } else if (maxTemp < 10) {
      score -= 3
      tips.push('❄️ 温度较低，外出注意保暖，短毛犬建议穿衣服')
    } else if (maxTemp < 5) {
      score -= 4
      tips.push('🥶 严寒警告！不建议长时间户外活动')
    }

    // 天气因素
    if (['大雨', '暴雨', '雷阵雨'].includes(weather)) {
      score -= 3
      tips.push('🌧️ 恶劣天气，建议室内活动')
    } else if (['中雨', '小雨', '阵雨'].includes(weather)) {
      score -= 1.5
      tips.push('🌦️ 有雨，带好雨具，注意地面湿滑')
    } else if (weather === '晴' && maxTemp > 28) {
      score -= 1
      tips.push('☀️ 晴天炎热，注意防晒和防中暑')
    }

    // 湿度因素
    const humidityNum = parseInt(humidity)
    if (humidityNum > 80) {
      score -= 1
      tips.push('💧 湿度高，体感更热，增加休息频次')
    }

    // 风力因素
    if (windLevel >= 5) {
      score -= 0.5
      tips.push('💨 风较大，注意防风保暖')
    }

    score = Math.max(1, Math.min(10, score))

    let level
    if (score >= 8) level = '非常适宜'
    else if (score >= 6) level = '适宜'
    else if (score >= 4) level = '一般'
    else if (score >= 2) level = '不太适宜'
    else level = '不推荐'

    return { level, score, tips }
  }
}

module.exports = WeatherTool
