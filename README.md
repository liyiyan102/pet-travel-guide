# 宠物友好旅行小程序

## 项目简介

这是一个专为宠物主设计的微信小程序Demo，帮助用户和爱宠一起规划旅行行程。核心功能包括：

- **地图探索**：查找附近的宠物友好场所（酒店、餐厅、公园等）
- **AI攻略生成**：根据目的地、天数、宠物信息智能生成行程
- **攻略管理**：查看、编辑、分享旅行攻略
- **宠物档案**：管理宠物信息，获得更精准推荐

## 项目结构

```
旅行攻略/
├── app.js                          # 小程序入口
├── app.json                        # 小程序配置
├── app.wxss                        # 全局样式
├── sitemap.json                    # 站点地图
│
├── pages/                          # 页面目录
│   ├── index/                      # 首页/地图探索 (F1)
│   │   ├── index.js
│   │   ├── index.json
│   │   ├── index.wxml
│   │   └── index.wxss
│   ├── generate/                   # AI生成攻略页 (F2)
│   │   ├── generate.js
│   │   ├── generate.json
│   │   ├── generate.wxml
│   │   └── generate.wxss
│   ├── mytrips/                    # 我的攻略页 (F3)
│   │   ├── mytrips.js
│   │   ├── mytrips.json
│   │   ├── mytrips.wxml
│   │   └── mytrips.wxss
│   ├── editor/                     # 行程编辑器 (F4)
│   │   ├── editor.js
│   │   ├── editor.json
│   │   ├── editor.wxml
│   │   └── editor.wxss
│   ├── profile/                    # 个人中心 (F5)
│   │   ├── profile.js
│   │   ├── profile.json
│   │   ├── profile.wxml
│   │   └── profile.wxss
│   └── poidetail/                  # POI详情页
│       ├── poidetail.js
│       ├── poidetail.json
│       ├── poidetail.wxml
│       └── poidetail.wxss
│
├── cloudfunctions/                 # 云函数目录
│   ├── getPOIList/                 # 获取POI列表
│   │   ├── index.js
│   │   └── package.json
│   ├── generateItinerary/          # AI生成攻略
│   │   ├── index.js
│   │   └── package.json
│   └── saveItinerary/              # 保存/更新攻略
│       ├── index.js
│       └── package.json
│
├── utils/                          # 工具函数目录
│   ├── util.js                     # 通用工具函数
│   ├── config.js                   # 应用配置
│   └── api.js                      # API封装
│
└── images/                         # 图片资源目录（需自行添加）
    ├── explore.png
    ├── explore-active.png
    ├── generate.png
    ├── generate-active.png
    ├── trip.png
    ├── trip-active.png
    ├── profile.png
    ├── profile-active.png
    ├── ... (其他图标资源)
```

## 功能模块说明

### F1 - 首页/地图探索
- 腾讯地图集成，显示附近POI
- 分类筛选：酒店、餐厅、咖啡厅、公园、医院、美容
- 宠物友好筛选开关
- POI列表展示，支持导航和拨打电话

### F2 - AI旅行攻略生成
- 输入目的地、出行天数
- 选择携带宠物（从档案选择或快速填写）
- 可选特殊需求和生成偏好
- 模拟AI生成过程展示
- 生成结果预览和保存

### F3 - 攻略管理
- 攻略列表展示（卡片式）
- 筛选功能（全部/最近7天/本月）
- 支持查看、编辑、复制、删除操作
- 分享功能

### F4 - 行程编辑器
- 多天Tab切换
- 地点增删改查
- 顺序调整（上移/下移）
- AI优化功能
- 预览模式切换

### F5 - 个人中心
- 用户信息展示和登录
- 宠物档案管理（添加/编辑/删除）
- 统计数据展示
- 设置、反馈、关于等功能入口

## 技术栈

- **框架**：微信小程序原生开发
- **云服务**：微信云开发（云函数、云数据库）
- **地图**：腾讯地图SDK
- **UI风格**：现代简约，圆角卡片设计

## 快速开始

### 1. 准备工作
- 安装微信开发者工具
- 注册微信小程序账号
- 开通云开发服务

### 2. 导入项目
1. 打开微信开发者工具
2. 选择"导入项目"
3. 选择本项目的文件夹路径
4. 填写AppID（或使用测试号）

### 3. 配置云开发
1. 在开发者工具中点击"云开发"
2. 创建云开发环境
3. 记录环境ID
4. 更新 `utils/config.js` 中的 `envId`

### 4. 上传云函数
1. 右键点击 `cloudfunctions` 目录下的每个云函数文件夹
2. 选择"上传并部署：云端安装依赖"

### 5. 创建数据库集合
在云开发控制台创建以下集合：
- `pois`：POI数据集合
- `itineraries`：攻略数据集合
- `users`：用户数据集合
- `pets`：宠物数据集合

### 6. 添加图片资源
需要在 `images/` 目录下添加以下图片资源：

**TabBar图标**：
- explore.png / explore-active.png
- generate.png / generate-active.png  
- trip.png / trip-active.png
- profile.png / profile-active.png

**分类图标**：
- category-all.png, category-hotel.png, category-restaurant.png
- category-cafe.png, category-park.png, category-hospital.png, category-grooming.png

**功能图标**：
- search.png, location.png, refresh.png, pet-icon.png
- navigation.png, phone.png, back.png, more.png
- edit.png, copy.png, delete.png, share.png
- add.png, arrow-up.png, arrow-down.png, drag.png
- settings.png, feedback.png, about.png, cache.png
- calendar-icon.png, note-icon.png, locate.png
- ... （其他页面中引用的图标）

**占位图**：
- empty.png, empty-trip.png, empty-pet.png, empty-spot.png
- default-avatar.png, pet-default.png
- ai-loading.gif

**Marker图标**：
- marker-hotel.png, marker-restaurant.png, marker-cafe.png
- marker-park.png, marker-hospital.png, marker-grooming.png, marker-default.png

> 提示：可以使用图标库或自行设计简单的图标，建议尺寸：
> - TabBar图标：81x81px
> - 分类图标：64x64px
> - 功能图标：32-48px
> - Marker图标：32x32px

## 数据模型

### POI数据结构
```javascript
{
  poi_id: String,           // 唯一标识
  name: String,             // 名称
  category: String,         // 分类：hotel/restaurant/cafe/park/hospital/grooming
  district: String,         // 行政区
  address: String,          // 地址
  lat: Float,               // 纬度
  lng: Float,               // 经度
  tel: String,              // 电话
  pet_policy: String,       // 宠物政策描述
  pet_fee: String,          // 收费
  pet_restrictions: String, // 限制条件
  source: String,           // 数据来源
  confidence: String,       // 可信度：high/medium/low
  verified: Boolean,        // 是否人工核实
  last_updated: Date        // 最后更新日期
}
```

### 攻略数据结构
```javascript
{
  itinerary_id: String,     // 唯一标识
  user_id: String,          // 所属用户
  title: String,            // 攻略标题
  destination: String,      // 目的地
  days: Int,                // 天数
  input_params: Object,     // 生成时的输入参数
  days_data: Array,         // 结构化行程数据
  created_at: DateTime,     // 创建时间
  updated_at: DateTime      // 更新时间
}
```

### 宠物数据结构
```javascript
{
  id: String,               // 唯一标识
  name: String,             // 昵称
  type: String,             // 类型：狗狗/猫咪/兔子等
  size: String,             // 体型：小型/中型/大型
  breed: String,            // 品种
  gender: String,           // 性别：公/母
  birthday: Date,           // 生日
  avatar: String            // 头像URL
}
```

## 注意事项

1. **本项目为Demo版本**，部分功能使用模拟数据和本地存储
2. 实际上线需要：
   - 接入真实的POI数据源
   - 配置AI生成服务的API密钥
   - 完善用户登录授权流程
   - 添加数据校验和异常处理
   - 进行性能优化和安全加固

3. **地图功能**需要在小程序后台配置腾讯地图插件或SDK

4. **位置权限**需要用户授权才能使用定位功能

## 后续优化方向

- [ ] 接入真实POI数据API（如高德、百度地图）
- [ ] 接入AI大模型实现真正的智能行程规划
- [ ] 添加社区功能（攻略分享、评论）
- [ ] 实现离线缓存和数据同步
- [ ] 添加多语言支持
- [ ] 优化无障碍访问体验

## 版本信息

- **版本**：v1.0.0
- **更新日期**：2026-07-24
- **作者**：PetTravel Team

## 许可证

MIT License
