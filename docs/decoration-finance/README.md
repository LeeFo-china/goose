# 装修公司财务系统文档

本目录收纳装修公司项目经营财务系统的 PRD、实施计划、Admin 对接、小程序对接、数据模型和支付能力设计。

范围聚焦租户装修业务内的项目收付款、报销与成本、财务流水、项目利润、workflow 联动和未来微信支付接入。平台 SaaS 计费、租户余额、短信/AI 扣费等平台收入能力不放在本目录，避免和租户项目经营财务混淆。

## 文档索引

- [2026-06-16-prd.md](./2026-06-16-prd.md)：装修公司财务系统 PRD，包含 workflow、Admin、小程序、权限和微信支付配置原则。
- [implementation-plan.md](./implementation-plan.md)：第一阶段实施计划，聚焦人工确认收款、workflow 推进、财务台账、Admin 和小程序交接。
- [2026-06-23-phase2-receivables-implementation-plan.md](./2026-06-23-phase2-receivables-implementation-plan.md)：第二阶段应收计划和逾期管理实施计划。
- [2026-06-23-phase2-receivables-miniprogram-handoff.md](./2026-06-23-phase2-receivables-miniprogram-handoff.md)：第二阶段应收计划小程序对接说明，包含 workflow v2 字段、complete payload 和 smoke 清单。
- [2026-06-23-phase2-receivables-smoke.md](./2026-06-23-phase2-receivables-smoke.md)：第二阶段应收计划 Task 6 smoke 记录，包含只读接口验收、样本缺失阻塞原因和完整 E2E 继续条件。
- [2026-06-24-phase2-1-receivable-allocation-response.md](./2026-06-24-phase2-1-receivable-allocation-response.md)：第二阶段补丁，说明收款 complete 响应返回 `receivable_allocation` 只读验收字段。
- [2026-06-23-expense-approval-payment-phase-plan.md](./2026-06-23-expense-approval-payment-phase-plan.md)：下一阶段费用审批与支出付款计划，包含 Admin 闭环、小程序影响评估和 smoke 验收口径。
- [2026-06-23-expense-approval-payment-task0-baseline.md](./2026-06-23-expense-approval-payment-task0-baseline.md)：费用审批与支出付款 Task 0 基线核查记录，包含 active workflow、测试账号、Admin 只读 smoke 和后续受控样本建议。
- [2026-06-23-expense-approval-payment-task1-5-smoke.md](./2026-06-23-expense-approval-payment-task1-5-smoke.md)：费用审批与支出付款 Task 1-5 修复、E2E smoke、Admin 可见性和台账幂等验收记录。
- [2026-06-23-expense-approval-payment-miniprogram-handoff.md](./2026-06-23-expense-approval-payment-miniprogram-handoff.md)：费用审批与支出付款的小程序影响说明，明确当前无需改代码及未来接入 workflow v2 契约。
- [2026-06-23-phase3-project-operating-summary.md](./2026-06-23-phase3-project-operating-summary.md)：第三阶段项目经营汇总和利润看板，包含后端接口、Admin 对接、小程序影响和 smoke 记录。
- [2026-06-24-phase4-cost-budget-profit-prd.md](./2026-06-24-phase4-cost-budget-profit-prd.md)：第四阶段项目成本预算与利润偏差 PRD，定义成本分类、预算、归集、利润口径和预警规则。
- [2026-06-24-phase4-cost-budget-profit-implementation-plan.md](./2026-06-24-phase4-cost-budget-profit-implementation-plan.md)：第四阶段项目成本预算与利润偏差实施计划，拆分 migration、后端、Admin、小程序 handoff 和 smoke 任务。
- [2026-06-24-phase4-cost-budget-profit-smoke.md](./2026-06-24-phase4-cost-budget-profit-smoke.md)：第四阶段成本预算与利润偏差 smoke 记录，包含 API、Admin 页面、预算编辑和风险字段验收。
- [2026-06-24-phase4-post-release-acceptance.md](./2026-06-24-phase4-post-release-acceptance.md)：第四阶段合入 main 后的发布后验收记录，包含 3000/3010 smoke、migration 对齐、小程序和 Admin 观察结论。
- [2026-06-24-phase4-cost-budget-profit-miniprogram-handoff.md](./2026-06-24-phase4-cost-budget-profit-miniprogram-handoff.md)：第四阶段小程序对接说明，明确当前无需改代码及后续费用申请成本分类接入口径。
- [2026-06-24-phase5-finance-analysis-warning-prd.md](./2026-06-24-phase5-finance-analysis-warning-prd.md)：第五阶段经营分析与预算预警闭环 PRD，定义风险筛选、风险原因、Admin 处理入口和小程序边界。
- [2026-06-24-phase5-finance-analysis-warning-miniprogram-handoff.md](./2026-06-24-phase5-finance-analysis-warning-miniprogram-handoff.md)：第五阶段小程序对接说明，明确本阶段无必改及后续可选只读展示契约。
- [2026-06-24-phase5-finance-analysis-warning-smoke.md](./2026-06-24-phase5-finance-analysis-warning-smoke.md)：第五阶段经营预警 API、Admin 和小程序影响 smoke 记录。
- [2026-06-28-phase6-receivable-operations-prd.md](./2026-06-28-phase6-receivable-operations-prd.md)：第六阶段应收运营 PRD，包含人工新增、调整、取消、跟进和事件追溯。
- [2026-06-28-phase6-receivable-operations-implementation-plan.md](./2026-06-28-phase6-receivable-operations-implementation-plan.md)：第六阶段应收运营实施计划。
- [2026-06-28-phase6-receivable-operations-post-release-smoke.md](./2026-06-28-phase6-receivable-operations-post-release-smoke.md)：第六阶段应收运营发布后 smoke 记录。
- [2026-06-28-phase6-receivable-operations-miniprogram-handoff.md](./2026-06-28-phase6-receivable-operations-miniprogram-handoff.md)：第六阶段小程序影响说明，明确当前无必改。
- [2026-06-28-phase7-finance-reconciliation-dashboard-plan.md](./2026-06-28-phase7-finance-reconciliation-dashboard-plan.md)：第七阶段财务对账与运营报表方向计划。
- [2026-06-29-phase7-task1-reconciliation-exceptions-handoff.md](./2026-06-29-phase7-task1-reconciliation-exceptions-handoff.md)：第七阶段 Task 1 对账异常接口 handoff。
- [2026-06-29-phase7-reconciliation-operating-report-smoke.md](./2026-06-29-phase7-reconciliation-operating-report-smoke.md)：第七阶段 worktree 内只读 smoke 记录。
- [2026-06-29-phase7-post-release-smoke-handoff.md](./2026-06-29-phase7-post-release-smoke-handoff.md)：第七阶段发布后 smoke 与 Admin/小程序对接回执。
- [2026-06-29-phase7-1-reconciliation-closure-plan.md](./2026-06-29-phase7-1-reconciliation-closure-plan.md)：Phase 7.1 财务对账异常处理闭环计划。
- [2026-06-29-phase7-1-reconciliation-closure-smoke.md](./2026-06-29-phase7-1-reconciliation-closure-smoke.md)：Phase 7.1 对账异常处理闭环 migration、Admin smoke 和源数据不变性验收记录。
- [2026-06-29-phase7-1-post-release-smoke.md](./2026-06-29-phase7-1-post-release-smoke.md)：Phase 7.1 合入 main 后的发布后只读 smoke、GitHub Actions 观察和 Admin/小程序回执。
- [2026-06-29-phase7-2-admin-ux-post-release-smoke.md](./2026-06-29-phase7-2-admin-ux-post-release-smoke.md)：Phase 7.2 Admin 对账体验合入 main 后的发布后只读 smoke 记录。
- [2026-06-29-phase7-3-reconciliation-correction-entry-plan.md](./2026-06-29-phase7-3-reconciliation-correction-entry-plan.md)：Phase 7.3 对账异常修正入口计划，明确只做人工引导、不自动修账。
- [2026-06-29-phase7-3-reconciliation-correction-entry-smoke.md](./2026-06-29-phase7-3-reconciliation-correction-entry-smoke.md)：Phase 7.3 对账异常修正入口实施与只读 smoke 记录。
- [2026-06-29-phase7-3-post-release-smoke.md](./2026-06-29-phase7-3-post-release-smoke.md)：Phase 7.3 合入 main 后的发布后只读 smoke、Admin 和小程序回执。
- [2026-06-29-phase7-4-manual-correction-closure-plan.md](./2026-06-29-phase7-4-manual-correction-closure-plan.md)：Phase 7.4 单据级人工修正闭环计划，明确先做人工修正能力、不做自动修账。
- [2026-06-29-phase7-4-manual-allocation-smoke.md](./2026-06-29-phase7-4-manual-allocation-smoke.md)：Phase 7.4 人工收款核销入口实施与 smoke 记录，包含 migration 核验、API 写入 smoke、Admin 只读 smoke 和小程序边界。
- [2026-06-29-phase7-4-post-release-smoke.md](./2026-06-29-phase7-4-post-release-smoke.md)：Phase 7.4 人工核销合入 main 后的发布后 smoke，包含 migration list 验证口径、API/Admin 只读核验和后续任务顺序。
- [2026-06-29-phase7-4-payment-ledger-repair-smoke.md](./2026-06-29-phase7-4-payment-ledger-repair-smoke.md)：Phase 7.4 收款台账补生成实施与 smoke 记录，覆盖 `payment_without_ledger` 精确跳转、Admin 补生成入口、API 防重和 migration 验证。
- [2026-06-30-phase7-4-ledger-legacy-repair-smoke.md](./2026-06-30-phase7-4-ledger-legacy-repair-smoke.md)：Phase 7.4 历史收款台账修正实施与 smoke 记录，覆盖 `ledger_without_payment` 精确跳转、关联 confirmed payment、标记历史和异常关闭。
- [2026-06-30-phase7-4-ledger-legacy-repair-post-release-smoke.md](./2026-06-30-phase7-4-ledger-legacy-repair-post-release-smoke.md)：Phase 7.4 历史收款台账修正合入 main 后的发布后 smoke，覆盖 migration、API 只读核验、Admin 精确跳转和小程序边界。
- [2026-06-30-phase7-4-summary.md](./2026-06-30-phase7-4-summary.md)：Phase 7.4 财务人工修正闭环总结，汇总人工核销、补生成台账、历史台账关联/标记、Admin/API/小程序边界和后续审计视图方向。
- [2026-06-30-phase7-5-finance-correction-audit.md](./2026-06-30-phase7-5-finance-correction-audit.md)：Phase 7.5 财务修正审计视图，覆盖统一只读审计 API、Admin 修正审计 tab、权限和小程序边界。
- [2026-06-30-phase7-5-post-release-smoke.md](./2026-06-30-phase7-5-post-release-smoke.md)：Phase 7.5 财务修正审计合入 main 后的发布后 smoke，覆盖 API 只读聚合、Admin 页面和小程序边界。
- [2026-06-30-phase7-5-1-generated-ledger-audit.md](./2026-06-30-phase7-5-1-generated-ledger-audit.md)：Phase 7.5.1 补生成项目收款台账纳入修正审计，覆盖 API operation、Admin 筛选和小程序边界。
- [2026-06-30-phase7-6-reconciliation-operating-stats.md](./2026-06-30-phase7-6-reconciliation-operating-stats.md)：Phase 7.6 财务对账运营统计，覆盖只读统计 API、Admin 运营统计区和小程序边界。
- [2026-06-30-phase7-6-post-release-smoke.md](./2026-06-30-phase7-6-post-release-smoke.md)：Phase 7.6 财务对账运营统计发布后只读 smoke 记录。
- [2026-06-30-phase7-6-rag-sync-dry-run-investigation.md](./2026-06-30-phase7-6-rag-sync-dry-run-investigation.md)：Phase 7.6 RAG sync dry-run / upload 失败核查，确认实际失败为 LightRAG 409 已存在文档。
- [2026-06-30-phase7-7-7-8-expense-reconciliation-summary.md](./2026-06-30-phase7-7-7-8-expense-reconciliation-summary.md)：Phase 7.7/7.8 费用侧对账异常、项目级对账摘要增强、Admin 对接和小程序边界。
- [2026-06-30-phase7-7-7-8-post-release-smoke.md](./2026-06-30-phase7-7-7-8-post-release-smoke.md)：Phase 7.7/7.8 发布后只读 smoke，覆盖费用异常、费用台账跳转和项目详情对账摘要。
- [2026-06-30-rag-sync-409-resolution.md](./2026-06-30-rag-sync-409-resolution.md)：RAG sync 409 修复记录，说明同源旧文档删除后重传策略和验证结果。
- [2026-06-30-phase7-9-expense-reconciliation-correction-plan.md](./2026-06-30-phase7-9-expense-reconciliation-correction-plan.md)：Phase 7.9 费用对账修正闭环计划，覆盖费用未入账、金额不一致和缺成本分类。
- [2026-06-30-phase7-9-post-release-smoke.md](./2026-06-30-phase7-9-post-release-smoke.md)：Phase 7.9 发布后只读 smoke，覆盖费用异常详情、修正动作、修正审计、Admin 处理抽屉和 migration 阻塞记录。
- [2026-06-30-phase8-finance-reporting-closing-prd.md](./2026-06-30-phase8-finance-reporting-closing-prd.md)：Phase 8 财务报表与月度结账 PRD，定义月度经营总览、项目排行、成本分类、应收账龄、结账快照和导出。
- [2026-06-30-phase8-task0-baseline.md](./2026-06-30-phase8-task0-baseline.md)：Phase 8 Task 0 基线核查，记录 migration 连接口径、已有 API/Admin 页面、索引和权限缺口。
- [2026-06-30-phase8-task1-5-implementation-smoke.md](./2026-06-30-phase8-task1-5-implementation-smoke.md)：Phase 8 Task 1-5 执行记录，覆盖月度总览 API、Admin 财务报表、结账快照、migration 和 smoke 结果。
- [2026-06-30-phase8-post-release-smoke.md](./2026-06-30-phase8-post-release-smoke.md)：Phase 8 Task 1-5 合入 main 后的发布后 smoke 记录，覆盖 API、Admin 页面、RAG 同步和只读边界。
- [2026-06-30-phase8-task6-10-next-plan.md](./2026-06-30-phase8-task6-10-next-plan.md)：Phase 8 后半段 Task 6-10 计划，覆盖结账写操作受控、快照差异、导出、专项报表、审计闭环和小程序边界。
- [2026-06-30-phase8-task6-10-implementation-smoke.md](./2026-06-30-phase8-task6-10-implementation-smoke.md)：Phase 8 Task 6-10 执行记录，覆盖专项报表 API、CSV 导出、Admin 页面和结账受控写 smoke。
- [2026-06-30-phase8-task6-10-miniprogram-boundary.md](./2026-06-30-phase8-task6-10-miniprogram-boundary.md)：Phase 8 Task 6-10 小程序边界说明，明确本轮小程序无必改。
- [2026-06-30-phase8-1-snapshot-diff-audit-smoke.md](./2026-06-30-phase8-1-snapshot-diff-audit-smoke.md)：Phase 8.1 结账快照差异与修正审计闭环 smoke，覆盖 API 新字段、Admin 展示、当月审计跳转和小程序边界。
- [2026-06-30-phase8-1-post-release-smoke.md](./2026-06-30-phase8-1-post-release-smoke.md)：Phase 8.1 合入 main 后发布后只读 smoke，覆盖 API 新字段、Admin 页面、修正审计 month 筛选和只读边界。
- [2026-06-30-phase8-2-difference-sources-plan.md](./2026-06-30-phase8-2-difference-sources-plan.md)：Phase 8.2 结账差异来源追溯计划，定义差异来源 API、Admin 页面、修正审计联动和小程序边界。
- [2026-06-30-phase8-2-difference-sources-smoke.md](./2026-06-30-phase8-2-difference-sources-smoke.md)：Phase 8.2 月度差异来源追溯 smoke，覆盖 API、Admin 页面、审计跳转和只读边界。
- [2026-06-30-phase8-2-post-release-smoke.md](./2026-06-30-phase8-2-post-release-smoke.md)：Phase 8.2 发布后 smoke 和非空差异来源样本，覆盖真实应收计划来源、Admin 非空页和摘要加固。
- [2026-06-30-phase8-3-difference-resolution-plan.md](./2026-06-30-phase8-3-difference-resolution-plan.md)：Phase 8.3 月结差异处理闭环 PRD 与计划，定义差异处理记录、API、Admin 和 smoke 验收口径。
- [2026-06-30-phase8-3-difference-resolution-smoke.md](./2026-06-30-phase8-3-difference-resolution-smoke.md)：Phase 8.3 月结差异处理闭环 smoke，覆盖 migration、API、Admin 页面和小程序边界。
- [2026-06-30-wechat-pay-integration-prd.md](./2026-06-30-wechat-pay-integration-prd.md)：微信支付接入 PRD，明确租户独立商户优先、支付订单、回调幂等、workflow 对接、对账异常和小程序边界。
- [2026-06-30-phase7-7-7-8-miniprogram-boundary.md](./2026-06-30-phase7-7-7-8-miniprogram-boundary.md)：Phase 7.7/7.8 小程序边界说明，明确本轮无必改和后续可选员工端摘要口径。
- `admin-integration.md`：后续 Admin 菜单、页面、权限与交互对接。
- [miniprogram-handoff.md](./miniprogram-handoff.md)：小程序任务中心和财务确认收款对接。
- [2026-06-16-miniprogram-real-integration-plan.md](./2026-06-16-miniprogram-real-integration-plan.md)：小程序真实联调执行计划，包含 gooes 和 orange 的任务拆分。
- [2026-06-16-miniprogram-integration-acceptance.md](./2026-06-16-miniprogram-integration-acceptance.md)：小程序财务收款联调验收记录。
- `payment-provider-wechat-pay.md`：后续微信支付商户配置、回调、幂等和 workflow 自动推进设计。
- [data-model-and-migrations.md](./data-model-and-migrations.md)：第一阶段数据模型、migration、台账、权限和微信支付配置空壳。
- `rollout-and-acceptance.md`：后续灰度发布、验收记录和回滚方案。

## 命名约定

- 已定稿或评审过的文件使用 `YYYY-MM-DD-主题.md`。
- 持续维护型执行文档使用语义名。
- 本目录只放租户装修业务财务；平台级计费和用量结算继续放在对应 billing 文档中。
