/**
 * 宠物品种知识库
 */

module.exports = {
  dogs: [
    {
      name: '金毛寻回犬',
      aliases: ['金毛', 'Golden Retriever', '金毛犬', '金毛巡回犬'],
      characteristics: ['温顺友善', '聪明易训', '精力旺盛', '喜欢游泳'],
      travel_suitability: {
        score: 9,
        pros: ['适应力强', '喜欢户外', '社交性好', '服从性高'],
        cons: ['需要大量运动(每天2h+)', '掉毛严重', '中大型犬限制多', '容易过热'],
        special_needs: ['每天至少2小时运动', '注意防暑降温', '准备充足饮水', '定期梳毛']
      },
      common_health_issues: ['髋关节发育不良', '皮肤病', '肥胖倾向', '肘关节问题'],
      dietary_restrictions: ['避免高脂肪食物', '控制食量防止肥胖', '避免巧克力葡萄'],
      size: 'large',
      life_expectancy: '10-12年',
      temperament: 'friendly'
    },
    {
      name: '拉布拉多寻回犬',
      aliases: ['拉布拉多', 'Labrador', '拉布', '拉多'],
      characteristics: ['聪明活泼', '温顺亲人', '食欲旺盛', '学习能力强'],
      travel_suitability: {
        score: 9,
        pros: ['适应力极强', '性格稳定', '不怕生', '易于训练'],
        cons: ['贪吃需控制饮食', '精力旺盛需要消耗', '大型犬部分场所受限', '幼年期比较调皮'],
        special_needs: ['严格控制饮食量', '充足运动', '社会化训练', '防偷吃']
      },
      common_health_issues: ['髋关节发育不良', '肥胖症', '眼疾', '胃扭转'],
      dietary_restrictions: ['严格控食', '少食多餐', '避免暴饮暴食'],
      size: 'large',
      life_expectancy: '10-14年',
      temperament: 'friendly'
    },
    {
      name: '柯基犬',
      aliases: ['柯基', 'Corgi', '威尔士柯基', '小短腿', '基基'],
      characteristics: ['聪明机警', '活泼好动', '表情丰富', '牧羊本能'],
      travel_suitability: {
        score: 8,
        pros: ['体型适中方便携带', '适应性强', '性格开朗', '运动量适中'],
        cons: ['脊椎较长不宜跳跃', '容易肥胖', '掉毛量大', '腿短不适合长途徒步'],
        special_needs: ['禁止从高处跳下', '控制体重保护脊椎', '定期梳毛', '上下车要抱']
      },
      common_health_issues: ['椎间盘疾病', '肥胖', '眼疾', '皮肤病'],
      dietary_restrictions: ['严格控制体重', '高蛋白低脂肪'],
      size: 'medium',
      life_expectancy: '12-15年',
      temperament: 'active'
    },
    {
      name: '泰迪/贵宾犬',
      aliases: ['泰迪', '贵宾', 'Poodle', '泰迪熊', '贵宾犬'],
      characteristics: ['聪明绝顶', '不掉毛', '体型多样', '粘人'],
      travel_suitability: {
        score: 10,
        pros: ['几乎不掉毛', '体型可选(玩具型超便携)', '聪明易训练', '过敏友好'],
        cons: ['需要定期美容', '容易焦虑分离', '骨骼脆弱小心看护', '美容费用较高'],
        special_needs: ['定期专业美容', '社会化训练防焦虑', '注意保暖(尤其小型)', '选择合适尺寸的航空箱']
      },
      common_health_issues: ['膝关节脱位', '牙结石', '耳道感染', '泪痕'],
      dietary_restrictions: ['小型犬专用粮', '少食多餐', '注意牙齿清洁'],
      size: 'variable', // toy/small/standard
      life_expectancy: '12-15年',
      temperament: 'intelligent'
    },
    {
      name: '比熊犬',
      aliases: ['比熊', 'Bichon', '棉花糖', '比熊犬'],
      characteristics: ['活泼开朗', '亲和力强', '白色卷毛', '不易掉毛'],
      travel_suitability: {
        score: 9,
        pros: ['体型小巧便携', '性格温顺', '几乎不掉毛', '对人友好'],
        cons: ['需要频繁美容', '容易有泪痕', '分离焦虑', '毛发容易打结'],
        special_needs: ['每日梳理毛发', '定期专业美容', '清洁眼部', '社会化训练']
      },
      common_health_issues: ['白内障', '膝盖问题', '过敏', '牙齿问题'],
      dietary_restrictions: ['优质小型犬粮', '控制零食'],
      size: 'small',
      life_expectivity: '12-15年',
      temperament: 'cheerful'
    },
    {
      name: '哈士奇',
      aliases: ['哈士奇', 'Husky', '二哈', '西伯利亚雪橇犬'],
      characteristics: ['精力无限', '独立性强', '爱拆家', '颜值高'],
      travel_suitability: {
        score: 6,
        pros: ['耐寒能力强', '体力好适合户外', '与人亲近', '适应冷环境'],
        cons: ['极度需要运动', '召回困难', '破坏力强', '夏季怕热', '吠叫较多'],
        special_needs: ['每天3+小时高强度运动', '必须牵绳(否则会跑丢)', '夏季避免外出', '耐用的航空箱和牵引绳']
      },
      common_health_issues: ['髋关节发育不良', '眼部疾病', '皮肤病'],
      dietary_restrictions: ['高蛋白饮食', '充足水分'],
      size: 'large',
      life_expectancy: '12-15年',
      temperament: 'independent'
    },
    {
      name: '法国斗牛犬',
      aliases: ['法斗', 'French Bulldog', 'Frenchie', '斗牛犬'],
      characteristics: ['安静温和', '不爱叫', '短鼻扁脸', '亲人类'],
      travel_suitability: {
        score: 7,
        pros: ['运动量小', '安静不扰民', '体型紧凑', '适合公寓'],
        cons: ['短鼻犬航空风险高', '怕热怕寒', '呼吸道敏感', '容易打鼾', '繁殖困难'],
        special_needs: ['避免高温环境', '考虑陆运而非空运', '保持体重健康', '监测呼吸状况']
      },
      common_health_issues: ['支气管塌陷综合征', '脊椎异常', '皮肤褶皱感染', '眼疾'],
      dietary_restrictions: ['易胖需控制', '软质易咀嚼食物'],
      size: 'small',
      life_expectancy: '10-12年',
      temperament: 'calm'
    },
    {
      name: '柴犬',
      aliases: ['柴犬', 'Shiba Inu', '小柴', '柴柴'],
      characteristics: ['独立固执', '忠诚', '爱干净', '表情丰富'],
      travel_suitability: {
        score: 7,
        pros: ['体型适中', '爱干净体味小', '相对安静', '适应力不错'],
        cons: ['独立性较强不太听话', '领地意识强可能与其他狗冲突', '换毛季掉毛严重', '对新事物警惕'],
        social_needs: ['早期社会化很重要', '耐心训练', '换毛期勤梳理', '给足安全感']
      },
      common_health_issues: ['膝关节炎', '过敏', '眼疾'],
      dietary_restrictions: ['优质蛋白质', '控制零食'],
      size: 'medium',
      life_expectancy: '12-16年',
      temperament: 'independent'
    },
    {
      name: '边境牧羊犬',
      aliases: ['边牧', 'Border Collie', '边牧犬', '边境'],
      characteristics: ['智商第一', '精力充沛', '学习力强', '牧羊本能'],
      travel_suitability: {
        score: 8,
        pros: ['极其聪明易训练', '与主人配合度高', '体能优秀', '可玩飞盘等互动游戏'],
        cons: ['需要大量脑力和体力刺激', '可能过度活跃', '会试图"放牧"其他动物和人', '分离焦虑'],
        special_needs: ['智力游戏+体力运动结合', '工作型任务满足其需求', '充足的互动时间', '避免长时间独处']
      },
      common_health_issues: ['髋关节发育不良', '癫痫', 'CEA( Collie Eye Anomaly)'],
      dietary_restrictions: ['高能量饮食', '适量补充'],
      size: 'medium',
      life_expectancy: '12-15年',
      temperament: 'intelligent_active'
    },
    {
      name: '萨摩耶',
      aliases: ['萨摩耶', 'Samoyed', '萨摩', '微笑天使', '小白熊'],
      characteristics: ['温顺友善', '爱笑', '白毛漂亮', '粘人'],
      travel_suitability: {
        score: 8,
        pros: ['性格极佳', '对人友好', '适应力强', '颜值高拍照好看'],
        cons: ['掉毛非常严重', '需要大量运动', '美容维护成本高', '夏季怕热', '有分离焦虑倾向'],
        special_needs: ['每天大量梳毛', '充足运动', '注意防暑降温', '避免长期独处']
      },
      common_health_issues: ['髋关节问题', '糖尿病', '皮肤过敏', '胃扩张'],
      dietary_restrictions: ['控制食量', '低敏饮食选项'],
      size: 'large',
      life_expectancy: '12-14年',
      temperament: 'friendly'
    }
  ],

  cats: [
    {
      name: '英国短毛猫',
      aliases: ['英短', 'British Shorthair', '蓝猫', '英短蓝猫'],
      characteristics: ['圆脸大眼', '性格温和', '适应力强', '容易饲养'],
      travel_suitability: {
        score: 6,
        pros: ['性格稳定不易应激', '体质较好', '适应新环境能力较强'],
        cons: ['猫通常不喜欢出门旅行', '需要航空箱适应训练', '容易紧张', '需要熟悉的环境感'],
        special_needs: ['提前适应航空箱', '使用费洛蒙喷雾减压', '带上熟悉的毯子/玩具', '短途旅行更佳']
      },
      common_health_issues: ['肥厚型心肌病(HCM)', '多囊肾病(PKD)', '肥胖'],
      dietary_restrictions: ['控制体重', '高质量猫粮'],
      size: 'medium',
      life_expectancy: '12-20年',
      temperament: 'calm'
    },
    {
      name: '美国短毛猫',
      aliases: ['美短', 'American Shorthread', '虎斑猫', '标斑'],
      characteristics: ['健康强壮', '好奇心强', '独立又亲人', '花纹美丽'],
      travel_suitability: {
        score: 6,
        pros: ['身体素质好', '好奇心强愿意探索', '适应力不错'],
        cons: ['精力充沛需要出口', '猫的通用旅行挑战', '可能想逃逸'],
        special_needs: ['确保航空箱安全牢固', '带些猫薄荷或熟悉气味物品', '途中安抚']
      },
      common_health_issues: ['HCM心脏问题'],
      dietary_restrictions: ['均衡营养'],
      size: 'medium-large',
      life_expectancy: '13-17年',
      temperament: 'curious'
    },
    {
      name: '布偶猫',
      aliases: ['布偶', 'Ragdoll', '仙女猫', '熊猫猫'],
      characteristics: ['温柔如布偶', '蓝眼睛', '长毛飘逸', '粘人'],
      travel_suitability: {
        score: 4,
        pros: ['性格极其温顺', '很少挣扎反抗', '信任主人'],
        cons: ['体质较弱易生病', '长毛需要护理', '胆小容易受惊', '免疫力较低', '应激反应风险高'],
        special_needs: ['除非必要不建议带出门', '必须提前做充分准备', '随身携带应急药物', '选择最稳妥的交通方式']
      },
      common_health_issues: ['HCM心脏病', '多囊肾', '脆弱皮肤综合征'],
      dietary_restrictions: ['易消化高质量食物', '补充Omega-3美毛'],
      size: 'large',
      life_expectancy: '12-15年',
      temperament: 'gentle'
    },
    {
      name: '中华田园猫(狸花)',
      aliases: ['狸花', '田园猫', '中国狸花', 'Dragon Li'],
      characteristics: ['身体健康', '聪明独立', '捕猎本能', '适应力超强'],
      travel_suitability: {
        score: 7,
        pros: ['身体强壮不易生病', '适应能力极强', '聪明能理解状况', '独立性好在陌生环境也能应对'],
        cons: ['野性较强可能想逃跑', '警惕性高', '不一定配合'],
        special_needs: ['确保牢固的笼子/航空箱', '佩戴不能挣脱的项圈', '给予足够的安全空间', '不要强迫互动']
      },
      common_health_issues: ['相对较少，较健康'],
      dietary_restrictions: ['杂食能力强但仍需均衡饮食'],
      size: 'medium',
      life_expectancy: '12-18年',
      temperament: 'independent_strong'
    }
  ]
}
