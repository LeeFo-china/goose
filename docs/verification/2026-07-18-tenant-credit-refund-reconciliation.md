# 租户积分退款主动对账验收记录

## 验收范围

- 分支：`release/recharge-payment-expiration`
- 验收起始 HEAD：`8469def2b6e19c4d2214eaa2c335d2e1885d19d7`
- 干净 release 基线：`309bc1868b8673c8e74846f614efd5f6ce27d138`
- 验收日期：2026-07-19（Asia/Shanghai）
- Bun：`1.3.2`
- Supabase CLI：`2.99.0`
- 授权目标：dev，`api-dev.goodcms.cn:5432`（仅记录主机和端口；未记录连接 URL、用户名或密码）

本次仅应用已纳入版本控制的 migration，并执行只读或事务回滚 smoke。未执行真实微信付款或退款，未修改 orange，未 push、merge、部署或创建 PR。

## Migration 门禁与应用证据

所有命令均只加载仓库授权的 `/Users/leefo/Public/work/gooes/.env`，未输出环境变量值。

### 应用前

`supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"` 成功。完整历史中不存在 remote-only 或错位；相关尾部的精确结果如下，所有更早版本也均为 Local/Remote 相等：

| Local | Remote |
| --- | --- |
| `20260717110000` | `20260717110000` |
| `20260718110000` | `20260718110000` |
| `20260718121000` | `20260718121000` |
| `20260718122000` | `20260718122000` |
| `20260718122500` | `20260718122500` |
| `20260718123000` | `20260718123000` |
| `20260718124000` | — |

### Dry-run

`supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --dry-run` 成功，唯一输出的待应用文件为：

```text
20260718124000_harden_tenant_credit_refund_reconciliation.sql
```

### 应用及应用后

仅执行一次 `supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --yes`，成功应用 `20260718124000_harden_tenant_credit_refund_reconciliation.sql`。未执行手工 SQL 或 migration repair。

应用后的 `supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"` 成功；相关尾部精确结果如下，完整历史 Local/Remote 对齐：

| Local | Remote |
| --- | --- |
| `20260717110000` | `20260717110000` |
| `20260718110000` | `20260718110000` |
| `20260718121000` | `20260718121000` |
| `20260718122000` | `20260718122000` |
| `20260718122500` | `20260718122500` |
| `20260718123000` | `20260718123000` |
| `20260718124000` | `20260718124000` |

## Supabase 类型生成

从同一 dev 数据库执行：

```bash
supabase gen types typescript \
  --db-url "$SUPABASE_DB_DIRECT_URL" \
  --schema public > /tmp/gooes-database.ts
```

CLI 在 schema inspect 阶段失败，稳定错误为：`failed to inspect docker image: Cannot connect to the Docker daemon`。生成的临时文件为空，因此未替换或手写 `apps/api/src/types/database.ts`；该文件保持不变，现有 repository 继续使用项目已有的未类型化 RPC 边界。

## 数据库 smoke

`apps/api/src/scripts/tenant-credit-refund-reconciliation-smoke.ts` 使用已安装 Bun `SQL.begin`/`SQL.array` API。契约测试先验证了模块缺失时的 RED，再在实现后获得 3 个测试、5 个断言全部通过。

dev smoke 的完整安全输出为：

```json
{"objects":true,"privileges":true,"historical_backfill":true,"safe_mirror_repair":true,"invalid_limit":true,"empty_claim":true,"rolled_back":true}
```

证据含义：

- 所需索引、三个稳定命名约束存在，`reconcile_last_error` 上限为 200 字符；
- `anon`、`authenticated` 对七个精确 RPC 签名的 14 项 `EXECUTE` 权限均为 `false`；
- 历史 `refunding` 空调度为 0，安全范围内的活动请求/订单陈旧镜像为 0；
- `p_limit=101` 在 `Bun.SQL.begin` 中返回稳定数据库错误 `BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID`，异常触发事务回滚；
- 第二个 `Bun.SQL.begin` 使用 epoch 时间、`p_limit=1`、120 秒 lease 和新 UUID，领取结果为空，随后抛出并捕获私有 sentinel 以证明回滚；
- 未创建退款、未调用微信、未提交业务数据。

## 代码与测试门禁

- 提交后 changed-test：53 个文件，512 个测试，1606 个断言，0 失败；
- 稳定工作区套件：
  - release-contracts：142 个测试，1537 个断言，0 失败；
  - domain：28 个测试，152 个断言，0 失败；
  - web：364 个测试，2121 个断言，0 失败；
  - 合计：534 个测试，3810 个断言，0 失败；
- `bun run api:check`：类型检查、API 构建、文件大小检查全部通过；
- `git diff --check 309bc1868b8673c8e74846f614efd5f6ce27d138..HEAD`：无错误；
- 当前工作区 `git diff --check`：无错误。
