# 客户装修生图身份与额度账本 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立服务端唯一可信的装修生图体验身份与额度账本，使未验证手机号的同一渠道账号只能成功体验 1 次，绑定已验证手机号后在同一装修公司内微信与抖音累计最多成功 5 次，并为下一阶段任务 Worker 提供原子预占、核销和释放能力。

**Architecture:** 双端 controller 只读取已校验 JWT；service 从可信会话和已有租户上下文解析 actor，并用独立、可版本化的 HMAC 密钥把微信 openid、抖音 subject 及手机号转换为租户范围摘要。Supabase migration 建立规范额度账户、渠道身份绑定、任务预占和只追加事件账本；所有合并、预占、核销、释放通过 `SECURITY DEFINER` RPC 在事务内按固定顺序加锁。数据库不保存裸手机号/原始渠道身份，额度账户不依赖 CRM `customer_id`，跨渠道合并不改变历史图片访问主体。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、现有 JWT/定位/抖音安装上下文、`@gooes/domain`。

---

## 范围和完成定义

本计划交付：

- `GET /visitor/renderings/quota` 与 `GET /douyin-mini/renderings/quota`。
- `POST /visitor/renderings/phone:bind` 与 `POST /douyin-mini/renderings/phone:bind`；请求只含 `idempotency_key`，手机号只从当前已签名会话的 `verified_phone` 获取。
- 微信、抖音身份与同一手机号的租户内额度归并。
- 内部 `reserve / consume / release` RPC 和 repository 能力，供下一阶段创建任务及 Worker 使用。
- 数据库并发证据：剩 1 次时两个不同请求只成功一个；相同幂等键不重复预占；绑定与结算并发不丢账。

本计划不交付：

- 不新增上传、任务、Worker、真实方舟调用、结果图或装修建议接口。
- 不修改 `orange`；小程序联调契约只写入 gooes 文档。
- 不自动创建或合并 CRM 客户，不按手机号开放另一渠道的历史图片。
- 不实现租户每日任务/预算和主体频控；它们与任务准入在下一计划中原子落地。
- 不发布开发环境，不 push；执行完成后先给本地验证结果，由用户决定 migration/发布。

## 固定业务规则

| 场景 | 服务端结果 |
| --- | --- |
| 未验证手机号且 `consumed + reserved = 0` | 剩余 1，可预占 |
| 未验证手机号且已有一次成功或预占 | 剩余 0，`RENDERING_PHONE_REQUIRED` |
| 已验证手机号 | 总额度 5，第一次包含在 5 次内 |
| 存在任意执行中预占 | 阻止不同新任务，`RENDERING_JOB_ACTIVE` |
| 同 actor、同操作、同幂等键、同请求摘要 | 返回原结果，不重复记账 |
| 同 actor、同操作、同幂等键、不同请求摘要 | 409 `RENDERING_IDEMPOTENCY_CONFLICT` |
| 明确技术失败/审核拒绝 | `release`，不消耗次数 |
| 可交付图片保存且审核通过 | `consume` 一次 |
| 微信和抖音各成功一次后绑定同一手机号 | 归并后 `consumed=2`、`remaining=3` |

---

### Task 1: 固化共享合同与稳定错误语义

**Files:**
- Modify: `packages/domain/src/customer-rendering.ts`
- Modify: `packages/domain/src/customer-rendering.test.ts`
- Modify: `apps/api/src/errors/error-codes.ts`
- Create: `apps/api/src/schema/customer-renderings.ts`
- Create: `apps/api/src/schema/customer-renderings.test.ts`

- [ ] **Step 1: 写失败测试**

在 domain 测试中覆盖：未验证上限 1、验证后总上限 5、预占优先返回 `job_active`、第一次不会在绑定后额外变成第 6 次。schema 测试覆盖 `phone:bind` 只接受 UUID `idempotency_key`，拒绝 `phone`、`verified`、`tenant_id` 等多余字段。

- [ ] **Step 2: 验证 RED**

Run:

```bash
bun test packages/domain/src/customer-rendering.test.ts \
  apps/api/src/schema/customer-renderings.test.ts
```

Expected: 新增 bind schema 和错误码尚不存在，测试失败。

- [ ] **Step 3: 最小实现**

新增并导出：

```ts
export const RenderingPhoneBindSchema = z.strictObject({
  idempotency_key: z.uuid(),
});

export type RenderingPhoneBind = z.infer<typeof RenderingPhoneBindSchema>;
```

在 `ErrorCodes` 增加：

```ts
RENDERING_TENANT_CONTEXT_REQUIRED: "RENDERING_TENANT_CONTEXT_REQUIRED",
RENDERING_PHONE_REQUIRED: "RENDERING_PHONE_REQUIRED",
RENDERING_QUOTA_EXHAUSTED: "RENDERING_QUOTA_EXHAUSTED",
RENDERING_JOB_ACTIVE: "RENDERING_JOB_ACTIVE",
RENDERING_IDEMPOTENCY_CONFLICT: "RENDERING_IDEMPOTENCY_CONFLICT",
RENDERING_IDENTITY_KEY_UNAVAILABLE: "RENDERING_IDENTITY_KEY_UNAVAILABLE",
```

保留现有 `RenderingQuotaSchema` 和 `projectRenderingQuota()` 为响应投影的唯一 shared contract，不创建第二套额度计算函数。

- [ ] **Step 4: 验证 GREEN**

Run: `bun test packages/domain/src/customer-rendering.test.ts apps/api/src/schema/customer-renderings.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/domain/src/customer-rendering.ts \
  packages/domain/src/customer-rendering.test.ts \
  apps/api/src/errors/error-codes.ts \
  apps/api/src/schema/customer-renderings.ts \
  apps/api/src/schema/customer-renderings.test.ts
git commit -m "feat(rendering): 固化客户生图额度合同"
```

### Task 2: 用 migration 建立租户隔离的身份和额度账本

**Files:**
- Create: `apps/api/src/services/customer-rendering/quota-migration-contract.test.ts`
- Create: `supabase/migrations/20260912150000_create_customer_rendering_quota_ledger.sql`

- [ ] **Step 1: 写失败的 migration 合同测试**

合同测试必须检查以下对象和安全属性，而不是只检查表名字符串：

- `customer_rendering_quota_accounts`：租户复合唯一键、`active/merged` 状态约束、手机号摘要/密钥版本成对为空或成对存在、规范账户指针约束。
- `customer_rendering_identity_bindings`：`tenant_id + channel + subject_key_version + subject_digest` 唯一；微信与抖音的 app/installation 字段形态约束；复合外键禁止跨租户账户绑定。
- `customer_rendering_quota_reservations`：`reserved/consumed/released` 状态、actor+操作幂等唯一、请求摘要、任务 ID、状态时间。
- `customer_rendering_quota_events`：`reserve/consume/release/merge`，同一次预占同一事件类型唯一，只授予 service role `SELECT/INSERT`，不授予更新或删除。
- 四张表全部启用 RLS，不给 anon/authenticated 直接表权限。
- RPC owner、空 `search_path`、撤销 PUBLIC execute，只允许 service role。

- [ ] **Step 2: 验证 RED**

Run: `cd apps/api && bun test src/services/customer-rendering/quota-migration-contract.test.ts`

Expected: FAIL，migration 尚不存在。

- [ ] **Step 3: 编写 forward-only migration**

migration 创建以下内部 RPC；参数只接受服务器已经计算的摘要，不接受裸手机号、openid 或抖音 openid：

```sql
public.get_customer_rendering_quota(
  p_tenant_id uuid,
  p_channel text,
  p_subject_key_version smallint,
  p_subject_digest text,
  p_phone_key_version smallint default null,
  p_phone_digest text default null
) returns jsonb

public.bind_customer_rendering_phone(
  p_tenant_id uuid,
  p_channel text,
  p_subject_key_version smallint,
  p_subject_digest text,
  p_application_id text,
  p_installation_id uuid,
  p_phone_key_version smallint,
  p_phone_digest text,
  p_idempotency_key uuid,
  p_request_hash text
) returns jsonb

public.reserve_customer_rendering_quota(
  p_tenant_id uuid,
  p_channel text,
  p_subject_key_version smallint,
  p_subject_digest text,
  p_application_id text,
  p_installation_id uuid,
  p_phone_key_version smallint,
  p_phone_digest text,
  p_job_id uuid,
  p_idempotency_key uuid,
  p_request_hash text
) returns jsonb

public.settle_customer_rendering_quota(
  p_tenant_id uuid,
  p_job_id uuid,
  p_outcome text -- consume | release
) returns jsonb
```

实现约束：

1. 所有摘要为 64 位小写十六进制并带正整数 key version。
2. 账户归并锁按 UUID 文本升序获取；所有 identity binding 最终指向规范账户。
3. 事件保持只追加；历史 reservation 不改写，读取和准入按规范账户及其已归并来源聚合。
4. 同手机号已存在规范账户时，把渠道试用账户并入该账户；不存在时升级当前账户或创建手机号账户。
5. 新预占在规范账户锁内统计 `consumed + reserved`，未验证上限 1、已验证上限 5。
6. 合并后多个历史在途 reservation 可以结算，但只要聚合 `reserved > 0` 就拒绝新任务。
7. `settle` 对相同 outcome 幂等，对相反的终态拒绝；迟到结算使用 reservation 的规范账户族，不丢预占。
8. RPC 返回内部严格 JSON：`account_id`、`phone_verified`、`consumed`、`reserved`、`active_job_id`、`reservation_status`；HTTP 层不会返回 `account_id`。

- [ ] **Step 4: 验证 GREEN**

Run: `cd apps/api && bun test src/services/customer-rendering/quota-migration-contract.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/customer-rendering/quota-migration-contract.test.ts \
  supabase/migrations/20260912150000_create_customer_rendering_quota_ledger.sql
git commit -m "feat(rendering): 增加客户生图额度账本"
```

### Task 3: 用真实 PostgreSQL 行为测试证明归并、幂等和并发

**Files:**
- Create: `supabase/tests/customer_rendering_quota.sql`
- Create: `supabase/tests/customer_rendering_quota_concurrency_fixture.sql`
- Create: `supabase/tests/customer_rendering_quota_concurrency.sh`

- [ ] **Step 1: 写顺序行为测试**

`customer_rendering_quota.sql` 在事务内创建两个租户和四个虚构摘要，覆盖：

- 租户 A 的未验证微信 actor 首次预占成功，第二个不同任务返回 `phone_required`。
- release 后可重新预占，consume 后不可再次匿名预占。
- 绑定手机号后，首次已消费计入 5 次总额，剩余为 4。
- 微信和抖音各消费 1 次再绑定同一手机号，剩余为 3。
- 同摘要在租户 B 是独立额度；任何复合外键都不能指向租户 A 账户。
- 删除/更新只追加 event 被权限拒绝。
- 测试最后 `ROLLBACK`，不留下 fixture。

- [ ] **Step 2: 写并发 harness**

脚本只允许本机数据库地址或默认 `supabase_db_gooes` 容器，拒绝带 query/fragment 的 URL，并复用仓库现有并发脚本的 `PGOPTIONS`、超时、清理模式。覆盖三个屏障场景：

1. 剩 1 次时同时 reserve 两个不同 job，恰好一个成功。
2. 同幂等键同时重放，只生成一个 reservation 和一个 reserve event。
3. 一边把微信/抖音账户绑定同一手机号，一边 consume 旧 reservation，最终 `consumed=2` 且无悬空 binding。

- [ ] **Step 3: 应用到本地隔离数据库并验证行为**

Run:

```bash
quota_reset_dir="$(mktemp -d /tmp/gooes-quota-reset.XXXXXX)"
trap '/usr/bin/trash "${quota_reset_dir}"' EXIT
mkdir -p "${quota_reset_dir}/supabase/migrations"
ln -s "$PWD/supabase/config.toml" "${quota_reset_dir}/supabase/config.toml"
for migration_file in "$PWD"/supabase/migrations/*.sql; do
  migration_name="$(basename "${migration_file}")"
  migration_version="${migration_name%%_*}"
  if [[ "${migration_version}" > "20260826141000" ]]; then
    continue
  fi
  ln -s "${migration_file}" \
    "${quota_reset_dir}/supabase/migrations/${migration_name}"
done
supabase --workdir "${quota_reset_dir}" db reset --local --no-seed
docker exec -i supabase_db_gooes psql -h /var/run/postgresql \
  -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/20260912150000_create_customer_rendering_quota_ledger.sql
docker exec -i supabase_db_gooes psql -h /var/run/postgresql \
  -X -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/tests/customer_rendering_quota.sql
bash supabase/tests/customer_rendering_quota_concurrency.sh
```

Expected: 顺序和并发测试均退出 0；若本机 Supabase/Docker 不可用，停止数据库实现验收并明确报告，不以静态测试替代并发证据。

仓库从 `20260826141500` 开始包含必须在事务外执行的并发索引 migration，
Supabase CLI 2.99 的 `db reset` 不支持这类文件，且其 migration `--version`
参数会被同名全局布尔参数抢占。这里通过临时 migration 视图把本地数据库重建到
`20260826141000`，再从版本控制中的账本 migration 文件直接创建本次测试对象；
不得为本地测试手工登记 migration history，也不得把该方式用于远端数据库。

- [ ] **Step 4: 检查开发库发布前 migration 对齐**

通过仓库专用 `.github/workflows/migrate-dev-database.yml` 的 `plan` 模式检查。

Expected: 开发库已对齐到 `20260912100000`，唯一待执行版本为
`20260912150000`。plan 模式不得写数据库；确认清单后才允许使用同一 workflow
的 `apply` 模式。禁止直接用 `supabase db push` 绕过非事务 migration runner。

- [ ] **Step 5: 提交**

```bash
git add supabase/tests/customer_rendering_quota.sql \
  supabase/tests/customer_rendering_quota_concurrency_fixture.sql \
  supabase/tests/customer_rendering_quota_concurrency.sh
git commit -m "test(rendering): 验证客户生图额度并发"
```

### Task 4: 实现可版本化的身份摘要，不落裸身份

**Files:**
- Create: `apps/api/src/services/customer-rendering/identity-digest.ts`
- Create: `apps/api/src/services/customer-rendering/identity-digest.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖：缺少密钥时 fail closed；密钥不足 32 字节时拒绝；同租户同主体结果稳定；不同租户、渠道、app/installation 或用途结果不同；手机号先规范化为 E.164 中国号码后再摘要；返回只包含 `{ keyVersion, digest }`；错误和日志不出现原始手机号/openid/subject。

- [ ] **Step 2: 验证 RED**

Run: `cd apps/api && bun test src/services/customer-rendering/identity-digest.test.ts`

Expected: FAIL，摘要服务尚不存在。

- [ ] **Step 3: 最小实现**

从进程环境读取专用配置：

```text
CUSTOMER_RENDERING_IDENTITY_HMAC_KEY
CUSTOMER_RENDERING_IDENTITY_HMAC_KEY_VERSION=1
```

摘要消息使用固定域分隔：

```text
customer-rendering/subject/v1/<tenant>/<channel>/<app>/<installation>/<subject>
customer-rendering/phone/v1/<tenant>/<e164-phone>
```

不得复用 `JWT_SECRET`，避免 JWT 密钥轮换破坏历史额度关联。构造函数允许测试注入密钥；生产缺失时通过 `Errors.business(503, ..., RENDERING_IDENTITY_KEY_UNAVAILABLE)` 返回，不输出密钥或原始值。

- [ ] **Step 4: 验证 GREEN**

Run: `cd apps/api && bun test src/services/customer-rendering/identity-digest.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/customer-rendering/identity-digest.ts \
  apps/api/src/services/customer-rendering/identity-digest.test.ts
git commit -m "feat(rendering): 增加客户额度身份摘要"
```

### Task 5: 建立可信的微信/抖音 actor 与租户上下文

**Files:**
- Create: `apps/api/src/repositories/customer-rendering-context.ts`
- Create: `apps/api/src/repositories/customer-rendering-context.test.ts`
- Create: `apps/api/src/services/customer-rendering/context.ts`
- Create: `apps/api/src/services/customer-rendering/context.test.ts`

- [ ] **Step 1: 写失败测试**

微信覆盖：

- `visitor_session` 使用签名 payload 的 `openid`；租户只能来自已确认且未过期的 `user_location_contexts.selected_tenant_id`。
- `auth + login_channel=wechat` 使用 `openid`；有 `tenant_id` 时仍校验租户 active，无 tenant 时不得信任 body/query，返回 `RENDERING_TENANT_CONTEXT_REQUIRED`。
- 带 `verified_phone` 的会话输出可信 phone；无该 claim 时不能由请求体补充。

抖音覆盖：

- 接受 `douyin_miniapp`，以及保留完整 `subject_hash/douyin_installation_id/douyin_app_id` 的 `auth + login_channel=douyin`。
- 复用 `findActiveInstallation` 校验 installation、app、tenant、授权状态、runtime 配置及 active tenant；JWT 自身字段不作为唯一依据。
- 安装停用或租户暂停时拒绝，不回退到 body `tenant_id`。

- [ ] **Step 2: 验证 RED**

Run:

```bash
cd apps/api
bun test src/repositories/customer-rendering-context.test.ts \
  src/services/customer-rendering/context.test.ts
```

Expected: FAIL，上下文 repository/service 尚不存在。

- [ ] **Step 3: 最小实现**

service 输出统一内部对象：

```ts
type CustomerRenderingActor = {
  tenantId: string;
  channel: "wechat" | "douyin";
  subject: string;
  applicationId: string | null;
  installationId: string | null;
  verifiedPhone: string | null;
};
```

repository 查询只选择必要字段并 `.limit(1)`；不新增无界列表。`subject` 和 `verifiedPhone` 只在 service 内短暂存在，下一层立刻转换为摘要，不写普通日志。

- [ ] **Step 4: 验证 GREEN**

Run: `cd apps/api && bun test src/repositories/customer-rendering-context.test.ts src/services/customer-rendering/context.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/repositories/customer-rendering-context.ts \
  apps/api/src/repositories/customer-rendering-context.test.ts \
  apps/api/src/services/customer-rendering/context.ts \
  apps/api/src/services/customer-rendering/context.test.ts
git commit -m "feat(rendering): 解析双端可信额度身份"
```

### Task 6: 封装 RPC repository 并严格解析数据库结果

**Files:**
- Create: `apps/api/src/repositories/customer-rendering-quota.ts`
- Create: `apps/api/src/repositories/customer-rendering-quota.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖四个 RPC 的精确参数映射、Supabase 错误包装、数据库业务状态映射、严格 JSON 解析、tenant/account/job UUID 校验、负数或非整数计数拒绝。任何未知 RPC 状态必须变成 `Errors.dbError('客户生图额度数据格式异常')`，不能静默当作零额度。

- [ ] **Step 2: 验证 RED**

Run: `cd apps/api && bun test src/repositories/customer-rendering-quota.test.ts`

Expected: FAIL，repository 尚不存在。

- [ ] **Step 3: 最小实现**

repository 只暴露：

```ts
read(input): Promise<QuotaLedgerSnapshot>
bindPhone(input): Promise<QuotaLedgerSnapshot>
reserve(input): Promise<QuotaReservationResult>
settle(input): Promise<QuotaReservationResult>
```

`read/bindPhone` 供本阶段 HTTP service 使用；`reserve/settle` 暂只供测试和下一阶段 job service 使用。业务拒绝由 RPC 返回稳定状态，再由 service 转为相应 `Errors.business(...)`；数据库错误细节不进入客户端响应。

- [ ] **Step 4: 验证 GREEN**

Run: `cd apps/api && bun test src/repositories/customer-rendering-quota.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/repositories/customer-rendering-quota.ts \
  apps/api/src/repositories/customer-rendering-quota.test.ts
git commit -m "feat(rendering): 封装客户生图额度账本"
```

### Task 7: 实现共享 quota service 与安全手机号归并

**Files:**
- Create: `apps/api/src/services/customer-rendering/quota.ts`
- Create: `apps/api/src/services/customer-rendering/quota.test.ts`
- Create: `apps/api/src/services/customer-rendering/index.ts`

- [ ] **Step 1: 写失败测试**

覆盖：

- `getQuota(user, channel)` 解析可信 actor、计算摘要并返回 `RenderingQuotaSchema`，不返回内部 account id/digest。
- 已验证会话在读取 quota 时执行幂等的身份同步，使刚完成手机号授权后的第一次 quota 查询就能看到跨渠道累计值。
- `bindPhone` 没有 `verified_phone` 时返回 409 `RENDERING_PHONE_REQUIRED`；有可信手机号时以 actor+phone+幂等键生成稳定 request hash 并归并。
- repository 返回 consumed/reserved 后只调用 `projectRenderingQuota()` 形成公共响应。
- 微信与抖音调用相同 service；无 CRM customer_id 也可成功。
- 日志、错误 details、测试快照不包含 phone、openid、subject 或摘要密钥。

- [ ] **Step 2: 验证 RED**

Run: `cd apps/api && bun test src/services/customer-rendering/quota.test.ts`

Expected: FAIL，quota service 尚不存在。

- [ ] **Step 3: 最小实现**

读取路径规则：匿名 actor 无账本时返回初始投影，不为单纯浏览创建记录；有 `verified_phone` 时允许执行自然幂等的规范账户同步，保证跨渠道额度准确。显式 `phone:bind` 继续保留给客户端完成手机号授权后的动作反馈和幂等响应。

service 不提供公开 reserve 方法；下一阶段创建任务时再把素材校验、任务记录、租户预算和 quota reserve 合并到同一数据库准入事务，避免“占了额度但任务没创建”。

- [ ] **Step 4: 验证 GREEN**

Run: `cd apps/api && bun test src/services/customer-rendering/quota.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/services/customer-rendering
git commit -m "feat(rendering): 增加客户生图额度服务"
```

### Task 8: 暴露双端 quota 与 phone:bind 薄接口

**Files:**
- Create: `apps/api/src/controllers/visitor-renderings/index.ts`
- Create: `apps/api/src/controllers/visitor-renderings/index.test.ts`
- Create: `apps/api/src/controllers/douyin-miniapp/renderings-controller.ts`
- Create: `apps/api/src/controllers/douyin-miniapp/renderings-controller.test.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.test.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/services/tenant-service-capability-map.ts`
- Modify: `apps/api/src/services/tenant-service-capability-map.test.ts`

- [ ] **Step 1: 写失败测试**

精确断言四条路由、Zod strict body、controller 只传 `request.user` 和已解析输入、统一 `ResponseHandler.success`。补充 auth plugin/能力映射测试，确保：

- `/visitor/renderings/*` 只接受现有微信 visitor/auth 会话规则。
- `/douyin-mini/renderings/*` 由抖音小程序 token 或保留抖音 subject claims 的 customer auth token进入，具体安装有效性仍由 service 校验。
- 新路径不会被 tenant trial capability 中间件误判为后台租户 CRUD，也不会扩大任意抖音 token 到 `/visitor/*`。

- [ ] **Step 2: 验证 RED**

Run:

```bash
cd apps/api
bun test src/controllers/visitor-renderings/index.test.ts \
  src/controllers/douyin-miniapp/renderings-controller.test.ts \
  src/controllers/douyin-miniapp/index.test.ts \
  src/services/tenant-service-capability-map.test.ts \
  src/plugins/auth/legacy-plugin-douyin.test.ts \
  src/plugins/auth/legacy-plugin.test.ts
```

Expected: FAIL，新路由尚未注册。

- [ ] **Step 3: 最小实现**

注册：

```text
GET  /visitor/renderings/quota
POST /visitor/renderings/phone:bind
GET  /douyin-mini/renderings/quota
POST /douyin-mini/renderings/phone:bind
```

响应只返回 `RenderingQuota`；不返回 phone、digest、account id、内部 event/reservation。controller 不查询 Supabase、不计算额度、不接受 tenant ID。

- [ ] **Step 4: 验证 GREEN**

重复 Step 2 命令，Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/controllers/visitor-renderings \
  apps/api/src/controllers/douyin-miniapp/renderings-controller.ts \
  apps/api/src/controllers/douyin-miniapp/renderings-controller.test.ts \
  apps/api/src/controllers/douyin-miniapp/index.ts \
  apps/api/src/controllers/douyin-miniapp/index.test.ts \
  apps/api/src/routes/index.ts \
  apps/api/src/services/tenant-service-capability-map.ts \
  apps/api/src/services/tenant-service-capability-map.test.ts
git commit -m "feat(rendering): 开放双端客户额度接口"
```

### Task 9: 回归、接口 smoke 和小程序交接文档

**Files:**
- Create: `docs/integration/customer-rendering-quota-api.md`
- Create: `docs/operations/evidence/2026-09-12-customer-rendering-quota-local.md`

- [ ] **Step 1: 写双端交接契约**

文档必须包含：四条 API、认证 token 类型、手机号先走现有微信/抖音授权流程再调用 `phone:bind`、字段映射、稳定错误码、幂等键生命周期和以下调用序列：

```text
建立会话/选择装修公司 -> GET quota
  -> 若 phone_required：调用现有手机号授权 -> 使用新 token POST phone:bind
  -> 再 GET quota -> 下一阶段 POST jobs
```

明确标记：gooes 已完成后端合同；`orange` 由小程序团队实现且本计划没有修改；抖音页面也留到客户端阶段。

- [ ] **Step 2: 运行最小完整回归**

Run:

```bash
bun test packages/domain/src/customer-rendering.test.ts
cd apps/api
bun test src/schema/customer-renderings.test.ts \
  src/services/customer-rendering \
  src/repositories/customer-rendering-quota.test.ts \
  src/repositories/customer-rendering-context.test.ts \
  src/controllers/visitor-renderings \
  src/controllers/douyin-miniapp/renderings-controller.test.ts
bun run typecheck
cd ../..
bun run api:build
bun scripts/check-file-size.ts --staged
git diff --check
```

Expected: 全部退出码为 0。

- [ ] **Step 3: 运行本地数据库复验并记录证据**

Run:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  -X -v ON_ERROR_STOP=1 -f supabase/tests/customer_rendering_quota.sql
bash supabase/tests/customer_rendering_quota_concurrency.sh
supabase migration list --local
```

证据记录 migration 版本、顺序用例结果、三个并发场景结果、测试数量、typecheck/build 结果；不得记录环境密钥、手机号、openid、subject digest 或数据库连接凭据。

- [ ] **Step 4: 自审边界**

检查 `git diff --stat` 和逐文件 diff，确认无 `orange` 改动、无远端 migration、无发布、无真实方舟费用、无未分页列表、无 controller 直连数据库、无 `throw new Error()`、无裸身份日志。

- [ ] **Step 5: 提交文档和证据**

```bash
git add docs/integration/customer-rendering-quota-api.md \
  docs/operations/evidence/2026-09-12-customer-rendering-quota-local.md
git commit -m "docs(rendering): 记录客户额度接口验收"
```

---

## 后续衔接

本计划验收后，下一份计划才进入“公开效果图库 + 任务准入”：先补素材 `review/published/hidden` 生命周期和双端分页浏览，再把私有上传、任务表、租户预算/频控及 `reserve_customer_rendering_quota` 合并为单一原子 `POST /jobs` 准入事务。随后才接持久 Worker、Seedream 生图、结果审核、装修建议和客户端页面。

## migration 发布与回退边界

- 开发发布前先展示唯一待执行 migration `20260912150000_create_customer_rendering_quota_ledger.sql`，经确认后再应用。
- 应用后必须运行 `supabase migration list`，确认 Local/Remote 对齐，再部署兼容 API。
- 回退优先撤下四条 HTTP 路由并关闭后续任务入口；账本属于不可丢失审计事实，不通过 down migration 删除。
- 若 migration 本身有缺陷，使用新的 forward migration 修复函数、约束或索引；不得手工远端 DDL/DML 修库。
