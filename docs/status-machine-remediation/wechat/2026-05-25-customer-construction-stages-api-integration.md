# 客户侧施工阶段状态接口对接说明

## 背景

微信小程序客户项目详情页需要展示施工阶段 timeline。员工端当前使用：

```http
GET /projects/:id/construction-stages
```

该接口属于员工/租户侧接口，会要求员工租户上下文。客户登录态调用时可能返回：

```json
{
  "code": "TENANT_CONTEXT_REQUIRED",
  "message": "当前操作必须在租户上下文中执行"
}
```

同时，客户侧如果继续用施工日志推断当前阶段，会和员工端施工阶段状态不一致。例如员工端已推进到“水电”，客户侧仍可能停留在“拆改”。

## 对接目标

新增客户侧施工阶段状态接口，客户项目详情页只调用 customer 命名空间接口，不再调用员工侧 `/projects/:id/construction-stages`。

## 是否需要小程序对接

需要。

原因：

- 新接口属于客户登录态专用接口，路径在 `/customer` 命名空间下。
- 小程序客户侧如果继续调用员工侧 `/projects/:id/construction-stages`，可能因为缺少员工租户上下文返回 `TENANT_CONTEXT_REQUIRED`。
- 施工阶段 timeline 应以该接口返回的 `current_stage`、`stages` 为准，避免继续从施工日志列表自行推断导致客户侧和员工端阶段不一致。

小程序本次必须调整：

1. 客户项目详情页新增请求 `GET /customer/projects/:id/construction-stages`。
2. 客户项目详情 timeline 的阶段状态优先消费该接口返回的 `stages`、`current_stage`、`next_stage`。
3. 页面 `useDidShow` 或客户验收/复核返回详情页时，重新拉取该接口。
4. 移除客户侧对员工端 `/projects/:id/construction-stages` 的调用。
5. 接口失败时可以临时回退到日志推断，但不能把 `TENANT_CONTEXT_REQUIRED` 直接 toast 给客户。

## 新增接口

```http
GET /customer/projects/:id/construction-stages
```

### 鉴权与权限

- 需要客户登录态。
- 后端必须校验 `:id` 对应项目属于当前客户。
- 项目不属于当前客户时返回 404 或 forbidden，不能泄露项目存在性。
- 不要求员工租户上下文，不能走 `getRequiredTenantContext()`。
- 租户范围应来自客户身份或项目自身租户，确保跨租户隔离。

### 业务逻辑

该接口应复用员工端施工阶段状态计算逻辑，保证返回结果和：

```http
GET /projects/:id/construction-stages
```

一致。

客户侧只读取展示，不提供创建日志、发起验收等员工操作能力。

## 返回结构

返回结构保持和员工端施工阶段接口一致：

```json
{
  "project_id": "b2f0a85c-0084-44ba-a988-438b6dcbec23",
  "project_status": "constructing",
  "required_stage_codes": [
    "demolition",
    "plumbing_electrical",
    "tiling",
    "woodwork",
    "painting",
    "installation"
  ],
  "required_completed": false,
  "current_stage": "plumbing_electrical",
  "next_stage": {
    "stage_code": "plumbing_electrical",
    "stage_label": "水电",
    "status": "in_progress",
    "is_required": true,
    "is_completion": false,
    "can_create_log": true,
    "can_create_acceptance": true,
    "acceptance_id": null,
    "acceptance_status": null,
    "latest_log": null,
    "blocked_reason": null
  },
  "missing_required_stages": [
    {
      "stage_code": "plumbing_electrical",
      "stage_label": "水电"
    }
  ],
  "stages": [
    {
      "stage_code": "demolition",
      "stage_label": "拆改",
      "status": "accepted",
      "is_required": true,
      "is_completion": false,
      "can_create_log": false,
      "can_create_acceptance": false,
      "acceptance_id": "uuid",
      "acceptance_status": "customer_confirmed",
      "latest_log": {
        "id": "uuid",
        "node_name": "拆改完成",
        "content": "现场拆改完成",
        "created_at": "2026-05-25T10:00:00.000Z"
      },
      "blocked_reason": null
    }
  ],
  "all_stage_codes": [
    "measure",
    "demolition",
    "plumbing_electrical",
    "tiling",
    "woodwork",
    "painting",
    "installation",
    "completion"
  ]
}
```

## 前端消费方式

微信小程序客户项目详情页：

1. 首屏加载扩展数据时请求 `GET /customer/projects/:id/construction-stages`。
2. 页面 `useDidShow` 时刷新该接口，避免客户复核后返回详情页仍显示旧状态。
3. timeline 当前阶段优先使用 `current_stage`。
4. 如果接口失败，前端可临时回退到施工日志推断，但不展示后端租户上下文错误 toast。
5. 客户侧不得调用 `/projects/:id/construction-stages`。

## 验收用例

1. 客户登录态访问自己的项目，接口返回 200。
2. 客户登录态访问非本人项目，接口返回 404 或 forbidden。
3. 客户项目详情页不再出现“当前操作必须在租户上下文中执行”。
4. 员工端项目阶段为“水电”时，客户项目详情 timeline 也显示到“水电”。
5. 客户复核通过上一工序后，返回客户项目详情页，timeline 能刷新为后端最新阶段。

## 当前小程序预期

小程序服务层新增方法：

```ts
ProjectAcceptanceService.getCustomerConstructionStages(projectId)
```

对应路径：

```http
GET /customer/projects/:id/construction-stages
```

后端接口上线后，小程序客户项目详情会使用该接口作为施工阶段 timeline 的主要状态源。

## 对接确认清单

- [ ] 服务层新增 `ProjectAcceptanceService.getCustomerConstructionStages(projectId)`。
- [ ] 客户项目详情首屏加载时调用客户侧施工阶段接口。
- [ ] 客户项目详情 `useDidShow` 时刷新客户侧施工阶段接口。
- [ ] timeline 使用 `stages` 渲染所有阶段，使用 `current_stage` 标记当前阶段。
- [ ] 不再从客户侧施工日志列表推断当前施工阶段作为主要状态源。
- [ ] 不再调用员工侧 `/projects/:id/construction-stages`。
- [ ] 验证客户验收通过上一阶段后，返回项目详情能看到下一阶段解锁。
