# Decoration Workflow Release Communication And Post-Release Smoke

日期：2026-06-18

基线提交：

```text
2bb95bf docs(workflow): 补充发布前技术验证
```

关联验收包：

- `docs/state_machine_migrate/2026-06-18-decoration-workflow-release-readiness.md`
- `docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json`

## 范围

本文件用于发布执行前沟通和发布后 smoke。发布后 smoke 只做只读或低风险检查，
不推进任何真实业务 workflow。

禁止在发布后 smoke 中执行：

- `POST /workflow-tasks/:taskId/complete`
- legacy rebuild / cancel 脚本的 `--apply`
- manual restore task 复跑
- customer-confirm 复跑
- signing task chain 复跑
- 施工 workflow 扩展推进

施工 workflow 全链路 smoke、负向用例专项和真实业务推进必须另起任务确认范围。

## 发给小程序端

可直接转发：

```text
gooes 侧 decoration workflow 发布前 gates 已关闭，发布基线为：
2bb95bf docs(workflow): 补充发布前技术验证

本轮已确认：
- customer_design_workflow 通过
- project_signing_workflow 通过
- payment_collection / payment_stage_2 通过
- construction_procedure_log 通过
- stage_acceptance_transition 通过
- Admin workflow 状态和 finance ledger 可见性通过
- 旧实例处置已完成，manual_restore_required=0

发布后小程序侧只需要做只读 smoke：
- 员工登录正常
- /workflow-tasks?status=pending 正常返回
- task actions[].key 正常可见
- 项目详情能读取 workflow_state

发布后不要重复执行旧 task，不要重复 customer-confirm，不要重复 signing chain，
也不要推进新的施工 workflow complete。若要继续施工全链路 smoke，需要先单独确认
测试项目、当前 task、执行账号和验收范围。
```

小程序侧若发现问题，请回传：

- 环境和小程序 commit
- 登录账号
- 接口 URL、HTTP status、错误 code/message
- 业务对象 ID：customer ID / project ID / workflow instance ID / task ID
- 当前页面动作来源：`workflow_state.actions` 或 `/workflow-tasks`
- 请求和响应脱敏日志
- 截图或录屏

## 发给后端/运维

可直接转发：

```text
decoration workflow 发布前技术验证已完成，发布基线为：
2bb95bf docs(workflow): 补充发布前技术验证

已通过：
- bun run api:check
- bun run admin:check
- bun run check:file-size
- workflow:decoration-manual-gates-check，结果 ok=true
- supabase migration list，Local/Remote 对齐，最后 migration 为 20260617190000

当前业务审查仍有 5 个 running legacy customer snapshot，但 legacy review 已确认
全部为 compatible_runtime：
- rebuild_candidate=0
- manual_restore_required=0
- unknown_review_required=0

这些 legacy customer snapshot 不需要发布前脚本写入处理，后续由当前
workflow task 和后端返回 actions 正常推进。
```

发布执行注意：

- 发布前确认目标环境变量和本地验证环境一致，尤其是 Supabase、JWT、COS 和短信配置。
- 如执行 `supabase migration list`，需要先加载数据库密码所在环境变量；本地用法为：

```bash
set -a
source .env.local
set +a
supabase migration list
```

- 本轮不包含新的数据库 migration 写入；禁止手工改远端表结构或运行未确认 DDL/DML。

## 发给业务侧

可直接转发：

```text
装修公司 workflow 和财务收款链路已完成发布前验收。

已覆盖：
- 客户设计流程
- 项目签约流程
- 项目收款入账和财务台账
- 施工日志
- 阶段验收、主管复核、客户确认
- Admin 项目状态和财务台账可见性

发布后我们会先做只读 smoke，不会重复推进业务数据。
如果后续需要继续验证完整施工流程，会单独准备测试项目和验收范围。
```

## 发布后 smoke 清单

目标：确认发布后的 API、Admin、小程序主入口可用，不制造新的业务状态变更。

### API smoke

环境：

```text
API_BASE_URL=<发布后 API 地址>
```

推荐账号：

```text
18800005001 / 小龙女
```

检查项：

| 步骤 | 请求 | 期望 |
| --- | --- | --- |
| 1 | `POST /admin/auth/login` | `200`，返回员工 token |
| 2 | `GET /admin/auth/me` | `200`，返回 tenant 和 employee |
| 3 | `GET /workflow-tasks?page=1&pageSize=5&status=pending` | `200`，返回 `data.list` 和 `data.pagination`，task 含 `actions[].key` |
| 4 | `GET /finance/ledger?page=1&pageSize=20&project_id=54f11aa5-09a8-4410-a9c5-604a7fe9e09c` | `200`，可见 project_payment 入账记录 |

本地验证时的参考结果：

- `/workflow-tasks`：`pagination.total = 8`
- sample task：`f68e9aaa-6020-4bdc-85a5-8c889f31cb1e`
- sample action：`complete`
- finance ledger：可见 `9fc924b7-b5db-4356-a91e-d83dacecbbce`

### Admin smoke

环境：

```text
ADMIN_BASE_URL=<发布后 Admin 地址>
```

检查项：

| 页面 | 期望 |
| --- | --- |
| `/login` | 员工账号可登录 |
| `/projects/54f11aa5-09a8-4410-a9c5-604a7fe9e09c` | 页面可打开，显示 `张学友·固始县蓼都廉租房 4单元201` 和 `施工中` |
| `/finance/ledger?page=1` | 页面可打开，显示 `财务台账`、`项目收款入账` 和金额 `10,000.00` |

本地验证说明：

- 本地 Admin smoke 通过 Admin 代理登录接口设置 `gooes_admin_token` 后访问受保护页面。
- 不保存新的发布后截图，除非目标环境验收需要。

### 小程序 smoke

检查项：

| 页面/入口 | 期望 |
| --- | --- |
| 员工登录 | 登录成功，租户上下文正常 |
| 任务中心 | 请求 `/workflow-tasks?page=1&pageSize=20&status=pending` 成功 |
| task actions | 使用后端返回的 `actions[].key`，不本地推导 action |
| 项目详情 | 读取 `workflow_state.actions`，按钮来源于后端 |
| 财务任务 | 能看到 pending 收款任务时，只验证展示，不执行 complete |

## 发布后观测

观察窗口：发布后半天到一天。

重点观察：

- `/workflow-tasks` pending 数量是否异常突增或异常清零
- `POST /workflow-tasks/:taskId/complete` 的 `409` 和 `403` 错误率
- `WORKFLOW_INSTANCE_REBUILD_REQUIRED` 是否在新业务数据中出现
- `WORKFLOW_NODE_NOT_CURRENT` 是否大量出现
- `project_payment` 是否正常生成 payment 和 ledger
- Admin 项目状态与小程序详情状态是否一致
- 5 个 compatible runtime customer snapshot 是否能继续通过当前 task 推进

需要升级处理的情况：

- 新建项目仍进入旧 `construction_main/designing`
- 小程序详情没有 `workflow_state.actions`
- `/workflow-tasks` 返回 403 `TENANT_CONTEXT_REQUIRED`
- 收款 complete 成功但没有 ledger
- Admin 财务台账不可见已确认入账流水
- 同一 task 重复 complete 产生重复 payment 或 ledger

## 发布后回填模板

发布完成后建议在发布记录中回填：

```text
发布时间：
发布环境：
发布 commit：
API smoke：
Admin smoke：
小程序只读 smoke：
manual gates check：
migration list：
异常记录：
是否需要回滚：
```

## 当前结论

本轮 release communication 和 post-release smoke 清单已准备完成。发布执行后，
只按本文件执行只读 smoke；任何会推进 workflow 的动作都必须另行确认。
