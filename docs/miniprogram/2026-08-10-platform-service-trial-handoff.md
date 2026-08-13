# 平台技术服务试用运营闭环：Orange 最终交接

日期：2026-08-12

适用范围：Gooes API / Admin / billing worker；Orange 小程序只读对接。

## 1. 交付结论

平台技术服务试用三阶段功能已在 Gooes 代码和本地数据库闭环：

- 申请、撤回、当前/历史、详情和正式购买归因；
- 平台审核、主动开通、延期、撤销、分配跟进人和规则管理；
- 员工登录后的统一 `service_access` 承接；
- 平台跟进记录、7/3/1 天提醒、进入宽限期、正式到期和转正式通知；
- 陪跑试用开通或批准后自动建立首次待跟进任务，命令重试复用原幂等键补偿；
- Admin `/platform/service-orders?tab=trials` 的试用管理、详情和跟进时间线；
- billing reconcile worker 有界领取、幂等发送、失败隔离和指数退避。

本阶段不修改 Orange 仓库。开发库发布和 Orange 真机结果需在合并后追加到发布记录；
禁止把本地 smoke 表述为远端已发布。

核心接口和字段详表继续参考
[`2026-08-10-platform-service-trial-core-handoff.md`](./2026-08-10-platform-service-trial-core-handoff.md)，
员工登录承接参考
[`2026-08-12-employee-service-access-bootstrap-handoff.md`](./2026-08-12-employee-service-access-bootstrap-handoff.md)。

## 2. Orange 需要调用的租户接口

所有接口使用租户员工 token，成功业务数据位于 `data`：

```text
GET  /billing/service-trials?page=1&pageSize=20
GET  /billing/service-trials/current
GET  /billing/service-trials/applications/:id
POST /billing/service-trials/applications
POST /billing/service-trials/applications/:id/withdraw
GET  /employee/bootstrap
GET  /billing/service-products?page=1&pageSize=20
POST /billing/service-orders
```

列表默认 `page=1&pageSize=20`，`pageSize` 最大 100。Orange 必须增量分页，不能一次拉取全量。

申请和撤回请求的 `idempotency_key` 必须为 UUID v4；一次用户操作及网络重试复用同一个键，
只有用户明确开始新操作时才生成新键。撤回还必须传当前 `expected_version`。

从试用详情进入正式套餐购买时必须透传：

```json
{
  "source_trial_id": "当前试用 UUID"
}
```

不得创建 ¥0 试用订单，也不得由小程序自行写入 converted。正式支付确认、工单和试用转化
由后端在同一数据库事务落事实。

## 3. Orange 不应调用的平台接口

以下接口只供平台 Admin 使用：

```text
GET  /platform/billing/service-trials/:id/follow-ups?page=1&pageSize=20
POST /platform/billing/service-trials/:id/follow-ups
POST /platform/billing/service-trials/:id/follow-ups/:followUpId/cancel
```

跟进记录是平台运营事实，不改变租户试用授权状态。Orange 不新增跟进表单、不直连
Supabase、不调用 claim/complete/fail RPC，也不自行取消平台跟进任务。

## 4. `available_actions` 与写操作

试用详情和当前试用返回后端计算的 `available_actions`。客户端只根据
`enabled` 控制入口，可展示 `disabled_reason`，但不得按中文原因或本机时间复制状态机。

核心动作包括：

- `withdraw`：租户撤回待审核申请；
- `purchase`：进入正式套餐购买，并携带 `source_trial_id`；
- `review`、`extend`、`revoke`、`assign`：平台 Admin 动作，Orange 不展示。

写请求失败时保留表单和当前幂等键；版本冲突或状态冲突先强制刷新详情，再由用户决定是否
发起新操作。

## 5. 登录后的服务状态承接

Orange 登录后以 `/employee/bootstrap` 的 `data.service_access` 为唯一入口事实：

| `access_status` | 行为 |
| --- | --- |
| `workspace_available` | 进入员工首页 |
| `pending_review` | 展示审核中承接页 |
| `scheduled` | 展示待生效承接页 |
| `grace_period` | 展示只读宽限页；用户确认后进入只读工作台 |
| `expired` | 展示到期页和正式购买入口 |
| `service_blocked` | 展示服务受限，不进入工作台 |
| `hard_blocked` | 展示平台停用/风控状态，不允许试用绕过 |

刷新必须调用 `AuthService.ensureEmployeeBootstrap(..., { force: true })`，使 token 结果缓存和
底层请求缓存一起更新。首页保留二次 guard。`primary_action` / `secondary_action` 是后端提供的
内部小程序 path；涉及试用购买时 path 已携带 URL 编码后的 `source_trial_id`。

## 6. 提醒与通知展示

后端按试用不可变 `policy_snapshot.reminder_days` 生成提醒，不使用当前默认规则回算历史记录。
默认规则的时间节点是 7、3、1 天，但 Orange 不得写死这些数字来决定授权或重复创建提醒。

通知事件稳定枚举：

```text
application_submitted
approved
rejected
extended
revoked
expires_in_7_days
expires_in_3_days
expires_in_1_day
entered_grace
expired
converted
```

通知进入现有员工通知体系，`scene=platform_service_trial`，目标为
`service_trial_delivery`。`target_url` 指向试用详情：

```text
/packageEmployees/pages/platformServiceTrialDetail/index?id=<trial_id>
```

Orange 只需复用已有通知列表和内部 path 跳转。不要依据通知到达时间改变访问权限；页面状态
仍以 bootstrap / trial API 为准。通知投递账本不保存正文、联系人、手机号或企业证照。

## 7. 平台跟进记录

Admin 可新增：

- 类型：`phone`、`wechat`、`online_meeting`、`onsite`、`other`；
- 状态：`pending` 或 `completed`；
- 摘要最多 500 字；结果最多 1000 字；
- `pending` 必须指定 RFC3339 `next_follow_up_at`；
- `idempotency_key` 必须为 UUID v4。

跟进列表分页，默认 1/20、最大 100，按 `created_at desc, id desc` 稳定排序。已完成正文不可
修改；待跟进只能通过受控命令取消。所有跟进新增/取消均写不可变试用事件。

`guided` 试用在平台主动开通或批准时，由后端自动创建“陪跑试用首次跟进”待办；若首次
响应不确定，平台端以原开通/审批幂等键重试即可补齐，禁止人工另造重复任务。

## 8. 稳定错误码

Orange 只消费 HTTP、稳定 `code` 和脱敏 Request-ID：

| HTTP | code | 处理 |
| ---: | --- | --- |
| 400 | `VALIDATION_ERROR` | 字段提示并保留表单 |
| 403 | `SERVICE_TRIAL_APPLICATION_DISABLED` | 隐藏申请入口，保留只读状态 |
| 403 | `TENANT_SERVICE_READ_ONLY` | 宽限期只读提示 |
| 403 | `TENANT_SERVICE_HARD_BLOCKED` | 平台停用/风控承接 |
| 402 | `TENANT_SERVICE_ACCESS_EXPIRED` | 到期页和正式购买入口 |
| 403 | `TENANT_SERVICE_CAPABILITY_NOT_INCLUDED` | 当前试用不包含该能力 |
| 404 | `SERVICE_TRIAL_NOT_FOUND` | 返回列表或刷新 current |
| 409 | `SERVICE_TRIAL_APPLICATION_PENDING` | 刷新当前申请 |
| 409 | `SERVICE_TRIAL_ACTIVE_EXISTS` | 刷新当前试用 |
| 409 | `SERVICE_TRIAL_VERSION_CONFLICT` | 刷新并使用最新 version |
| 409 | `SERVICE_TRIAL_IDEMPOTENCY_CONFLICT` | 新业务操作才更换幂等键 |
| 409 | `SERVICE_TRIAL_ORDER_SOURCE_INVALID` | 刷新试用和订单归因 |

不要解析中文 `message`，不要在日志、截图或群消息中回传 token、OpenID、支付签名、原始手机号、
企业证照值或数据库错误。

## 9. Dev 六账号回归矩阵

| 手机号 | 预期状态 | 核心验收 |
| --- | --- | --- |
| `19900009101` | `pending_review` | 审核中承接、申请详情、撤回 |
| `19900009102` | `scheduled` | 待生效承接、开始时间 |
| `19900009103` | `active` | 直接进入首页、scope 内读写 |
| `19900009104` | `grace_period` | 宽限承接、确认后只读工作台、写入口隐藏 |
| `19900009105` | `expired` | 到期承接、正式购买并透传来源 |
| `19900009106` | `converted` | 正式服务进入首页、转化展示 |

六个固定 fixture 不用于 hard block。`hard_blocked` 和 `service_blocked` 使用隔离 smoke/专用测试
租户验证，避免破坏已共享的六状态矩阵。

真机顺序：先完成只读状态、分页、详情、通知跳转，再执行申请/撤回和购买等写操作。异常只
回传环境、账号尾号、接口路径、HTTP、稳定 code、脱敏 Request-ID、trial/order ID 和幂等键
是否复用。

## 10. `@gooes/domain@1.17.0`

1.16.0 已正式交付员工 `service_access`，本阶段新增导出必须使用新的不可变版本：

- 制品：`/Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.17.0.tgz`；
- SHA-256：`3dd91492f1f8ff40664367137d6495a6780ee98f2719b53dd60309d4b294e27b`；
- 既有试用状态、来源、类型、capability 和 `PlatformServiceTrialScopeSchema` 保持兼容；
- 新增 `SERVICE_TRIAL_FOLLOW_UP_TYPE_VALUES` / `ServiceTrialFollowUpType`；
- 新增 `SERVICE_TRIAL_FOLLOW_UP_STATUS_VALUES` / `ServiceTrialFollowUpStatus`；
- 新增 `SERVICE_TRIAL_NOTIFICATION_EVENT_VALUES` / `ServiceTrialNotificationEvent`。

Orange 侧由小程序团队独立安装并提交：

```bash
pnpm add "/Users/leefo/Public/work/gooes/.artifacts/domain/gooes-domain-1.17.0.tgz"
```

必须同时核对 package.json、pnpm-lock.yaml、版本和 SHA。禁止继续用 1.16.0 文件名承载新增
内容，也禁止在 Orange 本地复制这些枚举。

## 11. 发布与验收门禁

Gooes 合并后按顺序执行：

1. 确认 dev 环境与项目绑定；
2. `supabase migration list`；
3. `supabase db push`；
4. 再次 `supabase migration list`，确认 Local/Remote 对齐至
   `20260812132230_create_platform_service_trial_operations.sql`；
5. 确认 billing reconcile worker 健康证据包含 trial reminder child；
6. Admin 验证跟进新增、分页、失败保留和即将到期标记；
7. Orange 按第 9 节真机矩阵回传结果。

禁止远端 reset，禁止手工 DDL/DML 修库。若 migration 失败，停止发布并根据 migration 日志
修复 forward migration；不得跳过或人工标记 applied。
