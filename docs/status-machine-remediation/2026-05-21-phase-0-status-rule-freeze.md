# 阶段 0：状态盘点与规则冻结

日期：2026-05-21

## 当前状态盘点

### 客户状态

定义位置：`packages/domain/src/customer.ts`

| 状态 | 标签 | 当前语义 |
| --- | --- | --- |
| `potential` | 潜在客户 | 新进入 CRM、还没有稳定跟进动作 |
| `following` | 跟进中 | 已进入销售跟进 |
| `arrived` | 已到店 | 客户已到店或完成等价到访动作 |
| `designing` | 设计中 | 已基于客户和房产信息进入设计方案阶段，且项目已创建/确认 |
| `dormant` | 沉睡客户 | 暂无进展，后续可重新激活 |
| `invalid` | 无效客户 | 作废、误录入、重复且不可继续跟进 |

### 项目状态

定义位置：`packages/domain/src/project.ts`

| 状态 | 标签 | 当前语义 |
| --- | --- | --- |
| `designing` | 设计中 | 项目已创建，正在进行设计方案 |
| `proposal_confirmed` | 方案已确认 | 平面方案和预算已确认 |
| `signed` | 已签约 | 项目合同已签署 |
| `design_finalized` | 设计定稿 | 施工图等设计文件已确认 |
| `pending_start` | 待开工 | 已排期，等待开工日期 |
| `started` | 已开工 | 已确认开工 |
| `constructing` | 施工中 | 正式进场，按节点施工 |
| `on_hold` | 已暂停 | 项目暂停 |
| `acceptance` | 竣工验收 | 项目进入竣工验收 |
| `invalid` | 无效项目 | 项目作废或不再有效 |

## 冻结原则

1. 客户状态表达销售生命周期，不表达项目签约和交付履约。
2. 项目状态表达单个工程项目的交付生命周期。
3. `designing` 是销售到项目的衔接节点：客户进入 `designing` 前，端侧必须先创建/确认项目。
4. 项目签约前必须先完成设计和方案确认。
5. `invalid` 是强终态，默认不允许恢复。后续如需恢复，必须新增显式动作。
6. `on_hold` 是暂停态，必须记录暂停前状态，恢复时回到可恢复状态。
7. 状态变更必须通过动作执行，动作负责校验前置条件和副作用。

## 客户状态动作表

| Action | From | To | 前置条件 | 副作用 |
| --- | --- | --- | --- | --- |
| `start_following` | `potential` | `following` | 客户有效 | 写状态日志 |
| `mark_arrived` | `following` | `arrived` | 客户有效 | 写状态日志 |
| `start_design` | `arrived` | `designing` | 客户有效，已有主房产，项目已创建/确认 | 写状态日志，后端复用已有有效项目作为兜底 |
| `mark_dormant` | `potential`, `following`, `arrived`, `designing` | `dormant` | 必须传 `reason` | 写状态日志 |
| `reactivate` | `dormant` | `following` | 客户有效 | 写状态日志 |
| `mark_invalid` | `potential`, `following`, `arrived`, `designing`, `dormant` | `invalid` | 必须传 `reason` | 写状态日志 |

## 项目状态动作表

| Action | From | To | 前置条件 | 副作用 |
| --- | --- | --- | --- | --- |
| `confirm_proposal` | `designing` | `proposal_confirmed` | 项目有效 | 写状态日志 |
| `sign_contract` | `proposal_confirmed` | `signed` | `signed_amount > 0` | 写状态日志 |
| `finalize_design` | `signed` | `design_finalized` | 项目已签约 | 写状态日志 |
| `schedule_construction` | `design_finalized` | `pending_start` | 设计已定稿 | 写状态日志 |
| `start_project` | `pending_start` | `started` | 已排期开工 | 写状态日志 |
| `start_construction` | `started` | `constructing` | 已确认开工 | 写状态日志 |
| `start_acceptance` | `constructing` | `acceptance` | 施工阶段有效 | 可触发验收流程 |
| `pause_project` | 进行中项目状态 | `on_hold` | 必须传 `reason` | 记录 `paused_from_status` |
| `resume_project` | `on_hold` | 暂停前状态 | 存在 `paused_from_status` | 恢复暂停前状态 |
| `mark_invalid` | 非 `invalid` | `invalid` | 必须传 `reason` | 清公开缓存，拦截后续写操作 |

## 已下线规则

- 客户不再有“下定”和“客户签约”状态。
- 项目不再有“量房、谈单、完工、售后”工程状态。
- 竣工验收是当前交付主路径的最后状态。

## 阶段 0 验收口径

- 状态动作表已落文档。
- 终态和恢复策略已明确。
- Admin 和小程序对接文档已放到各自子目录。
- 后续每次规则变化都必须先改本文档，再改代码。
