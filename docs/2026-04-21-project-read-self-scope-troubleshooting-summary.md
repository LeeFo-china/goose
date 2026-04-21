# 项目列表 `project.read=self` 排查摘要

## 现象

当前普通员工账号在首页项目工作区看不到任何项目摘要。

前端实际联调结果已经确认：

### 1. 权限接口正常返回

`GET /auth/me/permissions`

返回示例：

```json
{
  "data": {
    "authUserId": "f5e28f99-794d-42b8-afa2-59fc9d850b12",
    "employeeId": "23b0aa24-9b4b-4fc2-bed6-9212b922a570",
    "systemRole": "employee",
    "roleCodes": ["employee_base"],
    "permissions": [
      { "code": "project.read", "scope": "self" },
      { "code": "project.update", "scope": "self" }
    ]
  }
}
```

也就是说：

- 当前账号**确实有** `project.read`
- 范围是 `self`

### 2. 首页前端显示条件已满足

前端首页已经识别到：

```json
{
  "canReadProjects": true
}
```

所以首页项目工作区不是被前端权限显隐挡掉的。

### 3. 项目列表接口实际返回空

前端请求：

```http
GET /projects/status?page=1&pageSize=10
```

前端日志：

```json
{
  "page": 1,
  "pageSize": 10,
  "filter": "",
  "keyword": "",
  "total": 0
}
```

这说明：

- 前端请求已正常发出
- 接口已返回成功结构
- 但在当前 `project.read=self` 范围下，后端判定当前员工可见项目数为 `0`

## 结论

本次问题不在前端：

- 不是首页缺少项目摘要列表页
- 不是前端没有识别 `project.read`
- 不是前端没有发项目列表请求

问题集中在后端：

- `/projects/status` 对 `project.read=self` 的数据范围实现，当前把结果过滤成了空

## 后端需要重点排查的点

### 1. `self` 的口径到底是什么

请先明确：`project.read=self` 在项目模块里的定义是什么。

常见可选口径：

- `projects.designer_id = currentEmployeeId`
- `projects.supervisor_id = currentEmployeeId`
- `projects.designer_id = currentEmployeeId OR projects.supervisor_id = currentEmployeeId`
- 其他业务归属规则

如果这条规则没有明确，前后端会一直对不上“员工自己的项目”到底指什么。

### 2. 比对的 ID 维度是否正确

当前权限上下文同时有：

- `authUserId`
- `employeeId`

而项目表里参与归属判断的通常是：

- `designer_id`
- `supervisor_id`

这些字段一般都是 **`employees.id`**，不是 auth user id。

所以必须确认后端是否写成了错误判断：

```ts
project.designer_id === authUserId
```

或：

```ts
project.supervisor_id === authUserId
```

如果是这样，`self` 范围会被全部过滤掉。

正确方向应该是：

```ts
project.designer_id === currentEmployeeId
```

或：

```ts
project.supervisor_id === currentEmployeeId
```

或两者并集。

### 3. `/projects/status` 是否真的接入了范围过滤

需要确认这条接口不是只有：

- `status`
- `keyword`
- `page`
- `pageSize`

而没有真正把 `project.read=self` 的范围条件下推进数据库查询。

## 推荐排查步骤

### 第一步：打印当前权限上下文

在 `/projects/status` 路由或 service 层打印：

```ts
fastify.log.info(
  {
    authUserId: context.authUserId,
    employeeId: context.employeeId,
    permissions: context.permissions,
  },
  'project list permission context',
);
```

至少确认：

- 当前请求上下文里有没有 `employeeId`
- `project.read` 的 scope 是否真的是 `self`

### 第二步：打印最终范围条件

打印本次查询在 `self` 范围下最终拼出来的过滤条件，例如：

```ts
fastify.log.info(
  {
    scope: 'self',
    employeeId: currentEmployeeId,
    designerMatch: true,
    supervisorMatch: true,
  },
  'project list scope condition',
);
```

目标是确认：

- 到底是按 `designer_id`
- 还是按 `supervisor_id`
- 还是两者并集

### 第三步：直接对数据库做验证查询

建议直接查当前员工是否本来就有项目：

```sql
select id, name, designer_id, supervisor_id
from projects
where designer_id = '23b0aa24-9b4b-4fc2-bed6-9212b922a570'
   or supervisor_id = '23b0aa24-9b4b-4fc2-bed6-9212b922a570';
```

如果数据库里有结果，但接口返回 `total = 0`，说明后端范围实现有误。

如果数据库里本来就没有结果，那说明：

- 当前员工确实没有归属项目
- 这时返回空是正确行为

### 第四步：确认分页总数是否是过滤后的结果

`/projects/status` 返回的：

- `pagination.total`
- `pagination.totalPages`

必须基于 `self` 范围过滤后的集合计算。

## 推荐验收 case

### case 1：员工是设计师

前提：

- 员工 A 的 `employeeId = X`
- 某项目 `designer_id = X`

预期：

- `project.read=self` 时
- `/projects/status` 能返回这条项目

### case 2：员工是监理

前提：

- 员工 A 的 `employeeId = X`
- 某项目 `supervisor_id = X`

预期：

- `project.read=self` 时
- `/projects/status` 能返回这条项目

### case 3：员工既不是设计师也不是监理

预期：

- `/projects/status` 返回空列表
- `pagination.total = 0`

## 建议最终口径

如果当前业务上“员工自己的项目”定义为参与项目协作的项目，推荐：

## 当前后端复查结论

这次已按后端实现和真实数据库数据做了一轮复查，结论如下。

### 1. `project.read=self` 当前后端口径是明确的

当前后端实现里，`self` 的项目可见范围是：

- `projects.designer_id = currentEmployeeId`
- 或 `projects.supervisor_id = currentEmployeeId`

也就是：

```text
designer_id = 员工 employeeId
OR
supervisor_id = 员工 employeeId
```

不是按 `authUserId` 比对。

对应后端实现位置：

- `repositories/permissions.ts`
- `listVisibleProjectIds()`

### 2. 当前并不是“后端把有数据过滤没了”

已直接按当前员工的 `employeeId` 做数据库验证查询：

```sql
select id, name, designer_id, supervisor_id, status
from projects
where designer_id = '23b0aa24-9b4b-4fc2-bed6-9212b922a570'
   or supervisor_id = '23b0aa24-9b4b-4fc2-bed6-9212b922a570';
```

查询结果：

- `data = []`
- `error = null`

也就是说：

- 当前数据库里本来就没有这名员工作为设计师或监理归属的项目
- 所以 `project.read=self` 返回空列表是符合当前后端口径的
- 这次不是后端把“本来有的数据”错误过滤成空

### 3. 当前问题更接近“权限范围与业务预期不一致”

目前前端遇到的现象是：

- 首页项目工作区已显示
- `project.read` 权限已识别
- 但列表结果为空

真实原因是：

- 当前员工的 `project.read` 只有 `self`
- 但这名员工当前没有任何 `designer_id / supervisor_id` 命中的项目

所以现在不是接口异常，而是：

- 业务希望首页有项目摘要
- 但当前授权范围只允许看“自己参与的项目”
- 而该员工当前并没有归属项目

## 更新后的建议

如果前端产品预期是“普通员工首页也能看到项目摘要”，需要在业务上二选一：

### 方案 A：保持 `self` 不变

前提：

- 只有员工自己参与的项目才算“可见项目”

结果：

- 当前员工如果没有归属项目，首页项目摘要为空是正确行为
- 前端不应把空列表当成接口异常

### 方案 B：调整为更宽的范围

如果业务希望普通员工在首页能看到更多项目摘要，需要后端把该员工的 `project.read` 范围改成：

- `department`

或给该员工分配更高可见范围的角色模板 / 权限覆盖。

这时首页项目摘要是否显示，就不再取决于员工是否是设计师或监理本人。

## 当前一句话结论

这次不是“后端 `self` 过滤 bug”，而是“当前员工在 `project.read=self` 范围下本来就没有归属项目数据”。

```text
project.read=self
= designer_id = currentEmployeeId
  OR supervisor_id = currentEmployeeId
```

这样员工首页项目摘要、项目列表页、项目详情权限更容易和真实协作关系对齐。

## 一句话结论

本次问题已经定位到后端：

- `project.read=self` 已正常发给前端
- 前端也已正常请求 `/projects/status`
- 但接口返回 `total = 0`

因此需要后端重点检查：

- `self` 范围口径
- `employeeId` / `authUserId` 是否混用
- `/projects/status` 的范围过滤是否真正生效
