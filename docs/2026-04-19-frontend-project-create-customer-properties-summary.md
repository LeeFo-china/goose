# 项目创建页客户关联房产前端对接摘要

本文档用于给前端直接对照修改项目创建页里的“客户关联房产”选择逻辑。

当前后端已经支持在 `/properties` 上按 `customer_id` 过滤。

---

## 1. 当前可用接口

```http
GET /properties?page=1&pageSize=20
GET /properties?page=1&pageSize=20&customer_id=<customerId>
```

### 关键结论

- 不传 `customer_id`：返回普通房产分页列表
- 传 `customer_id`：只返回该客户名下房产

---

## 2. 前端应该怎么改

项目创建页里，前端在选中客户后，请直接按当前客户发起请求：

```http
GET /properties?page=1&pageSize=20&customer_id=<customerId>
```

不要再依赖“先拉全量房产，再在前端本地过滤”作为主方案。

本次前端改动仍然可以保留兜底过滤，但正式口径应以后端过滤结果为准。

---

## 3. 查询参数

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `page` | `number` | 否 | 页码，从 `1` 开始 |
| `pageSize` | `number` | 否 | 每页条数，最大 `100` |
| `customer_id` | `string` | 否 | 客户 ID，传入后按客户过滤 |

---

## 4. 当前后端过滤规则

后端当前逻辑：

```sql
where customer_id = :customer_id
order by created_at desc
limit ...
offset ...
```

也就是说：

- `/properties` 本身已经支持 `customer_id` 过滤
- 前端不需要再自己推断“哪些房产属于当前客户”

---

## 5. 返回结构

接口返回统一分页结构：

```json
{
  "data": {
    "list": [
      {
        "id": "property-1",
        "customer_id": "customer-1",
        "community": "橙城花园",
        "building_info": "3栋2单元1502",
        "layout": "三室两厅",
        "area": 118,
        "latitude": 30.1,
        "longitude": 120.1,
        "created_at": "2026-04-19T10:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 1,
      "totalPages": 1
    }
  },
  "message": "success"
}
```

前端读取方式：

```ts
const list = res.data.list;
const pagination = res.data.pagination;
```

---

## 6. 前端最少依赖字段

前端当前最少依赖：

- `id`
- `customer_id`
- `community`
- `building_info`
- `layout`
- `area`

建议展示口径：

1. 主标题：`community + building_info`
2. 次级信息：`layout + area`

---

## 7. 前端调用示例

```ts
const res = await request.get("/properties", {
  page: 1,
  pageSize: 20,
  customer_id: selectedCustomerId,
});

const list = res.data.list;
const pagination = res.data.pagination;
```

如果当前没有选中客户：

```ts
const res = await request.get("/properties", {
  page: 1,
  pageSize: 20,
});
```

---

## 8. 这次修复的口径

这次属于“后端补齐正式筛选能力 + 前端继续保留兜底”的组合修复。

更准确地说：

- 根因在于 `/properties` 之前没有按 `customer_id` 稳定过滤
- 现在后端已经补上这个筛选
- 前端即使保留本地兜底，也应以后端结果为准

这意味着：

- 前端不会再把同一批房产错误展示给所有客户
- 后端接口本身也已经具备正确的按客户隔离能力

---

## 9. 联调前自检清单

前端提测前请确认：

- 选中客户后，请求 `/properties` 时带上 `customer_id`
- 房产列表从 `data.list` 读取
- 分页信息从 `data.pagination` 读取
- 不再把“前端本地过滤全量房产”当成主流程
- 切换客户后会重新请求该客户的房产列表

---

## 10. 一句话版本

项目创建页里，前端只要在请求房产列表时传 `customer_id`，就能直接拿到“当前客户关联的房产子集”。
