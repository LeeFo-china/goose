# 员工首页今日工作筛选后端对接说明

日期：2026-05-08

## 一、已支持接口

员工首页客户和项目列表已支持独立时间维度筛选：

```http
GET /customers
GET /projects/status
GET /projects
```

新增可选参数：

```text
work_scope=all | today
```

规则：

- 不传：等同 `all`
- `work_scope=all`：保持原列表行为
- `work_scope=today`：只返回今天相关的工作内容
- 空字符串、`undefined`、`null`：按不传处理
- 其它值：返回 400，提示 `work_scope must be one of: all, today`

## 二、时间口径

`today` 使用业务时区 `Asia/Shanghai`。

后端按以下范围过滤：

```text
today_start = 当天 00:00:00.000 Asia/Shanghai
today_end   = 次日 00:00:00.000 Asia/Shanghai
```

查询条件使用：

```text
timestamp >= today_start AND timestamp < today_end
```

不会依赖数据库或服务器本地时区。

## 三、客户 today 规则

接口：

```http
GET /customers?work_scope=today
```

返回当前员工权限范围内，且满足任一今日条件的客户：

- 客户今天新建：`customers.created_at`
- 客户今天更新：`customers.updated_at`
- 今天有跟进记录：`customer_follow_ups.created_at`
- 今天计划跟进：`customer_follow_ups.next_follow_at`

组合过滤顺序：

```text
员工权限范围
-> status/source/customer_origin
-> keyword
-> follow
-> work_scope=today
-> count
-> page/pageSize
```

## 四、项目 today 规则

接口：

```http
GET /projects/status?work_scope=today
```

返回当前员工项目权限范围内，且满足任一今日条件的项目：

- 项目今天新建：`projects.created_at`
- 项目今天更新：`projects.updated_at`
- 今天有施工日志：`project_logs.created_at`
- 今天有工序验收创建：`project_acceptances.created_at`
- 今天有工序验收提交：`project_acceptances.submitted_at`
- 今天有工序验收复核：`project_acceptances.reviewed_at`
- 今天有客户确认验收：`project_acceptances.customer_confirmed_at`

组合过滤顺序：

```text
项目权限范围
-> ownership=self/all
-> status
-> keyword
-> work_scope=today
-> count
-> page/pageSize
```

说明：

- `GET /projects` 也同步支持 `work_scope`，便于后台和其它端复用。
- 当前项目 today 未包含任务中心待办表，只覆盖项目主表、施工日志和工序验收动态。

## 五、调用示例

### 客户

全部客户：

```http
GET /customers?page=1&pageSize=10
```

今天客户：

```http
GET /customers?page=1&pageSize=10&work_scope=today
```

状态 + 今天：

```http
GET /customers?page=1&pageSize=10&status=following&work_scope=today
```

关键词 + 今天：

```http
GET /customers?page=1&pageSize=10&keyword=张三&work_scope=today
```

### 项目

全部项目：

```http
GET /projects/status?page=1&pageSize=10&ownership=self
```

今天项目：

```http
GET /projects/status?page=1&pageSize=10&ownership=self&work_scope=today
```

状态 + 今天：

```http
GET /projects/status?page=1&pageSize=10&ownership=self&status=constructing&work_scope=today
```

关键词 + 今天：

```http
GET /projects/status?page=1&pageSize=10&ownership=self&keyword=湖畔&work_scope=today
```

## 六、返回结构

返回结构保持不变。

客户：

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
  }
}
```

项目：

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
  }
}
```

要求：

- `total` 是权限、状态、关键词和 today 过滤后的总数。
- 无结果返回 `list: []`，不会因为无数据返回错误。
- 今日过滤在分页前完成。

## 七、小程序端接入建议

客户队列增加：

```ts
timeScope: "all" | "today"
```

项目队列增加：

```ts
timeScope: "all" | "today"
```

请求参数：

```ts
{
  page,
  pageSize,
  ...(timeScope === "today" ? { work_scope: "today" } : {}),
}
```

UI 建议：

```text
全部 / 今天
```

时间筛选应与状态筛选、关键词搜索、项目归属筛选组合生效。
