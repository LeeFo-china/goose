# Phase 7.5 财务修正审计视图

日期：2026-06-30

## 结论

Phase 7.5 新增 Admin 财务“修正审计”只读视图，用于追溯财务人工核销和台账修正记录。

本阶段把 Phase 7.4 已完成的人工修正能力沉淀成统一审计入口，方便财务主管查看“谁在什么时候因为什么修正了什么”。

## 范围

- API：`GET /finance/correction-audits`
- Admin：`/finance/audits`
- 权限：`finance.reconciliation.manage`
- 小程序：无必改，无新增入口

## 覆盖记录

- 人工核销收款：`manual_allocation`
- 调整人工核销：`adjust_allocation`
- 撤销人工核销：`reverse_allocation`
- 缺失项目收款台账补生成：`generate_payment_ledger`
- 历史收款台账关联 confirmed payment：`link_ledger_payment`
- 历史收款台账标记为历史流水：`mark_legacy_ledger`

## API 契约

```text
GET /finance/correction-audits
```

查询参数：

- `page`：默认 `1`
- `pageSize`：默认 `20`，最大 `100`
- `operation`：修正类型
- `project_id`：项目 ID
- `actor_employee_id`：操作人
- `date_from`：开始日期，`YYYY-MM-DD`
- `date_to`：结束日期，`YYYY-MM-DD`

返回字段：

- `list[]`：统一审计记录
- `pagination`：分页信息
- `summary.total`：当前筛选范围修正总数
- `summary.ledger_repair`：台账修正数量
- `summary.receivable_allocation`：应收核销修正数量

## Admin 行为

- 财务模块新增 `修正审计` tab。
- 页面展示 KPI、筛选条件和只读表格。
- 筛选支持日期、项目 ID、修正类型和操作人。
- 表格只提供跳转，不提供写操作。
- 目标链接限制在 `/finance/*`，避免外部跳转。

## 当前边界

- 不新增修正写操作。
- 不新增复核审批流。
- 不新增导出。
- 不新增数据库表。
- `manual_allocation` 当前没有稳定 `allocation_id`，第一版展示为空。
- 补生成台账已在 Phase 7.5.1 通过 ledger metadata 规范纳入列表。

## 验证

已执行：

```bash
cd apps/api
bun test src/services/finance-correction-audits.test.ts
pnpm exec tsc -p tsconfig.json --noEmit

cd apps/admin
bun test components/finance/finance-correction-audit-utils.test.ts components/finance/finance-module-tabs.test.ts
pnpm run check

git diff --check
```

## 后续

- Phase 7.6 可继续基于该审计口径做对账异常运营统计。
