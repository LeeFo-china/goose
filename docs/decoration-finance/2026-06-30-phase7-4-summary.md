# Phase 7.4 财务人工修正闭环总结

日期：2026-06-30

## 当前结论

Phase 7.4 已把财务对账异常从“只读发现问题”推进到“Admin 侧可受控修正并关闭异常”。

当前已覆盖三类核心对账异常：

- `payment_unallocated`：已确认收款未核销到应收计划。
- `payment_without_ledger`：已确认收款缺少项目收款台账。
- `ledger_without_payment`：项目收款台账缺少收款关联。

本阶段仍坚持一个边界：对账页只负责发现异常和路由到修正入口，实际写操作必须进入对应业务页面，由具备权限的 Admin 操作，并写入审计信息。

## 已上线能力

### 1. 人工收款核销

用途：处理 `payment_unallocated`。

能力：

- Admin 可在应收计划详情中选择 confirmed payment 做人工核销。
- 支持核销、调整核销、撤销核销。
- 核销后应收计划的已收、未收、状态会重新计算。
- 对账异常会根据源数据重新计算，不靠手工标记关闭。

权限：

- 读取：`finance.receivable.view`
- 管理：`finance.receivable.manage`

主要文档：

- `docs/decoration-finance/2026-06-29-phase7-4-manual-allocation-smoke.md`

### 2. 缺失项目收款台账补生成

用途：处理 `payment_without_ledger`。

能力：

- 对 confirmed project payment 补生成 `project_payment` 入账流水。
- 防重复：同一 payment 不会重复生成项目收款台账。
- Admin 财务台账页可从 payment 精确跳转并显示补生成入口。
- 写入补生成原因和 metadata，方便后续追溯。

权限：

- 管理：`finance.reconciliation.manage`

主要文档：

- `docs/decoration-finance/2026-06-29-phase7-4-payment-ledger-repair-smoke.md`

### 3. 历史收款台账关联 payment

用途：处理可追溯到真实 confirmed payment 的 `ledger_without_payment`。

能力：

- Admin 财务台账页可将历史 `project_payment` 收入流水关联到 confirmed payment。
- 后端校验：
  - 同租户。
  - 同项目。
  - payment 状态必须是 `confirmed`。
  - payment 金额必须与 ledger 金额一致。
  - payment 不能已存在另一条项目收款台账。
  - ledger 必须是未关联 payment、未标记历史的 `project_payment` 收入流水。
- 写入审计字段：
  - `payment_linked_at`
  - `payment_linked_by`
  - `payment_link_reason`
  - `payment_link_previous_payment_id`

权限：

- 管理：`finance.reconciliation.manage`

主要文档：

- `docs/decoration-finance/2026-06-30-phase7-4-ledger-legacy-repair-smoke.md`
- `docs/decoration-finance/2026-06-30-phase7-4-ledger-legacy-repair-post-release-smoke.md`

### 4. 历史收款台账标记

用途：处理无法追溯到真实 confirmed payment、但确认不应继续进入对账异常的历史 `ledger_without_payment`。

能力：

- Admin 财务台账页可把未关联 payment 的历史项目收款流水标记为历史流水。
- 标记后该 ledger 不再进入 `ledger_without_payment`。
- 不会伪造 payment，不会自动补建 payment，不会修改 workflow。
- 写入审计字段：
  - `legacy_payment_ledger_marked_at`
  - `legacy_payment_ledger_marked_by`
  - `legacy_payment_ledger_reason`

权限：

- 管理：`finance.reconciliation.manage`

## Admin 当前边界

Admin 是财务人工修正唯一入口。

当前 Admin 已支持：

- 对账异常列表只读发现异常。
- 异常 action 精确跳转到对应修正页面。
- 应收计划页人工核销。
- 财务台账页补生成缺失台账。
- 财务台账页关联历史收款流水。
- 财务台账页标记历史流水。

当前 Admin 尚未支持：

- 独立的“修正记录/审计详情”列表。
- 按修正人、修正类型、修正时间筛选。
- 对账异常处理效率统计。
- 财务主管视角的修正复核或导出。

## 小程序当前边界

小程序本阶段无必改。

小程序继续保持：

- 不直接调用财务台账修正接口。
- 不本地推导对账异常修正动作。
- 不展示或操作 Admin 财务修正入口。
- workflow、收款、施工、费用仍按各自业务契约消费后端数据。

如未来需要小程序展示修正结果，只能做只读展示，例如：

- 收款是否已核销。
- 台账是否已生成。
- 财务确认状态。

不能在小程序侧增加修账操作。

## 数据和审计边界

本阶段新增或使用的关键审计字段：

- `finance_ledger_entries.payment_linked_at`
- `finance_ledger_entries.payment_linked_by`
- `finance_ledger_entries.payment_link_reason`
- `finance_ledger_entries.payment_link_previous_payment_id`
- `finance_ledger_entries.legacy_payment_ledger_marked_at`
- `finance_ledger_entries.legacy_payment_ledger_marked_by`
- `finance_ledger_entries.legacy_payment_ledger_reason`
- `project_receivable_allocations.source_type`
- `project_receivable_allocations.source_id`
- `project_receivable_allocations.reversed_at`
- `project_receivable_allocations.reverse_reason`

对账异常是否关闭，仍以当前源数据重新计算为准。不要通过单独状态字段“假关闭”异常。

## 已知问题

### RAG sync README 冲突

执行 `pnpm run sync:rag-docs` 时，post-release smoke 文档已经在 manifest 中显示为已同步，但 `docs/decoration-finance/README.md` 更新无法上传。

低层同步脚本返回：

```text
LightRAG API request failed: HTTP 409.
Document storage already contains 'README.md' (Status: processed).
Delete the existing record before re-inserting.
```

原因判断：

- gooes sync 脚本上传 text 时传入 `file_source=gooes/docs/decoration-finance/README.md`。
- LightRAG 服务端仍按原始文件名 `README.md` 做唯一性校验。
- 仓库中有多个 `README.md`，因此后续 README 更新容易冲突。

建议后续单独处理：

- 调整 RAG 同步工具的 text 文档 file source / display name 策略，确保服务端唯一键包含 repo 和相对路径。
- 或在 LightRAG 端支持同名不同路径文档更新。
- 不建议手动伪造 manifest hash 来绕过问题。

## 下一阶段建议

### Phase 7.5：财务修正审计视图

优先级最高。

原因：修账能力已经上线，财务主管需要能追溯“谁在什么时候因为什么修正了什么”。

建议能力：

- Admin 新增财务修正审计列表。
- 支持筛选：
  - 修正类型。
  - 项目。
  - 操作人。
  - 时间范围。
- 展示：
  - 操作人。
  - 操作时间。
  - 修正原因。
  - payment ID。
  - ledger ID。
  - receivable plan ID。
  - allocation ID。
- 从财务台账、应收计划、对账异常可跳转到对应审计记录。

### Phase 7.6：对账异常运营统计

在审计视图后实施。

建议能力：

- 异常数量趋势。
- 已处理 / 忽略 / 解决数量。
- 按项目、异常类型、处理人统计。
- 长时间未处理异常提醒。

## 当前阶段验收状态

- API 单测已覆盖关键修正校验。
- migration 已应用并验证 Local/Remote 对齐。
- API smoke 已验证修正前后异常数量变化。
- Admin post-release smoke 已验证精确跳转和只读展示。
- 小程序无必改。

Phase 7.4 可以视为业务闭环完成，后续重点转入修正审计和运营统计。
