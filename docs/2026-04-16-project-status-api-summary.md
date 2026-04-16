# 项目状态列表接口对接文档

本文档用于说明 `GET /projects/status` 接口的请求参数、返回结构和校验规则，方便前后端联调。

## 接口基本信息

- **接口路径**: `GET /projects/status`
- **功能描述**: 按项目状态、关键词和分页参数获取项目列表
- **鉴权要求**: 走项目现有的通用鉴权逻辑时，按实际网关/中间件要求携带 `Authorization` 请求头

---

## 1. 请求参数

### 请求格式

```http
GET /projects/status?status=designing&keyword=项目&page=1&pageSize=10
```

### 查询参数说明

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `status` | `string` | 否* | 项目状态筛选条件，取值必须是状态枚举中的一个 |
| `keyword` | `string` | 否 | 关键词搜索，支持按项目名称或地址模糊查询 |
| `page` | `number` | 否 | 页码，从 `1` 开始 |
| `pageSize` | `number` | 否 | 每页条数，从 `1` 开始，最大 `100` |

> 注：当前实现里 `status` 使用了枚举校验；如果不传，会按 schema 默认值处理为 `lead`。如果传空字符串 `status=`，会校验失败。

### `status` 可选值

```text
lead
negotiating
signed
designing
constructing
on_hold
acceptance
completed
after_sale
invalid
```

### 参数规则

- `page` 必须是大于 `0` 的整数
- `pageSize` 必须是大于 `0` 的整数，且不能超过 `100`
- `keyword` 会对 `name` 和 `address` 两个字段做模糊匹配
- `status` 只能传上面列出的枚举值

---

## 2. 成功响应

### 返回结构

```json
{
  "data": {
    "list": [],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 0,
      "totalPages": 0
    }
  },
  "message": "success"
}
```

### `list` 数据结构

```json
{
  "id": "fa8d2a0e-2eb8-4fd2-a77b-636b9b24a2f9",
  "name": "项目-3",
  "status": "designing",
  "budget": 295289,
  "address": "幸福路103号",
  "designer": {
    "id": "eee53516-d0f5-4192-903d-06d0044d2bfd",
    "name": "员工7",
    "phone": "13000000007",
    "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp7"
  },
  "customer": {
    "id": "157d9730-423b-42c2-9594-44e5ee865a9d",
    "name": "客户13",
    "phone": "15000000013"
  },
  "supervisor": {
    "id": "fa0652ca-5957-498a-8bd1-9e88ad8ce737",
    "name": "员工6",
    "phone": "13000000006",
    "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp6"
  }
}
```

### 字段说明

- `data.list`：项目列表
- `data.pagination.page`：当前页码
- `data.pagination.pageSize`：每页条数
- `data.pagination.total`：符合条件的总条数
- `data.pagination.totalPages`：总页数
- `designer`：项目设计师信息
- `customer`：项目客户信息
- `supervisor`：项目监理信息

### 成功响应示例

```json
{
  "data": {
    "list": [
      {
        "id": "fa8d2a0e-2eb8-4fd2-a77b-636b9b24a2f9",
        "name": "项目-3",
        "status": "designing",
        "budget": 295289,
        "address": "幸福路103号",
        "designer": {
          "id": "eee53516-d0f5-4192-903d-06d0044d2bfd",
          "name": "员工7",
          "phone": "13000000007",
          "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp7"
        },
        "customer": {
          "id": "157d9730-423b-42c2-9594-44e5ee865a9d",
          "name": "客户13",
          "phone": "15000000013"
        },
        "supervisor": {
          "id": "fa0652ca-5957-498a-8bd1-9e88ad8ce737",
          "name": "员工6",
          "phone": "13000000006",
          "avatar": "https://api.dicebear.com/7.x/identicon/svg?seed=emp6"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 1,
      "total": 6,
      "totalPages": 6
    }
  },
  "message": "success"
}
```

---

## 3. 校验失败响应

当参数不合法时，接口会返回 `VALIDATION_ERROR`，并带上字段级校验失败信息。

### 示例

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "error": "Bad Request",
  "message": "字段 [pageSize] 校验失败: 每页条数必须大于 0"
}
```

### 常见错误场景

- `status` 不是合法枚举值
- `page` 小于 `1`
- `pageSize` 小于 `1`
- `pageSize` 大于 `100`

---

## 4. 前端调用建议

```ts
const res = await request.get("/projects/status", {
  status: "designing",
  keyword: "项目",
  page: 1,
  pageSize: 10,
});

const list = res.data.list;
const pagination = res.data.pagination;
```

---

## 5. 补充说明

- 当前接口按 `created_at` 倒序返回
- `keyword` 会同时匹配项目名称和项目地址
- 如果前端只想按状态筛选，传 `status` 即可
