# 阶段 0：状态盘点与规则冻结

日期：2026-05-21

## 当前状态盘点

### 客户状态

当前定义位置：`packages/domain/src/customer.ts`

| 状态 | 标签 | 当前语义 |
| --- | --- | --- |
| `potential` | 潜在客户 | 新进入 CRM、还没有稳定跟进动作 |
| `following` | 跟进中 | 已进入销售跟进 |
| `arrived` | 已到店 | 客户已到店或完成等价到访动作 |
| `ordered` | 已下定 | 已支付定金或形成下定意向 |
| `contracted` | 已签约 | 已完成签约 |
| `dormant` | 沉睡客户 | 暂无进展，后续可重新激活 |
| `invalid` | 无效客户 | 作废、误录入、重复且不可继续跟进 |

### 项目状态

当前定义位置：`packages/domain/src/project.ts`

| 状态 | 标签 | 当前语义 |
| --- | --- | --- |
| `lead` | 线索客户 | 项目线索阶段 |
| `measure` | 量房中 | 已安排或正在量房 |
| `negotiating` | 谈单中 | 方案 / 报价 / 合同沟通中 |
| `signed` | 已签约 | 项目签约完成 |
| `designing` | 设计中 | 设计深化阶段 |
| `constructing` | 施工中 | 施工履约阶段 |
| `on_hold` | 已暂停 | 项目暂停 |
| `acceptance` | 验收中 | 项目进入验收 |
| `completed` | 已完工 | 项目交付完成 |
| `after_sale` | 售后中 | 完工后售后处理 |
| `invalid` | 无效客户 | 项目作废或不再有效 |

## 冻结原则

1. 客户状态表达 CRM 转化生命周期。
2. 项目状态表达单个工程项目的履约生命周期。
3. 客户签约和项目签约可以联动，但不能合并成同一个状态字段。
4. `invalid` 是强终态，默认不允许恢复。后续如需恢复，必须新增显式 `restore_*` 动作。
5. `completed` 默认不允许回退到施工状态。返工或维修走 `start_after_sale`。
6. `on_hold` 是暂停态，必须记录暂停前状态，恢复时回到可恢复状态。
7. 状态变更必须通过动作执行，动作负责校验前置条件和副作用。

## 项目状态动作表

| Action | From | To | 前置条件 | 副作用 |
| --- | --- | --- | --- | --- |
| `start_measure` | `lead` | `measure` | 项目存在，未作废 | 写状态日志 |
| `start_negotiation` | `measure` | `negotiating` | 项目存在，未作废 | 写状态日志 |
| `sign_contract` | `negotiating` | `signed` | `signed_amount > 0` | 写状态日志，必要时同步客户为 `contracted` |
| `start_design` | `signed` | `designing` | 项目已签约 | 写状态日志 |
| `start_construction` | `designing`, `signed` | `constructing` | 项目未暂停 / 未作废 | 写状态日志 |
| `pause_project` | `measure`, `negotiating`, `signed`, `designing`, `constructing`, `acceptance`, `after_sale` | `on_hold` | 必须传 `reason` | 记录 `paused_from_status` |
| `resume_project` | `on_hold` | 暂停前状态 | 存在 `paused_from_status` | 清理或归档暂停上下文 |
| `start_acceptance` | `constructing` | `acceptance` | 施工阶段有效 | 可触发验收流程 |
| `complete_project` | `acceptance`, `constructing` | `completed` | 完工条件满足 | 写状态日志，影响首页统计 |
| `start_after_sale` | `completed` | `after_sale` | 项目已完工 | 写状态日志 |
| `mark_invalid` | 非 `completed`, 非 `invalid` | `invalid` | 必须传 `reason` | 清公开缓存，拦截后续施工写操作 |

## 客户状态动作表

| Action | From | To | 前置条件 | 副作用 |
| --- | --- | --- | --- | --- |
| `start_following` | `potential` | `following` | 客户有效 | 写状态日志 |
| `mark_arrived` | `following` | `arrived` | 客户有效 | 写状态日志 |
| `place_order` | `arrived`, `following` | `ordered` | 客户有效 | 写状态日志 |
| `sign_contract` | `ordered`, `arrived`, `following` | `contracted` | 客户有效 | 可要求关联或创建项目 |
| `mark_dormant` | `potential`, `following`, `arrived`, `ordered` | `dormant` | 必须传 `reason` | 写状态日志 |
| `reactivate` | `dormant` | `following` | 客户有效，避免和开始跟进动作语义重叠 | 写状态日志 |
| `mark_invalid` | 非 `contracted`, 非 `invalid` | `invalid` | 必须传 `reason` | 写状态日志 |

## 待业务确认问题

1. `contracted` 客户是否允许作废。如果允许，是否需要 `void_contracted_customer` 独立动作。
2. `completed` 项目是否允许重新施工。如果允许，是否走 `start_after_sale` 还是新增 `reopen_construction`。
3. 项目 `sign_contract` 是否必须自动同步客户 `contracted`。
4. 客户 `sign_contract` 是否必须创建项目，还是允许只改客户状态。
5. `constructing -> completed` 是否必须先走 `acceptance`。

## 阶段 0 验收口径

- 状态动作表已落文档。
- 终态和恢复策略已明确。
- 待确认问题有业务结论后，才能进入阶段 1 代码实现。
- 后续每次规则变化都必须先改本文档，再改代码。
