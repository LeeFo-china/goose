# 项目日志日历接口方案

本文档用于说明如何基于 `supabase.public.project_logs` 实现项目日志日历接口，并给出更适合线上维护的落地方案。

## 目标

前端日历视图需要知道：

- 哪些日期有日志
- 每天日志数量
- 每天用于日历格子展示的简短标签

这个接口本质上不是“日志分页列表”，而是“日志日期索引”。

---

## 接口建议

- 路径：`GET /project-logs/projects/calendar`
- 鉴权：沿用现有 `Authorization: Bearer <token>`
- 查询参数：
  - `project_id: string`，必填，合法 UUID

### 为什么单独做接口

现有 `GET /project-logs/projects` 是分页日志列表接口，不适合直接拿来做日历：

- 前端一次只拿到一页
- 日历需要知道所有有日志的日期
- 为了打点去把全部日志分页拉完，成本高且不稳定

所以这个接口应该专门返回“日期聚合结果”。

---

## 返回结构建议

建议不要分页。

原因：

- 日历需要的是完整日期索引，而不是传统列表翻页
- 分页会让月视图、跨月打点、快速切换月份都变复杂
- 返回的是聚合后的日期数据，数据量通常远小于原始日志

### 推荐返回结构

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

### 字段约定

- `date`
  - 格式固定为 `YYYY-MM-DD`
  - 必须由后端按业务时区计算后返回
  - 不要让前端自己从 `created_at` 推导日期
- `count`
  - 当天日志条数
- `node_name`
  - 用于日历格子里的短标签
  - 固定取“当天最新一条日志”的 `node_name`
  - 必须有稳定规则，避免同一天刷新后展示结果变化

---

## 错误响应

参数不合法时保持现有风格一致：

```json
{
  "statusCode": 400,
  "code": "VALIDATION_ERROR",
  "error": "Bad Request",
  "message": "字段 [project_id] 校验失败: 无效的项目ID"
}
```

---

## 推荐实现方式

最佳实践是把聚合逻辑下沉到 Supabase/Postgres，用 RPC 返回结果，再由 Fastify 做参数校验、鉴权和错误包装。

不建议：

- 在 Fastify 层先查出全部日志再用 JavaScript 聚合
- 复用现有分页接口给前端拼日历
- 让前端自己处理时区切天逻辑

### 为什么推荐 RPC

这个需求本质上是数据库聚合：

- 先按 `project_id` 过滤
- 再按业务日期分组
- 再从当天日志里稳定选出一个 `node_name`

这些都更适合放在数据库层完成。

RPC 的好处：

- 性能更稳
- 逻辑更集中
- 结果更小
- 时区规则统一
- 后续支持权限和扩展字段更容易

---

## Supabase 查询建议

### 核心规则

1. 按 `project_id` 过滤 `project_logs`
2. 按业务时区切天
3. 每天统计日志数量
4. 每天固定取“最新一条日志”的 `node_name`
5. 按日期升序返回

### 时区规则

建议明确使用业务时区 `Asia/Shanghai`。

原因：

- `project_logs.created_at` 当前是 `timestamp with time zone`
- 如果不在后端统一切天，前端很容易因为本地时区不同出现日期偏移
- 日历视图对“哪一天有日志”非常敏感，不能依赖前端猜测

### 推荐 RPC 设计

函数名建议：

- `public.get_project_log_calendar`

建议入参：

- `project_uuid uuid`
- `timezone_name text default 'Asia/Shanghai'`

建议返回列：

- `date text`
- `count bigint`
- `node_name text`

### SQL 实现思路

推荐使用窗口函数，确保 `node_name` 取值稳定：

```sql
with ranked as (
  select
    (created_at at time zone timezone_name)::date as biz_date,
    node_name,
    created_at,
    id,
    row_number() over (
      partition by (created_at at time zone timezone_name)::date
      order by created_at desc, id desc
    ) as rn
  from public.project_logs
  where project_id = project_uuid
)
select
  biz_date::text as date,
  count(*) as count,
  max(case when rn = 1 then node_name end) as node_name
from ranked
group by biz_date
order by biz_date asc;
```

### 为什么不用普通 group by 直接取 node_name

因为普通聚合下 `node_name` 没有天然稳定规则。

如果一天里有多条日志：

- 直接 `max(node_name)` 没有业务意义
- 直接 `min(node_name)` 也没有业务意义
- 不加规则的第一条/最后一条在不同执行计划下可能不稳定

所以应显式定义：

- 当天最新日志优先
- 同秒冲突时按 `id desc` 再次稳定排序

---

## 数据库索引建议

当前 `project_logs` 表定义见 [20260403154952_create_project_logs.sql](/Users/leefo/Public/work/gooes/supabase/migrations/20260403154952_create_project_logs.sql)，但还没有适合该查询的索引。

建议新增：

```sql
create index if not exists idx_project_logs_project_id_created_at
on public.project_logs(project_id, created_at desc);
```

原因：

- 日历接口先按 `project_id` 过滤
- 同时依赖 `created_at` 做排序与分组前处理
- 对现有项目日志列表接口也有帮助

---

## Fastify 实现建议

### 路由

- 新增路由：`GET /project-logs/projects/calendar`

### 参数校验

不要复用现有 `ProjectLogQuerySchema`，建议单独新增：

- `ProjectLogCalendarQuerySchema`

建议结构：

```ts
export const ProjectLogCalendarQuerySchema = z.object({
  project_id: z.string().uuid("无效的项目ID"),
});
```

原因：

- 这个接口不需要分页
- `project_id` 对日历接口应当是必填
- 单独 schema 语义更清晰

### 控制器职责

控制器只做以下事情：

1. 校验 query
2. 调用 Supabase RPC
3. 处理数据库错误
4. 返回统一响应结构

不建议在控制器里：

- 手写聚合逻辑
- 查询原始全量日志后再 map/reduce
- 编写 `console.log`

---

## 权限建议

权限策略应与现有 `GET /project-logs/projects` 保持一致。

如果当前系统只有登录鉴权，没有项目级权限控制，那么这个接口先保持一致，不要单独发明一套权限逻辑。

如果后续要做严格权限控制，推荐两种方式：

1. 在 RPC 内部结合项目成员关系做过滤
2. 在 Fastify 控制器层先校验当前用户是否有该 `project_id` 访问权限，再调用 RPC

在权限模型没有明确之前，不建议先在这个接口里临时加特殊分支。

---

## 前端使用建议

前端应把返回结果视为“日历索引数据”，而不是日志详情。

推荐职责拆分：

- 日历接口：负责哪些日期有日志、每天多少条、当天展示标签
- 日志列表接口：负责点击某一天后查看日志详情

前端拿到 `list` 后，建议转成以 `date` 为 key 的映射：

```ts
const dateMap = new Map(
  res.data.list.map((item) => [item.date, item]),
);
```

这样渲染日历格子时可以直接按 `YYYY-MM-DD` 查找。

---

## 结论

基于 `project_logs` 表实现这个接口是可行的，而且是合理的。

推荐落地方案：

1. 新增 `GET /project-logs/projects/calendar`
2. 新增 `ProjectLogCalendarQuerySchema`
3. 在 Supabase 中新增 `get_project_log_calendar` RPC
4. 统一使用 `Asia/Shanghai` 作为业务切天时区
5. 给 `project_logs(project_id, created_at desc)` 增加索引
6. 返回结构去掉分页，只保留 `project_id + list`

这个方案比直接复用分页接口更符合接口职责，也更适合后续维护。
