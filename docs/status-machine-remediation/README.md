# 状态机整改执行台账

创建日期：2026-05-21

## 目标

把客户业务状态和工程项目状态从“枚举字段可更新”升级为“动作驱动、规则校验、日志可审计”的领域状态机。

当前最终口径：

- 客户状态只表达销售阶段。
- 项目状态只表达交付阶段。
- 客户到店后点击 `start_design`，端侧先创建/确认项目，再切换客户到 `designing`。
- 项目签约成功后，后端自动把关联客户销售状态从 `designing` 推进到 `signed`。
- 项目从 `designing` 开始推进到方案确认、签约、设计定稿、开工、施工和竣工验收。

## 文档索引

- [阶段 0：状态盘点与规则冻结](./2026-05-21-phase-0-status-rule-freeze.md)
- [销售到交付状态流](./2026-05-21-sales-to-delivery-status-flow.md)
- [施工阶段子状态机整改计划](./2026-05-24-construction-stage-status-machine-plan.md)
- [验收测试方案](./2026-05-21-acceptance-test-plan.md)
- [执行记录](./2026-05-21-execution-record.md)
- [Admin 状态机对接总览](./admin/README.md)
- [微信小程序状态机对接总览](./wechat/README.md)

## 目录约定

- Admin 对接文档统一放在 `docs/status-machine-remediation/admin/`。
- 微信小程序对接文档统一放在 `docs/status-machine-remediation/wechat/`。
- 根目录只保留状态机规则、验收方案、执行台账和总览索引。

## 当前有效状态流

客户销售阶段：

`potential` 线索 -> `following` 跟进中 -> `arrived` 已到店 -> `designing` 设计中 -> `signed` 已签约

项目交付阶段：

`designing` 设计中 -> `proposal_confirmed` 方案已确认 -> `signed` 已签约 -> `design_finalized` 设计定稿 -> `pending_start` 待开工 -> `started` 已开工 -> `constructing` 施工中 -> `acceptance` 竣工验收

## 已下线旧流程

- 客户下线状态：`ordered / contracted`。
- 客户下线动作：`place_order / sign_contract`。
- 项目下线状态：`lead / measure / negotiating / completed / after_sale`。
- 项目下线动作：`start_measure / start_negotiation / start_design / complete_project / start_after_sale`。

## 已落地接口

- `POST /customers/:id/status-transition`
- `POST /projects/:id/status-transition`
- `GET /customers/:id/status-actions`
- `GET /projects/:id/status-actions`
- `GET /customers/:id/status-transitions?page=1&pageSize=20`
- `GET /projects/:id/status-transitions?page=1&pageSize=20`

## 分阶段状态

### 阶段 0：状态盘点和规则冻结

状态：已完成，已按当前销售到交付流程更新。

### 阶段 1：项目状态机最小闭环

状态：已完成，当前项目主路径从 `designing` 开始。

### 阶段 2：项目状态副作用收口

状态：已完成。

首批已收口规则：

- `invalid / on_hold / acceptance` 项目禁止新增施工日志。
- `invalid / acceptance` 项目禁止新增摄像头。
- 只有 `constructing / acceptance` 项目允许发起或查看验收相关流程。

### 阶段 3：客户状态机最小闭环

状态：已完成，当前客户主路径到 `signed` 结束销售阶段。

### 阶段 4：客户和项目状态联动

状态：已完成。

已落地规则：

- 客户执行 `start_design` 前，端侧必须先创建/确认一个同客户同房产的 `designing` 项目。
- 后端仍校验客户必须已有主房产，并复用已有有效项目作为兜底，防止重复项目。
- 项目执行 `sign_contract` 成功后，后端自动把关联客户从 `designing` 推进到 `signed`；客户已是 `signed` 时保持不变。
- 项目签约不再写旧客户状态 `contracted`。
- 项目暂停、作废、竣工验收不会反向自动修改客户状态。
- 端侧应在客户开始设计前显式创建/确认项目，再通过项目状态机完成交付。

### 阶段 5：前端和小程序动作式对接

状态：已完成后端接口和 Admin 端最小闭环。

端侧对接文档：

- Admin：见 `docs/status-machine-remediation/admin/`。
- 微信小程序：见 `docs/status-machine-remediation/wechat/`。

### 阶段 6：施工阶段子状态机

状态：执行中，已完成总方案、Admin 对接文档、微信小程序对接文档、第一批后端硬门禁、施工阶段状态查询接口增强、Admin 项目详情阶段进度展示、Admin 验收入口第一版对接和小程序验收入口第一版对接。

目标：

- 施工日志 `stage_code / node_name` 从展示分类升级为受控施工阶段。
- 前一必需施工阶段未验收通过，不允许进入下一阶段。
- 必需施工阶段未全部完成，不允许项目执行 `start_acceptance` 进入竣工验收。

执行计划见 `docs/status-machine-remediation/2026-05-24-construction-stage-status-machine-plan.md`。

## 执行原则

- 状态变更必须通过 `action`，不能只传 `to_status`。
- 成功状态变更必须写日志。
- 旧接口短期兼容，但不得绕过状态机。
- repository 只负责数据读写，状态规则落在 domain/service。
- 错误响应必须经过 `Errors.*` 包装。
