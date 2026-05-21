# 微信小程序状态机对接总览

日期：2026-05-21

## 对接目标

微信小程序员工端需要从“直接提交 `status` 字段”调整为“详情页读取可执行动作，用户触发动作后调用状态流转接口”。

本次对接覆盖：

- 项目状态机：项目生命周期动作、签约金额、暂停恢复、作废。
- 客户状态机：客户生命周期动作、沉睡、重新激活、作废。
- 客户项目联动：项目签约成功后同步客户签约状态。
- 状态动作和时间线：可执行动作列表、状态流转日志分页展示。

## 文档索引

- [项目状态机对接](./2026-05-21-project-status-machine-integration.md)
- [客户状态机对接](./2026-05-21-customer-status-machine-integration.md)
- [客户项目状态联动对接](./2026-05-21-customer-project-status-linkage.md)
- [状态动作和时间线对接](./2026-05-21-status-actions-and-transition-timeline.md)

## 当前代码状态

当前仓库未发现 `apps/wechat` 目录；仓库内只有 `apps/h5`，且未发现状态机接口调用点。

后续接入真实微信小程序端时，应按本文档目录下的对接文档执行，并满足以下规则：

- 新代码不要通过 `PATCH /projects/:id` 或 `PATCH /customers/:id` 直接提交 `status`。
- 状态按钮来自 `GET /status-actions` 返回值。
- 状态变更统一调用 `POST /status-transition`。
- 状态时间线来自 `GET /status-transitions?page=1&pageSize=20`。
- 后端 400 / 403 是最终准入结果，小程序端只做体验层禁用和提示。
