# 状态机整改执行记录

日期：2026-05-21

## 已完成

- 新建 `docs/status-machine-remediation` 目录，并按 Admin / 微信小程序拆分对接文档子目录。
- 在 `packages/domain/src/customer.ts` 定义客户销售阶段状态、动作、动作配置、流转解析和可执行动作枚举能力。
- 在 `packages/domain/src/project.ts` 定义项目交付阶段状态、动作、动作配置、流转解析和可执行动作枚举能力。
- 增加客户和项目状态流转日志表，用于记录状态变化审计轨迹。
- 增加客户和项目状态动作接口：
  - `POST /customers/:id/status-transition`
  - `POST /projects/:id/status-transition`
- 增加客户和项目可执行动作接口：
  - `GET /customers/:id/status-actions`
  - `GET /projects/:id/status-actions`
- 增加客户和项目状态时间线接口：
  - `GET /customers/:id/status-transitions?page=1&pageSize=20`
  - `GET /projects/:id/status-transitions?page=1&pageSize=20`
- Admin 客户 / 项目详情已接入状态动作和状态时间线。
- Admin 客户 / 项目编辑表单在编辑模式下不再提交 `status`。
- 新增迁移 `20260521213000_replace_legacy_project_status_flow.sql`，映射存量旧状态并收紧数据库约束。

## 当前有效流程

客户销售阶段：

`potential` 线索 -> `following` 跟进中 -> `arrived` 已到店 -> `designing` 设计中 -> `signed` 已签约

项目交付阶段：

`designing` 设计中 -> `proposal_confirmed` 方案已确认 -> `signed` 已签约 -> `design_finalized` 设计定稿 -> `pending_start` 待开工 -> `started` 已开工 -> `constructing` 施工中 -> `acceptance` 竣工验收

## 当前关键规则

- 客户执行 `start_design` 前，端侧必须先创建/确认一个同客户同房产的 `designing` 项目；后端校验主房产并复用已有有效项目作为兜底。
- 项目处于 `designing` 时，下一步只能执行 `confirm_proposal`。
- 项目执行 `sign_contract` 时必须处于 `proposal_confirmed`，且必须提供 `signed_amount > 0`。
- 项目签约成功后，后端自动把关联客户销售状态从 `designing` 推进到 `signed`；不再写旧 `contracted` 状态。
- 项目 `on_hold` 状态动作列表会读取最近一次暂停日志里的 `paused_from_status`；缺少暂停上下文时不会返回恢复动作。
- 状态流转日志接口按 `created_at desc` 排序，并返回统一分页结构。

## 已下线旧流程

- 客户下线状态：`ordered / contracted`。
- 客户下线动作：`place_order / sign_contract`。
- 项目下线状态：`lead / measure / negotiating / completed / after_sale`。
- 项目下线动作：`start_measure / start_negotiation / start_design / complete_project / start_after_sale`。

## 写操作限制

- `invalid / on_hold / acceptance` 项目不能新增施工日志。
- `invalid / acceptance` 项目不能新增摄像头。
- 只有 `constructing / acceptance` 项目允许发起或查看验收相关流程。
- 仍允许读取历史施工日志、摄像头和验收数据。

## 端侧对接文档

- Admin 总览：`docs/status-machine-remediation/admin/README.md`
- Admin 客户状态机：`docs/status-machine-remediation/admin/2026-05-21-customer-status-machine-integration.md`
- Admin 项目状态机：`docs/status-machine-remediation/admin/2026-05-21-project-status-machine-integration.md`
- Admin 客户项目联动：`docs/status-machine-remediation/admin/2026-05-21-customer-project-status-linkage.md`
- 微信小程序总览：`docs/status-machine-remediation/wechat/README.md`
- 微信小程序客户状态机：`docs/status-machine-remediation/wechat/2026-05-21-customer-status-machine-integration.md`
- 微信小程序项目状态机：`docs/status-machine-remediation/wechat/2026-05-21-project-status-machine-integration.md`
- 微信小程序客户项目联动：`docs/status-machine-remediation/wechat/2026-05-21-customer-project-status-linkage.md`

## 验证命令

```bash
bun run api:typecheck
pnpm --dir apps/admin exec tsc -p tsconfig.json --noEmit
bun run api:build
bun run check:permission-boundaries
git diff --check
```

## 当前剩余

- 当前仓库未发现 `apps/wechat` 目录；后续接入真实小程序端时，需要按 `docs/status-machine-remediation/wechat/README.md` 下的文档完成动作化改造。
- 浏览器端仍需按真实业务数据做回归验收：客户详情、项目详情、方案确认、签约、暂停、恢复、作废、验收、摄像头绑定。
