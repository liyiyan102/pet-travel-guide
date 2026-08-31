/**
 * 输入验证工具
 */

class ValidationError extends Error {
  constructor(message, field) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

const validators = {
  // 验证非空字符串
  nonEmptyString(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ValidationError(`${fieldName}不能为空`, fieldName)
    }
    return value.trim()
  },

  // 验证数字范围
  numberRange(value, fieldName, min, max) {
    const num = Number(value)
    if (isNaN(num)) {
      throw new ValidationError(`${fieldName}必须是有效数字`, fieldName)
    }
    if (min !== undefined && num < min) {
      throw new ValidationError(`${fieldName}不能小于${min}`, fieldName)
    }
    if (max !== undefined && num > max) {
      throw new ValidationError(`${fieldName}不能大于${max}`, fieldName)
    }
    return num
  },

  // 验证枚举值
  enumValue(value, fieldName, allowedValues) {
    if (!allowedValues.includes(value)) {
      throw new ValidationError(`${fieldName}必须是以下值之一: ${allowedValues.join(', ')}`, fieldName)
    }
    return value
  },

  // 验证数组
  array(value, fieldName, minLength = 0) {
    if (!Array.isArray(value)) {
      throw new ValidationError(`${fieldName}必须是数组`, fieldName)
    }
    if (value.length < minLength) {
      throw new ValidationError(`${fieldName}至少需要${minLength}个元素`, fieldName)
    }
    return value
  },

  // 验证图片URL
  imageUrl(value, fieldName) {
    this.nonEmptyString(value, fieldName)
    // 支持http/https/base64/cloud/wxfile/file协议/本地路径
    const validPatterns = [
      /^https?:\/\/.+/,
      /^data:image\/.+/,
      /^cloud:\/\/.+/,
      /^wxfile:\/\/.+/,
      /^file:\/\/.+/,
      /^http:\/\/127\.0\.0\.1:\d+\/.+/,
      /^\/uploads\/.+/,
      /^[A-Za-z]:[\\/]/  // Windows 绝对路径
    ]
    
    const isValid = validPatterns.some(p => p.test(value))
    if (!isValid) {
      throw new ValidationError(`${fieldName}不是有效的图片地址`, fieldName)
    }
    return value
  },

  // 验证宠物信息
  petInfo(pet) {
    if (!pet || typeof pet !== 'object') {
      throw new ValidationError('宠物信息格式不正确', 'pet')
    }
    
    const result = {}
    if (pet.type) result.type = validators.enumValue(pet.type.toLowerCase(), '宠物类型', ['dog', 'cat', 'rabbit', 'bird', 'hamster', 'other'])
    if (pet.name) result.name = validators.nonEmptyString(pet.name, '宠物名称')
    if (pet.breed) result.breed = String(pet.breed)
    if (pet.age) result.age = String(pet.age)
    if (pet.size) result.size = validators.enumValue(pet.size.toLowerCase(), '体型', ['small', 'medium', 'large', 'xlarge'])
    
    return result
  },

  // 验证用户输入
  userInput(input) {
    if (!input || typeof input !== 'object') {
      throw new ValidationError('输入格式不正确', 'input')
    }

    const result = { ...input }
    
    // message和images至少有一个
    if (!result.message && (!result.images || result.images.length === 0)) {
      throw new ValidationError('请输入消息或上传图片', 'message/images')
    }
    
    if (result.message) {
      result.message = validators.nonEmptyString(result.message, '消息')
    }
    
    if (result.images && Array.isArray(result.images)) {
      result.images = result.images.map((img, i) => validators.imageUrl(img, `图片${i + 1}`))
    } else {
      result.images = []
    }

    return result
  }
}

module.exports = { validators, ValidationError }
