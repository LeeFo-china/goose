# Customer Rendering Private Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为微信和抖音客户提供相同的私有房间照片/可选户型图上传意图与确认接口，生成可验证归属的私有文件 ID；本计划不开放生图。

**Architecture:** 双端 session controller 只校验 HTTP，复用 `CustomerRenderingContextService` 和 `CustomerRenderingIdentityDigestService` 确定可信租户与主体；共享 service 管理上传意图、文件规范化及状态；repository 操作独立的私有输入账本，COS gateway 只处理受限对象路径和签名。现有 `platform_file_objects` 没有客户主体摘要、上传租约及审核生命周期字段，因此此处用专属账本而不扩大公开图库 scene。原始上传进入短期私有隔离区，确认时限量读取并复用现有图片规范化逻辑，WebP 写入最终私有区后返回 `pending_review`，由下一计划接内容审核和任务准入。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL migration、Tencent COS SDK `cos-nodejs-sdk-v5`、Sharp。

---

## 范围与依赖

设计依据：[客户装修 AI 生图首期设计](../specs/2026-09-13-customer-rendering-ai-mvp-design.md)。本计划只产出可独立调用和验收的私有上传能力；`pending_review` 文件不能用于生成。后续依次另写并验收：任务/额度与租户预算预占 → Worker/方舟/审核/建议/私有结果 → 抖音 UI 与微信交接 → 开发灰度。微信代码由 `orange` 团队维护，本计划只写 gooes。

开始执行前，用 `using-git-worktrees` 建立隔离工作区，保留当前 main 上无关改动；重新核对 `git status`、最新 migration 版本、已安装 COS SDK 的 `GetObjectParams`/`PutObjectParams`/`GetObjectUrlParams` 和仓库现有用法。通过 `supabase migration new create_customer_rendering_private_inputs` 生成唯一 migration（本次生成 `20260913035110`），并同步修改本计划指向，不覆盖既有文件。数据库变更只通过 migration，先 plan、后 apply、再 `supabase migration list`；不得手工远端 DDL/DML。费用或云端图片操作不属于本计划的默认验证。

## 文件职责

| 文件 | 责任 |
| --- | --- |
| `packages/domain/src/customer-rendering.ts`、对应 `.test.ts` | 严格的 intent/complete DTO，所有客户端共用 |
| `supabase/migrations/20260913035110_create_customer_rendering_private_inputs.sql` | 主体绑定、对象位置、状态、RLS/ACL 和查询索引 |
| `apps/api/src/repositories/customer-rendering-inputs.ts`、`.test.ts` | 只按租户和主体摘要读写私有文件行，条件状态转换 |
| `apps/api/src/gateways/customer-rendering-input-storage/client.ts`、`.test.ts` | 限定路径签 PUT、限量读原图、私有写规范图、HEAD 和清理 |
| `apps/api/src/services/customer-rendering/inputs.ts`、`.test.ts` | 可信身份、上传意图/确认编排及规范化；不直接访问数据库或 COS SDK |
| `apps/api/src/errors/error-codes.ts` | 上传过期、处理中和频控的稳定业务码；图片拒绝沿用现有码 |
| `apps/api/src/controllers/visitor-renderings/index.ts`、`.test.ts` | 微信 `/visitor/renderings` 路由 |
| `apps/api/src/controllers/douyin-miniapp/renderings-controller.ts`、`.test.ts` | 抖音 `/douyin-mini/renderings` 路由 |
| `docs/integration/customer-rendering-private-inputs-api.md` | 双端交接、状态/错误映射与 smoke |

## Task 1: 共享严格合同

**Files:** Modify `packages/domain/src/customer-rendering.ts`; Test `packages/domain/src/customer-rendering.test.ts`.

- [ ] **Step 1: 先写失败的 DTO 测试。** 覆盖 `purpose=room/floor_plan`、仅 JPEG/PNG/WebP、`1..10 MiB`、strict object、UUID 参数、不可提交 `tenant_id`/`subject`/任意 URL、到期时间为 ISO 字符串。测试主体：

```ts
expect(RenderingUploadIntentRequestSchema.safeParse({
  purpose: 'room', mime_type: 'image/jpeg', size_bytes: 1024,
}).success).toBe(true);
expect(RenderingUploadIntentRequestSchema.safeParse({
  purpose: 'room', mime_type: 'image/jpeg', size_bytes: 1024, tenant_id: crypto.randomUUID(),
}).success).toBe(false);
expect(RenderingUploadIntentRequestSchema.safeParse({
  purpose: 'floor_plan', mime_type: 'image/heic', size_bytes: 1024,
}).success).toBe(false);
expect(RenderingUploadIntentRequestSchema.safeParse({
  purpose: 'room', mime_type: 'image/png', size_bytes: 10 * 1024 * 1024 + 1,
}).success).toBe(false);
```

- [ ] **Step 2: 运行并确认红灯。** `bun test packages/domain/src/customer-rendering.test.ts`；预期新 schema 未导出导致失败，不把现有通过的用例当作新合同验证。
- [ ] **Step 3: 增加最小 schema 与类型。** 在现有文件追加以下合同；`HEIC/HEIF` 由客户端真实转码后再上传，不伪装 MIME。

```ts
export const RenderingUploadPurposeSchema = z.enum(['room', 'floor_plan']);
export const RenderingUploadMimeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const RenderingUploadIntentRequestSchema = z.strictObject({
  purpose: RenderingUploadPurposeSchema,
  mime_type: RenderingUploadMimeSchema,
  size_bytes: z.number().int().min(1).max(RENDERING_UPLOAD_MAX_BYTES),
});
export const RenderingUploadCompleteRequestSchema = z.strictObject({});
export const RenderingUploadIntentResponseSchema = z.strictObject({
  intent_id: z.uuid(), method: z.literal('PUT'),
  upload_url: z.url({ protocol: /^https$/ }),
  headers: z.record(z.string(), z.string()),
  expires_at: z.iso.datetime({ offset: true }),
});
export const RenderingUploadCompleteResponseSchema = z.strictObject({
  file_id: z.uuid(), status: z.literal('pending_review'),
  mime_type: z.literal('image/webp'), width: z.number().int().positive(),
  height: z.number().int().positive(), size_bytes: z.number().int().positive(),
});
```

- [ ] **Step 4: 运行绿灯与类型检查。** 在仓库根目录运行 `bun test packages/domain/src/customer-rendering.test.ts`、`bun run api:typecheck`；预期 0 fail、exit 0。只提交 domain 文件和测试：`feat(rendering): define private input upload contract`。

## Task 2: 私有输入账本 migration

**Files:** Create `supabase/migrations/20260913035110_create_customer_rendering_private_inputs.sql`; Create `apps/api/src/services/customer-rendering/inputs-migration-contract.test.ts`.

- [ ] **Step 1: 写 migration 合同红灯。** `bun:test` 读取上述 SQL，断言表名、租户复合唯一键、主体摘要/版本、私有对象键唯一约束、状态 CHECK、RLS、仅 service-role 授权、过期清理索引和 `BEGIN/COMMIT`。`cd apps/api && bun test src/services/customer-rendering/inputs-migration-contract.test.ts` 预期因文件不存在失败。
- [ ] **Step 2: 新建 migration。** 使用以下明确的列和约束；任何额外列须有具体消费方，不能记录原始 openid、手机号、签名 URL 或 COS 密钥。

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.customer_rendering_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('wechat', 'douyin')),
  subject_key_version smallint NOT NULL CHECK (subject_key_version > 0),
  subject_digest text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  application_id text,
  installation_id uuid,
  purpose text NOT NULL CHECK (purpose IN ('room', 'floor_plan')),
  declared_mime_type text NOT NULL CHECK (declared_mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  declared_size_bytes integer NOT NULL CHECK (declared_size_bytes BETWEEN 1 AND 10485760),
  -- 原图和归一化对象共用签发时的位置，后续操作不得依赖变化后的默认配置。
  bucket text NOT NULL CHECK (btrim(bucket) <> ''),
  region text NOT NULL CHECK (btrim(region) <> ''),
  raw_object_key text NOT NULL UNIQUE,
  normalized_object_key text UNIQUE,
  normalized_size_bytes integer CHECK (normalized_size_bytes BETWEEN 1 AND 10485760),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  checksum text CHECK (checksum ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'processing', 'pending_review', 'approved', 'rejected', 'failed', 'deleted')),
  expires_at timestamptz NOT NULL,
  processing_lease_expires_at timestamptz,
  raw_cleanup_after timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  raw_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_rendering_inputs_tenant_id_key UNIQUE (tenant_id, id),
  CONSTRAINT customer_rendering_inputs_scope_check CHECK (
    (channel = 'wechat' AND application_id IS NULL AND installation_id IS NULL)
    OR (channel = 'douyin' AND application_id IS NOT NULL AND installation_id IS NOT NULL)
  ),
  CONSTRAINT customer_rendering_inputs_normalized_check CHECK (
    status NOT IN ('pending_review', 'approved')
    OR (normalized_object_key IS NOT NULL AND normalized_size_bytes IS NOT NULL
      AND width IS NOT NULL AND height IS NOT NULL AND checksum IS NOT NULL)
  ),
  CONSTRAINT customer_rendering_inputs_processing_lease_check CHECK (
    status <> 'processing' OR processing_lease_expires_at IS NOT NULL
  )
);
CREATE INDEX customer_rendering_inputs_owner_idx
  ON public.customer_rendering_inputs (tenant_id, channel, subject_key_version, subject_digest, created_at DESC, id);
CREATE INDEX customer_rendering_inputs_raw_cleanup_idx
  ON public.customer_rendering_inputs (raw_cleanup_after, id)
  WHERE raw_deleted_at IS NULL;
CREATE TRIGGER tr_customer_rendering_inputs_updated_at
  BEFORE UPDATE ON public.customer_rendering_inputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.customer_rendering_inputs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_rendering_inputs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_rendering_inputs TO service_role;
COMMIT;
```

- [ ] **Step 3: 验证 migration。** 运行合同测试和项目 migration runner 的 `plan`；在隔离 PostgreSQL 中验证合法/非法 scope、同租户不同主体、同 object key 冲突及 status 约束。远端执行须在后续开发发布步骤单独确认待执行版本；不要在本任务手工修远端。通过后只提交 migration 和合同测试：`feat(rendering): add private customer input ledger`。

## Task 3: Repository 只读归属与状态转换

**Files:** Create `apps/api/src/repositories/customer-rendering-inputs.ts`; Test `apps/api/src/repositories/customer-rendering-inputs.test.ts`.

- [x] **Step 1: 写失败测试。** 用注入的 Supabase client 测：`createIssued` 只保存白名单字段（含签发时 bucket/region）；所有客户读写必须过滤 tenant、channel、subject 版本/摘要、app/installation scope，微信空 scope 使用 `.is(..., null)`；`findOwned` 另匹配 ID 且 `.limit(1)`；`countRecent` 用带索引的主体过滤及 `head:true,count:'exact'` 分别统计 10 分钟/本地日窗口；`claimProcessing` 允许 `issued → processing` 及过期 processing 租约的原子抢占，保护有效租约；`markNormalized/markFailed` 必须匹配仍有效的当前租约，防止旧进程覆盖结果；重放 `pending_review` 读取原记录，不重复写。无权与不存在都返回 null。
- [x] **Step 2: 运行红灯。** `cd apps/api && bun test src/repositories/customer-rendering-inputs.test.ts`；已确认新增模块缺失失败（0 pass / 1 fail）。
- [x] **Step 3: 实现仓储。** 导出 `CustomerRenderingInputsRepository`，依赖可注入 `from(table)` 客户端，默认用 `SupabaseDB.getAdminClient()`。查询字段固定为 `id,tenant_id,channel,subject_key_version,subject_digest,application_id,installation_id,purpose,declared_mime_type,declared_size_bytes,bucket,region,raw_object_key,normalized_object_key,normalized_size_bytes,width,height,checksum,status,expires_at,processing_lease_expires_at,raw_cleanup_after,raw_deleted_at`；单条查询 `.limit(1).maybeSingle()`，客户条件更新同时匹配完整 owner、ID、状态及租约，只返回 ID 区分成功/竞争失败。数据库错误及非法数据库响应走 `Errors.dbError`，响应通过 Zod strict schema 解析。不要通过读取全表后在内存检查所有权。

```ts
export type CustomerInputOwner = {
  tenantId: string;
  channel: 'wechat' | 'douyin';
  subjectKeyVersion: number;
  subjectDigest: string;
  applicationId: string | null;
  installationId: string | null;
};
export type CustomerInputRow = {
  id: string; tenant_id: string; channel: 'wechat' | 'douyin';
  subject_key_version: number; subject_digest: string;
  application_id: string | null; installation_id: string | null;
  purpose: 'room' | 'floor_plan'; declared_mime_type: string;
  declared_size_bytes: number; bucket: string; region: string; raw_object_key: string;
  normalized_object_key: string | null; normalized_size_bytes: number | null;
  width: number | null; height: number | null; checksum: string | null;
  status: 'issued' | 'processing' | 'pending_review' | 'approved' | 'rejected' | 'failed' | 'deleted';
  expires_at: string; processing_lease_expires_at: string | null;
  raw_cleanup_after: string; raw_deleted_at: string | null;
};
export interface CustomerRenderingInputsRepositoryPort {
  createIssued(owner: CustomerInputOwner, input: {
    id: string; purpose: 'room' | 'floor_plan'; mimeType: string;
    sizeBytes: number; bucket: string; region: string; rawObjectKey: string; expiresAt: string;
  }): Promise<void>;
  findOwned(owner: CustomerInputOwner, id: string): Promise<CustomerInputRow | null>;
  countRecent(owner: CustomerInputOwner, since: string): Promise<number>;
  claimProcessing(owner: CustomerInputOwner, id: string, leaseUntil: string, now: string): Promise<boolean>;
  markNormalized(owner: CustomerInputOwner, id: string, result: {
    objectKey: string; sizeBytes: number; width: number; height: number; checksum: string;
  }, leaseUntil: string, now: string): Promise<boolean>;
  markFailed(owner: CustomerInputOwner, id: string, leaseUntil: string | null, now: string): Promise<boolean>;
  listRawCleanupDue(now: string, limit: number): Promise<CustomerInputRow[]>;
  claimRawCleanup(input: {
    tenantId: string; id: string; previousDue: string; nextDue: string;
    status: CustomerInputRow['status']; now: string;
  }): Promise<boolean>;
  markRawDeleted(tenantId: string, id: string, claimedDue: string, now: string): Promise<boolean>;
}
```

**Task 5/6 消费约束：** service 使用本次领取的 `leaseUntil` 调用 `markNormalized/markFailed`，每次完成写入传入最新 `now`；签名失败仅可用 `markFailed(..., null, now)` 更新仍为 issued 的行。租约领取必须晚于 now；首次 issued 领取要求上传意图未过期，过期返回 409；processing 恢复仅要求旧处理租约过期及 raw 未删除，不再检查上传意图 expires_at，避免规范图 PUT 结果未知时无法恢复。complete 不得统一拒绝已过期的 processing 记录，有效处理租约仍返回处理中；raw 已删除始终不可领取。bucket/region 从账本传给后续存储操作，不能重新读取默认位置。清理 worker 传入扫描到的状态与原 due；仓储在同一 UPDATE 中只将过期 issued 或租约过期 processing 标为 deleted 并推进 due，阻止后续 complete 抢占；pending_review/approved 保留状态及成品。删除后必须以本次 `nextDue` 调用 `markRawDeleted`，租约过期/被抢占时返回 false。清理批次强制最多 100。测试使用已安装 Supabase 的真实查询构造器加本地 HTTP 数据库替身，不连接远端；并发行为仍需部署前数据库集成验证。
- [x] **Step 4: 运行测试、类型检查并提交。** 在 `apps/api` 运行 `bun test src/repositories/customer-rendering-inputs.test.ts`：13 pass / 0 fail / 112 assertions；仓库根目录 `bun run api:typecheck` exit 0；`git diff --cached --check` 通过。提交：`feat(rendering): 实现私有输入归属与租约仓储`。

## Task 4: COS 私有隔离与规范化网关

**Files:** Create `apps/api/src/gateways/customer-rendering-input-storage/client.ts`; Test `apps/api/src/gateways/customer-rendering-input-storage/client.test.ts`.

- [x] **Step 1: 先写网关红灯测试。** 注入 COS port；本地真实 SDK 验证签名。对象键只能是 `private/customer-rendering-inputs/<tenant>/<id>/raw` 与 `/normalized.webp`。签名绑定 `Content-Length`、Host、`x-cos-acl=private`、`x-cos-forbid-overwrite=true`，最长 10 分钟。HEAD 验证精确大小/MIME，流式 GET 拒绝超长及短读；规范图私有写入、校验长度/MIME/SHA-256 元数据。
- [x] **Step 2: 运行红灯。** `cd apps/api && bun test src/gateways/customer-rendering-input-storage/client.test.ts`：先观察真实 SDK 缺少 Content-Type 签名的断言失败，再观察新网关模块缺失（0 pass / 1 fail）。
- [x] **Step 3: 实现窄接口。** 采用已安装 COS SDK 2.15.4 的 `getAuth({ Headers })`。`getObjectUrl` 类型没有 Headers；`getAuth` 虽接收 Headers，但签名白名单排除 Content-Type。已明确调整合同：Content-Type 是客户端必传请求头，**不是加密绑定的签名头**；HEAD 必须验证声明 MIME/大小，Task 5 的实际解码必须再次验证静态 JPEG/PNG/WebP。不能把签名元数据视为 MIME 绑定。无自定义加密签名或新依赖。

签发流程固定为 `location → createIssued(bucket/region/key) → signPut(..., persistedLocation)`；签名返回相同 location，service 核对后只返回 DTO，绝不持久化签名 URL。后续读、写、HEAD、清理均传数据库记录的位置，只校验位置语法和 tenant/id 规范键，不要求与当前默认 bucket/region 相同。当前凭据仍须可访问旧位置，否则安全失败。`putNormalized` 使用 forbid-overwrite，写后 HEAD 校验 SHA-256 元数据；任何 PUT/验证失败返回 `RENDERING_INPUT_STORAGE_NORMALIZED_UNKNOWN`，保留 processing/对象供租约重领恢复。`hasNormalized` 使用本次确定性规范化字节的摘要校验旧对象；不匹配时不可覆盖或标记完成。

```ts
export interface CustomerInputStoragePort {
  rawObjectKey(tenantId: string, id: string): string;
  normalizedObjectKey(tenantId: string, id: string): string;
  location(tenantId: string, id: string): Promise<RenderingStorageLocation>;
  signPut(tenantId: string, id: string, mimeType: string, sizeBytes: number, location?: RenderingStorageLocation): Promise<{
    location: RenderingStorageLocation; uploadUrl: string; headers: Record<string, string>; expiresAt: string;
  }>;
  readRaw(tenantId: string, id: string, location: RenderingStorageLocation, expectedBytes: number, expectedMime: string): Promise<Buffer>;
  putNormalized(tenantId: string, id: string, location: RenderingStorageLocation, bytes: Buffer): Promise<void>;
  hasNormalized(tenantId: string, id: string, location: RenderingStorageLocation, bytes: Buffer): Promise<boolean>;
  removeRaw(tenantId: string, id: string, location: RenderingStorageLocation): Promise<void>;
}
```
- [x] **Step 4: 运行测试、类型检查并提交。** 在 `apps/api` 运行 `bun test src/gateways/customer-rendering-input-storage/client.test.ts`：10 pass / 0 fail / 57 assertions；根目录 `bun run api:typecheck` 与 `git diff --check` 验证。提交：`feat(rendering): 隔离客户私有输入存储`。未调用真实云服务；上线前仍需验证私有 bucket policy、客户端 CORS/必传头及真实 COS forbid-overwrite 行为。

## Task 5: 共享 service 与双端 HTTP

**Task 4 消费约束：** 使用上述持久位置签发流程。Content-Type 不受 SDK 签名保护，因此 HEAD/实际解码都不可省略；任一不匹配不得进入 pending_review。构建 normalized 位置时沿用账本 bucket/region，只用网关生成的规范键。恢复 processing 先重读 raw 并确定性规范化，用 `hasNormalized` 核对字节摘要后提交账本；`NORMALIZED_UNKNOWN` 不调用 markFailed、不删除对象、不盲目覆盖，保留有效恢复路径。未知对象即使 HEAD 404 也只能用 forbid-overwrite 写入；冲突或未知结果继续保留处理状态。

**Files:** Create `apps/api/src/services/customer-rendering/inputs.ts` and `.test.ts`; Modify `apps/api/src/services/customer-rendering/index.ts`, `apps/api/src/errors/error-codes.ts`, both rendering controllers and their tests; Modify `apps/api/src/schema/customer-renderings.ts` only if API-local path/query parsing needs it.

- [ ] **Step 1: 写 service 红灯测试。** 对微信访客、微信客户和抖音 subject 分别通过既有 `CustomerRenderingContextService` 与 HMAC 摘要解析身份。`createIntent` 按同租户/主体限制 10 分钟最多 3 个、每天最多 10 个未复用上传意图；先创建 `issued` 行再签 PUT，签名失败行标为 `failed`。`complete` 的路径 ID 必须为 UUID、body strict empty；只对本人 `issued/processing/pending_review` 行工作，过期拒绝，跨主体 404；`processing` 且租约未过期返回稳定的处理中错误，不同时读取同一对象；读取 raw 后调用现有 `normalizeRenderingSource`，只让真正 JPEG/PNG/WebP 静态图进入 WebP；规范图私有写入并经 HEAD 后才更新 `pending_review`，重放返回同一 file_id。`pending_review` 不等于审核通过；原始对象清理失败记录待清理事实，不向客户端泄露原图地址。
- [ ] **Step 2: 运行红灯。** `cd apps/api && bun test src/services/customer-rendering/inputs.test.ts`；预期新 service 缺失失败。
- [ ] **Step 3: 实现 service。** 构造器只注入 context、identity digest、repository、storage 与 `normalizeRenderingSource`；方法合同固定为 `createIntent(user: JwtPayload | undefined, channel: 'wechat' | 'douyin', request: RenderingUploadIntentRequest)` 和 `complete(user, channel, intentId: string)`。service 从可信 `CustomerRenderingActor` 派生摘要，绝不接受 body 中的 tenant、subject、object key。规范图检查 SHA-256、宽高、字节数；失败使用 `Errors.business` 与 `error-codes.ts` 中新增的 `RENDERING_UPLOAD_EXPIRED`（409）、`RENDERING_UPLOAD_PROCESSING`（409）、`RENDERING_UPLOAD_RATE_LIMITED`（429），图片解码拒绝沿用 `RENDERING_IMAGE_REJECTED`（422）；实际 COS 失败状态和重试证据留账本，不用 `throw new Error()`。所有数据库/COS 调用继续在 repository/gateway。

```ts
export interface CustomerRenderingInputsPort {
  createIntent(
    user: JwtPayload | undefined,
    channel: 'wechat' | 'douyin',
    request: z.infer<typeof RenderingUploadIntentRequestSchema>,
  ): Promise<z.infer<typeof RenderingUploadIntentResponseSchema>>;
  complete(
    user: JwtPayload | undefined,
    channel: 'wechat' | 'douyin',
    intentId: string,
  ): Promise<z.infer<typeof RenderingUploadCompleteResponseSchema>>;
}
```
- [ ] **Step 4: 写 controller 红灯测试。** 两端均有 `POST /uploads:intent` 与 `POST /uploads/:id/complete`，`tenantServiceAccess=session`；不传 token 返回 401，未选公司返回 409，body 多余 authority 字段返回 400，非法 ID 返回 400，合法响应经 `ResponseHandler.success`，且只把 `request.user` 和解析后的 DTO 传给 service。抖音不扩大 token 能力到通用上传路由；微信不走旧图库的 401 匿名回退。
- [ ] **Step 5: 实现薄 controller 并跑绿灯。** 微信沿用 `@Post(..., { tenantServiceAccess: 'session' })`，抖音在 `registerExtraRoutes` 上显式注册相同语义的前缀；均使用 shared Zod DTO、`Errors.fromZod` 和 `ResponseHandler.success`。在 `apps/api` 运行 `bun test src/services/customer-rendering/inputs.test.ts src/controllers/visitor-renderings/index.test.ts src/controllers/douyin-miniapp/renderings-controller.test.ts`，回仓库根目录运行 `bun run api:typecheck`、`bun run api:build`；预期 0 fail、exit 0。提交：`feat(rendering): expose private input upload to both mini programs`。

```ts
@Post('/visitor/renderings/uploads:intent', { tenantServiceAccess: 'session' })
async createInputIntent(request: FastifyRequest) {
  const parsed = RenderingUploadIntentRequestSchema.safeParse(request.body ?? {});
  if (!parsed.success) throw Errors.fromZod(parsed.error);
  return ResponseHandler.success(
    await this.inputs.createIntent(request.user, 'wechat', parsed.data),
  );
}
```

## Task 6: 清理、交接与发布前门禁

**Files:** Create `apps/api/src/workers/customer-rendering-input-cleanup-worker.ts` and `.test.ts`; Create `docs/integration/customer-rendering-private-inputs-api.md`.

- [ ] **Step 1: 写清理红灯测试。** 只扫描 `raw_deleted_at IS NULL AND raw_cleanup_after < now()` 的行，分页或有界批次领取（每批最多 100）。每条先用 `claimRawCleanup` 条件匹配原 `raw_cleanup_after` 并推进 5 分钟作为租约，只有领取成功者删除；对 `issued` 过期行标记 `deleted`；`processing` 仅在 `processing_lease_expires_at < now()` 时处理；`pending_review/approved` 只清理 raw，不碰 normalized 成品。某对象删除失败保留行供下次重试。不要全表扫描。
- [ ] **Step 2: 实现并验证清理。** 接入仓库现有 Worker 运行/部署方式，不新加 Redis 或队列；若现有部署方式不足，先在计划执行检查点停下评估，不用 API 进程内 fire-and-forget。在 `apps/api` 运行 `bun test src/workers/customer-rendering-input-cleanup-worker.test.ts`，回仓库根目录运行 `bun run api:typecheck` 与 `bun run api:build`，预期 0 fail、exit 0。
- [ ] **Step 3: 写双端交接文档。** 明列四条完整路径、session/选租要求、请求/响应字段、COS PUT 所需 headers、HTTP 400/401/404/409/422/429/503、上传/确认重放、`pending_review` 状态、WebP 规范化、10 MiB 和每主体频控。微信需在只读参考的 `orange/src/services/visitor_rendering_styles.ts` 与 `src/packageVisitor/pages/rendering-style-detail/index.tsx` 之外新增私有上传 service/页面；抖音需在 `apps/douyin-mini/src/api/rendering-styles.ts` 与详情页之外新增相同流程，但两个客户端 UI 不属于本计划。旧 `/visitor/picture-library/*` 不兼容也不复用匿名回退。
- [ ] **Step 4: 后验与提交。** 执行变更范围测试、`bun run api:typecheck`、`bun run api:build`、`git diff --check`；检查提交只包含本计划 gooes 文件。合同文档中附 Fastify inject smoke：合法会话 intent/complete、无会话 401、未选公司 409、跨主体 404、过期 409 / `RENDERING_UPLOAD_EXPIRED`、重复 complete 同 file_id、原图始终无公共 URL。提交：`docs(rendering): hand off private input upload contract`。

## 完成定义与后续计划

本计划完成后，客户端可以私有上传一张房间照或户型图并取得 owner-bound `file_id`，但页面必须保持生图按钮关闭，因为文件只到 `pending_review`。后续任务准入计划必须验证内容审核通过、同租户/本人归属、素材仍发布、额度 RPC 原子预占和租户预算；Worker 计划再处理方舟生成、私有结果和建议。两个小程序共享相同业务字段与状态，微信仓库由微信团队独立修改、测试和发布。

发布前必须先明确唯一待执行 migration；使用仓库批准的 migration workflow `plan → apply`，随后 `supabase migration list` 验证 Local/Remote 对齐。破坏性回滚不用 DROP；关闭新上传入口，保留现有私有对象与账本，必要修正走 forward migration。正式内容审核未连通前，不把 `pending_review` 当成可生成文件。
