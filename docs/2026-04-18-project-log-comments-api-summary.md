# 项目施工日志评论接口方案

本文档用于定义“员工、客户对施工日志评论/回复/评分”的第一阶段接口方案。

第一阶段只实现：

1. `POST /project_log_comments`
2. `GET /project_log_comments?log_id=...`

暂不实现：

- `DELETE /project_log_comments/:id`
- `PATCH /project_log_comments/:id`

这样可以先满足前端最核心的“发评论 + 看评论”需求，避免第一版把复杂度拉得太高。

---

## 1. 目标能力

第一阶段支持：

1. 员工可对某条施工日志发表评论
2. 客户可对某条施工日志发表评论
3. 员工/客户可回复已有评论
4. 客户可对某条日志给出评分
5. 前端可按某条日志拉取评论列表

---

## 2. 数据模型

建议新增独立表：

```ts
type ProjectLogComment = {
  id: string;
  log_id: string;
  parent_id: string | null;
  author_type: "employee" | "customer";
  author_id: string;
  content: string;
  rating: number | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};
```

### 字段说明

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | `string` | 评论 ID，UUID |
| `log_id` | `string` | 对应施工日志 ID |
| `parent_id` | `string \| null` | 父评论 ID，根评论为 `null` |
| `author_type` | `'employee' \| 'customer'` | 评论作者身份 |
| `author_id` | `string` | 评论作者 ID |
| `content` | `string` | 评论内容 |
| `rating` | `number \| null` | 评分，仅根评论允许填写 |
| `created_at` | `string` | 创建时间 |
| `updated_at` | `string \| null` | 更新时间 |
| `deleted_at` | `string \| null` | 删除时间，第一阶段保留字段但不使用 |

### 规则说明

- `parent_id = null` 表示直接评论某条日志
- `parent_id != null` 表示回复某条评论
- 回复评论时 `rating` 必须为 `null`
- 员工评论时 `rating` 必须为 `null`
- 只有客户对根评论允许评分

---

## 3. 接口列表

第一阶段接口：

1. `POST /project_log_comments`
2. `GET /project_log_comments?log_id=...`

第二阶段再考虑：

1. `DELETE /project_log_comments/:id`
2. `PATCH /project_log_comments/:id`

---

## 4. 创建评论/评分

### 路径

```http
POST /project_log_comments
```

### 鉴权

- 需要 `Authorization: Bearer <token>`

### 请求体

根评论示例：

```json
{
  "log_id": "2d074cba-3e16-4ae3-85dd-22ae03ae0493",
  "parent_id": null,
  "content": "今天现场挺整洁，节点推进也很清楚。",
  "rating": 5
}
```

回复评论示例：

```json
{
  "log_id": "2d074cba-3e16-4ae3-85dd-22ae03ae0493",
  "parent_id": "4dbac5c2-9864-4c31-ae8d-3be80f2f5eb1",
  "content": "收到，后续进场前会继续同步。",
  "rating": null
}
```

### 字段说明

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `log_id` | `string` | 是 | 施工日志 ID |
| `parent_id` | `string \| null` | 否 | 父评论 ID |
| `content` | `string` | 是 | 评论内容 |
| `rating` | `number \| null` | 否 | 评分，范围 1~5，仅客户根评论允许 |

### 后端规则

- `author_type` 不由前端传
- `author_id` 不由前端传
- 后端根据 token 自动识别当前身份：
  - 员工登录：`author_type = employee`
  - 客户登录：`author_type = customer`
- 员工如果传 `rating`，直接报错
- 回复评论如果传 `rating`，直接报错
- 如果 `parent_id` 不属于当前 `log_id`，直接报错

### 成功响应建议

```json
{
  "data": {
    "id": "4dbac5c2-9864-4c31-ae8d-3be80f2f5eb1",
    "log_id": "2d074cba-3e16-4ae3-85dd-22ae03ae0493",
    "parent_id": null,
    "author_type": "customer",
    "author_id": "c1a345d1-0e42-4d26-bef9-c8b20ef649a2",
    "content": "今天现场挺整洁，节点推进也很清楚。",
    "rating": 5,
    "created_at": "2026-04-18T12:30:00.000Z",
    "updated_at": null,
    "deleted_at": null,
    "author": {
      "id": "c1a345d1-0e42-4d26-bef9-c8b20ef649a2",
      "name": "张女士",
      "avatar": null
    }
  },
  "message": "success"
}
```

---

## 5. 获取某条日志的评论列表

### 路径

```http
GET /project_log_comments?log_id=<log_id>
```

### 鉴权

- 需要 `Authorization: Bearer <token>`

### 查询参数

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `log_id` | `string` | 是 | 施工日志 ID |

### 返回结构

后端返回平铺数组，前端自行组树：

```json
{
  "data": {
    "list": [
      {
        "id": "4dbac5c2-9864-4c31-ae8d-3be80f2f5eb1",
        "log_id": "2d074cba-3e16-4ae3-85dd-22ae03ae0493",
        "parent_id": null,
        "author_type": "customer",
        "author_id": "c1a345d1-0e42-4d26-bef9-c8b20ef649a2",
        "content": "今天现场挺整洁，节点推进也很清楚。",
        "rating": 5,
        "created_at": "2026-04-18T12:30:00.000Z",
        "updated_at": null,
        "deleted_at": null,
        "author": {
          "id": "c1a345d1-0e42-4d26-bef9-c8b20ef649a2",
          "name": "张女士",
          "avatar": null
        }
      },
      {
        "id": "5d50fd77-1ee7-4733-a6d5-d2cd1f66d177",
        "log_id": "2d074cba-3e16-4ae3-85dd-22ae03ae0493",
        "parent_id": "4dbac5c2-9864-4c31-ae8d-3be80f2f5eb1",
        "author_type": "employee",
        "author_id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
        "content": "收到，后续进场前会继续同步。",
        "rating": null,
        "created_at": "2026-04-18T12:35:00.000Z",
        "updated_at": null,
        "deleted_at": null,
        "author": {
          "id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
          "name": "员工3",
          "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp3"
        }
      }
    ]
  },
  "message": "success"
}
```

### 排序建议

- 按 `created_at asc` 返回

### 前端处理建议

- `parent_id = null` 的作为一级评论
- 其他评论按 `parent_id` 组装成回复
- `rating` 只展示在一级客户评论上

---

## 6. 参数校验规则

### 创建评论 Schema

```ts
export const CreateProjectLogCommentSchema = z.object({
  log_id: z.string().uuid("无效的日志ID"),
  parent_id: z.string().uuid("无效的父评论ID").nullable().optional(),
  content: z.string().trim().min(1, "评论内容不能为空").max(500, "评论内容过长"),
  rating: z.number().int().min(1, "评分最小为1").max(5, "评分最大为5").nullable().optional(),
});
```

### 查询评论 Schema

```ts
export const ProjectLogCommentsQuerySchema = z.object({
  log_id: z.string().uuid("无效的日志ID"),
});
```

### 常见错误场景

- `log_id` 非法
- `parent_id` 非法
- `content` 为空
- `content` 超过 500 字
- `rating` 不在 1~5 范围内
- 员工评论传 `rating`
- 回复评论传 `rating`
- 父评论不存在
- 父评论和当前日志不匹配

---

## 7. 前端 TypeScript 类型建议

```ts
type ProjectLogCommentAuthor = {
  id: string;
  name: string | null;
  avatar: string | null;
};

type ProjectLogCommentItem = {
  id: string;
  log_id: string;
  parent_id: string | null;
  author_type: "employee" | "customer";
  author_id: string;
  content: string;
  rating: number | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
  author: ProjectLogCommentAuthor | null;
};
```

---

## 8. 与现有 project_logs 的职责拆分

- `project_logs`
  - 发布日志
  - 查询日志列表
  - 删除日志
  - 更新日志图片
  - 日历打点

- `project_log_comments`
  - 评论
  - 回复
  - 评分

不要把评论和评分继续塞进 `project_logs` 表。
