/**
 * 轻量级实体识别器 (Entity Recognizer)
 * 基于词典匹配的实体提取，无需外部NLP库
 */

const logger = require('../utils/logger')

// ═══════════════════════════════════════════════════════════
// 实体词典
// ═══════════════════════════════════════════════════════════
const DICTIONARIES = {
  // 中国主要城市（含热门旅游城市）
  cities: [
    // 一线城市
    '北京', '上海', '广州', '深圳',
    // 新一线/热门旅游城市
    '成都', '杭州', '重庆', '西安', '苏州', '武汉', '南京', '天津', '长沙', '郑州',
    '青岛', '宁波', '厦门', '福州', '大连', '沈阳', '济南', '哈尔滨', '长春', '昆明',
    '贵阳', '南宁', '海口', '三亚', '乌鲁木齐', '拉萨', '呼和浩特', '银川', '兰州', '西宁',
    // 热门旅游目的地
    '桂林', '丽江', '大理', '张家界', '黄山', '九寨沟', '敦煌', '桂林', '凤凰古城',
    '乌镇', '周庄', '西塘', '平遥', '婺源', '稻城亚丁', '喀纳斯', '呼伦贝尔'
  ],

  // 省份/区域（用于泛化）
  provinces: [
    '北京', '上海', '天津', '重庆',
    '河北', '山西', '辽宁', '吉林', '黑龙江', '江苏', '浙江', '安徽', '福建', '江西',
    '山东', '河南', '湖北', '湖南', '广东', '海南', '四川', '贵州', '云南', '陕西',
    '甘肃', '青海', '台湾', '内蒙古', '广西', '西藏', '宁夏', '新疆', '香港', '澳门'
  ],

  // 宠物品种 - 犬类
  dogBreeds: [
    // 小型犬
    '泰迪', '贵宾', '比熊', '博美', '柯基', '威尔士柯基', '彭布罗克柯基',
    '法斗', '法国斗牛犬', '英斗', '英国斗牛犬', '巴哥', '巴哥犬',
    '雪纳瑞', '迷你雪纳瑞', '标准雪纳瑞', '巨型雪纳瑞',
    '约克夏', '约克夏梗', '马尔济斯', '吉娃娃', '腊肠犬', '腊肠',
    '蝴蝶犬', '北京犬', '西施犬', '日本尖嘴', '银狐', '日本狆',
    // 中型犬
    '柴犬', '柴犬', '中华田园犬', '土狗', '田园犬',
    '金毛', '金毛巡回犬', '金毛寻回犬',
    '哈士奇', '西伯利亚哈士奇', '二哈',
    '拉布拉多', '拉布拉多寻回犬',
    '萨摩', '萨摩耶', '萨摩耶德',
    '德牧', '德国牧羊犬', '德国狼狗', '黑背',
    '边牧', '边境牧羊犬', '边境牧羊',
    '松狮', '松狮犬', '松狮',
    '阿拉斯加', '阿拉斯加雪橇犬', '阿拉斯加',
    '苏牧', '苏格兰牧羊犬', '喜乐蒂',
    '古代牧羊犬', '古牧',
    '大麦町', '斑点狗',
    '沙皮', '沙皮犬',
    '标准贵宾', '巨型贵宾',
    '惠比特', '灵缇',
    // 大型犬/烈性犬
    '藏獒', '藏獒',
    '比特犬', '比特', '美国比特',
    '罗威纳', '罗威纳犬',
    '杜宾', '杜宾犬',
    '卡斯罗', '卡斯罗犬',
    '高加索', '高加索犬',
    '纽芬兰', '纽芬兰犬',
    '圣伯纳', '圣伯纳犬',
    '大丹犬', '大白熊', '伯恩山',
    // 其他常见称呼
    '串串', '混血', '混种', '杂交', '流浪狗', '流浪猫',
    '毛孩子', '汪星人', '喵星人', '狗狗', '狗子', '猫咪', '猫猫'
  ],

  // 宠物品种 - 猫类
  catBreeds: [
    '英短', '英国短毛猫', '英国短毛',
    '美短', '美国短毛猫', '美国短毛',
    '布偶', '布偶猫', '布拉多尔',
    '波斯猫', '波斯',
    '暹罗猫', '暹罗',
    '缅因猫', '缅因',
    '折耳', '苏格兰折耳', '折耳猫',
    '立耳', '苏格兰立耳',
    '加菲猫', '异国短毛猫', '加菲',
    '蓝猫', '俄罗斯蓝猫', '英短蓝猫',
    '橘猫', '橘猫', '大橘',
    '狸花猫', '狸花', '中华田园猫',
    '孟加拉豹猫', '豹猫',
    '斯芬克斯', '无毛猫',
    '埃及猫', '阿比西尼亚猫',
    '新加坡猫', '伯曼猫', '土耳其安哥拉'
  ],

  // 其他宠物
  otherPets: [
    '兔子', '兔兔', '垂耳兔', '荷兰猪', '豚鼠', '仓鼠', '龙猫',
    '鹦鹉', '虎皮鹦鹉', '牡丹鹦鹉', '玄凤鹦鹉', '八哥', '画眉',
    '乌龟', '巴西龟', '草龟', '陆龟', '蜥蜴', '守宫', '豹纹守宫',
    '蛇', '蟒蛇', '球蟒', '玉米蛇',
    '金鱼', '锦鲤', '热带鱼', '观赏鱼',
    '刺猬', '蜜袋鼯', '松鼠', '荷兰猪'
  ],

  // 交通工具
  transports: [
    '飞机', '航班', '航空', '客机',
    '高铁', '动车', '火车', '列车', '城际铁路',
    '自驾', '开车', '汽车', '私家车', '轿车', 'SUV', 'MPV',
    '地铁', '轻轨', '城轨', '地铁',
    '公交', '公交车', '巴士', '大巴', '客车', '长途汽车',
    '出租车', '网约车', '滴滴', '快车', '专车',
    '轮船', '游轮', '渡轮', '邮轮', '客船',
    '摩托车', '电瓶车', '电动车', '自行车', '骑行'
  ],

  // 时间/季节
  seasons: ['春天', '夏天', '秋天', '冬天', '春季', '夏季', '秋季', '冬季'],
  holidays: ['春节', '五一', '国庆', '中秋', '端午', '清明', '元旦', '七夕', '元宵', '重阳', '劳动节', '暑假', '寒假'],

  // 食物关键词（危险食物优先）
  dangerousFoods: [
    '巧克力', '可可', '可可粉', '黑巧克力', '白巧克力', '牛奶巧克力',
    '葡萄', '葡萄干', '提子', '红提', '青提',
    '洋葱', '大葱', '小葱', '青葱', '韭菜', '韭黄', '蒜', '大蒜', '蒜头', '蒜蓉', '蒜苗', '蒜薹',
    '木糖醇', '代糖', '人工甜味剂', '甜味剂', '阿斯巴甜',
    '酒精', '酒', '啤酒', '白酒', '红酒', '葡萄酒', '黄酒', '米酒', '清酒', '洋酒', '鸡尾酒', '威士忌', '伏特加', '朗姆酒',
    '咖啡因', '咖啡', '浓缩咖啡', '拿铁', '卡布奇诺', '美式', '意式',
    '茶', '绿茶', '红茶', '乌龙茶', '普洱茶', '奶茶', '抹茶', '茶饮料',
    '可乐', '百事', '可口可乐', '雪碧', '芬达', '功能饮料', '能量饮料', '红牛', '脉动', '佳得乐',
    '骨头', '鸡骨头', '鱼骨', '禽骨', '猪骨', '牛骨', '羊骨', '碎骨',
    '生面团', '酵母', '发酵面团',
    '牛油果', '鳄梨', '鳄梨果',
    '坚果', '杏仁', '核桃', '碧根果', '夏威夷果', '腰果', '开心果', '榛子', '松子', '南瓜子', '瓜子', '花生',
    '樱桃核', '苹果核', '桃核', '李子核', '梨核', '杏核', '果核',
    '人类食品', '人吃的', '剩菜', '剩饭', '餐桌食物', '外卖', '快餐',
    '火腿肠', '香肠', '腊肉', '培根', '咸肉', '加工肉类',
    '薯片', '膨化食品', '辣条', '方便面', '泡面'
  ],

  safeFoods: [
    '鸡肉', '鸭肉', '牛肉', '羊肉', '猪肉', '瘦肉', '鸡胸肉',
    '鸡蛋', '蛋黄', '蛋白', '鹌鹑蛋', '鸭蛋',
    '胡萝卜', '西兰花', '菠菜', '白菜', '南瓜', '红薯', '紫薯', '土豆', '山药', '黄瓜', '西红柿', '番茄',
    '苹果', '香蕉', '西瓜', '草莓', '蓝莓', '树莓', '覆盆子', '芒果', '梨', '桃子', '橙子', '橘子', '柚子', '柠檬', '猕猴桃', '火龙果', '樱桃', '石榴', '荔枝', '龙眼', '菠萝', '木瓜', '榴莲', '山竹', '杨梅', '枇杷', '桑葚',
    '米饭', '馒头', '面条', '面包', '燕麦', '糙米', '小米', '玉米', '荞麦',
    '酸奶', '奶酪', '芝士', '奶油', '黄油',
    '三文鱼', '鲑鱼', '鳕鱼', '虾', '虾仁', '蟹肉'
  ]
}

// ═══════════════════════════════════════════════════════════
// 实体识别器类
// ═══════════════════════════════════════════════════════════
class EntityRecognizer {
  constructor() {
    this.dictionaries = DICTIONARIES
    // 构建快速查找索引（按长度降序排列，优先匹配长词）
    this._buildIndex()
  }

  /**
   * 构建实体索引，按长度降序排列以支持最长匹配
   */
  _buildIndex() {
    this.index = {}
    for (const [type, words] of Object.entries(this.dictionaries)) {
      this.index[type] = [...words].sort((a, b) => b.length - a.length)
    }
  }

  /**
   * 从文本中提取所有实体
   * @param {string} text - 输入文本
   * @returns {Object} 提取结果 { type: [entities] }
   */
  extractAll(text) {
    if (!text || typeof text !== 'string') {
      return {}
    }

    const result = {}

    for (const [type, words] of Object.entries(this.index)) {
      const found = this._extractByType(text, words)
      if (found.length > 0) {
        result[type] = found
      }
    }

    return result
  }

  /**
   * 检查文本是否包含某类型的实体
   * @param {string} text - 输入文本
   * @param {string} type - 实体类型
   * @returns {boolean}
   */
  hasEntity(text, type) {
    const entities = this.extractAll(text)
    return Array.isArray(entities[type]) && entities[type].length > 0
  }

  /**
   * 获取指定类型的第一个实体
   * @param {string} text - 输入文本
   * @param {string} type - 实体类型
   * @returns {string|null}
   */
  getFirst(text, type) {
    const entities = this.extractAll(text)
    if (Array.isArray(entities[type]) && entities[type].length > 0) {
      return entities[type][0]
    }
    return null
  }

  /**
   * 获取宠物类型（dog/cat/other）
   * @param {string} text - 输入文本
   * @returns {string}
   */
  getPetType(text) {
    const lowerText = text.toLowerCase()

    // 直接提到猫/狗
    if (/猫|cat|kitten|kitty/i.test(lowerText)) return 'cat'
    if (/狗|犬|dog|puppy|汪/i.test(lowerText)) return 'dog'

    // 通过品种判断
    const breeds = this.extractAll(text)
    if (breeds.catBreeds && breeds.catBreeds.length > 0) return 'cat'
    if (breeds.dogBreeds && breeds.dogBreeds.length > 0) return 'dog'
    if (breeds.otherPets && breeds.otherPets.length > 0) return 'other'

    return 'unknown'
  }

  /**
   * 按类型提取实体（内部方法）
   */
  _extractByType(text, words) {
    const found = []
    const matchedPositions = new Set() // 记录已匹配的位置，避免重复

    for (const word of words) {
      let pos = text.indexOf(word)
      while (pos !== -1) {
        // 检查这个位置是否已被更长的词匹配
        const key = `${pos}-${pos + word.length}`
        if (!matchedPositions.has(key)) {
          found.push({
            word,
            position: pos,
            length: word.length
          })
          matchedPositions.add(key)
        }
        pos = text.indexOf(word, pos + 1)
      }
    }

    // 去重并返回实体词
    return [...new Set(found.map(e => e.word))]
  }

  /**
   * 获取实体的统计摘要（供评分使用）
   * @param {string} text - 输入文本
   * @returns {Object} 统计摘要
   */
  getSummary(text) {
    const entities = this.extractAll(text)

    return {
      hasCity: !!(entities.cities && entities.cities.length > 0),
      hasProvince: !!(entities.provinces && entities.provinces.length > 0),
      hasDogBreed: !!(entities.dogBreeds && entities.dogBreeds.length > 0),
      hasCatBreed: !!(entities.catBreeds && entities.catBreeds.length > 0),
      hasPet: !!(entities.dogBreeds || entities.catBreeds || entities.otherPets),
      hasTransport: !!(entities.transports && entities.transports.length > 0),
      hasSeason: !!(entities.seasons && entities.seasons.length > 0),
      hasHoliday: !!(entities.holidays && entities.holidays.length > 0),
      hasDangerousFood: !!(entities.dangerousFoods && entities.dangerousFoods.length > 0),
      hasSafeFood: !!(entities.safeFoods && entities.safeFoods.length > 0),

      // 具体值
      city: this.getFirst(text, 'cities'),
      province: this.getFirst(text, 'provinces'),
      breed: this.getFirst(text, 'dogBreeds') || this.getFirst(text, 'catBreeds') || this.getFirst(text, 'otherPets'),
      transport: this.getFirst(text, 'transports'),
      petType: this.getPetType(text),

      // 数量统计
      entityCount: Object.values(entities).reduce((sum, arr) => sum + arr.length, 0),
      entityTypes: Object.keys(entities).length,

      // 原始数据
      raw: entities
    }
  }
}

// 单例导出
let instance = null
function getInstance() {
  if (!instance) {
    instance = new EntityRecognizer()
  }
  return instance
}

module.exports = {
  EntityRecognizer,
  getInstance,
  DICTIONARIES
}
