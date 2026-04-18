# 项目日志评论前端对接摘要

本文档用于给前端直接对接项目日志评论第一阶段能力。

当前可用接口：

- 创建评论：`POST /project_log_comments`
- 查询评论列表：`GET /project_log_comments?log_id=<log_id>`

当前暂不支持：

- 删除评论
- 编辑评论

---

## 1. 能力范围

当前第一阶段支持：

1. 员工发表评论
2. 客户发表评论
3. 员工/客户回复已有评论
4. 客户对日志评分
5. 拉取某条日志的评论列表

---

## 2. 创建评论接口

### 请求

```http
POST /project_log_comments
Authorization: Bearer <token>
Content-Type: application/json
```

### 请求体

根评论示例：

```json
{
  "log_id": "08496911-f85b-4152-ba08-37732999bfb0",
  "parent_id": null,
  "content": "今天现场挺整洁，节点推进也很清楚。",
  "rating": 5
}
```

回复评论示例：

```json
{
  "log_id": "08496911-f85b-4152-ba08-37732999bfb0",
  "parent_id": "4d41218c-0f79-421c-8aa0-1bcaba769870",
  "content": "收到，后续进场前会继续同步。",
  "rating": null
}
```

### 字段说明

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `log_id` | `string` | 是 | 施工日志 ID |
| `parent_id` | `string \| null` | 否 | 父评论 ID，根评论传 `null` |
| `content` | `string` | 是 | 评论内容 |
| `rating` | `number \| null` | 否 | 评分，范围 `1~5`，只有客户根评论允许 |

### 前端注意事项

- 前端不要传 `author_type`
- 前端不要传 `author_id`
- 前端不要传 `created_at`
- 回复评论时请传 `rating: null`
- 员工端不要传 `rating`

### 成功响应

```json
{
  "data": {
    "id": "4d41218c-0f79-421c-8aa0-1bcaba769870",
    "log_id": "08496911-f85b-4152-ba08-37732999bfb0",
    "parent_id": null,
    "author_type": "employee",
    "author_id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
    "content": "评论接口联调测试-根评论",
    "rating": null,
    "created_at": "2026-04-18T06:31:23.815377+00:00",
    "updated_at": null,
    "deleted_at": null,
    "author": {
      "id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
      "name": "员工3",
      "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp3"
    }
  },
  "message": "success"
}
```

### 典型错误

员工传评分时会报错：

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "error": "Bad Request",
  "message": "员工评论不允许评分"
}
```

---

## 3. 获取评论列表接口

### 请求

```http
GET /project_log_comments?log_id=08496911-f85b-4152-ba08-37732999bfb0
Authorization: Bearer <token>
```

### 查询参数

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `log_id` | `string` | 是 | 施工日志 ID |

### 成功响应

```json
{
  "data": {
    "list": [
      {
        "id": "4d41218c-0f79-421c-8aa0-1bcaba769870",
        "log_id": "08496911-f85b-4152-ba08-37732999bfb0",
        "parent_id": null,
        "author_type": "employee",
        "author_id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
        "content": "评论接口联调测试-根评论",
        "rating": null,
        "created_at": "2026-04-18T06:31:23.815377+00:00",
        "updated_at": null,
        "deleted_at": null,
        "author": {
          "id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
          "name": "员工3",
          "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp3"
        }
      },
      {
        "id": "f75ca876-a3ca-4b62-a7b9-1befc6994d88",
        "log_id": "08496911-f85b-4152-ba08-37732999bfb0",
        "parent_id": "4d41218c-0f79-421c-8aa0-1bcaba769870",
        "author_type": "employee",
        "author_id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
        "content": "评论接口联调测试-回复评论",
        "rating": null,
        "created_at": "2026-04-18T06:32:05.596912+00:00",
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

### 返回特点

- 后端返回平铺数组
- 已按 `created_at asc` 排序
- `author` 信息已由后端组装好

---

## 4. 前端组树建议

前端建议自己组装评论树：

```ts
const rootComments = list.filter((item) => item.parent_id === null);

const childrenMap = new Map<string, ProjectLogCommentItem[]>();

for (const item of list) {
  if (!item.parent_id) continue;
  const group = childrenMap.get(item.parent_id) || [];
  group.push(item);
  childrenMap.set(item.parent_id, group);
}
```

展示建议：

- `parent_id = null` 作为一级评论
- 其他评论挂到对应父评论下
- `rating` 只在一级客户评论上显示

---

## 5. TypeScript 类型建议

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

type CreateProjectLogCommentPayload = {
  log_id: string;
  parent_id?: string | null;
  content: string;
  rating?: number | null;
};

type ProjectLogCommentsResponse = {
  data: {
    list: ProjectLogCommentItem[];
  };
  message: string;
};
```

---

## 6. 前端调用示例

### 创建根评论

```ts
await request.post("/project_log_comments", {
  log_id,
  parent_id: null,
  content,
  rating,
});
```

### 创建回复

```ts
await request.post("/project_log_comments", {
  log_id,
  parent_id: commentId,
  content,
  rating: null,
});
```

### 拉取评论列表

```ts
const res = await request.get<ProjectLogCommentsResponse>(
  "/project_log_comments",
  {
    log_id,
  },
);

const list = res.data.list;
```

---

## 7. 当前限制

- 暂不支持删除评论
- 暂不支持编辑评论
- 暂不支持后端直接返回树结构

如果后续需要删除/编辑能力，再补第二阶段接口即可。
