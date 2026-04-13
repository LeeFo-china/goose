# 前端对接摘要 - Customer 分页接口

日期：2026-04-12

## 本次变更

当前 customer 相关列表接口已支持分页，前端请求时统一可传：

- `page`
- `pageSize`

默认值：

- `page = 1`
- `pageSize = 20`

最大值：

- `pageSize <= 100`

---

## 1. 获取客户列表

### 接口

```http
GET /customers?page=1&pageSize=20
```

### 成功响应

```json
{
  "data": {
    "list": [
      {
        "id": "uuid",
        "name": "张三"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 58,
      "totalPages": 3
    }
  },
  "message": "success"
}
```

### 字段说明

- `data.list`：当前页数据
- `data.pagination.page`：当前页码
- `data.pagination.pageSize`：每页条数
- `data.pagination.total`：总条数
- `data.pagination.totalPages`：总页数

---

## 2. 获取客户跟进记录列表

### 接口

```http
GET /customers/:id/follow_ups?page=1&pageSize=20
```

例如：

```http
GET /customers/550e8400-e29b-41d4-a716-446655440000/follow_ups?page=1&pageSize=10
```

### 成功响应

```json
{
  "data": {
    "list": [
      {
        "id": "uuid",
        "customer_id": "uuid",
        "content": "今日已回访客户"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 26,
      "totalPages": 3
    }
  },
  "message": "success"
}
```

---

## 3. 未分页的接口

以下接口不是列表分页接口：

- `GET /customers/:id/detail`：客户详情
- `POST /customers/:id/follow_ups`：新增跟进记录

---

## 4. 前端调用建议

### 请求示例

```ts
const res = await request.get("/customers", {
  page: 1,
  pageSize: 20,
});

const list = res.data.list;
const pagination = res.data.pagination;
```

### 跟进记录请求示例

```ts
const res = await request.get(`/customers/${customerId}/follow_ups`, {
  page: 1,
  pageSize: 10,
});

const followUpList = res.data.list;
const pagination = res.data.pagination;
```

---

## 5. 注意事项

1. 分页参数未传时，会使用默认值 `page=1`、`pageSize=20`
2. `pageSize` 最大为 `100`
3. 客户列表和跟进记录列表都按 `created_at` 倒序返回
