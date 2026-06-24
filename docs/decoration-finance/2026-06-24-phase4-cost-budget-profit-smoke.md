# 阶段 4：成本预算与利润偏差 Smoke 记录

日期：2026-06-24

关联文档：

- [2026-06-24-phase4-cost-budget-profit-prd.md](./2026-06-24-phase4-cost-budget-profit-prd.md)
- [2026-06-24-phase4-cost-budget-profit-implementation-plan.md](./2026-06-24-phase4-cost-budget-profit-implementation-plan.md)
- [2026-06-24-phase4-cost-budget-profit-miniprogram-handoff.md](./2026-06-24-phase4-cost-budget-profit-miniprogram-handoff.md)

## 结论

阶段 4 API 和 Admin smoke 已按当前 feature worktree 验证通过。

本轮覆盖：

- 成本分类只读列表。
- 项目成本预算保存和读取。
- 财务总览项目经营列表中的预算成本、预算剩余、预算使用率、预算利润、利润偏差和风险字段。
- 项目详情总览页经营财务摘要和成本预算面板。
- Admin 侧预算编辑后，后端预算汇总和页面刷新一致。

本轮没有修改 workflow 模板、没有推进 workflow task、没有修改小程序仓库。

## 验收环境

当前 3000/3010 launchctl 服务指向主目录 `/Users/leefo/Public/work/gooes`，不是本阶段 feature worktree。为避免影响既有服务，本轮在 feature worktree 使用临时端口：

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| API | `http://127.0.0.1:3300` | 当前分支 `feat/finance-phase4-cost-budget` |
| Admin | `http://127.0.0.1:3011` | `GOOES_API_BASE_URL=http://127.0.0.1:3300` |

账号：

| 场景 | 账号 | 员工 |
| --- | --- | --- |
| API / Admin smoke | `18800005001` | 小龙女 / `bbab0193-43ae-4b7a-a7f3-24314e0f2e0d` |

租户：固始晴天装饰工程有限公司 / `3eebca47-961f-4899-b976-a3d3208d326b`

项目样本：`b95f6b51-6b9c-4970-948e-b369106545d8`

项目名称：应收小程序联调 Smoke项目 20260623125051

## API Smoke

执行接口：

- `POST /admin/auth/login`
- `GET /admin/auth/me`
- `GET /finance/cost-categories?page=1&pageSize=20&status=active`
- `PUT /projects/:projectId/cost-budgets`
- `GET /projects/:projectId/cost-budgets`
- `GET /finance/project-summary?keyword=:projectId&page=1&pageSize=20`
- `GET /projects/:projectId/finance-summary`

结果：

```json
{
  "project_id": "b95f6b51-6b9c-4970-948e-b369106545d8",
  "requests": {
    "login_status": 200,
    "me_status": 200,
    "cost_categories_status": 200,
    "save_budget_status": 200,
    "read_budget_status": 200,
    "project_summary_status": 200,
    "project_finance_summary_status": 200
  },
  "active_category_total": 8,
  "selected_categories": [
    {
      "id": "96c6b69d-7bd3-45e1-94d6-537d4da6d88e",
      "code": "labor",
      "name": "人工"
    },
    {
      "id": "cb75883b-628c-405b-bf53-651c19838146",
      "code": "main_material",
      "name": "主材"
    }
  ],
  "budget_summary": {
    "budget_configured": true,
    "budget_amount": 20000,
    "expense_amount": 0,
    "remaining_amount": 20000,
    "usage_ratio": 0,
    "unallocated_expense_amount": 0,
    "risk_level": "normal"
  },
  "project_summary": {
    "total": 1,
    "budget_configured": true,
    "budget_cost_amount": 20000,
    "budget_remaining_amount": 20000,
    "budget_usage_ratio": 0,
    "projected_budget_profit_amount": 30000,
    "profit_variance_amount": -20000,
    "projected_budget_gross_margin": 0.6,
    "risk_level": "normal",
    "risk_flags": []
  }
}
```

覆盖确认：

- active 成本分类返回 8 条。
- 预算保存返回 2 条 active 预算项。
- 项目预算读取返回 `budget_configured=true`。
- 项目经营列表和项目详情经营摘要均返回预算和利润偏差字段。
- 当前样本项目支出为 0，预算使用率为 0，风险等级为 `normal`，符合预期。

## Admin Smoke

执行方式：Playwright。

账号：`18800005001 / 小龙女`

路径：

- `/finance?keyword=b95f6b51-6b9c-4970-948e-b369106545d8`
- `/projects/b95f6b51-6b9c-4970-948e-b369106545d8?tab=overview`

验证结果：

- `/finance` 渲染“财务总览”。
- 财务总览展示“当前页预算成本”“预算成本”“预算剩余”“预算利润”。
- 项目详情总览页展示“经营财务摘要”和“成本预算”。
- 成本预算面板展示“人工”“主材”预算项。
- Playwright 将“人工”预算从 `12001` 调整到 `12002`，页面和 API readback 均显示预算总额 `¥20,002.00`。
- 最终只读重载没有发现前端 console error。
- 最终只读重载没有发现页面/API 4xx 或 5xx。

关键证据：

```json
{
  "base_url": "http://127.0.0.1:3011",
  "api_base_url": "http://127.0.0.1:3300",
  "account": "18800005001 / 小龙女",
  "project_id": "b95f6b51-6b9c-4970-948e-b369106545d8",
  "finance_page_checked": true,
  "project_budget_panel_checked": true,
  "budget_edit_saved": true,
  "expected_budget_total_visible": "¥20,002.00",
  "console_errors": [],
  "failed_responses": []
}
```

截图证据：

- `/tmp/gooes-phase4-cost-budget-admin-project.png`

## Smoke 过程备注

本轮 smoke 过程中有一次被手工中断的重复预算保存请求，后端最终记录为 Supabase update timeout，并返回 `500 DB_ERROR`。该请求不是最终通过路径的一部分，原因是脚本已取消但后端请求仍继续等待远端数据库响应。

最终用于验收的页面只读重载无 4xx/5xx，且 API readback 已确认预算编辑后的结果：

```json
{
  "budget_summary": {
    "budget_configured": true,
    "budget_amount": 20002,
    "expense_amount": 0,
    "remaining_amount": 20002,
    "usage_ratio": 0,
    "risk_level": "normal"
  },
  "budget_rows": [
    { "category_name": "人工", "budget_amount": 12002 },
    { "category_name": "主材", "budget_amount": 8000 }
  ],
  "finance_budget_cost_amount": 20002
}
```

后续如果在正式环境也出现预算保存长时间等待，应优先检查 Supabase/PostgREST 更新请求耗时和网络超时配置，而不是在前端本地兜底推进状态。

## 验证命令

最终提交前已执行：

```bash
cd apps/api
bun test ./src/services/finance-cost-categories.test.ts ./src/services/project-cost-budgets.test.ts ./src/services/finance-project-summary.test.ts ./src/services/expense-requests/legacy/payment.test.ts ./src/services/finance-ledger.test.ts
bun run typecheck
cd ../..
pnpm --dir apps/admin check
git diff --check
```

结果：

- API 指定测试：21 pass，0 fail。
- API typecheck：退出码 0。
- Admin check：文件大小检查和 typecheck 均退出码 0。
- `git diff --check`：退出码 0。
