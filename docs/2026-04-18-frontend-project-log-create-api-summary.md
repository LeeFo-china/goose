# 项目施工日志创建接口对接文档

本文档用于说明“项目详情页新增施工日志”当前已经落地的后端接口能力，前端可直接按本文档对接。

当前相关接口：

- 图片上传：`POST /uploads/images`
- 创建日志：`POST /project_logs`
- 日志列表：`GET /project_logs/projects`
- 日历打点：`GET /project_logs/projects/calendar`

---

## 1. 对接流程

推荐前端按下面顺序调用：

1. 用户填写 `node_name`、`content`
2. 用户选择 1~9 张图片
3. 先调用 `POST /uploads/images`
4. 从返回值中取 `path`
5. 再调用 `POST /project_logs`
6. 创建成功后刷新：
   - `/project_logs/projects`
   - `/project_logs/projects/calendar`

---

## 2. 图片上传接口

### 路径

```http
POST /uploads/images
```

### 鉴权

- 需要 `Authorization: Bearer <token>`

### 请求方式

- `multipart/form-data`

### 表单字段

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `files` | `file` | 是 | 图片文件，支持多张 |
| `project_id` | `string` | 否 | 项目 ID，建议传，便于对象按项目归档 |
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

### 字段说明

- `url`：当前可直接预览的公开地址
- `path`：Storage bucket 内对象路径，创建日志时建议优先提交这个值

### 校验规则

- 最多 9 张
- 单张最大 10MB
- 支持：
  - `image/jpeg`
  - `image/png`
  - `image/webp`
  - `image/heic`
  - `image/heif`

### TypeScript 类型建议

```ts
type UploadImageItem = {
  url: string;
  path: string;
};

type UploadImagesResponse = {
  data: {
    list: UploadImageItem[];
  };
  message: string;
};
```

---

## 3. 创建施工日志接口

### 路径

```http
POST /project_logs
```

### 鉴权

- 需要 `Authorization: Bearer <token>`

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
| `project_id` | `string` | 是 | 项目 ID，合法 UUID |
| `node_name` | `string` | 是 | 施工节点名称 |
| `content` | `string \| null` | 否 | 施工日志描述 |
| `images` | `string[]` | 否 | 已上传后的图片路径数组，兼容传 Supabase public URL |

### 注意事项

- 前端不要传 `employee_id`
- 后端会根据当前 token 自动写入 `employee_id`
- 前端不要传 `created_at`
- 后端会自动生成时间
- 前端推荐传 `path`，不要传 `url`

### 成功响应

```json
{
  "data": {
    "id": "8cc0d9b8-9c8b-4bb4-8d2c-e6c1e03c48ff",
    "project_id": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2",
    "employee_id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
    "node_name": "水电进场",
    "content": "今天完成厨房和卫生间水电放线，现场已确认插座点位。",
    "images": [
      "https://<supabase-project-ref>.supabase.co/storage/v1/object/public/project-logs/c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2/2026/04/18/a.jpg"
    ],
    "created_at": "2026-04-18T09:30:00.000Z",
    "employee": {
      "id": "088ec9de-b364-4907-b1f6-cf97811bc09f",
      "name": "员工3",
      "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp3"
    }
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
    images: string[];
    created_at: string;
    employee: {
      id: string;
      name: string;
      avatar: string | null;
    } | null;
  };
  message: string;
};
```

---

## 4. 参数校验规则

后端当前规则：

```ts
export const CreateProjectLogRequestSchema = z.object({
  project_id: z.string().uuid("无效的项目ID"),
  node_name: z.string().trim().min(1, "节点名称不能为空").max(100, "节点名称过长"),
  content: z.string().trim().max(500, "日志内容过长").nullable().optional(),
  images: z.array(z.string().trim().min(1, "图片路径不能为空")).max(9, "最多上传9张图片").optional(),
});
```

### 常见错误场景

- `project_id` 非法
- `node_name` 为空
- `node_name` 超长
- `content` 超长
- `images` 超过 9 张
- `images` 数组中有空字符串

### 错误响应示例

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "error": "Bad Request",
  "message": "字段 [project_id] 校验失败: 无效的项目ID"
}
```

---

## 5. 前端示例

### 第一步：上传图片

```ts
const uploadRes = await request.upload("/uploads/images", {
  files,
  project_id,
});

const imagePaths = uploadRes.data.list.map((item) => item.path);
```

### 第二步：创建日志

```ts
await request.post("/project_logs", {
  project_id,
  node_name,
  content,
  images: imagePaths,
});
```

### 第三步：刷新页面数据

```ts
await Promise.all([
  request.get("/project_logs/projects", {
    project_id,
    page: 1,
    pageSize: 20,
  }),
  request.get("/project_logs/projects/calendar", {
    project_id,
  }),
]);
```

---

## 6. 补充说明

- 图片当前上传到 Supabase Storage 的 `project-logs` bucket
- 数据库存的是图片 `path`
- 接口返回给前端的是可直接预览的 `url`
- 如果前端误传了 Supabase public URL，后端当前也能兼容转换
- 如果前端还需要删除图片或删除整条日志，请参考：
  [2026-04-18-project-log-delete-api-summary.md](/Users/leefo/Public/work/gooes/docs/2026-04-18-project-log-delete-api-summary.md)
