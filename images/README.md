# 图片资源说明

本目录需要包含以下图标资源。由于无法直接生成PNG图片，请使用以下方式获取图标：

## 推荐方案

### 方案1：使用图标库
推荐从以下免费图标库下载：
- [Iconfont](https://www.iconfont.cn/) - 阿里巴巴矢量图标库
- [Flaticon](https://www.flaticon.com/) - 免费图标库
- [icon8](https://icons8.cn/) - 图标库

### 方案2：使用占位符
在开发测试阶段，可以使用纯色方块或简单图形作为占位符。

## 需要的图标清单

### TabBar图标 (建议尺寸: 81x81px)
- `explore.png` / `explore-active.png` - 探索（地图/指南针图标）
- `generate.png` / `generate-active.png` - 生成（AI/魔法棒图标）
- `trip.png` / `trip-active.png` - 攻略（行程/列表图标）
- `profile.png` / `profile-active.png` - 我的（人物/用户图标）

### 分类图标 (建议尺寸: 64x64px)
- `category-all.png` - 全部
- `category-hotel.png` - 酒店
- `category-restaurant.png` - 餐厅
- `category-cafe.png` - 咖啡厅
- `category-park.png` - 公园
- `category-hospital.png` - 医院
- `category-grooming.png` - 美容

### 功能图标 (建议尺寸: 32-48px)
搜索和位置相关：
- `search.png` - 搜索
- `location.png` - 定位
- `location-pin.png` - 定位点
- `locate.png` - 定位选择
- `refresh.png` - 刷新
- `distance.png` - 距离

宠物相关：
- `pet-icon.png` - 宠物图标
- `pet-icon-lg.png` - 宠物图标(大)
- `pet-small.png` - 宠物图标(小)
- `pet-default.png` - 默认宠物头像

导航和操作：
- `navigation.png` - 导航
- `phone.png` - 电话
- `back.png` - 返回
- `back-white.png` - 返回(白色)
- `more.png` - 更多
- `edit.png` - 编辑
- `edit-sm.png` - 编辑(小)
- `copy.png` - 复制
- `delete.png` - 删除
- `delete-sm.png` - 删除(小)
- `share.png` - 分享
- `share-white.png` - 分享(白色)
- `add.png` - 添加
- `add-to-trip.png` - 加入行程
- `arrow-up.png` - 上箭头
- `arrow-down.png` - 下箭头
- `arrow-right.png` - 右箭头
- `drag.png` - 拖拽手柄

设置和其他：
- `settings.png` - 设置
- `feedback.png` - 反馈
- `about.png` - 关于
- `cache.png` - 缓存
- `calendar-icon.png` / `calendar-sm.png` - 日历
- `note-icon.png` - 备注
- `camera.png` - 相机
- `report.png` - 反馈/举报

### 占位图 (建议尺寸: 200x200px以上)
- `empty.png` - 空状态（通用）
- `empty-trip.png` - 空状态（攻略）
- `empty-pet.png` - 空状态（宠物）
- `empty-spot.png` - 空状态（地点）
- `default-avatar.png` - 默认头像
- `ai-loading.gif` - AI加载动画

### Marker图标 (建议尺寸: 32x32px)
- `marker-hotel.png` - 酒店标记
- `marker-restaurant.png` - 餐厅标记
- `marker-cafe.png` - 咖啡厅标记
- `marker-park.png` - 公园标记
- `marker-hospital.png` - 医院标记
- `marker-grooming.png` - 美容标记
- `marker-default.png` - 默认标记

## 快速解决方案

如果暂时没有图标资源，可以：

1. **使用微信小程序内置图标**：修改代码使用button的icon属性或字体图标
2. **使用CSS绘制**：用伪元素和CSS绘制简单图形
3. **使用网络图片**：临时使用在线图标CDN（不推荐用于生产环境）

## 图标风格建议

为保持UI一致性，建议所有图标遵循以下规范：
- **颜色**：主色 #4A90D9，辅助色 #52c41a, #faad14, #ff4d4f
- **风格**：线性图标(linear)或填充图标(filled)保持统一
- **圆角**：适当圆角，与整体UI风格一致
- **粗细**：描边2-3px，保持视觉平衡
