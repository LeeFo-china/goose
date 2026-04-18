# 项目日志日历接口对接文档

本文档用于说明 `GET /project_logs/projects/calendar` 接口的请求参数、返回结构和前端对接方式，便于项目详情页中的日志日历联调。

## 接口基本信息

- **接口路径**: `GET /project_logs/projects/calendar`
- **功能描述**: 按项目 ID 获取项目日志的日历索引数据，返回哪些日期有日志、每天日志条数和当天展示标签
- **鉴权要求**: 需要按项目现有鉴权方式携带 `Authorization: Bearer <token>`

---

## 1. 请求参数

### 请求示例

```http
GET /project_logs/projects/calendar?project_id=c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2
Authorization: Bearer <token>
```

### 查询参数说明

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `project_id` | `string` | 是 | 项目 ID，必须是合法 UUID |

### 参数校验规则

```ts
export const ProjectLogCalendarQuerySchema = z.object({
  project_id: z.string().uuid("无效的项目ID"),
});
```

### 参数规则补充

- `project_id` 必须传合法 UUID
- 该接口不支持分页
- 该接口返回的是“日期聚合结果”，不是日志详情列表

---

## 2. 成功响应

### 返回结构

```json
{
  "data": {
    "project_id": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2",
    "list": []
  },
  "message": "success"
}
```

### `data.list` 单项结构

```json
{
  "date": "2026-03-12",
  "count": 2,
  "node_name": "水电"
}
```

### 字段说明

- `data.project_id`：当前查询的项目 ID
- `data.list`：有日志的日期列表
- `date`：业务日期，格式固定为 `YYYY-MM-DD`
- `count`：当天日志数量
- `node_name`：当天用于日历格子展示的短标签，固定取当天最新一条日志的 `node_name`

### 成功响应示例

```json
{
  "data": {
    "project_id": "c310d1a5-d6b0-4f46-9c7e-5f0ff6eb70e2",
    "list": [
      {
        "date": "2026-03-07",
        "count": 1,
        "node_name": "开工"
      },
      {
        "date": "2026-03-12",
        "count": 2,
        "node_name": "水电"
      },
      {
        "date": "2026-04-03",
        "count": 1,
        "node_name": "泥木"
      }
    ]
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
- 未传 `project_id`

---

## 4. 前端调用建议

### TypeScript 类型建议

```ts
type ProjectLogCalendarItem = {
  date: string;
  count: number;
  node_name: string | null;
};

type ProjectLogCalendarResponse = {
  data: {
    project_id: string;
    list: ProjectLogCalendarItem[];
  };
  message: string;
};
```

### 请求示例

```ts
const res = await request.get<ProjectLogCalendarResponse>(
  "/project_logs/projects/calendar",
  {
    project_id: currentProjectId,
  },
);

const projectId = res.data.project_id;
const list = res.data.list;
```

### 建议的日历数据处理

前端建议把返回结果转成以 `date` 为 key 的映射，方便日历格子快速查询：

```ts
const dateMap = new Map(
  res.data.list.map((item) => [item.date, item]),
);

const dayInfo = dateMap.get("2026-03-12");
// => { date: "2026-03-12", count: 2, node_name: "水电" }
```

### 与日志详情接口的职责拆分

- `/project_logs/projects/calendar`：负责日历打点
- `/project_logs/projects`：负责日志详情列表

建议交互方式：

1. 进入项目详情页时先请求日历接口
2. 渲染哪些日期有日志
3. 用户点击某一天后，再请求日志详情接口

---

## 5. 联调示例

### curl 示例

将下面的变量替换成真实值：

- `BASE_URL`：你的 API 地址
- `TOKEN`：登录后的 Bearer Token
- `PROJECT_ID`：项目 ID

```bash
curl -X GET "$BASE_URL/project_logs/projects/calendar?project_id=$PROJECT_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### fetch 示例

```ts
const res = await fetch(
  `${BASE_URL}/project_logs/projects/calendar?project_id=${projectId}`,
  {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
);

const data = await res.json();
```

---

## 6. 补充说明

- 后端已按 `Asia/Shanghai` 业务时区切天
- 返回结果按日期升序排列
- `node_name` 固定取当天最新一条日志，前端无需自行排序
- 如果某天没有日志，该日期不会出现在 `list` 中
