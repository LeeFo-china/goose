# 客户资料编辑页房产落库对接摘要

## 背景

当前“修改客户资料”页面会编辑这几类房产信息：

- 小区 `community`
- 楼栋房号 `building_info`
- 面积 `area`
- 户型 `layout`

但数据库里这些字段不在 `customers` 表，而在独立的 `properties` 表：

- `customers`：客户基础信息
- `properties`：客户关联房产

因此，前端如果只调用 `POST /customers` 或 `PUT /customers/:id`，房产信息不会自动落库。

## 当前前端处理

前端现已做兼容处理：

- 编辑客户时：
  - 先调用 `PUT /customers/:id`
  - 再调用 `GET /properties?customer_id=:id&page=1&pageSize=1`
  - 有房产则 `PUT /properties/:propertyId`
  - 无房产则 `POST /properties`
- 新建客户时：
  - 先调用 `POST /customers`
  - 取返回的 `customer.id`
  - 再调用 `POST /properties`

也就是说，当前在现有接口能力下，前端已经可以把客户页里的房产信息写入 `properties`。

## 当前后端状态

这次后端已经按更稳定的一体化方案补齐，前端现在可以直接走客户接口，不必再自己编排两套写入。

当前已支持：

1. `POST /customers`
   - 支持接收嵌套 `property`
2. `PUT /customers/:id`
   - 支持接收嵌套 `property`
3. `PATCH /customers/:id`
   - 同样支持接收嵌套 `property`
4. `GET /customers/:id/detail`
   - 返回主房产平铺字段
   - 返回 `property_id`
   - 同时保留 `properties` 和 `property_count`

也就是说，这份文档里建议的方案 A 和方案 B，现在后端都已经具备了核心能力。

## 后端返回口径

### 1. 客户详情接口

当前 `GET /customers/:id/detail` 会返回：

```json
{
  "data": {
    "id": "customer-id",
    "name": "张三",
    "phone": "13800000000",
    "status": "following",
    "source": "douyin",
    "owner_id": "employee-id",
    "property_id": "property-id",
    "community": "橙城花园",
    "building_info": "3号楼2单元1502",
    "layout": "三室两厅",
    "area": 128,
    "properties": [
      {
        "id": "property-id",
        "community": "橙城花园",
        "building_info": "3号楼2单元1502",
        "layout": "三室两厅",
        "area": 128
      }
    ],
    "property_count": 1
  }
}
```

其中主房产口径为：

- 按 `created_at desc` 取当前客户名下第一条房产

这个口径与前端之前用 `/properties?page=1&pageSize=1` 的现有兼容逻辑保持一致。

### 2. 客户保存接口

当前 `POST /customers`、`PUT /customers/:id`、`PATCH /customers/:id` 都支持：

```json
{
  "name": "张三",
  "phone": "13800000000",
  "source": "douyin",
  "status": "following",
  "owner_id": "employee-id",
  "property": {
    "community": "橙城花园",
    "building_info": "3号楼2单元1502",
    "layout": "三室两厅",
    "area": 128
  }
}
```

保存语义：

- 创建客户时：
  - 先创建客户
  - 如果带了 `property`，则同步创建一条房产
- 编辑客户时：
  - 如果客户已有房产，则更新主房产
  - 如果客户还没有房产，则新建一条房产
  - 不会因为前端只改房产而要求前端额外再调 `/properties`

## 后端更优方案

虽然前端之前已兼容，但后端最好补一层更稳定的一体化能力，避免前端自己拼两次请求。

当前这层能力已经落地。

文档里原先的两种方案保留如下，作为对照说明。

### 方案 A：客户详情接口返回主房产 ID

建议 `GET /customers/:id/detail` 返回：

```json
{
  "data": {
    "id": "customer-id",
    "name": "张三",
    "phone": "13800000000",
    "status": "following",
    "source": "douyin",
    "owner_id": "employee-id",
    "community": "橙城花园",
    "building_info": "3号楼2单元1502",
    "layout": "三室两厅",
    "area": 128,
    "property_id": "property-id"
  }
}
```

这样前端编辑时就不需要先查 `/properties` 再猜哪条是主房产。

### 方案 B：客户保存接口直接支持主房产

建议 `POST /customers` 和 `PUT /customers/:id` 支持接收嵌套房产字段：

```json
{
  "name": "张三",
  "phone": "13800000000",
  "source": "douyin",
  "status": "following",
  "owner_id": "employee-id",
  "property": {
    "community": "橙城花园",
    "building_info": "3号楼2单元1502",
    "layout": "三室两厅",
    "area": 128
  }
}
```

后端负责：

- 创建客户时同步创建一条主房产
- 编辑客户时同步更新主房产
- 返回最新客户详情

这对前端是最简洁、最稳定的方案。

## 推荐前端接入方式

前端现在推荐直接收口成以下方式：

1. 进入编辑页时：
   - 调 `GET /customers/:id/detail`
   - 直接读取：
     - `property_id`
     - `community`
     - `building_info`
     - `layout`
     - `area`
2. 保存时：
   - 直接调 `PUT /customers/:id` 或 `PATCH /customers/:id`
   - 在请求体里带 `property`
3. 新建时：
   - 直接调 `POST /customers`
   - 在请求体里带 `property`

前端不再推荐继续走：

- 先保存客户
- 再查 `/properties`
- 再自己决定 `POST /properties` 还是 `PUT /properties/:id`

## 后端验收标准

### 新建客户

请求：

```json
{
  "name": "李四",
  "phone": "13900000000",
  "source": "referral",
  "status": "potential",
  "owner_id": "employee-id",
  "property": {
    "community": "锦绣城",
    "building_info": "8栋1201",
    "layout": "两室两厅",
    "area": 89
  }
}
```

验收：

- `customers` 表写入客户
- `properties` 表写入一条 `customer_id = 新客户 id` 的房产
- 客户详情接口能回出这条房产信息

### 编辑客户

请求：

```json
{
  "name": "李四",
  "phone": "13900000000",
  "status": "following",
  "property": {
    "community": "锦绣城",
    "building_info": "8栋1501",
    "layout": "三室一厅",
    "area": 102
  }
}
```

验收：

- 客户基础信息正常更新
- 原主房产被更新，而不是无意义重复新增多条
- 重新进入客户详情页能看到更新后的房产摘要

## 当前验收结论

当前后端实现已经满足这份文档的核心前端需求：

- 客户保存接口支持嵌套 `property`
- 客户详情接口返回主房产平铺字段和 `property_id`
- 房产信息不再要求前端额外编排第二套写接口
