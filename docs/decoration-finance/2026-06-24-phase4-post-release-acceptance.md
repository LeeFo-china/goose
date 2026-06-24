# 阶段 4：成本预算与利润偏差发布后验收记录

日期：2026-06-24

关联文档：

- [2026-06-24-phase4-cost-budget-profit-prd.md](./2026-06-24-phase4-cost-budget-profit-prd.md)
- [2026-06-24-phase4-cost-budget-profit-implementation-plan.md](./2026-06-24-phase4-cost-budget-profit-implementation-plan.md)
- [2026-06-24-phase4-cost-budget-profit-smoke.md](./2026-06-24-phase4-cost-budget-profit-smoke.md)
- [2026-06-24-phase4-cost-budget-profit-miniprogram-handoff.md](./2026-06-24-phase4-cost-budget-profit-miniprogram-handoff.md)

## 结论

阶段 4 已从功能分支合入 `main`，并在主工作区通过发布后 smoke。

本次发布后验收只覆盖成本预算与利润偏差能力，不推进 workflow task，不修改 workflow 模板，不修改小程序仓库。

验收结论：

- `main` 已推送到远端，发布基线为 `5ee7890a fix(finance): 收敛项目成本预算保存`。
- API `3000` 和 Admin `3010` 均由 `launchctl` 从主工作区 `/Users/leefo/Public/work/gooes` 启动。
- Supabase migration Local/Remote 已对齐到 `20260624114500`。
- API 发布后 smoke 全部返回 `200`。
- Admin 发布后 smoke 可见财务总览和项目详情成本预算面板，没有前端 console error，没有页面/API 4xx 或 5xx。

## 发布基线

| 项 | 值 |
| --- | --- |
| Git branch | `main` |
| Git commit | `5ee7890a fix(finance): 收敛项目成本预算保存` |
| API | `http://127.0.0.1:3000` |
| Admin | `http://127.0.0.1:3010` |
| API launchctl label | `local.gooes.api` |
| Admin launchctl label | `local.gooes.admin` |
| 工作目录 | `/Users/leefo/Public/work/gooes` |

服务状态：

- `3000`：`bun` 进程监听。
- `3010`：`node` 进程监听。
- `POST /admin/auth/login` 返回 `200`。

## Migration 状态

发布后执行 `supabase migration list`，确认以下阶段 4 migration Local/Remote 对齐：

| Migration | 说明 |
| --- | --- |
| `20260624100000_finance_cost_budget.sql` | 成本分类、项目预算和成本归集数据模型 |
| `20260624113000_save_project_cost_budgets_rpc.sql` | 项目成本预算 bulk save RPC |
| `20260624114500_save_project_cost_budgets_rpc_return_json.sql` | RPC 返回 JSON，避免 void RPC 空响应挂起 |

## 验收账号和样本

| 项 | 值 |
| --- | --- |
| 员工账号 | `18800005001` |
| 员工 | 小龙女 / `bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` |
| 租户 | 固始晴天装饰工程有限公司 / `3eebca47-961f-4899-b976-a3d3208d326b` |
| 项目 ID | `b95f6b51-6b9c-4970-948e-b369106545d8` |
| 项目名称 | 应收小程序联调 Smoke项目 20260623125051 |

## API 发布后 Smoke

执行接口：

- `POST /admin/auth/login`
- `GET /admin/auth/me`
- `GET /finance/cost-categories?page=1&pageSize=20&status=active`
- `GET /projects/:projectId/cost-budgets`
- `PUT /projects/:projectId/cost-budgets`
- `GET /finance/project-summary?keyword=:projectId&page=1&pageSize=20`
- `GET /projects/:projectId/finance-summary`

结果摘要：

```json
{
  "ok": true,
  "project_id": "b95f6b51-6b9c-4970-948e-b369106545d8",
  "requests": {
    "login_status": 200,
    "me_status": 200,
    "cost_categories_status": 200,
    "read_budget_before_status": 200,
    "save_budget_status": 200,
    "read_budget_after_status": 200,
    "project_summary_status": 200,
    "project_finance_summary_status": 200
  },
  "active_category_total": 8,
  "saved_item_count": 2,
  "budget_summary": {
    "budget_configured": true,
    "budget_amount": 20010,
    "expense_amount": 0,
    "remaining_amount": 20010,
    "usage_ratio": 0,
    "unallocated_expense_amount": 0,
    "risk_level": "normal"
  },
  "project_summary": {
    "budget_configured": true,
    "budget_cost_amount": 20010,
    "budget_remaining_amount": 20010,
    "budget_usage_ratio": 0,
    "projected_budget_profit_amount": 29990,
    "profit_variance_amount": -19990,
    "projected_budget_gross_margin": 0.5998,
    "risk_level": "normal",
    "risk_flags": []
  }
}
```

覆盖确认：

- active 成本分类返回 8 条。
- 项目成本预算读取和保存均返回 `200`。
- 预算保存后仍为 2 条 active 预算项。
- 项目预算汇总返回 `budget_configured=true`。
- 财务项目经营列表和项目详情财务摘要均返回预算成本、预算剩余、预算利润、利润偏差和风险字段。

## Admin 发布后 Smoke

执行方式：Playwright。

路径：

- `/finance?keyword=b95f6b51-6b9c-4970-948e-b369106545d8`
- `/projects/b95f6b51-6b9c-4970-948e-b369106545d8?tab=overview`

结果摘要：

```json
{
  "ok": true,
  "login_status": 200,
  "login_has_token": true,
  "cookies": ["gooes_admin_token"],
  "finance_contains_project": true,
  "finance_contains_budget": true,
  "project_contains_project": true,
  "project_contains_budget_panel": true,
  "project_contains_budget": true,
  "console_errors": [],
  "failed_responses": []
}
```

截图证据：

- `/tmp/gooes-phase4-release-finance.png`
- `/tmp/gooes-phase4-release-project.png`

覆盖确认：

- Admin 登录代理返回 `200`，并写入 `gooes_admin_token`。
- 财务总览页可见目标项目和预算金额 `20,010`。
- 项目详情页可见目标项目、成本预算面板和预算金额 `20,010`。
- 未发现前端 console error。
- 未发现页面/API 4xx 或 5xx。

## 提交前验证

合入前和合入后均已执行核心检查。

合入后主工作区验证：

```bash
cd apps/api
bun test ./src/repositories/project-cost-budgets.test.ts ./src/services/finance-cost-categories.test.ts ./src/services/project-cost-budgets.test.ts ./src/services/finance-project-summary.test.ts ./src/services/expense-requests/legacy/payment.test.ts ./src/services/finance-ledger.test.ts
bun run typecheck
cd ../..
pnpm --dir apps/admin check
git diff --check
```

结果：

- API 指定测试：22 pass，0 fail。
- API typecheck：退出码 0。
- Admin check：文件大小检查和 typecheck 均退出码 0。
- `git diff --check`：退出码 0。

## 小程序对接结论

本阶段小程序端暂无必改。

当前约定：

- 小程序不计算预算、利润、风险等级和风险原因。
- 小程序不直接复用 Admin 经营分析接口作为业务页面展示源。
- 如果后续产品要求员工在小程序提交费用时选择成本分类，再接入：
  - `GET /finance/cost-categories?page=1&pageSize=100&status=active`
  - `POST /expense-requests` / `PATCH /expense-requests/:id` 可选提交 `cost_category_id`
- 不提交 `cost_category_id` 仍兼容，未分类支出由 Admin 财务侧后续归集。

## Admin 后续观察点

阶段 4 进入观察期后，Admin 侧重点看：

- 财务总览中预算成本、预算剩余、预算利润、利润偏差是否与项目详情一致。
- 成本预算保存是否持续稳定，不再出现多行并发保存导致的超时或部分写入风险。
- 费用台账成本分类调整后，项目经营汇总是否刷新为一致结果。
- 是否出现接口 4xx/5xx 或前端 console error。

## 下一阶段建议

建议 Phase 5 进入“经营分析与预算预警闭环”：

- 强化项目风险分层：正常、预警、超支、低毛利。
- 扩展风险原因 `risk_flags`，让后端输出可解释的风险原因。
- Admin 增加预算使用趋势、分类成本占比和未归集成本提醒。
- 小程序继续只消费后端契约，不本地计算财务指标。
