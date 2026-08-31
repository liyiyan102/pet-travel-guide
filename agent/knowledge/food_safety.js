/**
 * 宠物食物安全知识库
 */

module.exports = {
  // 对狗有毒的食物
  toxic_for_dogs: [
    {
      name: '巧克力',
      toxicity: 'high',
      toxic_component: '可可碱(Theobromine)',
      symptoms: ['呕吐', '腹泻', '过度兴奋', '心跳加速', '抽搐', '心力衰竭'],
      dangerous_amount: '烘焙巧克力>黑巧克力>牛奶巧克力>白巧克力',
      treatment: '立即催吐(若<2小时)，紧急送医，携带包装说明可可含量',
      prevention: '将所有巧克力存放在狗狗无法触及的地方'
    },
    {
      name: '葡萄/葡萄干',
      toxicity: 'critical',
      toxic_component: '未知物质(疑似鞣酸或大黄素)',
      symptoms: ['呕吐', '腹泻', '食欲不振', '腹痛', '急性肾衰竭(数天内)'],
      dangerous_amount: '极少即可中毒，个体差异大，有的狗几粒就出问题',
      treatment: '立即催吐并紧急送医，需要进行肾功能检测和支持治疗',
      prevention: '绝对禁止喂食任何形式的葡萄或葡萄干'
    },
    {
      name: '洋葱/大蒜/韭菜/葱',
      toxicity: 'medium-high',
      toxic_component: '正丙基二硫化物(导致溶血)',
      symptoms: ['虚弱', '呼吸困难', '红色/棕色尿液(血红蛋白尿)', '溶血性贫血', '黄疸'],
      dangerous_amount: '熟洋葱约15-30g/kg体重即可中毒，生洋葱毒性更强',
      treatment: '就医检查血常规，严重时需要输血治疗',
      prevention: '避免喂食含葱蒜的食物(如炒菜、饺子馅、肉汤)'
    },
    {
      name: '木糖醇',
      toxicity: 'critical',
      toxic_component: '木糖醇本身(导致胰岛素快速释放)',
      symptoms: ['呕吐', '协调能力丧失', '嗜睡', '抽搐', '低血糖休克', '肝衰竭'],
      dangerous_amount: '少量(如几颗口香糖)即可导致严重低血糖，100mg/kg可致肝衰竭',
      treatment: '紧急送医，需要静脉输葡萄糖和保肝治疗',
      prevention: '检查所有无糖食品成分表，妥善保管口香糖、糖果、牙膏'
    },
    {
      name: '酒精',
      toxicity: 'high',
      toxic_component: '乙醇',
      symptoms: ['嗜睡', '协调障碍', '呼吸抑制', '代谢性酸中毒', '昏迷', '死亡'],
      dangerous_amount: '极少量即可影响，取决于体重',
      treatment: '立即催吐，紧急送医支持治疗',
      prevention: '确保所有含酒精饮料和食品远离宠物'
    },
    {
      name: '咖啡因',
      toxicity: 'high',
      toxic_component: '咖啡因',
      symptoms: ['不安', '呕吐', '心悸', '肌肉震颤', '癫痫发作'],
      dangerous_amount: '约9mg/kg即可出现症状，一杯咖啡约含100-150mg',
      treatment: '催吐(若及时)，送医对症治疗',
      prevention: '收好咖啡豆、茶包、可乐、能量饮料'
    },
    {
      name: '煮熟的骨头(尤其是禽类)',
      toxicity: 'medium',
      toxic_component: '物理损伤(非化学毒素)',
      symptoms: ['口腔/喉咙划伤', '消化道穿孔', '肠梗阻', '便秘'],
      dangerous_amount: '任何煮熟的骨头都有危险',
      treatment: 'X光检查，可能需要手术取出',
      prevention: '只给生骨或专门设计的宠物磨牙骨，绝对不给煮熟的禽类骨头'
    },
    {
      name: '牛油果(Avocado)',
      toxicity: 'low-medium',
      toxic_component: 'Persin( persin)',
      symptoms: ['呕吐', '腹泻', '呼吸困难(大量摄入)'],
      dangerous_amount: '果肉少量通常问题不大，果皮、叶、核含量更高',
      treatment: '少量通常自行恢复，大量需就医',
      prevention: '不建议主动喂食，误食少量不必过于担心'
    },
    {
      name: '澳洲坚果(Macadamia)',
      toxicity: 'medium',
      toxic_component: '未知',
      symptoms: ['无力(尤其是后肢)', '发热', '呕吐', '震颤', '无法站立'],
      dangerous_amount: '几颗坚果即可导致症状',
      treatment: '支持治疗，通常12-48小时内恢复',
      prevention: '存放好所有坚果类食品'
    },
    {
      name: '酵母面团',
      toxicity: 'medium-high',
      toxic_component: '乙醇发酵 + 胃部膨胀',
      symptoms: ['腹部膨胀', '酒精中毒症状', '胃扭转(GDV/Bloat)'],
      dangerous_amount: '取决于面团大小',
      treatment: '紧急送医，胃扭转是致命急症',
      prevention: '将面团放在宠物接触不到的地方，特别是发酵中的面团'
    }
  ],

  // 对狗安全的食物
  safe_for_dogs: [
    { name: '鸡胸肉(熟)', notes: '去皮去骨，水煮不加调料', frequency: '适量作为零食或拌饭' },
    { name: '胡萝卜', notes: '切碎或蒸熟，生的可以当磨牙零食', frequency: '适量' },
    { name: '苹果', notes: '去核去籽(籽含微量氰化物)', frequency: '适量切片' },
    { name: '白米饭(熟)', notes: '无调料，适合肠胃不适时食用', frequency: '适量' },
    { name: '南瓜(熟)', notes: '富含纤维，有助于消化', frequency: '适量' },
    { name: '蓝莓', notes: '抗氧化剂丰富', frequency: '少量作为奖励' },
    { name: '西瓜', notes: '去籽，夏季解暑佳品', frequency: '适量' },
    { name: '鸡蛋(熟)', notes: '全蛋，优质蛋白来源', frequency: '每周2-3个' },
    { name: '燕麦片(熟)', notes: '无糖无添加，膳食纤维', frequency: '适量' },
    { name: '花生酱(无糖无盐)', notes: '确认不含木糖醇！', frequency: '少量' }
  ],

  // 对猫有毒的食物
  toxic_for_cats: [
    {
      name: '百合花(Lily)',
      toxicity: 'critical',
      note: '即使少量花粉或叶片也可能致命！',
      symptoms: ['呕吐', '嗜睡', '急性肾衰竭(24-72小时内)'],
      treatment: '立即送医！这是猫科动物最危险的植物之一'
    },
    {
      name: '葱/蒜/韭菜',
      toxicity: 'high',
      note: '猫比狗更敏感！',
      symptoms: ['贫血', '牙龈苍白', '嗜睡', '呼吸急促'],
      treatment: '立即就医'
    },
    {
      name: '巧克力',
      toxicity: 'high',
      note: '猫对可可碱也很敏感',
      symptoms: ['呕吐', '心率加快', '癫痫', '死亡'],
      treatment: '催吐后送医'
    },
    {
      name: '葡萄/葡萄干',
      toxicity: 'unknown-but-risky',
      note: '虽然研究不如狗明确，但建议避免',
      symptoms: ['可能引起肾衰竭'],
      treatment: '避免喂食，误食后观察并咨询兽医'
    },
    {
      name: '牛奶(成年猫)',
      tolerance: 'lactose_intolerant',
      note: '大多数成年猫乳糖不耐受',
      symptoms: ['腹泻', '腹胀', '消化不良'],
      treatment: '停止喂食，提供新鲜水'
    }
  ]
}
