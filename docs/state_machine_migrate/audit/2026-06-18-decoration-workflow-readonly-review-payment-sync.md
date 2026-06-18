# 装修 workflow 只读复核记录

日期：2026-06-18

## 背景

orange 小程序团队已完成财务收款 workflow smoke。gooes 已把该结果同步到
`2026-06-17-decoration-workflow-e2e-acceptance-checklist.md` 和装修 workflow
专用 manual gates JSON。本次只读复核用于确认远端模板和旧实例计数在收款 smoke 后
是否发生变化。

本轮未执行任何 `--apply`，未手工改远端数据库。

## 只读命令

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 100
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100
```

## 业务轨道审计结果

生成时间：`2026-06-18T02:03:32.653Z`

| 检查项 | 结果 |
| --- | --- |
| `needs_migration` | `false` |
| `needs_instance_review` | `true` |
| `total_issues` | `10` |
| `active_customer_main_contains_signed_node` | `0` |
| `active_construction_main_contains_project_signing_nodes` | `0` |
| `active_project_workflow_contains_exception_nodes` | `0` |
| `tenants_missing_project_signing_definition` | `0` |
| `running_instances_on_legacy_snapshots` | `10` |

结论：模板层面仍为已收口状态；剩余问题仍全部是运行中旧快照实例。

## 旧实例复核结果

生成时间：`2026-06-18T02:03:32.232Z`

| 分类 | 数量 |
| --- | --- |
| `compatible_runtime` | `6` |
| `rebuild_candidate` | `1` |
| `manual_restore_required` | `3` |
| `unknown_review_required` | `0` |

关键对象未变化：

- 项目 `1a8589fb-8f3f-4900-a759-6d15438ffcc2` 仍为
  `rebuild_candidate`，推荐受控重建到 `project_signing`，正式执行前仍需业务确认。
- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460` 仍为
  `manual_restore_required`，需要人工定义施工后段恢复点或确认继续旧验收节点。
- 客户 `aa55b76c-a6a1-498a-9e36-fde8b974a248` 和
  `2cc20642-03d9-4bc6-a68a-f7236ab8e3ea` 仍为关闭态客户旧实例，
  取消前仍需业务确认。

## 门禁校验结果

```bash
cd apps/api && bun run workflow:decoration-manual-gates-check -- \
  --evidence-file docs/state_machine_migrate/audit/2026-06-17-decoration-workflow-manual-gates.json
```

结果仍为非 0，符合预期：

- `read_only_review_current = ok`
- `legacy_apply_confirmations` 仍缺
  `project_signing_rebuild` 和 `invalid_customer_cancellations`
- `manual_restore_decision` 仍缺项目
  `634ff402-ff84-4541-aa7c-3cdcd4fd5460` 的恢复策略
- `orange_e2e_acceptance` 仍缺客户设计、项目签约、施工日志、阶段验收和 Admin 可见性场景
- `closeout_rules_consistent = ok`

结论：财务收款 smoke 已同步为通过，但 PRD 仍不能关闭，也不能执行旧实例
`--apply`。
