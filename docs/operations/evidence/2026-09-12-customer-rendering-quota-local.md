# 客户装修生图额度本地验收证据

日期：2026-09-12
分支：`feat/customer-rendering-quota`
结论：代码、合同、构建及独立数据库行为通过；完整 migration 历史未对齐，禁止据此发布到开发环境。

## 已验证范围

- 公共规则：未验证 1 次；验证后总共 5 次；预占计入剩余；活动任务优先阻止重复生成。
- 身份：微信 visitor/customer 与抖音 mini/customer 分流；租户和抖音安装由服务端可信上下文解析。
- 隐私：数据库仅保存 tenant-scoped HMAC 摘要；HTTP body 不接受手机号、租户或平台主体。
- 原子性：手机号跨渠道归并、预占、消费/释放、幂等重放均由 SECURITY DEFINER RPC 完成。
- HTTP：四条 quota/phone:bind 路由、strict DTO、认证隔离和 trial capability 排除。

## 测试与构建

执行并通过：

```text
bun test packages/domain/src/customer-rendering.test.ts
  7 pass, 0 fail, 32 expectations

cd apps/api
bun test src/schema/customer-renderings.test.ts \
  src/services/customer-rendering \
  src/repositories/customer-rendering-quota.test.ts \
  src/repositories/customer-rendering-context.test.ts \
  src/controllers/visitor-renderings \
  src/controllers/douyin-miniapp/renderings-controller.test.ts
  31 pass, 0 fail, 143 expectations

bun test src/controllers/visitor-renderings/index.test.ts \
  src/controllers/douyin-miniapp/renderings-controller.test.ts \
  src/controllers/douyin-miniapp/index.test.ts \
  src/services/tenant-service-capability-map.test.ts \
  src/plugins/auth/legacy-plugin-douyin.test.ts \
  src/plugins/auth/legacy-plugin.test.ts
  62 pass, 0 fail, 297 expectations

最终把上述 API 用例合并为一次回归执行
  89 pass, 0 fail, 428 expectations

bun run typecheck
  exit 0

bun run api:build
  984 modules bundled; exit 0

Fastify inject route smoke
  http_route_smoke=pass statuses=200,200,200,200,400,400
  四条合法请求均为 200；两个含禁用 authority 字段的绑定请求均为 400

bun scripts/check-file-size.ts --staged
  no staged API/Admin files at verification time

git diff --check
  exit 0
```

worktree 初始通过软链接复用主目录依赖，导致 domain 被错误解析到用户目录中的 Zod 4.1.8，而 API 使用 Zod 4.4.2。验收前已把被 Git 忽略的 worktree 依赖链接改为当前 workspace 解析，`tsc` 随后无错误。没有修改依赖版本、package manifest 或锁文件。

## 数据库行为

测试对象来自 migration：

```text
20260912150000_create_customer_rendering_quota_ledger.sql
```

本地 PostgreSQL 顺序脚本：

```text
BEGIN
DO
ROLLBACK
```

本地双连接并发脚本：

```text
remaining_race=pass
idempotent_replay=pass
merge_settlement_race=pass
```

三组场景分别证明：最后一次额度并发只允许一个预占；同一请求并发重放只生成一份事实；微信/抖音手机号归并与旧 reservation 结算并发后仍落到一个规范账户。

## migration 阻塞

此前执行完整 `supabase db reset --local` 时，在既有 migration：

```text
20260826141500_prepare_supplier_purchase_batch_catalog_search.sql
```

失败，原因为当前 Supabase CLI 的 migration pipeline 不允许 `CREATE INDEX CONCURRENTLY`，数据库返回 `SQLSTATE 25001`。因此 reset 在该版本中止；为验证本次账本 SQL 的独立行为，曾直接从已提交的 migration 文件把本次 SQL 应用到本地临时数据库，但没有写入 migration history。

2026-09-12 再次运行 `supabase migration list --local`：文件侧包含 `20260912150000`，本地数据库 migration history 仍只对齐到 `20260826141000`，`20260826141500` 及其后的 history 均为空。该状态不满足项目“Local/Remote 对齐”要求。

发布前必须先由独立任务修正既有 `20260826141500` 对当前 CLI 的兼容性，重新执行完整 reset/up，再确认 `20260912150000` 同时出现在文件和本地数据库历史中。禁止用 `migration repair`、手工写 history 或手工远端 DDL/DML 掩盖该问题。

## 配置与边界

API 启动前必须配置：

```text
CUSTOMER_RENDERING_IDENTITY_HMAC_KEY        至少 32 字节
CUSTOMER_RENDERING_IDENTITY_HMAC_KEY_VERSION 正整数，默认 1
```

身份摘要密钥不回退到 `JWT_SECRET`。本证据未记录任何密钥值、真实手机号、openid、subject 或摘要。

本次没有：

- 应用远端 migration；
- 发布 API 或触发真实火山方舟生图费用；
- 修改 `orange`；
- 新增无分页列表；
- 让 controller 直连 Supabase；
- 在生产新增裸身份日志。

`orange` 只读检查时已有其他未提交采购相关改动；本次没有接触其 Git 状态或内容。完整客户端交接见 `docs/integration/customer-rendering-quota-api.md`。
