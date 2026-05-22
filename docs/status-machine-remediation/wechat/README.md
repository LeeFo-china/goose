# 微信小程序状态机对接总览

日期：2026-05-21

## 对接目标

微信小程序员工端需要从“直接提交 `status` 字段”调整为“详情页读取可执行动作，用户触发动作后调用状态流转接口”。

当前有效流程：

- 客户销售阶段：`potential` 线索 -> `following` 跟进中 -> `arrived` 已到店 -> `designing` 设计中。
- 客户点击 `start_design` 时，小程序端必须先完成项目创建/确认；项目存在后才调用客户状态动作进入 `designing`。
- 项目交付阶段：`designing` 设计中 -> `proposal_confirmed` 方案已确认 -> `signed` 已签约 -> `design_finalized` 设计定稿 -> `pending_start` 待开工 -> `started` 已开工 -> `constructing` 施工中 -> `acceptance` 竣工验收。

已下线内容：

- 客户 `ordered / contracted` 状态。
- 客户 `place_order / sign_contract` 动作。
- 项目 `lead / measure / negotiating / completed / after_sale` 状态。
- 项目 `start_measure / start_negotiation / start_design / complete_project / start_after_sale` 动作。

## 文档索引

- [客户状态机对接](./2026-05-21-customer-status-machine-integration.md)
- [项目状态机对接](./2026-05-21-project-status-machine-integration.md)
- [客户项目状态联动对接](./2026-05-21-customer-project-status-linkage.md)
- [状态动作和时间线对接](./2026-05-21-status-actions-and-transition-timeline.md)

## 当前代码状态

当前仓库未发现 `apps/wechat` 目录；仓库内只有 `apps/h5`，且未发现状态机接口调用点。

后续接入真实微信小程序端时，应按本文档目录下的对接文档执行，并满足以下规则：

- 新代码不要通过 `PATCH /projects/:id` 或 `PATCH /customers/:id` 直接提交 `status`。
- 状态按钮来自 `GET /status-actions` 返回值。
- 状态变更统一调用 `POST /status-transition`。
- 状态时间线来自 `GET /status-transitions?page=1&pageSize=20`。
- 客户开始设计时，如果缺少主房产，应在项目创建/确认表单内先补齐主房产。
- 项目执行 `schedule_construction` 进入待开工前，必须先确认开工日期 `start_date`。
- 服务端返回 400 / 403 时直接展示后端中文错误。
