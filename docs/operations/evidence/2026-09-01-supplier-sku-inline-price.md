# SKU 即时价格验收证据

## 当前结论

- 验收日期：2026-09-02。
- 功能分支：`docs/supplier-sku-inline-price-design`。
- 本次评审修正前的 Task 9 证据文档 commit：
  `1091d1ba1000ab005d31bafc1760f1979886ae06`。
- 首轮目标保护修正 commit：
  `3bc478ce25eeb52d4dbb5269a1636db5961a2b9e`。本文当前的类型生成保护修正由包含
  本文当前版本的后续 commit 一并记录，未使用未创建的 SHA 占位符。
- `origin/main` 已通过双父 merge commit
  `1571b30f1f1f69d0f8fa39dac271d08ac14487c0` 集成主功能；该 commit 不是 squash。
- 当前分支已有五个验证/证据及目标保护 commit，本次类型生成保护修正也仍待后续集成。
- 功能 migration：`20260901130000_create_supplier_purchasable_sku_command.sql`。
- 开发库目标已在连接前按 host `api-dev.goodcms.cn`、database `postgres`
  精确校验，并拒绝生产目标。`dev-direct` 在内存中补充 `sslmode=require`，未修改
  根 `.env`；验证输出未包含连接 URL 或凭据。
- 主功能进入 `origin/main` 只表示代码已集成，不代表已部署。没有可核实的开发 API/Admin
  部署 revision；当前分支验证加固仍待 PR、评审、合并和正常发布流程。

## Migration

使用从 git common directory 定位的根 `.env` 和 Supabase CLI `2.99.0` 验证：

- `supplier:purchasable-sku:target:dev-direct` 只输出开发 host、database 和 TLS 模式；
- `supabase migration list` exit 0，556 条 Local/Remote 记录零差异，对齐至
  `20260901130000`；
- `supabase db push --dry-run` exit 0，返回 `Remote database is up to date.`；
- 本轮未执行 migration push，未连接生产环境。

## 类型生成

- `supplier:purchasable-sku:db:gen-types:dev-direct` 在内部使用经校验并补齐 TLS 的 URL，
  固定执行 Supabase CLI `2.99.0`，schema 为 `public,graphql_public`；
- 单元测试确认 argv、纯 TypeScript stdout、诊断 stderr、失败退出码和凭据脱敏；
- 开发库临时文件验证中，Supabase `postgres-meta` 容器返回 DNS `EAI_AGAIN`，命令 exit 1；
- 失败时 stdout 为 0 字节，诊断中没有 URL 或凭据，临时文件已删除，已签入的
  `apps/api/src/types/database.ts` 未改动；未声称类型比较通过。

## 开发库 Smoke

`supplier:purchasable-sku:smoke:dev-direct` exit 0：

| 证据 | 结果 |
| --- | --- |
| `created` | `true` |
| `edited` | `true` |
| `replayed` | `true` |
| `concurrent_conflict` | `true` |
| `future_preserved` | `true` |
| `resolver_verified` | `true` |
| `cleanup_verified` | `true` |
| 并发结果 | 1 success / 1 conflict |
| 清理残留 | 0 |

## EXPLAIN

`supplier:purchasable-sku:explain:dev-direct` exit 0：

| 查询 | relation / index |
| --- | --- |
| 当前默认价格 | `supplier_price_lists` / `supplier_price_lists_tenant_supplier_status_idx`; `supplier_price_list_items` / `supplier_price_items_sku_list_idx` |
| 最早未来价格 | `supplier_price_lists` / `supplier_price_lists_tenant_supplier_status_idx`; `supplier_price_list_items` / `supplier_price_items_sku_list_idx` |
| 目标 SKU 当前价格 | `supplier_price_list_items` / `supplier_price_items_tenant_supplier_list_idx` |
| 集合复制 | `supplier_price_list_items` / `supplier_price_items_tenant_supplier_list_idx` |

- `query_count=4`；
- `n_plus_one=false`；
- 四条计划的 `sharedRead` 均为 0；
- `transaction_rolled_back=true`，回滚后残留为 0。

## 自动化门禁

| 命令 | 结果 |
| --- | --- |
| 聚焦数据库保护测试，2 个文件 | 22 pass / 0 fail / 79 `expect()` calls |
| 聚焦 API 回归，17 个文件 | 196 pass / 0 fail / 945 `expect()` calls |
| `bun run api:check` | exit 0；typecheck、build、API file-size 均通过 |
| `pnpm --dir apps/admin check` | exit 0；1332 个 TS/TSX 文件检查及 typecheck 通过 |
| `pnpm --dir apps/admin build` | exit 0；Next.js production build 通过 |
| `pnpm --dir apps/admin test:e2e:supplier-product-pricing` | 18 pass / 0 fail，Chromium 单 worker |
| `bun run check:permission-boundaries` | exit 0 |
| `bun run audit:supabase-writes` | exit 0；17 个既有候选，当前分支未新增候选 |
| `git diff --check origin/main...HEAD` | exit 0 |

## 发布与回滚

当前只完成开发库 migration 和本地/开发直连验收，没有可核实的代码部署。当前分支验证加固
合并后，再按正常流程先发布 API、后发布 Admin，并在各自 revision 可追溯后复核健康检查和
接口 smoke。生产 migration、API 和 Admin 发布仍需单独明确授权。

如发布后需要回滚：

1. 先停用合并表单入口并将 Admin 回退到上一兼容 revision；
2. 再将 API 回退到上一兼容 revision，保留既有接口兼容路径；
3. 已应用的数据库 migration 不手工编辑、不直接回滚；如需修正 schema、函数、权限或索引，
   新增经评审的 forward-only remediation migration；
4. 修正后重新执行 Local/Remote 对齐、dry-run、API smoke、EXPLAIN、Admin build 和 Playwright
   门禁，再恢复发布。

本文不记录任何真实租户、员工、供应商、用户标识或凭据。
