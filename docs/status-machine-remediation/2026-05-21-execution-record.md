# 状态机整改执行记录

## 2026-05-21 阶段 0 启动

已完成：

- 新建 `docs/status-machine-remediation` 目录。
- 建立整改总台账。
- 盘点当前客户状态和项目状态。
- 起草项目状态动作表。
- 起草客户状态动作表。
- 起草分阶段验收测试方案。

当前阶段：

- 阶段 0：状态盘点和规则冻结。

下一步：

- 确认阶段 0 中的待业务确认问题。
- 业务规则确认后，进入阶段 1：项目状态机最小闭环。

## 2026-05-21 阶段 1 项目状态机最小闭环

已完成：

- 在 `packages/domain/src/project.ts` 增加项目状态动作、动作配置、流转解析、旧 status 目标推断和可执行动作枚举能力。
- 增加 `ProjectStatusTransitionSchema`，状态变更请求改为动作驱动。
- 新增 `project_status_transition_logs` migration，用于记录项目状态流转日志。
- 新增 `projectStatusTransitionRepository`，负责写入和查询项目状态流转日志。
- 新增 `projectStatusService.transitionProjectStatus()`，集中处理状态动作校验、签约金额校验、暂停恢复上下文和日志写入。
- 新增 `POST /projects/:id/status-transition`。
- 改造 `PATCH /projects/:id`：如果 payload 包含 `status`，会根据当前状态和目标状态推断动作并走状态机；不包含 `status` 时保持原有更新行为。
- 状态变更后清理公开项目列表、公开详情、日志、成员缓存。

当前规则：

- `invalid` 是终态，默认不允许恢复。
- `completed` 默认不允许回到施工，售后走 `start_after_sale`。
- `pause_project` 和 `mark_invalid` 必须传 `reason`。
- `resume_project` 会读取最近一次 `pause_project` 日志里的 `paused_from_status`。
- `sign_contract` 必须提供有效 `signed_amount`。

待后续阶段处理：

- 项目状态对施工日志、摄像头、验收、售后日志的写操作拦截。
- 项目签约和客户 `contracted` 状态的联动。
- 状态流转日志列表接口和 Admin 展示。

阶段 1 验证命令：

```bash
bun run api:typecheck
cd packages/domain && bun run build
bun run api:build
bun run check:permission-boundaries
git diff --check
```

## 2026-05-21 阶段 2 项目状态副作用收口

已完成：

- 新增项目状态副作用 guard：
  - `assertCanCreateProjectLog`
  - `assertCanBindProjectCamera`
  - `assertCanCreateProjectAcceptance`
- 施工日志创建和修改目标项目时，校验项目状态：
  - `invalid`：禁止新增施工日志。
  - `on_hold`：禁止新增施工日志。
  - `completed`：禁止新增施工日志。
- 摄像头绑定时，校验项目状态：
  - `invalid`：禁止新增摄像头。
  - `completed`：禁止新增摄像头。
- 验收单创建时，校验项目状态：
  - 仅允许 `constructing` 和 `acceptance`。
- 补充小程序对接文档：
  - `docs/status-machine-remediation/wechat/2026-05-21-project-status-machine-integration.md`
- 补充 Admin 对接文档：
  - `docs/status-machine-remediation/admin/2026-05-21-project-status-machine-integration.md`

当前保守策略：

- 仍允许更新 / 删除已有摄像头，用于运维纠错。
- 仍允许读取历史施工日志和验收单。
- 完工项目的售后日志暂未复用施工日志接口，后续如要支持，需要单独定义售后日志动作和字段。

阶段 2 验证命令：

```bash
bun run api:typecheck
bun run api:build
bun run check:permission-boundaries
git diff --check
```

## 2026-05-21 阶段 3 客户状态机最小闭环

已完成：

- 在 `packages/domain/src/customer.ts` 增加客户状态动作、动作配置、流转解析、旧 status 目标推断和可执行动作枚举能力。
- 增加 `CustomerStatusTransitionSchema`，客户状态变更请求改为动作驱动。
- 新增 `customer_status_transition_logs` migration，用于记录客户状态流转日志。
- 新增 `customerStatusTransitionRepository`，负责写入客户状态流转日志。
- 新增 `customerStatusService.transitionCustomerStatus()`，集中处理状态动作校验、原因必填校验、客户更新和日志写入。
- 新增 `POST /customers/:id/status-transition`。
- 改造 `PATCH /customers/:id`：如果 payload 包含 `status`，会根据当前状态和目标状态推断动作并走状态机；不包含 `status` 时保持原有更新行为。
- 改造 `DELETE /customers/:id`：保留作废接口语义，内部改为 `mark_invalid` 状态动作并写流转日志。
- 补充小程序对接文档：
  - `docs/status-machine-remediation/wechat/2026-05-21-customer-status-machine-integration.md`
- 补充 Admin 对接文档：
  - `docs/status-machine-remediation/admin/2026-05-21-customer-status-machine-integration.md`

当前规则：

- `invalid` 是终态，默认不允许恢复。
- `contracted` 默认不允许作废或回退。
- `mark_dormant` 和 `mark_invalid` 必须传 `reason`。
- 历史 `PATCH /customers/:id` 直接传 `status` 仍兼容，但非法跳转和缺少原因会返回 400。

待后续阶段处理：

- 项目签约和客户 `contracted` 状态联动。
- 客户签约动作是否必须创建或关联项目。
- 状态流转日志列表接口和 Admin 展示。

阶段 3 验证命令：

```bash
bun run api:typecheck
cd packages/domain && bun run build
bun run api:build
bun run check:permission-boundaries
git diff --check
```

## 2026-05-21 阶段 4 客户项目状态联动最小闭环

已完成：

- 项目 `sign_contract` 状态动作成功时，如果项目有关联客户，会同步客户状态为 `contracted`。
- 客户同步仍复用 `customerStatusService.transitionCustomerStatus()`，因此会写入 `customer_status_transition_logs`。
- 关联客户已是 `contracted` 时，不重复写客户状态日志。
- 关联客户如果不是 `ordered / contracted`，项目签约会返回 400：
  - `项目签约前，关联客户状态必须为已下定`
- 项目未关联客户时，暂不阻断项目签约。
- 项目作废、暂停、完工不会反向自动修改客户状态，避免多项目客户被单项目状态误伤。
- 补充小程序对接文档：
  - `docs/status-machine-remediation/wechat/2026-05-21-customer-project-status-linkage.md`
- 补充 Admin 对接文档：
  - `docs/status-machine-remediation/admin/2026-05-21-customer-project-status-linkage.md`

当前保守策略：

- 项目签约是客户签约联动的主入口。
- 客户侧主动 `sign_contract` 暂不强制创建项目，避免破坏现有客户编辑和跟进体验。
- 后续如要强制“客户签约必须选择项目”，应先完成 Admin / 小程序项目选择 UI。

阶段 4 验证命令：

```bash
bun run api:typecheck
cd packages/domain && bun run build
bun run api:build
bun run check:permission-boundaries
git diff --check
```

## 2026-05-21 阶段 5 端侧动作化后端接口

已完成：

- 新增项目当前状态可执行动作接口：
  - `GET /projects/:id/status-actions`
- 新增项目状态流转日志分页接口：
  - `GET /projects/:id/status-transitions?page=1&pageSize=20`
- 新增客户当前状态可执行动作接口：
  - `GET /customers/:id/status-actions`
- 新增客户状态流转日志分页接口：
  - `GET /customers/:id/status-transitions?page=1&pageSize=20`
- 项目 `on_hold` 状态动作列表会读取最近一次暂停日志里的 `paused_from_status`；缺少暂停上下文时不会返回恢复动作。
- 状态流转日志接口按 `created_at desc` 排序，并返回统一分页结构。
- 补充小程序对接文档：
  - `docs/status-machine-remediation/wechat/2026-05-21-status-actions-and-transition-timeline.md`
- 补充 Admin 对接文档：
  - `docs/status-machine-remediation/admin/2026-05-21-status-actions-and-transition-timeline.md`

端侧收口要求：

- 项目 / 客户详情页用 `status-actions` 渲染按钮。
- 状态变更仍统一调用 `POST /:resource/:id/status-transition`。
- 时间线用 `status-transitions` 分页加载。
- 新代码不要再通过 `PATCH` 直接提交 `status`。

阶段 5 验证命令：

```bash
bun run api:typecheck
cd packages/domain && bun run build
bun run api:build
bun run check:permission-boundaries
git diff --check
```

## 2026-05-21 阶段 5 Admin 动作化对接

已完成 Admin 端最小闭环。

详细对接和落地记录已归档到：

- `docs/status-machine-remediation/admin/2026-05-21-admin-status-machine-implementation.md`

当前剩余：

- 小程序代码目录未在当前仓库中发现 `apps/wechat`；仓库当前只有 `apps/h5`，且未发现状态机接口调用点。
- 后续如接入真实小程序端，需要按 `docs/status-machine-remediation/wechat/README.md` 下的文档完成同样的动作化改造。

## 2026-05-21 设计状态前置调整

已完成：

- 客户状态新增 `designing`，位置调整为 `arrived -> designing -> ordered`。
- 客户动作新增 `start_design`：
  - 仅 `arrived` 可执行。
  - 执行前必须已有客户主房产。
  - 成功后自动创建或复用客户主房产对应的有效项目。
  - 自动项目状态为 `designing`。
- 客户 `place_order` 收口为仅 `designing -> ordered`。
- 客户 `sign_contract` 收口为仅 `ordered -> contracted`。
- 项目状态流转调整为：
  - `negotiating -> designing` 使用 `start_design`。
  - `designing / negotiating -> signed` 使用 `sign_contract`。
  - `signed -> constructing` 使用 `start_construction`。
- 项目签约联动客户签约时，关联客户必须为 `ordered / contracted`。
- 远端 Supabase 已更新 `customer_status_transition_logs` 约束，允许 `start_design` 和 `designing`。

验证命令：

```bash
bun run api:typecheck
pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit
bun run api:build
bun run check:permission-boundaries
pnpm --dir apps/admin build
git diff --check
```
