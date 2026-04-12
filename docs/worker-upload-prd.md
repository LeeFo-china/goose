# 工人端极简拍照功能 - 需求文档

> **文档版本**: v1.0  
> **创建日期**: 2026-04-07  
> **产品负责人**: [待定]  
> **开发团队**: [待定]  

---

## 一、背景与问题

### 1.1 现状分析

| 现状 | 问题 |
|------|------|
| 工人拍照发到微信群 | 照片散落，没有结构化数据 |
| 管理员手动整理 | 重复劳动，效率低 |
| 客户无法实时查看 | 信息不对称，频繁问询 |
| 工人做完就结束 | 没有动力做更多记录 |

### 1.2 核心问题

**工人们不愿意更新进度的根本原因：**

1. **增加工作量** - "我已经够累了，还要拍照写字"
2. **没有个人收益** - "更新了对我的好处是什么？"
3. **被监控感** - "公司用这个来监视我、扣我钱"
4. **工具不好用** - 手机操作麻烦，输入成本高

### 1.3 设计目标

> **核心原则：不能比发微信群更麻烦**

| 目标 | 衡量指标 |
|------|---------|
| 操作极简化 | 工人只需要做一件事：拍照 |
| 即时反馈 | 上传后立即看到成功提示 |
| 价值感知 | 让工人知道更新对自己有好处 |
| 零培训 | 不需要说明书，一看就会用 |

---

## 二、目标用户

### 2.1 主要用户画像

**工人（瓦工/木工/水电/油漆等）**

- 年龄：30-55 岁
- 智能手机：都有，但操作不熟练
- 文化程度：不等，普遍不高
- 使用习惯：微信发图，最熟悉的操作
- 核心诉求：干完活，拿钱走人，别折腾我

### 2.2 用户场景

```
场景：工人张师傅在客户家贴瓷砖

❌ 以前：
1. 打开微信群
2. 拍照片
3. 发到群里
4. 可能还要回复"贴完了"
5. 等管理员确认

✅ 现在：
1. 打开小程序
2. 拍照
3. 完成
```

---

## 三、功能需求

### 3.1 功能优先级

| 优先级 | 功能 | 描述 | 价值 |
|--------|------|------|------|
| **P0** | 极简拍照 | 一步完成拍照上传 | 降低使用门槛 |
| **P0** | GPS + 时间戳 | 自动记录位置和时间 | 真实性证明 |
| **P0** | 实时同步 | 客户立即看到进度 | 信息透明 |
| **P1** | 工时统计 | 工人可查看自己记录 | 给工人好处 |
| **P1** | AI 阶段识别 | 拍照自动识别施工阶段 | 减少操作 |
| **P2** | 客户好评 | 客户可对工人评分 | 成就感激励 |
| **P2** | 排行榜 | 更新最多的工人公示 | 社会认同 |

### 3.2 P0 功能详细需求

#### 功能 1：极简拍照

**用户操作流程：**

```
1. 打开页面 → 显示大拍照按钮
2. 点击拍照 → 调用系统相机
3. 拍照完成 → 显示预览
4. 点击确认 → 上传到服务器
5. 上传成功 → 显示成功动画
6. 2秒后 → 自动回到拍照页面
```

**设计要求：**

- 拍照按钮：直径 320rpx，屏幕中心位置
- 按钮颜色：品牌绿色 (#00d4aa)，醒目
- 操作提示：底部显示 3 个核心卖点
- 预览照片：最大程度展示，附加时间/位置标签

#### 功能 2：GPS + 时间戳自动记录

**实现要求：**

| 数据 | 获取方式 | 失败处理 |
|------|---------|---------|
| 位置 | `wx.getLocation()` | 静默失败，不阻止上传 |
| 时间 | `new Date()` 本地时间 | 必填，显示格式 MM-DD HH:mm |
| 施工阶段 | TODO: AI 识别 | 默认"未分类" |

**照片叠加信息：**

- 左下角：时间标签（半透明黑色背景）
- 右下角：位置标签（绿色背景）

#### 功能 3：实时同步到客户

**数据流向：**

```
工人拍照 → 服务器存储 → 客户小程序展示
    ↓
自动关联到该项目
    ↓
客户收到通知（可选）
```

**客户视图：**

- 最新一条进度展示在项目详情页顶部
- 时间线展示所有历史进度
- 支持按施工阶段筛选

---

## 四、页面设计

### 4.1 页面结构

```
worker-upload/
├── index.tsx          # 极简拍照主页面
└── index.scss         # 样式文件
```

### 4.2 页面状态

| 状态 | 描述 | UI |
|------|------|-----|
| `idle` | 空闲，等待拍照 | 大拍照按钮 + 提示文案 |
| `preview` | 照片预览 | 照片 + 重拍/确认按钮 |
| `uploading` | 上传中 | 加载动画 + 提示 |
| `success` | 上传成功 | 成功图标 + 动画 |
| `error` | 上传失败 | 错误图标 + 重试按钮 |

### 4.3 视觉规范

**设计风格：**

- 深色背景（#1a1a2e → #16213e）
- 高对比度，户外可见
- 大按钮，大图标，大文字
- 圆角卡片，柔和阴影

**颜色规范：**

| 用途 | 颜色 | 说明 |
|------|------|------|
| 主色 | #00d4aa | 拍照按钮、成功状态 |
| 背景 | #1a1a2e | 深色渐变 |
| 文字 | #ffffff | 白色主文字 |
| 次要文字 | rgba(255,255,255,0.6) | 辅助说明 |
| 警告 | #ff6b6b | 错误状态 |

**字体规范：**

| 用途 | 字号 | 字重 |
|------|------|------|
| 页面标题 | 48rpx | 700 |
| 按钮文字 | 32rpx | 700 |
| 提示文字 | 28rpx | 400 |
| 标签文字 | 22rpx | 400 |

**间距规范：**

- 页面内边距：40rpx
- 元素间距：32rpx
- 按钮内边距：24rpx

### 4.4 组件状态

**拍照按钮：**

| 状态 | 样式 |
|------|------|
| 默认 | 绿色圆形，阴影效果 |
| 按下 | scale(0.95)，阴影减弱 |

**操作按钮：**

| 按钮 | 样式 |
|------|------|
| 确认 | 绿色填充，白色文字 |
| 取消 | 透明背景，白色边框 |

---

## 五、技术实现

### 5.1 路由配置

```typescript
// app.config.ts 添加页面
pages: [
  // ...existing pages
  'packageWorkers/pages/upload/index'
]
```

### 5.2 页面入口

```
工人端入口：我的 → 拍照上传
或
固定 TabBar 入口（推荐）
```

### 5.3 权限申请

```json
// app.config.ts
permission: {
  "scope.userLocation": {
    desc: "用于记录工人到场情况"
  }
}
```

### 5.4 工具函数

```typescript
// 路径：src/utils/progress.ts

/**
 * 拍照获取图片
 */
export const captureImage = async (): Promise<{ path: string }> => {
  const res = await Taro.chooseImage({
    count: 1,
    source: ['camera'],
    sizeType: ['compressed']
  });
  return { path: res.tempFilePaths[0] };
};

/**
 * 获取当前位置
 */
export const getLocation = (): Promise<{ lat: number; lng: number }> => {
  return Taro.getLocation({ type: 'gcj02' }).then(res => ({
    lat: res.latitude,
    lng: res.longitude
  }));
};

/**
 * 获取格式化时间
 */
export const getTimestamp = (): string => {
  const now = new Date();
  return now.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};
```

### 5.5 API 接口

```typescript
// 路径：src/services/progress.ts

interface ProgressSubmitData {
  photoPath: string;        // 照片临时路径
  location?: {              // 位置信息（可选）
    lat: number;
    lng: number;
  };
  timestamp: string;        // 时间戳 MM-DD HH:mm
  stage?: ProgressStage;    // 施工阶段（TODO）
}

export const submitProgress = async (data: ProgressSubmitData) => {
  // TODO: 实现实际上传逻辑
  // 1. 上传图片到服务器获取永久 URL
  // 2. 提交进度记录
  
  return Promise.resolve({ success: true });
};
```

### 5.6 类型定义

```typescript
// 路径：src/types/progress.ts

export type ProgressStage = 
  | 'demolition'        // 拆改
  | 'hydraulic'         // 水电
  | 'brick'             // 泥工
  | 'wood'              // 木工
  | 'paint'             // 油漆
  | 'installation'      // 安装
  | 'final'             // 竣工
  | 'uncategorized';    // 未分类

export interface ProgressRecord {
  id: string;
  projectId: string;       // 项目ID
  workerId: string;        // 工人ID
  photoUrl: string;        // 照片URL
  stage: ProgressStage;    // 施工阶段
  location?: {
    lat: number;
    lng: number;
  };
  createdAt: string;       // 创建时间
  geolocation?: string;    // 地理位置描述
}
```

---

## 六、数据结构

### 6.1 进度记录表

```sql
CREATE TABLE progress_records (
  id          VARCHAR(36) PRIMARY KEY,
  project_id  VARCHAR(36) NOT NULL,    -- 项目ID
  worker_id   VARCHAR(36) NOT NULL,     -- 工人ID
  photo_url   VARCHAR(500) NOT NULL,    -- 照片URL
  stage       VARCHAR(20) DEFAULT 'uncategorized',  -- 施工阶段
  latitude    DECIMAL(10, 6),           -- 纬度
  longitude   DECIMAL(10, 6),           -- 经度
  geolocation VARCHAR(200),              -- 地理位置描述
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_project (project_id),
  INDEX idx_worker (worker_id),
  INDEX idx_created (created_at)
);
```

---

## 七、后续迭代方向

### 7.1 P1 功能

| 功能 | 描述 | 技术要点 |
|------|------|---------|
| **AI 阶段识别** | 拍照后自动识别施工阶段 | 调用图像识别 API |
| **工时统计** | 工人可查看自己的记录 | 数据聚合查询 |
| **离线支持** | 网络不好时先缓存 | 本地存储 + 同步 |

### 7.2 P2 功能

| 功能 | 描述 | 激励价值 |
|------|------|---------|
| **客户好评** | 客户可对进度进行评分 | 工人成就感 |
| **排行榜** | 更新次数最多的工人公示 | 社会认同 |
| **连续徽章** | 连续更新给勋章 | 游戏化 |

### 7.3 长期方向

| 方向 | 描述 |
|------|------|
| **智能推荐** | 根据施工阶段推荐下一步工作 |
| **语音输入** | 录语音自动转文字描述 |
| **自动化报告** | 每周自动生成进度报告给客户 |

---

## 八、风险与注意事项

### 8.1 技术风险

| 风险 | 应对措施 |
|------|---------|
| 微信 chooseImage 限制 | 引导用户正确授权 |
| 图片上传失败 | 本地重试机制 |
| 位置获取失败 | 静默处理，不阻止上传 |

### 8.2 用户风险

| 风险 | 应对措施 |
|------|---------|
| 老人不会用 | 大按钮 + 极简流程 |
| 不想用 | 强调"留痕保护自己" |
| 嫌麻烦 | 对标发微信群的体验 |

---

## 九、成功指标

| 指标 | 目标值 | 衡量方式 |
|------|-------|---------|
| 使用率 | 80%+ 的工人每天使用 | 日活 / 总工人数 |
| 照片数量 | 人均 3+ 张/天 | 每日照片数 / 工人 |
| 客户满意度 | 提升 20% | 客户调研 |
| 管理员效率 | 减少 50% 手工操作 | 操作日志统计 |

---

## 十、附录

### 10.1 页面原型

> 详见 `src/packageWorkers/pages/upload/index.tsx`

### 10.2 设计稿

> 待 UI 设计师输出高保真设计稿

### 10.3 相关文档

| 文档 | 路径 |
|------|------|
| API 接口文档 | [待补充] |
| 数据库设计 | [待补充] |
| 运营后台设计 | [待补充] |

---

**文档结束**
