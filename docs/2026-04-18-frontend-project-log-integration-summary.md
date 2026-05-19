# 项目日志前端对接摘要

本文档用于给前端直接对接项目日志相关能力，当前可用接口包括：

- 图片上传：`POST /uploads/images`
- 创建日志：`POST /project_logs`
- 删除日志：`DELETE /project_logs/:id`
- 更新日志图片：`PATCH /project_logs/:id/images`
- 日志列表：`GET /project_logs/projects`
- 日历打点：`GET /project_logs/projects/calendar`

---

## 1. 前端调用顺序

前端按下面顺序调用：

1. 用户选择图片
2. 调用 `POST /uploads/images`
3. 从返回结果中取 `path`
4. 调用 `POST /project_logs`
5. 创建成功后刷新：
   - `GET /project_logs/projects`
   - `GET /project_logs/projects/calendar`

删除相关场景：

1. 删除单张图片时，前端保留剩余图片路径数组
2. 调用 `PATCH /project_logs/:id/images`
3. 删除整条日志时，调用 `DELETE /project_logs/:id`
4. 成功后刷新：
   - `GET /project_logs/projects`
   - `GET /project_logs/projects/calendar`

---

## 2. 图片上传接口

### 请求

```http
POST /uploads/images
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

### 表单字段

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `files` | `file` | 是 | 图片文件，支持多张 |
| `project_id` | `string` | 否 | 项目 ID，建议传，便于归档 |
| `scene` | `string` | 否 | 当前后端不依赖，可不传 |

### 成功响应

```json
{
  "data": {
    "list": [
      {
        "url": "https://<supabase-project-ref>.supabase.co/storage/v1/object/public/project-logs/c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg",
        "path": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg"
      }
    ]
  },
  "message": "success"
}
```

### 前端应取哪个字段

- 预览图片：用 `url`
- 创建日志时提交：优先用 `path`

### 约束

- 最多 9 张
- 单张最大 10MB
- 支持：
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/heic`
  - `image/heif`

---

## 3. 创建日志接口

### 请求

```http
POST /project_logs
Authorization: Bearer <token>
Content-Type: application/json
```

### 请求体

```json
{
  "project_id": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2",
  "node_name": "水电进场",
  "content": "今天完成厨房和卫生间水电放线，现场已确认插座点位。",
  "images": [
    "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg",
    "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/b.jpg"
  ]
}
```

### 字段说明

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `project_id` | `string` | 是 | 项目 ID |
| `node_name` | `string` | 是 | 日志节点名称 |
| `content` | `string \| null` | 否 | 日志内容 |
| `images` | `string[]` | 否 | 图片路径数组，兼容传 public URL |

### 注意

- 前端不要传 `employee_id`
- 后端会根据当前 token 自动写入 `employee_id`
- 前端不要传 `created_at`
- 后端会自动生成时间

### 成功响应

```json
{
  "data": {
    "id": "2d074cba-3e16-4ae3-85dd-22ae03ae0493",
    "project_id": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2",
    "employee_id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
    "node_name": "接口联调测试",
    "content": "通过上传接口和创建日志接口完成的联调测试记录。",
    "images": [
      "https://<supabase-project-ref>.supabase.co/storage/v1/object/public/project-logs/c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg"
    ],
    "created_at": "2026-04-18T05:03:32.274122+00:00",
    "employee": {
      "id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
      "name": "员工3",
      "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp3"
    }
  },
  "message": "success"
}
```

---

## 4. 日志列表接口

### 请求

```http
GET /project_logs/projects?project_id=<project_id>&page=1&pageSize=20
Authorization: Bearer <token>
```

### 返回重点

- `data.list`：日志列表
- `data.pagination`：分页信息
- `images`：返回的是可直接预览的 URL 数组
- `comment_count`：该条日志当前评论数量，前端可直接用于显示评论角标

---

## 5. 删除日志接口

### 请求

```http
DELETE /project_logs/:id
Authorization: Bearer <token>
```

### 成功响应

```json
{
  "data": {
    "id": "5afbef84-37a6-4788-a294-d0130aa5d130"
  },
  "message": "success"
}
```

### 行为说明

- 只允许日志创建人删除自己的日志
- 后端会同时删除该日志关联的 Storage 图片

---

## 6. 更新日志图片接口

### 请求

```http
PATCH /project_logs/:id/images
Authorization: Bearer <token>
Content-Type: application/json
```

### 请求体

前端传“保留的图片列表”：

```json
{
  "images": [
    "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg"
  ]
}
```

### 成功响应

```json
{
  "data": {
    "id": "5afbef84-37a6-4788-a294-d0130aa5d130",
    "images": [
      "https://<supabase-project-ref>.supabase.co/storage/v1/object/public/project-logs/c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg"
    ]
  },
  "message": "success"
}
```

### 行为说明

- 前端不需要传“删除了哪些图片”
- 只要传当前最终保留的图片路径数组
- 后端会自动删除不再保留的 Storage 图片

---

## 7. 日历接口

### 请求

```http
GET /project_logs/projects/calendar?project_id=<project_id>
Authorization: Bearer <token>
```

### 返回重点

- `date`：`YYYY-MM-DD`
- `count`：当天日志数
- `node_name`：当天用于日历展示的标签

---

## 8. 前端示例代码

### 上传后创建

```ts
const uploadRes = await request.upload("/uploads/images", {
  files,
  project_id: projectId,
});

const imagePaths = uploadRes.data.list.map((item) => item.path);

await request.post("/project_logs", {
  project_id: projectId,
  node_name,
  content,
  images: imagePaths,
});

await Promise.all([
  request.get("/project_logs/projects", {
    project_id: projectId,
    page: 1,
    pageSize: 20,
  }),
  request.get("/project_logs/projects/calendar", {
    project_id: projectId,
  }),
]);
```

### 删除单张图片

```ts
const nextImages = formImages
  .filter((item) => item.path !== removedPath)
  .map((item) => item.path);

await request.patch(`/project_logs/${logId}/images`, {
  images: nextImages,
});

await Promise.all([
  request.get("/project_logs/projects", {
    project_id: projectId,
    page: 1,
    pageSize: 20,
  }),
  request.get("/project_logs/projects/calendar", {
    project_id: projectId,
  }),
]);
```

### 删除整条日志

```ts
await request.delete(`/project_logs/${logId}`);

await Promise.all([
  request.get("/project_logs/projects", {
    project_id: projectId,
    page: 1,
    pageSize: 20,
  }),
  request.get("/project_logs/projects/calendar", {
    project_id: projectId,
  }),
]);
```

---

## 9. 对接注意事项

- 上传接口返回 `url` 和 `path`，创建日志时优先传 `path`
- 如果前端误传了 Supabase public URL，后端当前也能兼容
- 日志列表和创建接口返回的 `images` 都是可直接预览的 URL
- 日志列表接口每条记录都带 `comment_count`
- 更新图片接口传的是“保留图片列表”
- 删除日志会同时删除关联图片
- 日历接口只负责打点，不返回日志详情
