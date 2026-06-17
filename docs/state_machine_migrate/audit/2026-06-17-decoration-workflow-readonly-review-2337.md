# 装修 workflow 只读复核记录 23:37

日期：2026-06-17

本轮只执行只读审计和复核命令，未执行任何 `--apply` 写入命令。

## 命令

```bash
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 100
bun --env-file=.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100
```

## 业务模板审计

结果摘要：

- `needs_migration = false`
- `needs_instance_review = true`
- `total_issues = 10`
- `active_customer_main_contains_signed_node = 0`
- `active_construction_main_contains_project_signing_nodes = 0`
- `active_project_workflow_contains_exception_nodes = 0`
- `tenants_missing_project_signing_definition = 0`
- `running_instances_on_legacy_snapshots = 10`

结论：

- 当前 active 模板层面的装修 workflow 规范问题仍为 0。
- 剩余 10 条问题均为运行中旧发布快照实例，不能通过模板 migration 自动改写。

## 旧实例复核

结果摘要：

- `sample_size = 10`
- `compatible_runtime = 6`
- `rebuild_candidate = 1`
- `manual_restore_required = 3`
- `unknown_review_required = 0`
- `needs_rebuild = true`
- `needs_manual_restore = true`

分类未变化：

| 分类 | 数量 | 处理方式 |
| --- | ---: | --- |
| `compatible_runtime` | 6 | 继续通过当前 workflow task 和后端返回的 actions 推进 |
| `rebuild_candidate` | 1 | 业务确认后受控重建到 `project_signing` |
| `manual_restore_required` | 3 | 需要业务确认取消或定义恢复点 |
| `unknown_review_required` | 0 | 无 |

关键对象：

- 项目 `1a8589fb-8f3f-4900-a759-6d15438ffcc2`：
  `rebuild_candidate`，当前旧 `construction_main` 节点为 `designing`，
  推荐 dry-run 后受控重建到 `project_signing`。
- 客户 `aa55b76c-a6a1-498a-9e36-fde8b974a248`：
  `manual_restore_required`，客户状态为 `invalid`，旧 `customer_main`
  实例仍在 `potential`。
- 客户 `2cc20642-03d9-4bc6-a68a-f7236ab8e3ea`：
  `manual_restore_required`，客户状态为 `invalid`，旧 `customer_main`
  实例仍在 `potential`。
- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460`：
  `manual_restore_required`，旧 `construction_main` 实例已在 `acceptance`，
  不允许直接重建到新施工流程起点。

## 结论

- 本轮只读复核没有发现新的模板 migration 需求。
- 机读门禁可以继续保持 `needs_migration = false`、`unknown_review_required = 0`。
- 旧实例写入处置、施工后段恢复策略和 orange 真实端到端验收仍未完成。
