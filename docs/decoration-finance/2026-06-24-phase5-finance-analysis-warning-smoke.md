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
