# 仓库采购基础开发库执行证据

## 范围

- 日期：2026-09-05
- 分支：`feature/warehouse-procurement-foundation`
- 目标环境：development
- Supabase project ref：`fclnkyatvfvmzgzdqlba`
- 数据库 host：`api-dev.goodcms.cn`

本次仅完成仓库采购阶段 A 基础能力：仓库基础表、仓库管理 API、采购单据双目的地字段和
admin 仓库设置入口。仓库采购写入开关仍保持关闭，未开放小程序或租户端仓库采购提交。

## Migration

应用前执行目标校验：

- `node scripts/validate-dev-database-target.mjs --direct-migration-history ...`
- 校验结果：只允许 project ref `fclnkyatvfvmzgzdqlba` 和 host `api-dev.goodcms.cn`
- 输出未包含数据库连接串或密钥。

首次 dry-run 发现开发库已有 `20260905130000`，当前 worktree 缺失；已先将分支
rebase 到最新 `origin/main` 后继续。

待应用 migration：

- `20260905210000_create_warehouse_foundation.sql`
- `20260905211000_add_procurement_destinations.sql`

执行过程中发现并修复两个开发库真实数据兼容问题：

- `tenant_supplier_settings.enabled_by_employee_id` 存在非同租户员工引用，默认仓库回填改为
  只在员工与租户匹配时写入审计员工，否则写 `NULL`。
- `supplier_purchase_orders` 的 submitted 状态保护触发器阻止历史目的地字段回填，第二条
  migration 按既有模式仅在回填 `destination_type` 时临时 disable/enable
  `supplier_purchase_orders_prevent_submitted_mutation`。

最终执行结果：

- `supabase db push` exit 0。
- `supabase migration list` 显示 `20260905210000` 和 `20260905211000` Local/Remote 均存在。
- `supabase db push --dry-run` 返回 `Remote database is up to date.`。

## Typegen

尝试生成 Supabase 类型：

- `supabase gen types typescript --project-id fclnkyatvfvmzgzdqlba --schema public,graphql_public`
  返回 `Project must be active and healthy.`。
- `supabase gen types typescript --db-url "$SUPABASE_DB_DIRECT_URL" --schema public,graphql_public`
  在 CLI postgres-meta 容器内返回 DNS `EAI_AGAIN api-dev.goodcms.cn`。

因此 `apps/api/src/types/database.ts` 未替换，没有产生部分写入。当前新增代码未依赖该生成
类型新增字段，API typecheck 已通过；后续 Supabase metadata/DNS 恢复后应重跑 typegen。

## 开发库 Smoke

使用 Supabase JS service role 做只读计数，未输出租户、员工或供应商标识：

| 检查项 | 结果 |
| --- | --- |
| `warehouses` | 1 |
| active default warehouses | 1 |
| `warehouse_procurement_enabled = true` | 0 |
| project destination batches | 16 |
| project destination requisitions | 14 |
| project destination orders | 14 |

结论：默认仓库已生成；仓库采购开关仍关闭；既有采购批次、采购申请和采购单均回填为项目目的地。

## 本地门禁

| 命令 | 结果 |
| --- | --- |
| 仓库/采购目的地相关 API 聚焦测试 | 103 pass / 0 fail / 678 expect |
| `bun test packages/domain/src/permission.test.ts` | 18 pass / 0 fail / 269 expect |
| `bun run api:check` | exit 0；typecheck、build、API file-size 通过 |
| `pnpm --dir apps/admin check` | exit 0；Admin file-size、Next typegen、tsc 通过 |
| `bun run check:permission-boundaries` | exit 0 |
| `bun run audit:supabase-writes` | exit 0；17 个既有候选，本分支未新增候选 |
| `git diff --check` | exit 0 |

## 回滚说明

已应用 migration 不手工回滚。若需要停用本能力：

1. 保持 `tenant_supplier_settings.warehouse_procurement_enabled = false`；
2. 不在 Admin 暴露仓库采购创建入口；
3. 如需调整 schema、函数、触发器或权限，新增 forward-only remediation migration；
4. 修复后重新执行 migration list、dry-run、API/Admin typecheck 和开发库 smoke。
