# 项目日志列表接口对接文档

本文档用于说明 `GET /project_logs/projects` 接口的请求参数、返回结构和前端对接方式，便于项目日志列表页联调。

## 接口基本信息

- **接口路径**: `GET /project_logs/projects`
- **功能描述**: 按项目 ID 查询项目日志列表，支持分页
- **鉴权要求**: 需要按项目现有鉴权方式携带 `Authorization: Bearer <token>`

---

## 1. 请求参数

### 请求示例

```http
GET /project_logs/projects?project_id=c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2&page=1&pageSize=20
Authorization: Bearer <token>
```

### 查询参数说明

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `project_id` | `string` | 是 | 项目 ID，必须是合法 UUID |
| `page` | `number` | 否 | 页码，从 `1` 开始，默认 `1` |
| `pageSize` | `number` | 否 | 每页条数，默认 `20`，最大 `100` |

### 参数校验规则

```ts
export const ProjectLogQuerySchema = z.object({
  project_id: z.string().uuid("无效的项目ID"),
  page: z.coerce.number().int().min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce.number().int().min(1, "每页条数必须大于 0").max(100, "每页条数不能超过 100").default(20),
});
```

### 参数规则补充

- `project_id` 必须传合法 UUID
- `page` 支持字符串或数字，后端会自动转成数字
- `pageSize` 支持字符串或数字，后端会自动转成数字
- `pageSize` 最大不超过 `100`

---

## 2. 成功响应

### 返回结构

接口实际成功返回外层带 `data` 和 `message`：

```json
{
  "data": {
    "list": [],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 0,
      "totalPages": 0
    }
  },
  "message": "success"
}
```

### `data.list` 单项结构

```json
{
  "id": "35facf85-7a0f-4d63-b18d-eb0bbc1f24c1",
  "project_id": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2",
  "employee_id": "387519de-3601-45bc-b4ee-da76627f04ea",
  "node_name": "开工",
  "content": "项目日志内容-1",
  "images": [
    "https://picsum.photos/seed/log1/200/200"
  ],
  "created_at": "2026-04-08T07:24:49.720318+00:00",
  "employee": {
    "id": "387519de-3601-45bc-b4ee-da76627f04ea",
    "name": "员工20",
    "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp20"
  }
}
```

### 字段说明

- `data.list`：项目日志列表
- `data.pagination.page`：当前页码
- `data.pagination.pageSize`：当前每页条数
- `data.pagination.total`：总条数
- `data.pagination.totalPages`：总页数
- `employee`：日志对应员工信息
- `images`：日志图片数组，可能为空数组、`null` 或其他兼容结构，前端建议先做数组兜底

### 成功响应示例

```json
{
  "data": {
    "list": [
      {
        "id": "35facf85-7a0f-4d63-b18d-eb0bbc1f24c1",
        "project_id": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2",
        "employee_id": "387519de-3601-45bc-b4ee-da76627f04ea",
        "node_name": "开工",
        "content": "项目日志内容-1",
        "images": [
          "https://picsum.photos/seed/log1/200/200"
        ],
        "created_at": "2026-04-08T07:24:49.720318+00:00",
        "employee": {
          "id": "387519de-3601-45bc-b4ee-da76627f04ea",
          "name": "员工20",
          "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp20"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 1,
      "total": 20,
      "totalPages": 20
    }
  },
  "message": "success"
}
```

---

## 3. 校验失败响应

参数不合法时，接口会返回 `400`，并带校验失败原因。

### 示例

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "error": "Bad Request",
  "message": "字段 [project_id] 校验失败: 无效的项目ID"
}
```

### 常见错误场景

- `project_id` 不是合法 UUID
- `page` 小于 `1`
- `pageSize` 小于 `1`
- `pageSize` 大于 `100`

---

## 4. 前端调用建议

### TypeScript 类型建议

```ts
type ProjectLogEmployee = {
  id: string;
  name: string;
  avatar: string | null;
};

type ProjectLogItem = {
  id: string;
  project_id: string;
  employee_id: string;
  node_name: string;
  content: string | null;
  images: string[] | null;
  created_at: string;
  employee: ProjectLogEmployee | null;
};

type ProjectLogListResponse = {
  data: {
    list: ProjectLogItem[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  };
  message: string;
};
```

### 请求示例

```ts
const res = await request.get<ProjectLogListResponse>("/project_logs/projects", {
  project_id: currentProjectId,
  page: 1,
  pageSize: 20,
});

const list = res.data.list;
const pagination = res.data.pagination;
```

### 建议的列表处理

```ts
const safeList = (res.data.list || []).map((item) => ({
  ...item,
  images: Array.isArray(item.images) ? item.images : [],
}));
```

---

## 5. 补充说明

- 当前接口按 `created_at` 倒序返回
- 当前查询会联表返回日志创建员工的 `id`、`name`、`avatar`
- 前端做分页时，直接使用 `data.pagination.total` 和 `data.pagination.totalPages`
- 如果后续要支持“全部项目日志列表”，需要后端先调整 `project_id` 的查询逻辑，再开放前端不传该参数
