# 项目工序验收接口对接文档

本文档给 admin 和小程序端对接“项目工序验收”第一版 MVP 使用。

## 一、当前已落地能力

- 后端新增验收模板、验收单、验收项、操作记录表。
- 内置 8 个工序验收模板。
- 支持监理发起验收草稿。
- 支持逐项填写通过、不通过、不适用、备注和图片。
- 支持提交验收。
- 支持领导通过或驳回。
- 支持业主确认或提出疑问。
- 支持同一项目同一工序进行中验收单防重复。
- 支持整改后失败项复验校验。

## 二、上传图片

沿用现有图片上传接口：

```http
POST /uploads/images
```

表单字段：

| 字段 | 必填 | 说明 |
| :--- | :--- | :--- |
| `files` | 是 | 图片文件，可多张 |
| `project_id` | 建议 | 项目 ID |
| `scene` | 是 | 固定传 `project_acceptance` |

提交验收项时，使用上传返回的 `path`。

## 三、验收模板

### 查询模板列表

```http
GET /project-acceptance-templates?stage_code=plumbing_electrical
```

返回结构：

```json
{
  "data": {
    "list": [
      {
        "id": "template-id",
        "stage_code": "plumbing_electrical",
        "stage_label": "水电验收",
        "name": "水电验收",
        "version": 1,
        "items": [
          {
            "id": "item-id",
            "category": "工艺",
            "title": "水管打压",
            "standard": "打压测试结果正常，无渗漏",
            "required": true,
            "allow_not_applicable": false,
            "photo_required": true,
            "photo_min_count": 1,
            "photo_max_count": 9
          }
        ]
      }
    ]
  },
  "message": "success"
}
```

## 四、验收单

### 发起验收

```http
POST /project-acceptances
```

请求：

```json
{
  "project_id": "project-id",
  "stage_code": "plumbing_electrical"
}
```

说明：

- 后端自动匹配启用模板。
- 后端自动快照模板项。
- 如果同一项目同一工序已有进行中的验收单，会返回失败。

### 查询验收列表

```http
GET /project-acceptances?project_id=project-id&page=1&pageSize=20
```

可选过滤：

- `project_id`
- `status`
- `stage_code`
- `reviewer_id`
- `customer_id`

### 查询验收详情

```http
GET /project-acceptances/:id
```

详情里包含：

- `items`
- `actions`
- `project`
- `initiator`
- `reviewer`
- `customer`
- `has_customer_dispute`
- `customer_status_label`

客户侧状态展示建议：

- 普通 `leader_approved`：显示 `customer_status_label = 待业主确认`
- 如果之前有 `customer_dispute`，且当前状态又回到 `leader_approved`：显示 `customer_status_label = 整改完成，待你确认`

验收项里会返回整改信息：

```json
{
  "id": "acceptance-item-id",
  "title": "卫生间坡度",
  "rectification_remark": "已重新补拍卫生间地面照片",
  "rectification_images": [
    "https://.../image.jpg"
  ],
  "rectification_image_items": [
    {
      "path": "project-id/acceptance/2026/05/08/a.jpg",
      "url": "https://.../image.jpg",
      "thumb_url": "https://.../image.jpg"
    }
  ]
}
```

前端展示规则：

- `rectification_remark` 或 `rectification_images` 有值时，在该验收项下显示“整改说明”。
- 整改详情从验收项读取，不要从 `actions` 里反推。
- `actions` 只用于展示“谁在什么时候做了什么”。

`actions` 中每条操作记录会返回操作人：

```json
{
  "action": "leader_approve",
  "comment": "复核通过",
  "created_at": "2026-05-08T10:00:00.000Z",
  "operator_type": "employee",
  "operator_id": "employee-id",
  "operator": {
    "id": "employee-id",
    "name": "张三",
    "avatar": null
  }
}
```

如果 `operator_type = customer`，`operator` 为客户对象，包含 `id`、`name`、`phone`。

### 保存草稿

```http
PATCH /project-acceptances/:id
```

请求：

```json
{
  "summary": "现场整体符合验收条件",
  "items": [
    {
      "id": "acceptance-item-id",
      "result": "pass",
      "remark": "现场已确认",
      "images": ["project-id/acceptance/2026/05/08/a.jpg"]
    }
  ]
}
```

`result` 可选：

- `pass`
- `fail`
- `not_applicable`

注意：

- `allow_not_applicable=false` 的项不能选择 `not_applicable`。
- 选择 `not_applicable` 必须填写 `remark`。

### 提交验收

```http
POST /project-acceptances/:id/submit
```

请求体和保存草稿一致，可为空对象：

```json
{}
```

提交校验：

- 必检项必须填写结果。
- 必传照片必须满足数量。
- 如果存在 `fail` 项，后端会把验收单状态置为 `rejected`，监理需要整改后再次提交。
- 如果是整改后再次提交，上一次为 `fail` 的项必须补充：
  - `result = pass`，或允许情况下 `not_applicable`
  - `rectification_remark`
  - 必要时 `rectification_images`

## 五、领导复核

### 通过

```http
POST /project-acceptances/:id/approve
```

请求：

```json
{
  "comment": "复核通过"
}
```

成功后状态：

```text
leader_approved
```

### 驳回

```http
POST /project-acceptances/:id/reject
```

请求：

```json
{
  "comment": "水管打压照片不完整，请整改后重新提交"
}
```

成功后：

- 状态变为 `rejected`
- `reject_source = leader`
- 操作记录 `action = leader_reject`

## 六、业主确认

### 客户侧查询验收列表

小程序客户项目详情页不要调用员工端列表接口，应使用客户侧只读接口：

```http
GET /customer/project-acceptances?project_id=project-id&page=1&pageSize=10
```

可选过滤：

- `status`
- `stage_code`

后端按当前客户登录态校验：

- `customers.user_id = 当前 authUserId`
- `projects.customer_id = 当前 customer.id`

客户只能看到自己项目的验收单。

### 客户侧查询验收详情

```http
GET /customer/project-acceptances/:id
```

后端按验收单 `customer_id` 校验当前客户归属，不需要员工权限码。

### 确认通过

```http
POST /project-acceptances/:id/customer-confirm
```

请求：

```json
{
  "comment": "已确认"
}
```

成功后状态：

```text
customer_confirmed
```

### 我有疑问

```http
POST /project-acceptances/:id/customer-dispute
```

请求：

```json
{
  "comment": "卫生间地面照片看不清楚，请补充",
  "images": []
}
```

成功后：

- 状态变为 `rejected`
- `reject_source = customer`
- 操作记录 `action = customer_dispute`

前端展示时应该显示“业主有疑问”，不要显示成“领导驳回”。

## 七、状态与按钮

| 状态 | 员工端主按钮 | 领导端主按钮 | 业主端主按钮 |
| :--- | :--- | :--- | :--- |
| `draft` | 保存草稿 / 提交验收 | 无 | 无 |
| `submitted` | 查看 | 通过 / 驳回 | 无 |
| `leader_approved` | 查看 | 查看 | 确认通过 / 我有疑问 |
| `rejected` | 整改后重新提交 | 查看 | 查看 |
| `customer_confirmed` | 查看 | 查看 | 查看 |
| `cancelled` | 查看 | 查看 | 查看 |

## 八、权限

员工端需要登录 token。

后端权限码：

- `project_acceptance.read`
- `project_acceptance.create`
- `project_acceptance.update_own`
- `project_acceptance.submit`
- `project_acceptance.review`
- `project_acceptance.reject`
- `project_acceptance.manage`

业主确认接口使用客户登录态，根据 `customers.user_id` 匹配当前客户。

## 九、推荐前端落地顺序

1. admin 项目详情增加“工序验收”tab。
2. 支持查看验收列表和详情。
3. 支持监理发起草稿和填写标准项。
4. 支持提交验收。
5. 支持领导复核。
6. 小程序客户项目详情展示待确认验收。
7. 小程序客户支持确认通过和我有疑问。
