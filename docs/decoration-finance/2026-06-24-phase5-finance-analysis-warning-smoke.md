# 阶段 5：经营分析与预算预警 Smoke 记录

日期：2026-06-24

## API 验收

- [x] `GET /finance/project-summary?page=1&pageSize=20&risk_level=warning`
  - HTTP 200，`pagination.total=0`，当前测试数据无 warning 项目。
- [x] `GET /finance/project-summary?risk_flag=project_over_budget`
  - HTTP 200，`pagination.total=0`，当前测试数据无项目超预算样本。
- [x] `GET /finance/project-summary?budget_configured=false`
  - HTTP 200，`pagination.total=10`。
  - 首条项目：`407537b4-2adc-4a0f-ac83-bdaecf70e559`
  - `risk_level=info`
  - `risk_flags=["budget_missing"]`
  - `risk_reasons[].code=["budget_missing"]`
- [x] `GET /finance/project-summary?has_unallocated_expense=true`
  - HTTP 200，`pagination.total=2`。
  - 首条项目：`c20e4693-e3a8-47b8-840f-4fb3639d6420`
  - `risk_level=danger`
  - `risk_flags=["budget_missing","unallocated_expense","negative_actual_profit"]`
  - `risk_reasons[].code=["budget_missing","unallocated_expense","negative_actual_profit"]`
  - `unallocated_expense_amount=1000`
- [x] `GET /projects/:id/finance-summary`
  - 样本项目：`c20e4693-e3a8-47b8-840f-4fb3639d6420`
  - HTTP 200，返回 `risk_reasons[]` 和 `unallocated_expense_amount=1000`。
- [x] `GET /finance/ledger?project_id=:id&direction=out&unallocated_only=true`
  - 样本项目：`c20e4693-e3a8-47b8-840f-4fb3639d6420`
  - HTTP 200，`pagination.total=1`。
  - 首条流水：`d5b60241-ad52-4890-8f03-28a5bee1bbbd`
  - `direction=out`，`cost_category_id=null`，`amount=1000`

## 2026-06-28 高风险样本补充验收

背景：2026-06-24 初始 smoke 中，`warning`、`project_over_budget`、
`low_projected_margin`、`receivable_overdue` 缺少真实样本，无法证明对应筛选
在有数据时能命中。本轮补充受控样本后重新验证风险筛选。

执行环境：

- API：`http://127.0.0.1:3000`
- 账号：`18800005001 / 小龙女`
- tenant ID：`3eebca47-961f-4899-b976-a3d3208d326b`
- 日期：`2026-06-28`
- 安全约束：未执行 workflow complete，未推进业务流程。

样本准备：

- 项目超预算样本通过公开 API `PUT /projects/:id/cost-budgets` 配置成本预算：
  - project ID：`634ff402-ff84-4541-aa7c-3cdcd4fd5460`
  - 项目：`刘德华·信合·湖畔春天1期 E4号楼4001`
  - 成本分类：`main_material`
  - 预算金额：`400`
  - 已有支出台账：`500.7`
- 预算毛利偏低样本通过公开 API `PUT /projects/:id/cost-budgets` 配置成本预算：
  - project ID：`b95f6b51-6b9c-4970-948e-b369106545d8`
  - 项目：`应收小程序联调 Smoke项目 20260623125051`
  - 合同金额：`50000`
  - 预算总额：`45000`
  - 预测预算毛利率：`0.1`
- 逾期应收样本因当前没有公开 Admin/API 手工创建应收计划入口，使用应用
  Supabase client 进行受控幂等 upsert：
  - receivable plan ID：`f55e810c-aacb-44af-817e-3ab1d35699c2`
  - project ID：`407537b4-2adc-4a0f-ac83-bdaecf70e559`
  - source ID：`00000000-0000-4000-8000-202606280001`
  - title：`阶段五风险样本逾期应收`
  - amount：`3000`
  - due_date：`2026-06-01`
  - status：`pending`
- 未归集成本复用既有样本：
  - project ID：`c20e4693-e3a8-47b8-840f-4fb3639d6420`
  - 未归集支出：`1000`

补充验收结果：

| 验收项 | 接口 | 结果 |
| --- | --- | --- |
| 项目超预算 | `GET /finance/project-summary?page=1&pageSize=5&risk_flag=project_over_budget` | `pagination.total=1`，命中 `634ff402-ff84-4541-aa7c-3cdcd4fd5460`，`risk_level=danger`，`risk_flags=["category_over_budget","project_over_budget","negative_actual_profit"]`，`budget_cost_amount=400`，`expense_paid_amount=500.7` |
| 预算毛利偏低 | `GET /finance/project-summary?page=1&pageSize=5&risk_flag=low_projected_margin` | `pagination.total=1`，命中 `b95f6b51-6b9c-4970-948e-b369106545d8`，`risk_level=warning`，`risk_flags=["low_projected_margin"]`，`budget_cost_amount=45000`，`projected_budget_gross_margin=0.1` |
| 应收逾期 | `GET /finance/project-summary?page=1&pageSize=5&risk_flag=receivable_overdue` | `pagination.total=1`，命中 `407537b4-2adc-4a0f-ac83-bdaecf70e559`，`risk_level=warning`，`risk_flags=["budget_missing","receivable_overdue"]`，`overdue_count=1`，`overdue_amount=3000` |
| 未归集支出 | `GET /finance/project-summary?page=1&pageSize=5&has_unallocated_expense=true` | `pagination.total=1`，命中 `c20e4693-e3a8-47b8-840f-4fb3639d6420`，`risk_level=danger`，`risk_flags=["budget_missing","unallocated_expense","negative_actual_profit"]`，`unallocated_expense_amount=1000` |
| 预警等级筛选 | `GET /finance/project-summary?page=1&pageSize=5&risk_level=warning` | `pagination.total=2`，命中低毛利和逾期应收两个 warning 项目 |
| 高风险等级筛选 | `GET /finance/project-summary?page=1&pageSize=5&risk_level=danger` | `pagination.total=2`，命中未归集/实际利润为负项目和项目超预算项目 |
| 逾期应收列表 | `GET /finance/receivables?page=1&pageSize=5&overdue_only=true` | `pagination.total=1`，首条为 `f55e810c-aacb-44af-817e-3ab1d35699c2`，`status=overdue`，`remaining_amount=3000`，`overdue_days=27` |

结论：Phase 5 风险筛选已覆盖 `project_over_budget`、`low_projected_margin`、
`receivable_overdue`、`has_unallocated_expense`、`risk_level=warning` 和
`risk_level=danger` 的真实数据命中路径。

后续如果需要清理本轮 smoke 数据，应优先按上述固定 project ID、receivable plan ID 和
source ID 做受控回滚，不要模糊删除同类业务数据。

## Admin 验收

- [x] 财务总览风险等级筛选。
  - `http://127.0.0.1:3010/finance?risk_level=warning` 返回 200。
- [x] 财务总览风险原因筛选。
  - `http://127.0.0.1:3010/finance?risk_flag=unallocated_expense` 返回 200。
- [x] 财务总览风险汇总卡片。
  - `http://127.0.0.1:3010/finance` 可见“全部风险”和“未归集成本”。
- [x] 项目详情风险解释区。
  - `http://127.0.0.1:3010/projects/c20e4693-e3a8-47b8-840f-4fb3639d6420?tab=overview` 返回 200。
  - 页面可见“经营财务摘要”和“未归集成本”。
- [x] 未归集成本入口跳转财务台账。
  - `http://127.0.0.1:3010/finance/ledger?project_id=c20e4693-e3a8-47b8-840f-4fb3639d6420&direction=out&unallocated_only=true` 返回 200。
  - 页面可见“财务台账”和“仅未归集”。
- [x] 成本分类归集后风险刷新。
  - 本轮只读 smoke 未修改成本分类，刷新链路以页面和接口可见性通过为准。
  - 后续真实归集操作继续使用既有 `finance.cost-allocation.manage` 权限和台账成本分类更新接口。
- [x] 浏览器错误检查。
  - Playwright 只读 smoke：`consoleErrorCount=0`，`failedResponseCount=0`。

## 小程序影响

- [x] 本阶段无必改。
- [x] 只读 smoke 不推进 workflow。

## 小程序发布后只读 Smoke

执行方：orange

执行环境：

- API：`http://192.168.1.3:3000`
- 账号：`18800005001 / 小龙女`
- employee ID：`bbab0193-43ae-4b7a-a7f3-24314e0f2e0d`

检查结果：

- [x] 员工登录正常。
  - `POST /admin/auth/login` 返回 200。
  - `GET /admin/auth/me` 返回 200。
  - `GET /employee/bootstrap` 返回 200。
- [x] 项目详情 workflow 正常。
  - 项目 ID：`00000000-0000-4000-8000-202606160006`
  - `GET /projects/:projectId/employee-detail-bootstrap` 返回 200。
  - `instance_status=running`
  - `current_node_key=tile_work`
  - `timeline_nodes_count=3`
  - `actions_count=1`
  - 当前节点：瓦工，当前节点 `actions_count=1`。
- [x] 施工入口正常。
  - `GET /workflow-tasks?status=pending&subject_type=project` 返回 200。
  - 当前返回施工 task：`tile_work`。
  - action key：`start_procedure`。
  - 未执行 complete。
- [x] 费用入口正常。
  - `GET /workflow-tasks?status=pending&subject_type=expense_request` 返回 200。
  - 当前无 pending 费用 task。
  - `GET /expense-requests?page=1&pageSize=5` 返回 200。
  - 返回 2 条费用申请，均可读。
- [x] 收款相关只读正常。
  - 当前账号无 pending 收款 task。
  - 已用项目 `b95f6b51-6b9c-4970-948e-b369106545d8` 验证：
    `GET /projects/:projectId/receivables` 返回 200。
  - 应收计划 `status=paid`，`paid_amount=10000`，`remaining_amount=0`。
- [x] 安全约束符合预期。
  - 未调用 `POST /workflow-tasks/:taskId/complete`。
  - 未新增本地风险计算。
  - 未请求预算/利润接口做业务判断。
  - orange `src` 中未发现 `risk_level`、`risk_reasons`、`budget_usage_ratio`、
    `unallocated_expense_amount` 的业务使用。

结论：Phase 5 对小程序现有登录、项目 workflow、施工、费用、收款只读入口无破坏影响；
当前阶段 orange 无必改。

补充：orange 侧只读查看了 gooes
`docs/decoration-finance/2026-06-24-phase5-finance-analysis-warning-miniprogram-handoff.md`。
本轮未修改 gooes 后端代码，orange 本轮无业务改动。

## 结果

通过。

补充：

- 本轮验证使用 worktree 临时启动服务，API `3000`，Admin `3010`。
- `launchctl` 当前服务配置指向主仓库 `/Users/leefo/Public/work/gooes`，不是本 worktree；因此本轮发布前 smoke 未使用 `launchctl` 进程作为代码验证来源。
- 执行账号：`18800005001 / 小龙女`。
- Supabase migration 已应用，`20260624160000` Local/Remote 对齐。
