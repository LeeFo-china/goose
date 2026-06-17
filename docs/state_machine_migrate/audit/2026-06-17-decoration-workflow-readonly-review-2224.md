# 装修 workflow 只读复核记录

日期：2026-06-17 22:24 +08:00

本轮只执行只读审计和旧实例复核，未执行任何 `--apply`，未手工修改远端数据库。

## 命令

```bash
bun --env-file=/Users/leefo/Public/work/gooes/.env.local apps/api/src/scripts/decoration-workflow-business-audit.ts --sample-limit 100
bun --env-file=/Users/leefo/Public/work/gooes/.env.local apps/api/src/scripts/decoration-workflow-legacy-instance-review.ts --sample-limit 100
```

## 业务模板审计

- `needs_migration = false`
- `needs_instance_review = true`
- `total_issues = 10`
- `active_customer_main_contains_signed_node = 0`
- `active_construction_main_contains_project_signing_nodes = 0`
- `active_project_workflow_contains_exception_nodes = 0`
- `tenants_missing_project_signing_definition = 0`
- `running_instances_on_legacy_snapshots = 10`

## 旧实例复核

- `sample_size = 10`
- `compatible_runtime = 6`
- `rebuild_candidate = 1`
- `manual_restore_required = 3`
- `unknown_review_required = 0`
- `needs_rebuild = true`
- `needs_manual_restore = true`

## 结论

- 模板 migration 仍保持闭环，不需要新增模板 migration。
- 剩余问题仍全部是运行中旧快照处置。
- 可写入的 3 个处置命令仍需业务确认后才能执行 `--apply`。
- 项目 `634ff402-ff84-4541-aa7c-3cdcd4fd5460` 仍需人工恢复点决策。
- orange 真实联调仍需小程序团队回填验收结果。

## 脚本可用性

本轮复核验证了装修审计/复核脚本可使用 `SUPABASE_DB_DIRECT_URL` 优先连接，
并且不会因 SQL close 等待而长时间挂住。
