/**
 * 场所宠物政策知识库
 */

module.exports = {
  scenic_spots: [
    {
      name: '西湖景区',
      location: '杭州',
      pet_policy: {
        allowed: true,
        conditions: '必须牵绳，部分室内区域和游船限制进入',
        ticket_info: '免费开放',
        best_time: '四季皆宜，春季(3-5月)最佳',
        pet_facilities: ['部分区域有宠物饮水点', '粪便清理设施'],
        tips: '周末人多建议工作日前往；苏堤、白堤非常适合遛狗；雷峰塔内部不允许进入'
      },
      pet_friendly_score: 8
    },
    {
      name: '灵隐寺/飞来峰',
      location: '杭州',
      pet_policy: {
        allowed: 'partial',
        conditions: '飞来峰景区允许牵绳进入，灵隐寺大殿内部不允许',
        ticket_info: '飞来峰45元，灵隐寺30元(另购香花券)',
        best_time: '春秋季节',
        pet_facilities: [],
        tips: '可以轮流看管进入寺庙参观；景区外有寄存处但不建议长时间寄养宠物'
      },
      pet_friendly_score: 6
    },
    {
      name: '西溪湿地',
      location: '杭州',
      pet_policy: {
        allowed: true,
        conditions: '室外开放区域允许，电瓶船视情况而定',
        ticket_info: '80元(成人)',
        best_time: '春夏秋三季，秋季芦苇最美',
        pet_facities: ['步道宽敞适合散步'],
        tips: '面积很大适合带狗深度游览；注意防蚊虫；部分封闭区域可能有季节性限制'
      },
      pet_friendly_score: 9
    },
    {
      name: '故宫博物院',
      location: '北京',
      pet_policy: {
        allowed: false,
        conditions: '除导盲犬外，所有宠物不得入内',
        ticket_info: '60元(旺季)/40元(淡季)，需预约',
        alternatives: '故宫周边有不少公园可以遛宠，建议安排人员轮换照看',
        tips: '绝对不要尝试藏匿宠物带入，会被安检发现'
      },
      pet_friendly_score: 1
    },
    {
      name: '上海迪士尼度假区',
      location: '上海',
      pet_policy: {
        allowed: false,
        conditions: '园区内不允许携带宠物(服务犬除外)',
        ticket_info: '475元起',
        alternatives: '迪士尼小镇部分室外餐饮区允许；园区入口附近有宠物日托服务(约150元/天)',
        tips: '如果一定要去，建议一人入园游玩，一人在外陪伴宠物'
      },
      pet_friendly_score: 3
    },
    {
      name: '黄山风景区',
      location: '安徽',
      pet_policy: {
        allowed: 'restricted',
        conditions: '山脚允许，登山缆车和山顶区域有限制',
        ticket_info: '190元',
        best_time: '四季皆宜',
        tips: '带狗爬山需谨慎，确保狗狗体能足够；索道规定可能因运营方而异，需提前确认'
      },
      pet_friendly_score: 5
    },
    {
      name: '大理古城',
      location: '云南大理',
      pet_policy: {
        allowed: true,
        conditions: '整个古城开放式，大部分店铺餐厅允许携带',
        ticket_info: '免费',
        best_time: '全年适宜，3-4月最佳',
        pet_facilities: ['许多客栈民宿宠物友好', '洱海边适合遛宠'],
        tips: '大理是非常宠物友好的城市，很多咖啡馆欢迎宠物；环洱海骑行/自驾很适合带狗'
      },
      pet_friendly_score: 10
    },
    {
      name: '成都大熊猫基地',
      location: '成都',
      pet_policy: {
        allowed: false,
        conditions: '为保护熊猫，禁止携带任何宠物入内',
        ticket_info: '55元',
        alternatives: '基地门口可能有临时寄存服务(需确认)；建议安排不养宠的朋友同行',
        tips: '绝对遵守规定，这里是国宝的家'
      },
      pet_friendly_score: 2
    }
  ],
  
  transport_policies: {
    airplane: {
      summary: '国内航班支持随机托运或货运托运，客舱仅限服务犬',
      details: {
        required_documents: ['动物检疫合格证明(出发前7天内)', '狂犬病免疫证明(至少21天前接种)', '运输申请书(航空公司提供)'],
        crate_requirements: ['符合IATA标准', '坚固通风良好', '宠物能站立转身躺下', '底部铺吸水垫'],
        restrictions: ['短鼻犬(法斗/巴哥等)夏季禁运', '怀孕/哺乳期宠物不承运', '极度紧张或有攻击性的宠物可能被拒'],
        fees: '一般为票价的1.5%-5%，各航空公司不同',
        process: '购票时申请→办理检疫证明→购买航空箱→出发当天提前3小时到机场办理'
      },
      tips: '提前致电航空公司确认该航班是否有有氧舱；选择直飞避免中转压力；飞行前4小时禁食但可少量饮水'
    },
    high_speed_rail: {
      summary: '高铁目前不支持随身携带宠物，需办理托运或使用专列',
      details: {
        options: ['托运(部分线路支持)', '宠物专列(京沪线等有尝试)', '自驾/大巴替代'],
        note: '政策在逐步放开中，建议出行前查询最新规定'
      }
    },
    subway: {
      summary: '绝大多数城市地铁禁止携带宠物(除导盲犬)',
      exceptions: ['部分城市允许携带装在背包/手提袋的小型宠物(需确认当地规定)'],
      tip: '一般公交也不允许，打车是最方便的城市交通方式'
    },
    car_travel: {
      summary: '自驾是最灵活的带宠出行方式',
      safety_tips: ['使用宠物安全带或航空箱固定', '不要让宠物探出头窗外', '每2小时休息一次让宠物活动排泄', '准备车载水碗', '切勿将宠物单独留在车内(即使是阴天)!'],
      car_sickness_prevention: ['出发前4小时禁食', '开窗通风', '使用晕车药(咨询兽医)', '逐渐习惯乘车']
    }
  },

  hotel_policies: {
    general_rules: [
      '预订前务必电话确认宠物政策',
      '可能需要额外支付宠物清洁费(50-300元/晚)',
      '要求自备宠物寝具',
      '公共区域需牵绳',
      '对损坏负责赔偿'
    ],
    pet_friendly_chains: [
      { name: '亚朵酒店', policy: '多数门店允许，需提前告知，可能收费', rating: '⭐⭐⭐⭐⭐' },
      { name: '全季酒店', policy: '部分门店允许，需确认', rating: '⭐⭐⭐⭐' },
      { name: '如家/汉庭', policy: '多数不允许，少数例外', rating: '⭐⭐' },
      { name: '民宿/Airbnb', policy: '筛选时可勾选"允许携带宠物"，沟通最重要', rating: '⭐⭐⭐⭐' },
      { name: '万达悦华/美居', policy: '部分门店宠物友好', rating: '⭐⭐⭐' }
    ]
  }
}
