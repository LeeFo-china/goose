# 客户装修生图额度本地与开发环境验收证据

日期：2026-09-12
分支：`feat/customer-rendering-quota`
结论：代码、合同、构建及独立数据库行为通过；唯一待执行 migration 已由仓库专用 workflow 应用到开发库，API 已发布到开发环境并完成后验检查。

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
  89 pass, 0 fail, 430 expectations

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

## migration 路径核对

此前执行完整 `supabase db reset --local` 时，在既有 migration：

```text
20260826141500_prepare_supplier_purchase_batch_catalog_search.sql
```

失败，原因为当前 Supabase CLI 2.99 的 migration pipeline 不允许
`CREATE INDEX CONCURRENTLY`，数据库返回 `SQLSTATE 25001`。根因不是该
migration 损坏：它的首行明确声明 `gooes:migration-mode=nontransactional`，仓库
`docs/runbooks/supplier-purchase-batch-nontransactional-migrations.md` 也规定必须由
`.github/workflows/migrate-dev-database.yml` 在事务外执行并在索引校验通过后登记
history。直接 `db reset` / `db push` 本来就不是这组 migration 的支持路径。

本地行为复验通过临时 migration 视图把 Docker 数据库完整重建到
`20260826141000`。Supabase CLI 2.99 的 migration `--version` 参数被同名全局
布尔参数抢占，因此未依赖该参数。随后从已提交的 `20260912150000` 文件直接创建
本次测试对象，并重新执行顺序和三组并发测试，结果均通过；没有手工登记 history，
本地 history 的最大版本仍是 `20260826141000`，也没有把该方式用于远端。它证明
账本 SQL 可在干净前置 schema 上运行，不代表完整 migration runner 验收。

2026-09-12 通过开发服务器的只读 PostgreSQL 会话查询
`supabase_migrations.schema_migrations`，开发库最新版本为 `20260912100000`；与
当前分支 migration 文件比对后，唯一待执行版本是
`20260912150000_create_customer_rendering_quota_ledger.sql`。查询强制
`default_transaction_read_only=on` 和 15 秒超时，没有执行数据库写入。

仓库 migration runner 合同以 `bun test --timeout 20000` 完整复验：155 项通过、
0 项失败、5045 次断言，包含非事务 migration 的事务外执行、失败不登记 history
及索引后验校验。随后已按该路径完成 `plan` 和 `apply`，详见下方开发发布证据。
禁止修改既有并发索引 migration、使用 `migration repair`、手工写 history 或
手工远端 DDL/DML 来掩盖 CLI 限制。

## 配置与边界

API 启动前必须配置：

```text
CUSTOMER_RENDERING_IDENTITY_HMAC_KEY        至少 32 字节
CUSTOMER_RENDERING_IDENTITY_HMAC_KEY_VERSION 正整数，默认 1
```

身份摘要密钥不回退到 `JWT_SECRET`。本证据未记录任何密钥值、真实手机号、openid、subject 或摘要。

开发服务器 `/opt/gooes-dev/docker/.env.dev.api` 已在服务器本机生成并原子写入
64 位十六进制 HMAC 值及版本 `1`，文件权限保持 `0600`；可恢复备份为
`/opt/gooes-dev/docker/.env.dev.api.bak.customer-rendering-20260912T152825Z`。
密钥值没有离开服务器或进入日志/证据；API 发布后容器内只核对到配置存在、长度
为 64 且版本为 `1`。

## 开发 migration 与 API 发布

- Migration plan：[run 34702449470](https://github.com/LeeFo-china/goose/actions/runs/34702449470)，绑定提交 `ab42e7b0654de32deff389a974d3d79fb2763c10`；`before_count=617`、`before_latest=20260912100000`、`pending_count=1`、`pending_versions=20260912150000`、`applied_count=0`。
- Migration apply：[run 34702485912](https://github.com/LeeFo-china/goose/actions/runs/34702485912)，绑定相同提交；`after_count=618`、`after_latest=20260912150000`、`applied_count=1`、`applied_versions=20260912150000`。
- 只读数据库后验：history 为 `618 / 20260912150000`；5 张账本表存在且 5 张均启用 RLS；4 个公开 RPC 存在，4 个均有预期 service-role EXECUTE 权限。
- API 发布：[run 34702570347](https://github.com/LeeFo-china/goose/actions/runs/34702570347)，migration history gate、不可变镜像证据、部署和服务健康检查均通过；运行容器 revision 为完整提交 `ab42e7b0654de32deff389a974d3d79fb2763c10`。
- 公网 smoke：根路径返回 200；微信和抖音 quota 路径在无 token 时均返回 401 / `TOKEN_MISSING`；使用服务器内生成的短期虚构 subject 抖音 token 调用 quota 返回 200 / `message=success` / `remaining=1` / `phone_verified=false`。

开发库当时没有未过期的微信 visitor 选租上下文，因此没有伪造或写入 fixture 来
强行完成微信 200 smoke；微信合法会话路径已由本地 Fastify inject 和 service 测试
覆盖。未认证公网检查证明新路径已进入统一鉴权，剩余风险是等待小程序真实微信
会话联调。

本次没有：

- 触碰生产 migration 或生产发布；
- 触发真实火山方舟生图费用；
- 修改 `orange`；
- 新增无分页列表；
- 让 controller 直连 Supabase；
- 在生产新增裸身份日志。

`orange` 只读检查时已有其他未提交采购相关改动；本次没有接触其 Git 状态或内容。完整客户端交接见 `docs/integration/customer-rendering-quota-api.md`。
