# 平台技术服务试用核心：Orange 对接交接

日期：2026-08-11

适用仓库：`gooes` 后端 / Admin；`orange` 小程序只读对接

## 1. 当前状态与边界

- Gooes 试用核心、统一访问门禁、正式购买归因和超管 Admin 已完成；
- 本地空库已完整执行 migration 至 `20260811103000`；
- 本地真实数据库 smoke 连续 5 轮共 18/18 场景通过，包含 60 轮双连接竞争；
- dev 已发布 commit `51c5d150f38adc988c9c21bd867893abac26a2fd`，发布 workflow `31480862914` 全部成功；
- `20260811103000` 会在 develop 环境创建下述限时验收 fixture，在其他环境严格 no-op；
- Orange 仓库本轮保持只读，本文是小程序团队后续接入依据。

发布受两个平台系统配置保护：

- `PLATFORM_SERVICE_TRIAL_APPLICATION_ENABLED`：是否允许租户提交新申请；
- `PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED`：统一访问门禁是否接受试用/宽限事实。

两项默认均为 false；migration 只在数据库已有
`WECHAT_MINIPROGRAM_ENV_VERSION=develop` 的开发环境初始化为 true，其他环境（包括生产）
保持关闭。关闭申请开关不会阻止历史读取和待审核申请撤回；关闭访问开关不会删除既有
试用或审计事实，正式合同、正式待实施服务和 legacy 资格仍按原优先级判定。

本轮已实现：

- 租户自主申请、查看历史/当前申请、撤回待审核申请；
- 平台审核、主动开通、延期、撤销、分配跟进人、规则管理；
- 默认 30 天试用、7 天只读宽限期和数据库时间判定；
- 路由 capability 范围控制；
- 从试用进入现有正式套餐购买并用 `source_trial_id` 固化转化归因；
- 正式付款确认与试用转化同一数据库事务落库；
- Admin 路径 `/platform/service-orders?tab=trials` 的完整运营入口。

当前未实现：试用跟进记录的 `GET/POST .../:id/follow-ups`。Orange 不得调用或模拟该能力。

## 2. 业务规则

### 2.1 默认规则

- 默认试用：30 个连续 24 小时；
- 默认宽限期：7 个连续 24 小时；
- 默认到期提醒节点：7、3、1 天；
- 默认再次申请冷却期：30 天；
- 默认最多延期 1 次，每次最多 30 天；
- 普通运营配置边界：试用 1～60 天、宽限期 0～14 天；
- 数据库硬边界：总试用不超过 365 天、宽限期不超过 30 天。

这些值来自后端当前规则及试用记录的不可变 `policy_snapshot`。Orange 不得写死 30/7、提醒节点、延期次数或冷却期。

### 2.2 状态

| status | 小程序含义 |
| --- | --- |
| `pending_review` | 待平台审核 |
| `scheduled` | 已批准，等待开始 |
| `active` | 试用中，可使用 scope 内读写能力 |
| `grace_period` | 宽限期，只允许 scope 内读取 |
| `expired` | 试用和宽限期均结束 |
| `rejected` | 申请被拒绝 |
| `withdrawn` | 租户已撤回 |
| `revoked` | 平台已撤销 |
| `converted` | 已完成正式购买归因 |

API 的 `status` 是按数据库统一时间计算的生效状态；`persisted_status` 仅供审计。客户端展示和交互一律使用 `status`、`available_actions` 和后端错误码，不根据本机时间重算状态。

### 2.3 来源和类型

- `source=tenant_application`：租户自主申请，必须经平台审核；
- `source=platform_grant`：平台主动开通；
- `trial_type=standard`：标准试用；
- `trial_type=guided`：陪跑试用，开通/批准时必须指定平台跟进人。

### 2.4 v1 capability

```text
core.projects
core.customers
core.employees
core.workflows
core.files
core.notifications
```

`scope` 格式固定为：

```json
{
  "version": 1,
  "capabilities": ["core.projects", "core.customers"]
}
```

试用仅覆盖 scope 中的能力。独立支付配置、平台设置、正式服务恢复接口和其他明确排除的业务不会因试用而开放。

## 3. 权限

租户员工：

- `billing.service_trial.read`：历史、当前、详情；
- `billing.service_trial.apply`：提交和撤回申请；
- `billing.service_order.create`：进入正式套餐并创建订单；
- `billing.service_order.read`：读取正式服务订单。

真实租户管理员角色 `system_admin` 默认具备试用 apply/read；其他员工必须显式授权。

平台员工：

- `platform.service_trial.read`：列表、统计、详情、规则读取；
- `platform.service_trial.review`：审核；
- `platform.service_trial.manage`：主动开通、分配跟进人；
- `platform.service_trial.override`：与 manage 组合执行延期、撤销、规则修改和业务边界例外。

平台写命令采用 AND 权限，不允许用 `override` 替代基础权限。平台超级管理员拥有全部平台试用权限。

## 4. 租户接口

所有接口使用租户员工登录态：

```http
Authorization: Bearer <tenant_employee_token>
```

成功响应沿用 Gooes envelope：业务字段位于 `data`。

### 4.1 历史列表

```http
GET /billing/service-trials?page=1&pageSize=20&status=active
```

- `page` 默认 1；
- `pageSize` 默认 20，最大 100；
- `status` 可选，取第 2.2 节枚举；
- 只返回当前租户数据；
- 响应为 `data.list`、`data.pagination`、`data.server_time`。

### 4.2 当前试用

```http
GET /billing/service-trials/current
```

有当前记录：

```json
{
  "data": {
    "trial": { "id": "uuid", "status": "active", "version": 2 },
    "available_actions": {},
    "server_time": "2026-08-11T08:00:00.000Z"
  }
}
```

没有当前记录时 `data.trial=null`、`data.available_actions=null`，仍返回 200。

### 4.3 申请详情

```http
GET /billing/service-trials/applications/:id
```

只能读取当前租户的记录；跨租户按不存在/无权限处理。

### 4.4 提交申请

```http
POST /billing/service-trials/applications
Content-Type: application/json

{
  "application_reason": "希望评估项目和客户协同能力",
  "expected_user_count": 8,
  "expected_project_count": 3,
  "contact_name": "张经理",
  "contact_phone": "13800000000",
  "idempotency_key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
}
```

- `idempotency_key` 必须为 UUID v4；一次用户操作及网络重试复用同一个键；
- 联系人姓名、手机号必填；后端响应会脱敏；
- 企业名称、信用代码和地址复用已核验租户企业资料，客户端不重复提交；
- 缺少已批准企业入驻/证照一致事实时返回 `SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED`；
- 创建和幂等重放均返回 HTTP 200，使用 `data.idempotent` 区分。

### 4.5 撤回申请

```http
POST /billing/service-trials/applications/:id/withdraw
Content-Type: application/json

{
  "idempotency_key": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  "expected_version": 1,
  "reason": "申请信息需要修改"
}
```

仅 `available_actions.withdraw.enabled=true` 时展示/执行。同一操作重试复用幂等键；版本冲突先刷新详情。

## 5. 响应字段

试用资源核心字段：

| 字段 | 说明 |
| --- | --- |
| `id`, `tenant_id` | 试用及租户 UUID |
| `source`, `trial_type` | 来源和类型 |
| `status` | 当前生效状态，UI 权威字段 |
| `persisted_status` | 数据库审计状态，不用于客户端自行判定 |
| `application_reason` | 申请理由；命令幂等快照可能为 null |
| `expected_user_count`, `expected_project_count` | 预计规模 |
| `contact_name`, `contact_phone` | 后端脱敏后的联系人 |
| `requested_at`, `reviewed_at`, `granted_at` | 申请、审核、授权时间 |
| `starts_at`, `trial_ends_at`, `grace_ends_at` | 开始、试用结束、宽限结束时间 |
| `converted_at`, `converted_order_id` | 正式购买归因事实 |
| `assignee_employee_id` | 平台跟进人；命令幂等快照可能为 null |
| `scope` | v1 capability 快照 |
| `policy_snapshot` | 本记录创建/批准时的规则快照 |
| `extension_count`, `version` | 延期次数、乐观锁版本 |
| `created_at`, `updated_at` | 记录时间 |

详情还可能包含脱敏后的 `tenant`、`assignee` 和最多 100 条审计 `events`。Orange 不应缓存或展示原始联系人、企业身份摘要、actor ID 或任意原始 RPC metadata。

## 6. `available_actions`

后端返回以下动作：

```json
{
  "withdraw": { "enabled": false, "disabled_reason": "当前状态不可撤回" },
  "review": { "enabled": false, "disabled_reason": "当前状态不可审核" },
  "extend": { "enabled": false, "disabled_reason": "无试用延期权限" },
  "revoke": { "enabled": false, "disabled_reason": "无试用撤销权限" },
  "assign": { "enabled": false, "disabled_reason": "无跟进人分配权限" },
  "purchase": { "enabled": true, "disabled_reason": null }
}
```

Orange 侧规则：

1. 只按 `enabled` 控制按钮，不复制状态机；
2. disabled 时可以展示 `disabled_reason`，不要根据中文文本分支；
3. 写请求提交期间禁用按钮；
4. 成功后刷新当前详情和历史列表；
5. 失败时保留表单和幂等键；只有用户发起新的业务操作时才生成新键。

## 7. 正式购买与 `source_trial_id`

现有接口保持不变：

```http
GET  /billing/service-products?page=1&pageSize=20
POST /billing/service-orders
```

从试用详情点击正式购买时，创建订单请求新增可选字段：

```json
{
  "product_code": "platform_service_1y",
  "terms_version": 1,
  "terms_accepted": true,
  "idempotency_key": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  "source_trial_id": "试用 UUID"
}
```

- 从某条试用进入购买时必须传该 `trial.id`；普通套餐入口可以不传；
- 后端校验同租户、可归因状态和未关闭来源订单唯一性；
- 同一订单幂等重放若 `source_trial_id` 不一致，返回 `SERVICE_TRIAL_ORDER_SOURCE_INVALID`；
- 一条试用同一时刻只能绑定一张未关闭订单；待支付订单关闭后可重新选择套餐；
- 微信支付回调只消费订单固化的来源；付款、工单和转化在数据库原子处理；
- 归因异常不会回滚已成功的付款或工单，会写脱敏审计事件供平台处理。

Orange 当前需改：

- `src/types/api/platform_service.d.ts`：给 `CreatePlatformServiceOrderPayload` 增加 `source_trial_id?: string`，新增 trial 类型；
- `src/services/platform_service.ts`：增加试用 list/current/detail/apply/withdraw wrappers；现有 `createOrder` 类型自然透传 `source_trial_id`；
- 新增试用状态/申请页面，并在 `src/app.config.ts` 注册；
- `src/pages/order-center/index.tsx`：按 `billing.service_trial.read/apply` 增加试用入口；
- `src/packageEmployees/pages/platformServicePaymentSmoke/usePlatformServicePaymentSmoke.ts`：如果后续复用为正式套餐购买页，从试用入口进入时透传 `source_trial_id`；不得把试用包装成 ¥0 免费订单；
- `src/packageEmployees/pages/platformServiceOrders/*`：按需要展示来源/转化状态，但不自行推导访问资格。

## 8. 稳定错误码

| HTTP | code | Orange 建议处理 |
| ---: | --- | --- |
| 400 | `VALIDATION_ERROR` | 请求字段、UUID、空 scope 或普通输入边界不合法，保留表单按字段提示 |
| 400 | `SERVICE_TRIAL_POLICY_INVALID` | 请求形状合法但规则事实无效，刷新当前规则 |
| 400 | `SERVICE_TRIAL_EXTENSION_INVALID` | 请求形状合法但延期会突破当前规则/事实边界 |
| 403 | `SERVICE_TRIAL_APPLICATION_DISABLED` | 自主申请开关关闭，隐藏申请入口并保留只读状态页 |
| 403 | `SERVICE_TRIAL_REPEAT_REQUIRES_OVERRIDE` | 租户侧提示联系平台运营 |
| 403 | `PLATFORM_PERMISSION_REQUIRED` | 隐藏/禁用无权平台动作 |
| 403 | `TENANT_SERVICE_READ_ONLY` | 展示宽限期只读提示，阻止写操作 |
| 403 | `TENANT_SERVICE_HARD_BLOCKED` | 展示平台停用/风控状态，不引导试用绕过 |
| 402 | `TENANT_SERVICE_ACCESS_EXPIRED` | 展示已到期和正式购买入口 |
| 403 | `TENANT_SERVICE_CAPABILITY_NOT_INCLUDED` | 当前功能不在试用范围，展示购买/联系运营 |
| 404 | `SERVICE_TRIAL_NOT_FOUND` | 返回列表或刷新当前状态 |
| 409 | `SERVICE_TRIAL_APPLICATION_PENDING` | 刷新当前申请 |
| 409 | `SERVICE_TRIAL_ACTIVE_EXISTS` | 刷新当前试用 |
| 409 | `SERVICE_TRIAL_FORMAL_SERVICE_ACTIVE` | 已有正式服务，不再申请试用 |
| 409 | `SERVICE_TRIAL_REAPPLY_COOLDOWN` | 展示后端返回的恢复信息，不自行算日期 |
| 409 | `SERVICE_TRIAL_ENTERPRISE_IDENTITY_REQUIRED` | 引导先完成企业资料核验 |
| 409 | `SERVICE_TRIAL_ACTION_NOT_ALLOWED` | 刷新详情和 actions |
| 409 | `SERVICE_TRIAL_VERSION_CONFLICT` | 刷新后用最新 version 重试 |
| 409 | `SERVICE_TRIAL_IDEMPOTENCY_CONFLICT` | 当前键已对应其他请求；用户重新提交时生成新键 |
| 409 | `SERVICE_TRIAL_ORDER_SOURCE_INVALID` | 刷新试用和订单，禁止继续使用错误归因 |

所有错误只消费稳定 `code`、HTTP 状态和 Request-ID。不要解析中文 `message`，不要把后端 raw error、SQL、token、手机号或支付字段写入埋点/截图。

## 9. 访问体验

- `active`：scope 内 read/write 可用；
- `grace_period`：scope 内 read 可用，write 返回 `TENANT_SERVICE_READ_ONLY`；
- `expired`：访问返回 `TENANT_SERVICE_ACCESS_EXPIRED`；
- 正式合同、正式待实施服务、历史 legacy 资格优先于 trial；
- 平台停用、冻结、风控等 hard block 优先级最高，试用不能绕过；
- 页面可用 `server_time` 显示剩余时间，但不能以本地倒计时决定真实授权。

## 10. Dev fixture 与验收矩阵

`20260811103000_seed_dev_platform_service_trial_fixtures.sql` 使用生产 RPC 创建以下脱敏
fixture。六状态矩阵自 migration 应用起稳定 21 天；若 21 天后仍需联调，必须在到期前
新增 forward migration 刷新时间，不得手工修改远端数据。

| fixture slug | 预期状态/用途 |
| --- | --- |
| `dev-trial-application` | `pending_review`，验证申请、幂等和撤回 |
| `dev-trial-platform-grant` | `scheduled`，验证超管主动开通 |
| `dev-trial-active` | `active`，scope 内 read/write 成功 |
| `dev-trial-grace` | `grace_period`，read 成功、write 返回只读错误 |
| `dev-trial-expired` | `expired`，返回访问过期并展示购买入口 |
| `dev-trial-converted` | `converted`，正式订单支付确认后仅归因一次 |

验收清单：

1. 有权限租户管理员提交申请，重复网络请求返回同一 `trial.id` 且 `idempotent=true`；
2. 无权限员工不能申请或读取；
3. 平台 Admin 在 `/platform/service-orders?tab=trials` 审核或主动开通；
4. guided 开通必须选择跟进人；
5. active 用户只能访问 scope 内能力；
6. grace 只读、expired 阻断、hard block 不被试用绕过；
7. 从试用进入套餐页创建订单时传 `source_trial_id`；
8. 关闭待支付订单后可重新选择套餐；
9. 支付成功后试用为 `converted`，重复回调不产生第二次转化或第二张工单；
10. 列表分页默认 1/20，增量加载，禁止一次拉全量；
11. UI、日志和反馈截图均只有脱敏联系人和 Request-ID；
12. Orange 真机验收结果按“环境、接口、稳定 code、脱敏 Request-ID、是否通过”回传，不提供 token/OpenID/支付签名。

## 11. 所有权

- Gooes：数据库、权限、原子 RPC、访问门禁、正式购买归因、API、Admin 和 dev fixture；
- Orange：小程序入口、申请/状态页、服务 wrapper/type、actions 交互、分页和真机验收；
- Orange 不修改 Gooes 数据结构，不直连 Supabase，不自行审批或计算试用有效期；
- 本次只在 Gooes 写入本文，Orange 工作区未修改、未格式化、未生成、未暂存、未提交。
