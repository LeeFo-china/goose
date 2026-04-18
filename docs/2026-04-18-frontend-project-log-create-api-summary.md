# 项目施工日志创建接口对接摘要

本文档用于说明“项目详情页新增施工日志”所需的后端能力，供后端实现接口时参考。

当前前端已完成：

- 项目详情页增加“添加日志”入口
- 新增施工日志编辑页
- 支持填写 `node_name`、`content`
- 支持本地选择/预览/删除最多 9 张图片

当前尚未接入后端：

- 图片上传
- 创建施工日志

因此，后端建议提供两类接口：

1. 图片上传接口
2. 项目日志创建接口

---

## 1. 目标能力

前端希望完成的交互顺序：

1. 用户在施工日志编辑页填写节点名称、日志内容
2. 用户选择 1~9 张施工图片
3. 前端先上传图片，拿到图片 URL 列表
4. 前端再调用创建日志接口，提交日志基础信息和图片 URL
5. 创建成功后返回新日志记录，前端回到详情页并刷新

这样设计的原因：

- 当前 `project_logs.images` 最终更适合存储 URL 数组，而不是小程序本地临时路径
- 前端与后端职责清晰
- 后续日志编辑、图片复用、CDN 替换都更容易处理

---

## 2. 数据结构依据

当前前端参考的数据结构来自：

```ts
export interface ProjectLog {
  id: string;
  project_id: string;
  employee_id: string;
  node_name: string;
  content: string | null;
  images: Json | null;
  created_at: string;
}
```

前端当前提交目标 payload 形态为：

```ts
type PendingProjectLogPayload = {
  project_id: string;
  employee_id: string;
  node_name: string;
  content: string | null;
  images: string[];
  created_at: string;
};
```

说明：

- `images` 前端最终希望传的是图片 URL 数组
- `employee_id` 前端当前可以传，但后端更推荐从 Bearer Token 中解析当前员工 ID
- `created_at` 建议后端自己生成；前端传了也可以忽略

---

## 3. 推荐接口一：图片上传

### 接口路径

```http
POST /uploads/images
```

如果你们已有统一上传接口，也可以复用现有路径；只要最终能返回可访问 URL 即可。

### 鉴权

- 需要 `Authorization: Bearer <token>`

### 请求方式

推荐使用 `multipart/form-data`

字段建议：

- `files`: 图片文件，支持多文件
- `scene`: 可选，建议传固定值 `project_log`
- `project_id`: 可选，便于后端归档

### 请求示例

```http
POST /uploads/images
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

### 成功响应建议

```json
{
  "data": {
    "list": [
      {
        "url": "https://cdn.example.com/project-logs/2026/04/18/a.jpg",
        "path": "project-logs/2026/04/18/a.jpg"
      },
      {
        "url": "https://cdn.example.com/project-logs/2026/04/18/b.jpg",
        "path": "project-logs/2026/04/18/b.jpg"
      }
    ]
  },
  "message": "success"
}
```

### 字段说明

- `url`: 前端创建日志时要写入 `images` 的最终值
- `path`: 可选，便于后端后续做删除、迁移、审计

### TypeScript 类型建议

```ts
type UploadImageItem = {
  url: string;
  path?: string;
};

type UploadImagesResponse = {
  data: {
    list: UploadImageItem[];
  };
  message: string;
};
```

### 校验建议

- 最多 9 张
- 仅允许图片类型
- 单张大小限制建议 10MB 以内
- 返回的 URL 必须是前端可直接访问/预览的地址

### Supabase 实现建议

如果后端使用 Supabase Storage，建议：

- bucket 可单独建为 `project-logs`
- 对象路径建议包含日期或项目 ID，例如：
  - `project-logs/{project_id}/{yyyy}/{mm}/{uuid}.jpg`
- 上传后返回 public URL，或签名 URL

如果返回签名 URL，需要确认有效期是否足够长；施工日志图片通常更适合稳定 URL。

---

## 4. 推荐接口二：创建施工日志

### 接口路径

```http
POST /project_logs
```

### 鉴权

- 需要 `Authorization: Bearer <token>`

### 请求体

推荐请求体如下：

```json
{
  "project_id": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2",
  "node_name": "水电进场",
  "content": "今天完成厨房和卫生间水电放线，现场已确认插座点位。",
  "images": [
    "https://cdn.example.com/project-logs/2026/04/18/a.jpg",
    "https://cdn.example.com/project-logs/2026/04/18/b.jpg"
  ]
}
```

### 字段建议

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `project_id` | `string` | 是 | 项目 ID，合法 UUID |
| `node_name` | `string` | 是 | 施工节点名称 |
| `content` | `string \| null` | 否 | 施工日志描述 |
| `images` | `string[]` | 否 | 已上传后的图片 URL 列表 |

### 关于 `employee_id`

不建议前端显式提交 `employee_id` 作为可信字段。

更推荐后端：

- 从当前 Bearer Token 解析用户
- 由后端写入 `employee_id`

如果为了兼容当前前端你们想先收这个字段，也建议：

- 仅作为兜底字段
- 最终仍以后端鉴权身份为准

### 关于 `created_at`

建议后端自行生成，不需要前端传。

---

## 5. 创建成功响应建议

### 成功响应

```json
{
  "data": {
    "id": "8cc0d9b8-9c8b-4bb4-8d2c-e6c1e03c48ff",
    "project_id": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2",
    "employee_id": "f5e28f99-794d-42b8-afa2-59fc0d850b12",
    "node_name": "水电进场",
    "content": "今天完成厨房和卫生间水电放线，现场已确认插座点位。",
    "images": [
      "https://cdn.example.com/project-logs/2026/04/18/a.jpg",
      "https://cdn.example.com/project-logs/2026/04/18/b.jpg"
    ],
    "created_at": "2026-04-18T09:30:00.000Z"
  },
  "message": "success"
}
```

### TypeScript 类型建议

```ts
type CreateProjectLogPayload = {
  project_id: string;
  node_name: string;
  content?: string | null;
  images?: string[];
};

type CreateProjectLogResponse = {
  data: {
    id: string;
    project_id: string;
    employee_id: string;
    node_name: string;
    content: string | null;
    images: string[] | null;
    created_at: string;
  };
  message: string;
};
```

---

## 6. 校验失败建议

### Zod 示例

```ts
export const CreateProjectLogSchema = z.object({
  project_id: z.string().uuid("无效的项目ID"),
  node_name: z.string().trim().min(1, "节点名称不能为空").max(100, "节点名称过长"),
  content: z.string().trim().max(500, "日志内容过长").nullable().optional(),
  images: z.array(z.string().url("图片地址无效")).max(9, "最多上传9张图片").optional(),
});
```

### 错误响应示例

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "error": "Bad Request",
  "message": "字段 [project_id] 校验失败: 无效的项目ID"
}
```

### 常见错误场景

- `project_id` 非法
- `node_name` 为空
- `content` 超长
- `images` 超过 9 张
- `images` 里存在非法 URL

---

## 7. 前端对接顺序建议

推荐前端按下面顺序调用：

### 第一步：上传图片

```ts
const uploadRes = await request.upload("/uploads/images", files);
const imageUrls = uploadRes.data.list.map((item) => item.url);
```

### 第二步：创建日志

```ts
const createRes = await request.post("/project_logs", {
  project_id,
  node_name,
  content,
  images: imageUrls,
});
```

### 第三步：回到详情页刷新

- 重新请求 `/project_logs/projects`
- 重新请求 `/project_logs/projects/calendar`

这样可以同时刷新：

- 时间线日志列表
- 施工日历上的日期标记

---

## 8. 是否可以做成单接口

可以，但不推荐作为首选。

例如也可以做成：

```http
POST /project_logs/create-with-images
Content-Type: multipart/form-data
```

同时传：

- `project_id`
- `node_name`
- `content`
- `files[]`

这种方式前端也能接，但会带来这些问题：

- 接口职责更重
- 日后单独复用上传能力不方便
- 日志编辑/补图场景扩展性差

所以更推荐：

- 上传接口独立
- 创建日志接口独立

---

## 9. 后端实现建议

如果后端是 Fastify + Supabase，建议：

### 图片上传

- Fastify 处理 multipart
- 上传到 Supabase Storage
- 返回图片 URL 列表

### 创建日志

- 从 token 解析当前用户
- 写入 `project_logs`
- `images` 直接存 `text[]` 对应的 JSON 数组

### 数据库写入结果

建议插入后直接返回完整记录，便于前端立即刷新或乐观更新。

---

## 10. 当前前端状态说明

前端当前已完成这些准备：

- 已有新增施工日志页面
- 已完成图片选择、预览、删除
- 已按 `project_log` 结构组装提交 payload
- 当前只差后端“上传 + 创建”两个正式接口接入

所以后端只要把这两个接口按上面协议落好，前端就可以直接接入。
