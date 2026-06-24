# 阶段 5：经营分析与预算预警 Smoke 记录

日期：2026-06-24

## API 验收

- [ ] `GET /finance/project-summary?page=1&pageSize=20&risk_level=warning`
- [ ] `GET /finance/project-summary?risk_flag=project_over_budget`
- [ ] `GET /finance/project-summary?budget_configured=false`
- [ ] `GET /finance/project-summary?has_unallocated_expense=true`
- [ ] `GET /projects/:id/finance-summary`
- [ ] `GET /finance/ledger?project_id=:id&direction=out&unallocated_only=true`

## Admin 验收

- [ ] 财务总览风险等级筛选。
- [ ] 财务总览风险原因筛选。
- [ ] 财务总览风险汇总卡片。
- [ ] 项目详情风险解释区。
- [ ] 未归集成本入口跳转财务台账。
- [ ] 成本分类归集后风险刷新。

## 小程序影响

- [ ] 本阶段无必改。
- [ ] 只读 smoke 不推进 workflow。

## 结果

待执行。
