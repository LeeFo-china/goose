# 销售到交付状态流

## 客户销售阶段

客户状态只表达销售推进，主路径为：

`potential` 线索 -> `following` 跟进中 -> `arrived` 已到店 -> `designing` 设计中

`designing` 是销售到项目的衔接节点。客户进入 `designing` 前，端侧必须先创建/确认项目；后端要求客户已有主房产信息，并复用已有有效项目作为兜底。

客户侧旧状态已下线：

- `ordered` 已下定
- `contracted` 已签约

客户侧旧动作已下线：

- `place_order`
- `sign_contract`

## 项目交付阶段

项目只表达交付推进，主路径为：

`designing` 设计中 -> `proposal_confirmed` 方案已确认 -> `signed` 已签约 -> `design_finalized` 设计定稿 -> `pending_start` 待开工 -> `started` 已开工 -> `constructing` 施工中 -> `acceptance` 竣工验收

项目侧旧工程流已下线：

- `lead`
- `measure`
- `negotiating`
- `completed`
- `after_sale`

项目侧旧动作已下线：

- `start_measure`
- `start_negotiation`
- `start_design`
- `complete_project`
- `start_after_sale`

## 数据迁移

迁移 `20260521213000_replace_legacy_project_status_flow.sql` 会把存量旧状态映射到新流程：

- 客户 `ordered / contracted` -> `designing`
- 项目 `lead / measure / negotiating` -> `designing`
- 项目 `completed / after_sale` -> `acceptance`

迁移同时收紧 `customers.status`、`projects.status`、客户状态日志、项目状态日志的数据库约束，防止旧状态再次写入。
