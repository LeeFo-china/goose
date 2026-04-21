# 列表状态过滤后端排查摘要

日期：2026-04-21

## 背景

当前前端已经在以下列表页补了本地状态过滤兜底：

- 客户列表
- 员工列表
- 项目列表
- 首页工作区的客户/项目面板

这样做的原因不是前端想长期替代后端过滤，而是当前后端 `status` 过滤结果还不能完全信任。

换句话说：

- 前端之前确实少了一层本地收窄
- 但后端列表接口的 `status` 过滤能力也没有稳定到“前端可以只信接口结果”

建议后端统一排查以下 3 条资源：

- `GET /customers`
- `GET /employees`
- `GET /projects`

---

## 目标

确保下面这类请求都稳定成立：

```http
GET /customers?page=1&pageSize=10&status=following
GET /employees?page=1&pageSize=10&status=active
GET /projects?page=1&pageSize=10&status=constructing
```

要求：

1. `data.list` 中每条记录都必须满足 `status` 条件
2. `data.pagination.total` 必须是过滤后的总数
3. `data.pagination.totalPages` 必须基于过滤后的总数计算
4. 翻页后不能混入其他状态数据
5. `status + keyword` 同时传入时，必须共同生效

---

## 建议排查范围

优先排查这 3 类接口：

### 1. customers

```http
GET /customers?page=1&pageSize=10&status=following
GET /customers?page=1&pageSize=10&status=arrived
GET /customers?page=1&pageSize=10&status=contracted
```

### 2. employees

```http
GET /employees?page=1&pageSize=10&status=pending
GET /employees?page=1&pageSize=10&status=active
GET /employees?page=1&pageSize=10&status=suspended
```

### 3. projects

```http
GET /projects?page=1&pageSize=10&status=measure
GET /projects?page=1&pageSize=10&status=constructing
GET /projects?page=1&pageSize=10&status=completed
```

---

## 推荐排查顺序

### 1. 打印原始 query

先确认接口是否真的收到了 `status`：

```ts
fastify.log.info({ query: request.query }, 'list query');
```

重点看：

- `page`
- `pageSize`
- `status`
- `keyword`

---

### 2. 打印 schema parse 后结果

确认 `status` 没有被 schema 丢掉、吞掉、转成空值：

```ts
const query = ListSchema.parse(request.query);
fastify.log.info({ parsedQuery: query }, 'parsed list query');
```

重点确认：

- `status` 是否还存在
- `status` 是否被 trim 后变空
- 是否出现字段名不一致

---

### 3. 检查 service / repository 是否真的使用了 status

很多问题发生在这里：

- 路由收到了 `status`
- schema 也保留了
- 但数据库查询根本没把 `status` 用进去

正确逻辑应类似：

```ts
if (query.status) {
  builder = builder.eq('status', query.status);
}
```

要确认：

- 过滤条件是否真的存在
- 使用的字段名是不是数据库真实字段 `status`
- 没有写成别的名字，比如 `customer_status` / `project_status`

---

### 4. 检查过滤和分页顺序

必须保证顺序是：

1. 先按权限范围过滤
2. 再按 `status` 过滤
3. 再按 `keyword` 搜索
4. 再计算 `count`
5. 最后分页

不要这样：

1. 先分页
2. 再按状态过滤

否则会出现：

- `list` 数量不对
- `total` 不对
- `totalPages` 不对
- 第 2 页开始混入其他状态

---

### 5. 检查返回结构

最终 response 要确认这几件事：

```json
{
  "data": {
    "list": [...],
    "pagination": {
      "page": 1,
      "pageSize": 10,
      "total": 23,
      "totalPages": 3
    }
  }
}
```

必须满足：

- `list` 中每条数据状态都匹配 query.status
- `total` 是过滤后的总数
- `totalPages` 是过滤后的分页数

---

## 常见问题清单

后端最常见的错误点：

1. schema 里没定义 `status`
2. query 收到了，但 service/repository 没用
3. 用错字段名
4. `status` 过滤写在分页之后
5. `count` 不是基于过滤后的结果
6. 某些接口走 join/view，过滤条件没下推进去
7. `status + keyword` 时只生效了一边

---

## 推荐测试用例

建议每个资源至少补这 4 个自动化用例。

### customers

1. `GET /customers?status=following`
   断言返回 list 全部为 `following`
2. `GET /customers?status=following&keyword=李`
   断言状态和搜索同时生效
3. `GET /customers?page=2&pageSize=10&status=following`
   断言第二页仍然全部为 `following`
4. 校验 `pagination.total / totalPages`

### employees

1. `GET /employees?status=active`
2. `GET /employees?status=active&keyword=张`
3. `GET /employees?page=2&pageSize=10&status=active`
4. 校验 `pagination.total / totalPages`

### projects

1. `GET /projects?status=constructing`
2. `GET /projects?status=constructing&keyword=金地`
3. `GET /projects?page=2&pageSize=10&status=constructing`
4. 校验 `pagination.total / totalPages`

---

## 建议日志模板

建议在排查阶段加这些日志：

```ts
fastify.log.info({ query: request.query }, 'raw list query');
fastify.log.info({ parsedQuery: query }, 'parsed list query');
fastify.log.info(
  {
    status: query.status,
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize,
  },
  'effective list filters',
);
```

如果 service/repository 有 builder，也建议在进入状态过滤分支时打点：

```ts
if (query.status) {
  fastify.log.info({ status: query.status }, 'apply status filter');
}
```

---

## 当前结论

这次已经按文档里的排查方向完成了一轮实际跟进，结论如下：

### 1. customers

`GET /customers` 之前确实存在缺口：

- controller 只用了通用分页 schema
- 只解析了 `page / pageSize`
- 没有解析 `status`
- 也没有解析 `keyword`
- 数据库查询里没有把 `status / keyword` 下推

已完成修复：

- 新增 `CustomerListQuerySchema`
- 列表接口现在支持：
  - `status`
  - `keyword`
  - 过滤后的 `count / totalPages`
- 查询顺序为：
  1. 权限范围
  2. `status`
  3. `keyword`
  4. `count`
  5. 分页

当前关键词匹配字段：

- `name`
- `phone`

对应代码：

- `schema/customer.ts`
- `controllers/customer/index.ts`

### 2. employees

`GET /employees` 之前也存在同类问题：

- controller 只用了通用分页 schema
- 只解析了 `page / pageSize`
- 没有解析 `status`
- 也没有解析 `keyword`
- 数据库查询里没有把 `status / keyword` 下推

已完成修复：

- 新增 `EmployeeListQuerySchema`
- 列表接口现在支持：
  - `status`
  - `keyword`
  - 过滤后的 `count / totalPages`
- 查询顺序为：
  1. 权限范围
  2. `status`
  3. `keyword`
  4. `count`
  5. 分页

当前关键词匹配字段：

- `name`
- `phone`

对应代码：

- `schema/employee.ts`
- `controllers/employee/index.ts`

### 3. projects

`GET /projects` 本次核查时已经具备以下能力：

- 支持 `status`
- 支持 `keyword`
- `count / totalPages` 基于过滤后结果
- 过滤顺序正确

所以这次没有对 `projects` 列表接口做代码修改，只做了现状复核。

对应代码：

- `schema/projects.ts`
- `controllers/projects/index.ts`

## 本次验证结果

本次除了本地构建，还用真实 Supabase 数据做了实际校验。

### 1. 构建验证

已执行：

```bash
bun build app.ts --outdir dist --target node
```

结果：通过。

### 2. 实数验证

#### customers

- `status=following`
  - `total = 8`
  - 抽样返回全部匹配 `following`
- `status=following&keyword=奔驰`
  - `total = 1`
  - 状态和关键词同时生效
- 分页验证
  - 第 2 页仍全部匹配 `following`
  - `page = 2`
  - `pageSize = 3`
  - `total = 8`
  - `totalPages = 3`

#### employees

- `status=active`
  - `total = 16`
  - 抽样返回全部匹配 `active`
- `status=active&keyword=固始`
  - `total = 1`
  - 状态和关键词同时生效
- 分页验证
  - 第 2 页仍全部匹配 `active`
  - `page = 2`
  - `pageSize = 5`
  - `total = 16`
  - `totalPages = 4`

#### projects

- `status=constructing`
  - `total = 2`
  - 抽样返回全部匹配 `constructing`
- `status=constructing&keyword=项目`
  - `total = 2`
  - 状态和关键词同时生效

## 更新后的结论

当前状态已经不是“后端 3 条列表接口都不可信”，而是：

- `customers`：本次已补齐 `status + keyword + count + 分页`
- `employees`：本次已补齐 `status + keyword + count + 分页`
- `projects`：原本已正常，本次已复核

因此这轮跟进后，后端这 3 条核心列表接口的状态过滤链路已经收稳。

前端保留本地兜底不会出错，但从后端现状看，后续已经具备评估是否逐步移除前端本地状态二次过滤的条件。

## 后续建议

如果要继续收尾，优先级建议是：

1. 给 `customers / employees / projects` 补自动化用例，而不是继续靠手工验证
2. 把同类列表查询统一收口成专用 list query schema，避免再退回只解析 `page / pageSize`
3. 如果前端准备移除本地兜底，先灰度观察一轮真实请求结果和分页行为
