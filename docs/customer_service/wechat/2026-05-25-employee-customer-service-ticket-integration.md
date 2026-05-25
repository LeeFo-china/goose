# 微信小程序员工端客服问题任务对接

日期：2026-05-25

## 对接结论

员工端客服问题最小闭环不需要后端新增接口。

后端任务中心客服待办已经返回稳定跳转字段：

```json
{
  "id": "customer_service_ticket:uuid",
  "type": "customer_service_ticket",
  "target_type": "customer_service_ticket",
  "target_id": "uuid",
  "target_url": "/customer-service?ticketId=uuid"
}
```

小程序员工端必须使用 `target_type + target_id` 跳转，不要解析 `id` 字符串。`target_url` 当前是 Admin 路由，仅供 Admin 使用，小程序员工端不要直接使用。

## 执行顺序

1. 任务中心增加客服类型识别和跳转映射。
2. 新增员工端客服详情页。
3. 新增员工端客服 service。
4. 详情页展示基础信息、图片、处理记录。
5. 接入 `available_actions`，先支持 `start`、`resolve`、`close`、`reopen`、`cancel`。
6. 开发构建验证。

## 任务中心跳转映射

任务中心接口：

```http
GET /task-center/todos?page=1&pageSize=20
GET /task-center/todos?type=customer_service_ticket&page=1&pageSize=20
GET /task-center/todos/summary
```

客服待办示例：

```json
{
  "id": "customer_service_ticket:9f3c...",
  "type": "customer_service_ticket",
  "title": "客服问题待处理",
  "subtitle": "墙面有开裂情况，请安排处理",
  "status": "pending",
  "status_label": "待处理",
  "priority": "high",
  "priority_label": "高优先级",
  "action_label": "去处理",
  "target_url": "/customer-service?ticketId=9f3c...",
  "target_type": "customer_service_ticket",
  "target_id": "9f3c...",
  "metadata": {
    "ticket_no": "CS20260525120000ABCD",
    "customer_name": "张三",
    "project_name": "张三装修项目",
    "ticket_status": "open"
  }
}
```

跳转规则：

| `target_type` | 小程序跳转 |
| --- | --- |
| `customer_service_ticket` | `/packageEmployees/pages/customerServiceTicketDetail/index?id=${target_id}` |

兜底规则：

- 如果 `target_type !== "customer_service_ticket"`，按现有任务中心映射处理。
- 如果 `target_type === "customer_service_ticket"` 但 `target_id` 为空，提示“客服问题数据异常”，不要解析 `id`。
- 不使用 `target_url` 跳转员工端详情。

## 员工端客服 service

建议新增 employee 侧 service，例如 `services/customer-service.ts`。

图片上传复用现有上传接口：

```http
POST /uploads/images
```

上传参数：

- `scene=customer_service`
- 最多 9 张。
- 上传成功后，把返回的 object key 放入动作接口的 `images`。

详情接口：

```http
GET /customer-service-tickets/:id
```

动作接口：

```http
POST /customer-service-tickets/:id/action
```

动作请求：

```json
{
  "action": "start",
  "content": "已联系客户确认问题",
  "images": []
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `action` | 是 | `start`、`resolve`、`close`、`reopen`、`cancel` |
| `content` | 否 | 处理说明；`resolve` 必填 |
| `images` | 否 | 处理附件图片 object key 数组，仅 `resolve` 支持，最多 9 张 |
| `metadata` | 否 | 扩展信息，第一版可不传 |

标记解决并上传附件示例：

```json
{
  "action": "resolve",
  "content": "已完成墙面修补，客户确认现场效果",
  "images": [
    "tenant/xxx/customer-service/resolve-1.webp",
    "tenant/xxx/customer-service/resolve-2.webp"
  ]
}
```

约束：

- `images` 只在 `action=resolve` 时允许传。
- 其他动作传 `images` 会被后端拒绝。
- `resolve` 的 `content` 必填，`images` 非必填。

## 详情页展示

详情页入参：

```text
id=客服问题 ID
```

详情页首屏调用：

```http
GET /customer-service-tickets/:id
```

建议展示：

- 工单编号 `ticket_no`
- 状态 `status_label`
- 优先级 `priority_label`
- 分类 `category_label`
- 标题 `title`
- 问题描述 `content`
- 客户信息 `customer`
- 关联项目 `project`
- 图片 `images`
- 当前负责人 `assigned_employee`
- 创建时间、解决时间、关闭时间
- 处理记录 `actions`
- 当前可执行动作 `available_actions`

图片字段后端已返回可访问 URL，小程序按现有图片预览组件展示即可。

处理记录中的附件字段：

```json
{
  "action": "resolve",
  "action_label": "标记解决",
  "content": "已完成墙面修补，客户确认现场效果",
  "images": ["https://...signed-url..."],
  "image_items": [
    {
      "url": "https://...signed-url...",
      "thumb_url": "https://...signed-url..."
    }
  ],
  "image_count": 1
}
```

员工端展示处理记录时，如果 `image_count > 0`，在该条处理记录下展示图片缩略图并支持预览。

## 状态和动作

状态展示：

| 状态 | 展示 |
| --- | --- |
| `open` | 待处理 |
| `in_progress` | 处理中 |
| `resolved` | 已解决 |
| `closed` | 已关闭 |
| `cancelled` | 已取消 |

动作展示以后端 `available_actions` 为准，不要在小程序本地硬编码状态流转。

第一版需要支持：

| action | 展示 | 说明 |
| --- | --- | --- |
| `start` | 开始处理 | `open -> in_progress` |
| `resolve` | 标记解决 | `in_progress -> resolved`，必须填写处理结果 |
| `close` | 关闭问题 | `resolved -> closed` |
| `reopen` | 重新打开 | `resolved/closed/cancelled -> in_progress` |
| `cancel` | 取消问题 | `open/in_progress -> cancelled` |

如果后端返回 `assign`，员工端第一版可以先不展示；分配客服仍由 Admin 承接。

## 动作交互

建议交互：

- 点击动作按钮后弹出确认或处理说明输入框。
- `resolve` 必须要求填写处理结果。
- `resolve` 弹窗展示附件上传区，最多 9 张，非必填。
- `start`、`close`、`reopen`、`cancel` 可以允许选填说明。
- 其他动作不展示附件上传区。
- 提交 `resolve` 前先完成图片上传，再提交动作。
- 提交中禁用按钮，避免重复请求。
- 成功后刷新详情，并通知任务中心刷新数量。
- 失败时展示后端错误文案。

示例：

```ts
await customerServiceTicketService.executeAction(ticketId, {
  action: "resolve",
  content: "已安排施工负责人处理，客户确认问题已解决",
  images: ["tenant/xxx/customer-service/resolve-1.webp"],
});
```

## 权限要求

后端权限：

- 读取详情：需要 `customer.read`。
- 执行动作：需要 `customer.update`。

如果员工端提示无权限，优先检查该员工的角色是否包含以上权限。

## 验收清单

- 任务中心能识别 `customer_service_ticket` 类型。
- 点击客服待办能进入员工端客服详情页。
- 详情页能展示基础信息、图片和处理记录。
- `open` 状态能执行 `start`。
- `in_progress` 状态能执行 `resolve`，且未填处理结果时不能提交。
- `resolve` 弹窗能上传图片附件，提交后处理记录能展示图片。
- `resolved` 状态能执行 `close` 和 `reopen`。
- `open/in_progress` 状态能执行 `cancel`。
- 每次动作成功后详情页状态刷新。
- 任务中心列表和汇总数量能在动作后刷新。
- 不依赖解析 `id = customer_service_ticket:uuid`。
- 不使用 Admin `target_url` 作为员工端跳转。
