# 微信小程序客服问题对接文档

日期：2026-05-24

## 对接目标

微信小程序需要给客户提供客服入口：

- 展示租户客服电话并支持一键拨打。
- 客户可以提交客服问题。
- 客户可以上传问题图片。
- 客户可以查看自己的问题历史和处理状态。

## 当前后端状态

已落地第一版 API：

- `GET /customer/bootstrap` 新增 `customer_service`。
- `POST /customer/service-tickets`
- `GET /customer/service-tickets`
- `GET /customer/service-tickets/:id`
- `POST /uploads/images` 支持 `scene=customer_service`。

创建问题受租户配置控制：`CUSTOMER_SERVICE_ENABLED=false` 时，后端会拒绝创建并返回 `客服入口未启用`。

## 入口展示

建议入口：

- 首页客户服务卡片。
- 我的页面客服入口。
- 项目详情页“联系客服/提交问题”入口。

显示规则：

- `customer_service.enabled=false`：不展示客服入口。
- `enabled=true` 且有 `phone`：展示“拨打客服电话”和“提交问题”。
- `enabled=true` 但无 `phone`：只展示“提交问题”。

## Bootstrap 对接

现有客户启动接口新增客服配置：

```http
GET /customer/bootstrap
```

返回新增字段：

```json
{
  "customer_service": {
    "enabled": true,
    "phone": "400-000-0000",
    "working_hours": "周一至周日 09:00-18:00",
    "notice": "施工、验收和售后问题可提交客服"
  }
}
```

小程序本地展示：

- `phone` 用于拨号。
- `working_hours` 展示在电话下方。
- `notice` 展示在提交入口附近。

## 拨打电话

```ts
wx.makePhoneCall({
  phoneNumber: customerService.phone,
});
```

注意：

- 拨打前检查 `phone` 非空。
- 电话来自后端配置，不在小程序硬编码。

## 提交客服问题

接口：

```http
POST /customer/service-tickets
```

请求：

```json
{
  "project_id": "uuid",
  "category": "construction",
  "content": "墙面有开裂情况，请安排处理",
  "images": ["tenant/xxx/customer_service/xxx.webp"]
}
```

字段规则：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `project_id` | 否 | 关联项目 ID |
| `category` | 是 | 问题分类 |
| `content` | 是 | 问题描述，最多 1000 字 |
| `images` | 否 | 图片 object key 数组，最多 9 张 |

分类：

| 分类 | 展示 |
| --- | --- |
| `after_sale` | 售后咨询 |
| `construction` | 施工问题 |
| `acceptance` | 验收问题 |
| `billing` | 费用问题 |
| `other` | 其他 |

提交成功：

```json
{
  "id": "uuid",
  "ticket_no": "CS20260524180000ABCD",
  "status": "open",
  "status_label": "待处理",
  "created_at": "2026-05-24T10:00:00.000Z",
  "actions": [
    {
      "action": "create",
      "action_label": "提交问题"
    }
  ]
}
```

提交成功后建议跳转到问题详情。

## 图片上传

复用现有上传接口：

```http
POST /uploads/images
```

上传字段：

- `scene=customer_service`
- `files` 或现有上传组件约定字段。

规则：

- 最多 9 张。
- 单张大小遵守后端上传限制。
- 支持 `jpg/png/webp/heic/heif`。
- 上传成功后，把返回的 `storage_path` 或 `object_key` 放入 `images`。

后端同时也允许直传初始化场景 `customer_service`，如果小程序上传组件已切到直传模式，可以继续沿用同一 scene。

建议交互：

- 提交按钮必须等待图片上传完成后再启用。
- 上传失败时允许删除失败图片重试。
- 图片上传成功但问题提交失败时，保留已上传图片，用户可再次提交。

## 我的问题列表

接口：

```http
GET /customer/service-tickets?page=1&pageSize=20
```

列表字段建议：

- 工单编号。
- 分类。
- 状态。
- 描述摘要。
- 图片数量。
- 创建时间。
- 关联项目名称。

列表返回同样包含 `pagination`，按创建时间倒序。

## 问题详情

接口：

```http
GET /customer/service-tickets/:id
```

详情展示：

- 分类。
- 状态。
- 问题描述。
- 图片。
- 关联项目。
- 创建时间。
- 最新处理结果。
- 动作历史。

客户侧第一版只展示后端返回的 `actions[]`，不需要提供客户处理动作。

## 状态展示

| 状态 | 小程序展示 |
| --- | --- |
| `open` | 待处理 |
| `in_progress` | 处理中 |
| `resolved` | 已解决 |
| `closed` | 已关闭 |
| `cancelled` | 已取消 |

第一版客户侧只读状态，不需要客户执行状态动作。

后续可以增加：

- 客户取消问题。
- 客户确认关闭。
- 客户追加留言。

## 员工端任务中心

如果微信小程序员工端对接现有任务中心，需要识别客服问题待办类型。

接口：

```http
GET /task-center/todos?type=customer_service_ticket&page=1&pageSize=20
GET /task-center/todos/summary
```

任务字段：

```json
{
  "id": "customer_service_ticket:uuid",
  "type": "customer_service_ticket",
  "title": "客服问题待处理",
  "subtitle": "问题摘要",
  "status": "pending",
  "status_label": "待处理",
  "priority": "high",
  "priority_label": "高优先级",
  "action_label": "去处理",
  "target_type": "customer_service_ticket",
  "target_id": "uuid",
  "metadata": {
    "ticket_no": "CS20260525120000ABCD",
    "customer_name": "张三",
    "project_name": "张三装修项目",
    "ticket_status": "open"
  }
}
```

小程序员工端可以先只展示该类型；详情处理可以跳转到后续员工端客服问题详情页。如果员工端暂不处理客服问题，可以隐藏该类型，让 Admin 承接处理。

## 项目选择

提交问题时 `project_id` 可选。

推荐交互：

- 从客户已有项目中选择。
- 从项目详情进入时默认带当前项目。
- 如果客户没有项目，允许不选项目。

后端约束：

- 如果传 `project_id`，必须属于当前客户。
- 不属于当前客户时返回中文错误。

## 错误处理

小程序直接展示后端中文错误。

典型错误：

- `客服入口未启用`
- `问题描述不能为空`
- `图片最多上传9张`
- `项目不属于当前客户`
- `客服问题不存在`

## 第一版验收

- 客服入口按 `enabled` 正确显示/隐藏。
- 有电话时可以一键拨打。
- 可以提交文字问题。
- 可以上传图片并提交。
- 可以查看我的问题列表。
- 可以进入详情查看图片和状态。
- 后端错误能直接展示。
