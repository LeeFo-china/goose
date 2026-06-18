# Decoration Workflow Release Readiness

日期：2026-06-18

生成时间：2026-06-18T16:35:56+08:00

提交基线：

```text
3c20427 docs(workflow): close decoration e2e gates
```

## 结论

装修 workflow、收款 workflow、小程序 E2E、Admin 可见性和旧实例处置已完成本轮
发布前收口。当前可以进入发布准备；不需要再重复执行旧 task、客户确认、项目签约
task chain 或 manual restore task。

当前唯一保留的非阻塞项是：业务审查仍能看到 5 个 running legacy
customer snapshot，但旧实例复核已判定全部为 `compatible_runtime`，推荐通过当前
workflow task 和后端返回的 actions 继续推进，不需要脚本写入、rebuild、cancel 或
manual restore。

## 发布前只读检查

### decoration business audit

命令：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 100
```

结果：

- `needs_migration = false`
- `needs_instance_review = true`
- `total_issues = 5`
- `active_customer_main_contains_signed_node = 0`
- `active_construction_main_contains_project_signing_nodes = 0`
- `active_project_workflow_contains_exception_nodes = 0`
- `tenants_missing_project_signing_definition = 0`
- `running_instances_on_legacy_snapshots = 5`

说明：

- 这里的 `ok = false` 来自 5 个 legacy customer running snapshot。
- 这些实例不再是发布阻塞，需结合 legacy review 结果判断。

### decoration legacy instance review

命令：

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100
```

结果：

- `ok = true`
- `sample_size = 5`
- `needs_rebuild = false`
- `needs_manual_restore = false`
- `has_unknown_review_required = false`
- `compatible_runtime = 5`
- `rebuild_candidate = 0`
- `manual_restore_required = 0`
- `unknown_review_required = 0`

剩余 compatible runtime 样本：

| instance ID | subject ID | node | subject status | recommended action |
| --- | --- | --- | --- | --- |
| `c23cf757-5109-4ffa-92c0-52ebb2ef8719` | `2327ae27-658a-4db3-aef5-9d69e0eab37c` | `signed` | `signed` | continue current task |
| `79ab52c1-94c7-4815-822e-859cc0af38ba` | `e646e8e2-e502-49be-9118-8c2df7fed08d` | `following` | `following` | continue current task |
| `13499eeb-7113-4155-b76a-cfb12c0854af` | `8633b724-5e9a-4b93-80c4-10aabdf53094` | `following` | `following` | continue current task |
| `ecfdab4a-5b39-4364-b5ea-8f6d73a6a47e` | `00d561ef-d2e5-4288-8926-415e01112768` | `potential` | `following` | continue current task |
| `2ed66797-e0cf-4a9b-91fe-eee2133c9d12` | `3718dc44-0212-4f3b-b1fd-feea982af0a4` | `signed` | `signed` | continue current task |

### manual gates

命令：

```bash
cd apps/api
bun run workflow:decoration-manual-gates-check -- \
  --evidence-file docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json
```

结果：`ok = true`

通过项：

- `decoration_manual_gate_evidence`
- `read_only_review_current`
- `legacy_apply_confirmations`
- `manual_restore_decision`
- `orange_e2e_acceptance`
- `closeout_rules_consistent`

关键门禁状态：

- `manual_restore_decision = passed`
- `selected_option = continue_legacy_acceptance_until_completed`
- `followup_required = false`
- `orange_e2e_acceptance = passed`
- `closeout_rules.can_close_prd_without_followup = true`

### migration status

命令：

```bash
set -a
source .env.local
set +a
supabase migration list
```

结果：

- Local 和 Remote 对齐。
- 当前最后一条 migration：`20260617190000`
- 首次未加载 `.env.local` 直接执行时，CLI 因缺少当前 shell 的
  `SUPABASE_DB_PASSWORD` 连接失败；加载 `.env.local` 后检查通过。

## 发布前技术验证执行记录

执行时间：2026-06-18T16:40+08:00

### build/type/file-size

命令：

```bash
bun run api:check
bun run admin:check
bun run check:file-size
```

结果：

- `api:check` 通过：
  - `tsc -p apps/api/tsconfig.json --noEmit` 通过
  - `bun build apps/api/src/app.ts --outdir dist --target node` 通过
  - API file size check 通过，唯一超限文件为生成文件
    `apps/api/src/types/database.ts`
- `admin:check` 通过：
  - Admin file size check 通过，`492` 个 TS/TSX 文件均不超过 `500` 行
  - `tsc -p apps/admin/tsconfig.json --noEmit` 通过
- 根目录 `check:file-size` 通过

### API smoke

环境：

- API：`http://127.0.0.1:3000`
- 执行账号：`18800005001` / 小龙女

检查结果：

| 接口 | 结果 |
| --- | --- |
| `POST /admin/auth/login` | `200`，返回员工 token |
| `GET /admin/auth/me` | `200`，tenant 为 `3eebca47-961f-4899-b976-a3d3208d326b`，employee 为小龙女 |
| `GET /workflow-tasks?page=1&pageSize=5&status=pending` | `200`，`pagination.total = 8`，响应结构为 `data.list + data.pagination`，sample task 含 `actions[].key = complete` |
| `GET /finance/ledger?page=1&pageSize=20&project_id=54f11aa5-09a8-4410-a9c5-604a7fe9e09c` | `200`，可见 ledger `9fc924b7-b5db-4356-a91e-d83dacecbbce` |

### Admin smoke

环境：

- Admin：`http://127.0.0.1:3010`
- 登录方式：通过 Admin 自身 `/api/auth/login` 设置 `gooes_admin_token`
  cookie 后访问页面

检查结果：

| 页面 | 结果 |
| --- | --- |
| `/projects/54f11aa5-09a8-4410-a9c5-604a7fe9e09c` | 页面可打开，显示 `项目档案`、`张学友·固始县蓼都廉租房 4单元201` 和 `施工中` |
| `/finance/ledger?page=1` | 页面可打开，显示 `财务台账`、`项目收款入账` 和金额 `10,000.00` |

说明：

- 本轮 Admin smoke 不保存新截图；UI 可见性截图已在
  `docs/state_machine_migrate/evidence/2026-06-18-admin-project-workflow-visibility.png`
  和
  `docs/state_machine_migrate/evidence/2026-06-18-admin-finance-ledger-visibility.png`
  中留档。
- Headless 表单点击登录没有完成 URL 跳转，因此本轮页面 smoke 使用 Admin
  代理登录接口设置 cookie 后验证受保护页面。代理登录本身返回 `200` 且设置
  `gooes_admin_token`。

## 已关闭的主线验收

| 场景 | 状态 | 证据 |
| --- | --- | --- |
| customer_design_workflow | passed | `docs/state_machine_migrate/2026-06-17-decoration-workflow-e2e-acceptance-checklist.md` |
| project_signing_workflow | passed | `docs/state_machine_migrate/2026-06-18-project-signing-rebuild-execution.md` |
| payment_collection_workflow | passed | `docs/state_machine_migrate/2026-06-18-decoration-workflow-next-smoke-backend-response.md` |
| construction_procedure_log | passed | `docs/state_machine_migrate/2026-06-17-decoration-workflow-e2e-acceptance-checklist.md` |
| stage_acceptance_transition | passed | `docs/state_machine_migrate/2026-06-18-stage-acceptance-transition-customer-confirm-backend-handoff.md` |
| admin_finance_and_workflow_visibility | passed | `docs/state_machine_migrate/evidence/2026-06-18-admin-project-workflow-visibility.png` 和 `docs/state_machine_migrate/evidence/2026-06-18-admin-finance-ledger-visibility.png` |

## 旧实例处置状态

已完成：

- 项目签约旧实例受控 rebuild：
  `b58acf8e-4f18-4b40-b5c7-919600e5e636` -> `project_signing`
  instance `651184a9-095d-42a9-8669-476c1d125a37`
- invalid customer 旧实例取消：
  `41f7772d-c472-41e6-a913-c6e641be3dd2`
  和 `1a6dc44b-19b9-4516-8d3f-9e2f4125b842`
- manual restore project 旧验收节点 completed：
  instance `c435b9e9-0e22-49e7-9352-446259f9b57c`
  已到 `end/completed`

不再执行：

- 不重复复测旧 task `aa6d93f8-f825-4f9a-bd04-f346ba3e2d5f`
- 不重复执行已完成的 signing task chain
- 不重复执行 acceptance
  `2e3779f7-8b51-4b05-9b7b-e1f3e18f1992` 的 customer-confirm
- 不重复执行 manual restore task
  `13133174-8de6-4ef1-b1ac-e69b7c1d2f2c`

## 发布前建议口径

发给小程序端：

```text
gooes 侧 decoration workflow E2E gates 已关闭。

已确认：
- customer_design_workflow 通过
- project_signing_workflow 通过
- payment_collection/payment_stage_2 通过
- construction_procedure_log 通过
- stage_acceptance_transition 通过
- Admin workflow 状态和 finance ledger 可见性通过
- 旧实例处置已完成，manual_restore_required=0

后续不需要重复执行旧 task，也不需要重复 customer-confirm 或 signing chain。
如果继续联调，只进入新的施工 workflow 扩展 smoke，需先确认范围。
```

发给发布/后端侧：

```text
本轮 decoration workflow 发布前 gates 已通过。
manual gates: ok=true
needs_migration=false
legacy review: rebuild_candidate=0, manual_restore_required=0, unknown_review_required=0
migration list: Local/Remote 对齐，最后 migration 为 20260617190000

剩余 5 个 running legacy customer snapshot 均为 compatible_runtime，
不需要脚本写入处理，后续由当前 workflow task 正常推进。
```

## 后续可选事项

这些不阻塞本轮发布前收口：

1. 施工 workflow 扩展 smoke：如要继续，应先确认范围，再从
   project `1a8589fb-8f3f-4900-a759-6d15438ffcc2` 的施工 workflow
   task `f68e9aaa-6020-4bdc-85a5-8c889f31cb1e` 开始。
2. 负向用例专项补测：缺 `signed_amount`、缺 `start_date`、图片不足、
   未收款越过财务门禁等。
3. 发布后观测：关注 `/workflow-tasks` pending 数、`project_payment`
   ledger 入账、workflow task complete 的 409/403 错误率。
