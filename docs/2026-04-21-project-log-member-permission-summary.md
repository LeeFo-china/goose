# 项目施工跟进成员权限对接摘要

> 已废弃：这份文档基于旧口径 `can_write_log`。
>
> 当前请改看新的统一权限模型文档：
> [2026-04-22-project-log-permission-model-unification-summary.md](/Users/leefo/Public/work/orange/docs/2026-04-22-project-log-permission-model-unification-summary.md:1)
>
> 最新口径：
> - 不再返回 `can_write_log`
> - 统一走 `/auth/me/permissions`
> - 施工日志写入权限改为 `project_log.create`
> - 项目详情页除评论板块外的其它交互，也统一按 `project_log.create` 收口

## 目标

实现这条规则：

- 只有属于该项目的成员，才可以写施工跟进
- 不属于该项目的员工，不能进入“写施工跟进”页面
- 即使手输路由或直接调接口，也必须被拦截

## 当前前端已实现

前端现在已经做了两层拦截：

1. 项目详情页点击“添加日志”前先校验
2. 日志编辑页加载时再校验一次

当前前端能判断的“项目成员”口径只有：

- `designer_id`
- `supervisor_id`

也就是说，当前前端逻辑等价于：

```ts
isProjectMember =
  employeeId === project.designer_id ||
  employeeId === project.supervisor_id;
```

这是基于当前项目数据结构能做的最小可用实现。

## 当前问题

如果后端业务上认定“项目成员”不只包含设计师和项目监理，而还包括：

- 项目经理
- 工长
- 施工员
- 其他协作成员

那么仅靠前端判断 `designer_id / supervisor_id` 会不完整。

所以这条权限最终应由后端给出统一成员口径。

## 后端推荐方案

推荐后端在项目详情或独立接口里直接返回“当前员工是否可写施工跟进”的结果，避免前端猜。

### 方案 A：项目详情直接返回写权限

推荐 `GET /projects/:id` 或 `GET /projects/:id/detail` 返回：

```json
{
  "data": {
    "id": "project-id",
    "name": "张三·橙城花园",
    "designer_id": "employee-a",
    "supervisor_id": "employee-b",
    "can_write_log": true
  }
}
```

这样前端最简单：

- 有 `can_write_log = true` 才显示/允许进入写日志页
- 否则直接拦截

### 方案 B：单独给项目成员权限接口

推荐新增：

```http
GET /projects/:id/log-permission
```

返回：

```json
{
  "data": {
    "project_id": "project-id",
    "employee_id": "employee-id",
    "is_member": true,
    "can_write_log": true
  },
  "message": "success"
}
```

这条接口适合后端成员口径比较复杂时使用。

## 后端最低要求

如果后端暂时不想加新字段或新接口，至少要保证：

1. `GET /projects/:id`
   必须稳定返回：
   - `designer_id`
   - `supervisor_id`

2. `POST /project-logs`
   必须在后端强校验当前员工是否属于该项目成员

也就是说：

- 前端可以先拦一层
- 但最终能不能创建施工日志，必须由后端 `POST /project-logs` 决定

## 后端校验规则建议

### 当前最小口径

如果后端目前也只有这两个归属字段，建议先统一成：

```text
当前员工 employeeId === projects.designer_id
或
当前员工 employeeId === projects.supervisor_id
```

### 后续可扩展口径

如果后端后续加入其他项目成员表或字段，例如：

- `project_members`
- `project_manager_id`
- `worker_ids`

则统一在后端扩展为：

```text
项目成员 = 设计师 + 项目监理 + 其他项目协作成员
```

前端不需要知道具体细节，只吃：

- `can_write_log`
或
- `is_member`

## 推荐错误返回

当非项目成员尝试写施工跟进时，推荐返回：

```json
{
  "statusCode": 403,
  "code": "FORBIDDEN",
  "error": "Forbidden",
  "message": "只有项目成员才可以写施工跟进"
}
```

这样前端可以直接复用提示文案。

## 前端当前联调口径

当前前端会先调：

- `/auth/me/permissions`
  - 取 `employeeId`

再调：

- `/projects/:id`
  - 取 `designer_id / supervisor_id`

然后判断是否允许进入：

```ts
employeeId === designer_id || employeeId === supervisor_id
```

所以如果后端这两个字段本身就不准确，前端也会跟着误判。

## 推荐验收标准

### case 1：设计师写施工跟进

前提：

- 当前员工 `employeeId = A`
- 项目 `designer_id = A`

预期：

- 可以进入写施工跟进页面
- `POST /project-logs` 成功

### case 2：项目监理写施工跟进

前提：

- 当前员工 `employeeId = B`
- 项目 `supervisor_id = B`

预期：

- 可以进入写施工跟进页面
- `POST /project-logs` 成功

### case 3：无关员工尝试写施工跟进

前提：

- 当前员工既不是设计师也不是项目监理

预期：

- 前端进入前提示并拒绝
- 即使绕过前端直接调 `POST /project-logs`
- 后端也返回 `403`

## 一句话结论

前端现在已经先按：

- `designer_id`
- `supervisor_id`

做了最小可用拦截。

后端如果想把“只有项目成员可写施工跟进”这条规则真正做稳，建议：

1. 明确项目成员口径
2. 给项目详情补 `can_write_log`
   或新增 `GET /projects/:id/log-permission`
3. 在 `POST /project-logs` 做最终强校验

## 当前后端状态

这次后端已按“方案 A + 最低要求”完成对齐。

当前已落地：

1. `GET /projects/:id`
   - 返回 `designer_id`
   - 返回 `supervisor_id`
   - 新增返回 `can_write_log`
2. `POST /project-logs`
   - 已做后端强校验
   - 非项目成员会被 `403` 拦截
   - `employee_id` 由后端按当前登录员工自动写入
3. `GET /project-logs/projects`
   - 已接入 `project.read`
4. `GET /project-logs/projects/calendar`
   - 已接入 `project.read`

## 当前项目成员口径

当前后端与前端最小可用口径统一为：

```text
当前员工 employeeId === projects.designer_id
或
当前员工 employeeId === projects.supervisor_id
```

也就是说，当前“项目成员”只按：

- 设计师
- 项目监理

来判定。

后续如果要扩展到：

- 项目经理
- 工长
- 施工员
- 其他协作成员

应继续由后端统一扩口径，而不是让前端自己猜。

## 当前接口口径

### 1. `GET /projects/:id`

当前返回里，前端可以直接读取：

- `designer_id`
- `supervisor_id`
- `can_write_log`

推荐前端优先使用：

- `can_write_log`

作为是否允许进入“写施工跟进”页的最终展示口径。

### 2. `POST /project-logs`

当前请求体不再要求前端传：

- `employee_id`

后端会自动用当前 token 对应的 `employeeId` 写入。

当前后端会先做：

1. 登录态校验
2. 项目存在性校验
3. 当前员工是否为项目成员校验

如果不是项目成员，返回：

```json
{
  "statusCode": 403,
  "code": "FORBIDDEN",
  "error": "Forbidden",
  "message": "只有项目成员才可以写施工跟进"
}
```

### 3. `GET /project-logs/projects`

当前已按 `project.read` 做后端校验。

也就是说：

- 只有能看该项目的员工，才能看该项目日志列表

### 4. `GET /project-logs/projects/calendar`

当前也已按 `project.read` 做后端校验。

### 5. `GET /project_log_comments`

当前员工侧也已按所属日志对应项目的 `project.read` 做后端校验。

也就是说：

- 只要当前员工能看该项目
- 即使 `can_write_log = false`
- 仍然可以查看日志评论列表

### 6. `POST /project_log_comments`

当前员工侧也已按所属日志对应项目的 `project.read` 做后端校验。

也就是说：

- 只要当前员工能看该项目
- 即使不是项目成员、不能写施工跟进
- 仍然可以回复评论

## 本次后端改动

对应代码：

- `services/access-policy.ts`
  - 新增 `canWriteProjectLog()`
- `controllers/projects/index.ts`
  - `GET /projects/:id` 补 `can_write_log`
- `schema/project-logs.ts`
  - 创建日志 schema 不再要求前端传 `employee_id`
- `controllers/project-logs/index.ts`
  - 重写 `create`
  - 对日志列表 / 日历补项目读权限校验
- `controllers/project-log-comments/index.ts`
  - 对评论列表 / 评论回复补项目读权限校验

## 更新后的前端接入建议

前端现在建议按这个顺序判断：

1. 先查 `/auth/me/permissions`
   - 确认当前账号至少有项目读取能力
2. 再查 `/projects/:id`
3. 直接读：
   - `can_write_log`

不再推荐继续只靠：

```ts
employeeId === designer_id || employeeId === supervisor_id
```

虽然当前后端成员口径与这条规则一致，但后端已经给出了稳定字段，前端应优先使用后端布尔结果。

如果：

- `project.read = true`
- 但 `can_write_log = false`

在“项目详情页”这个页面里，前端应把当前员工视为：

- 可以看
- 但除评论板块外不可操作

前端页面建议保留可用：

- 项目日志列表
- 评论板块
- 评论回复
- 按日期筛选日志

前端页面建议隐藏或禁用：

- “添加日志”
- 编辑/删除日志类按钮
- 进入写施工跟进页的入口
- 项目签约
- 项目介绍费“去配置”
- 项目详情页里的其他任何按钮和可写交互

也就是说，在项目详情页里应按这个页面级规则处理：

- `project.read`
  - 决定这个页面能不能进入、能不能看日志/评论/日历
- `can_write_log`
  - 当前阶段同时作为“是否为项目成员”的前端判定
  - 只要是 `false`
  - 这个详情页除评论板块外，其它交互都不要开放

这里要区分两层语义：

- 页面交互口径
  - 非项目成员在项目详情页只保留评论能力
- 后端接口权限口径
  - `project.update`
  - `project_referral.read`
  - `project_referral.manage`

后端这些权限码仍然存在，是给独立业务接口和其他页面使用的；  
但在“项目详情页”上，不应继续单独拿它们决定按钮显隐，否则就会出现：

- 不是项目成员
- 但还能点“项目签约”
- 还能点“去配置”

这种与当前产品规则冲突的结果。

所以项目详情页正确显隐建议应改成：

- 先看 `project.read`
  - 没有就整个页面不展示
- 再看 `can_write_log`
  - 为 `false`：只保留评论板块相关交互
  - 为 `true`：再按具体业务权限展示其它按钮

## 当前一句话结论

这条规则现在已经由后端做稳了：

- 项目详情可直接返回 `can_write_log`
- 非项目成员即使绕过前端，也不能成功 `POST /project-logs`
- 非项目成员只要有 `project.read`，仍然可以看日志、看评论、按日期筛选并回复评论
