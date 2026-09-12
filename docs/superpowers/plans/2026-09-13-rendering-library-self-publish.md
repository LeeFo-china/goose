# 装修效果素材租户自助发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让租户管理员把私有装修效果素材发布为独立公开快照，并让微信、抖音小程序通过可信租户会话分页浏览。

**Architecture:** 保留 `tenant_rendering_styles` 作为当前可编辑资料，在同一行增加发布快照；发布命令通过 PostgreSQL RPC 预留固定公开文件和租约，COS gateway 复制规范化 WebP，最终 RPC 原子激活文件与快照。双端 controller 只解析各自会话，共用只读 catalog service 和单次关联查询；Admin 复用现有效果库组件增加状态化发布与隐藏交互。

**Tech Stack:** Bun、TypeScript、Fastify decorators、Zod、Supabase/PostgreSQL、腾讯云 COS SDK 2.15.4、Next.js、React、shadcn/Radix、Tailwind；不增加依赖，不修改 orange。

---

设计依据：`docs/superpowers/specs/2026-09-13-rendering-library-self-publish-design.md`。
执行前保持当前 worktree：`.worktrees/feat-customer-rendering-quota`。

## 文件结构

- `packages/domain/src/rendering-library.ts`：内部素材、发布命令和客户公开 DTO 的唯一共享合同。
- `supabase/migrations/20260913001512_publish_tenant_rendering_styles.sql`：发布快照、命令表、索引、RLS/ACL 及三支 RPC。
- `apps/api/src/gateways/rendering-library-storage/client.ts`：受控私有对象到确定性公开对象的复制、存在性校验和 URL 生成。
- `apps/api/src/repositories/tenant-rendering-publication.ts`：发布 begin/complete/fail RPC 的严格结果解析。
- `apps/api/src/services/tenant-rendering-publication/`：权限、源文件策略、幂等和外部复制编排。
- `apps/api/src/repositories/customer-rendering-catalog.ts`：已发布快照的一次关联分页查询。
- `apps/api/src/services/customer-rendering/catalog.ts`：双端可信租户解析与公开 DTO 编排。
- `apps/api/src/controllers/tenant-rendering-library/index.ts`：增加租户发布 HTTP 命令。
- `apps/api/src/controllers/visitor-renderings/index.ts`、`apps/api/src/controllers/douyin-miniapp/renderings-controller.ts`：增加双端列表和详情。
- `apps/admin/components/rendering-library/`：发布确认、线上版本提示、隐藏警示和请求封装。
- `docs/operations/`：接口交接与开发环境 smoke 证据；不改 orange。

### Task 1：扩展共享合同

**Files:**
- Modify: `packages/domain/src/rendering-library.ts`
- Modify: `packages/domain/src/rendering-library.test.ts`

- [ ] **Step 1: 写失败测试**

测试必须先断言当前实现不支持以下合同：

```ts
expect(RENDERING_LIBRARY_STATUS_VALUES).toEqual(['draft', 'published', 'hidden']);
expect(RENDERING_LIBRARY_PUBLIC_SCENE).toBe('rendering_style_public');
expect(RenderingLibraryPublishSchema.parse({
  expected_version: 2,
  idempotency_key: '11111111-1111-4111-8111-111111111111',
  responsibility_confirmed: true,
})).toEqual({
  expected_version: 2,
  idempotency_key: '11111111-1111-4111-8111-111111111111',
  responsibility_confirmed: true,
});
expect(RenderingPublishedStyleSchema.parse(publicStyle)).toEqual(publicStyle);
```

同时拒绝 `responsibility_confirmed=false`、未知字段、HTTP 图片、内部字段、超过 100 的分页和不完整发布快照。内部 `RenderingLibraryStyleSchema` 增加
`published_version/published_at/published_by_employee_id` 三个 nullable 字段；不把公开文件 ID 暴露给 Admin DTO。

- [ ] **Step 2: 运行 RED**

Run: `cd packages/domain && bun test src/rendering-library.test.ts`

Expected: FAIL，缺少 public scene、published 状态和发布/公开 DTO schema。

- [ ] **Step 3: 最小实现**

在 `rendering-library.ts` 增加：

```ts
export const RENDERING_LIBRARY_PUBLIC_SCENE = 'rendering_style_public';
export const RENDERING_LIBRARY_STATUS_VALUES = ['draft', 'published', 'hidden'] as const;

export const RenderingLibraryPublishSchema = z.strictObject({
  expected_version: ExpectedVersionSchema,
  idempotency_key: z.uuid(),
  responsibility_confirmed: z.literal(true),
});

export const RenderingPublishedStyleSchema = z.strictObject({
  id: z.uuid(),
  title: styleFields.title,
  space: styleFields.space,
  style: styleFields.style,
  color_notes: styleFields.color_notes.removeDefault(),
  material_notes: styleFields.material_notes.removeDefault(),
  source_type: styleFields.source_type,
  image_url: z.url({ protocol: /^https$/ }),
  published_at: z.string().datetime({ offset: true }),
});

export const RenderingPublishedStyleListSchema = z.strictObject({
  list: z.array(RenderingPublishedStyleSchema).max(100),
  pagination: z.strictObject({
    page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  }),
}).refine(({ list, pagination }) =>
  list.length <= pagination.pageSize
  && pagination.totalPages === Math.ceil(pagination.total / pagination.pageSize));
```

内部素材 schema 只新增 Admin 真正需要的发布摘要字段；数据库完整快照由 publication repository 的私有 row schema 校验。

- [ ] **Step 4: 运行 GREEN 和类型检查**

Run:

```bash
cd packages/domain
bun test src/rendering-library.test.ts
bunx tsc --noEmit
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/domain/src/rendering-library.ts packages/domain/src/rendering-library.test.ts
git commit -m "feat(rendering): 增加素材发布共享合同"
```

### Task 2：用 migration 建立发布快照和原子命令

**Files:**
- Create: `supabase/migrations/20260913001512_publish_tenant_rendering_styles.sql`
- Create: `apps/api/src/services/tenant-rendering-publication/migration-contract.test.ts`
- Create: `supabase/tests/tenant_rendering_style_publication.sql`

- [ ] **Step 1: 写 migration 合同失败测试**

测试读取唯一的新 migration，断言：

```ts
for (const fragment of [
  'published_title text',
  'published_file_id uuid',
  "check (status in ('draft', 'published', 'hidden'))",
  'tenant_rendering_style_publish_commands',
  'begin_tenant_rendering_style_publish',
  'complete_tenant_rendering_style_publish',
  'fail_tenant_rendering_style_publish',
  'security definer',
  'set search_path = pg_catalog, public',
  'for update',
  'grant execute on function',
]) expect(normalized).toContain(fragment);
```

另断言 migration 没有 `DROP TABLE tenant_rendering_styles`，三支 RPC 对
`PUBLIC, anon, authenticated` 均 revoke，只向 `service_role` grant；命令表启用 RLS 且没有客户端 policy。

- [ ] **Step 2: 运行 RED**

Run: `cd apps/api && bun test src/services/tenant-rendering-publication/migration-contract.test.ts`

Expected: FAIL，migration 尚不存在。

- [ ] **Step 3: 创建 forward migration**

使用已核对且未占用的唯一时间戳 `20260913001512`。migration 必须在单个事务内完成以下精确结构：

```sql
ALTER TABLE public.tenant_rendering_styles
  DROP CONSTRAINT tenant_rendering_styles_status_check,
  ADD CONSTRAINT tenant_rendering_styles_status_check
    CHECK (status IN ('draft', 'published', 'hidden'));

ALTER TABLE public.tenant_rendering_styles
  ADD COLUMN published_title text,
  ADD COLUMN published_space text,
  ADD COLUMN published_style text,
  ADD COLUMN published_color_notes text,
  ADD COLUMN published_material_notes text,
  ADD COLUMN published_source_type text,
  ADD COLUMN published_file_id uuid,
  ADD COLUMN published_version integer,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN published_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD CONSTRAINT tenant_rendering_styles_published_file_fkey
    FOREIGN KEY (tenant_id, published_file_id)
    REFERENCES public.platform_file_objects(tenant_id, id) ON DELETE RESTRICT;
```

增加 all-or-none、标题/枚举/文本长度、`published_version <= version`、以及
`status='published'` 必须有完整快照的 CHECK。创建客户目录覆盖索引：

```sql
CREATE INDEX tenant_rendering_styles_public_catalog_idx
  ON public.tenant_rendering_styles(tenant_id, published_space,
    published_style, sort_order, id)
  WHERE status = 'published' AND deleted_at IS NULL;
```

命令表固定字段：`tenant_id/style_id/idempotency_key`、`request_hash char(64)`、
`expected_version`、`public_file_id`、`lease_token/lease_expires_at`、
`status preparing|succeeded|failed`、`result_version`、稳定 `failure_code`、时间戳；唯一约束为
`(tenant_id,idempotency_key)` 和 `(tenant_id,style_id,expected_version)`，复合外键全部包含 tenant。

`begin_tenant_rendering_style_publish`：锁素材行；严格比较 request hash；同键成功返回 `succeeded`，未过期准备态返回 `in_progress`；失败或租约过期用调用方新 lease token 重领同一 command/public file；首次领取同时插入 `platform_file_objects` migrating 行，路径固定为
`public/renovation-styles/<tenant>/<style>/<expected_version+1>.webp`。RPC 只返回稳定 decision、command/public file ID、位置、源 checksum/bytes 和已有结果版本。

`complete_tenant_rendering_style_publish`：锁命令、素材和两条文件记录；验证租约 token、当前版本、源文件及公开文件策略；在一个事务内把公开文件设为 active/public 并填入 HTTPS public_url，把当前资料复制到全部 published 字段，将素材 status 设 published、version 加 1、published_version 设新 version，最后命令 succeeded。

`fail_tenant_rendering_style_publish`：只允许当前 lease token 把 preparing 命令标为 failed，保存枚举稳定 failure code；不删除文件行或对象。

- [ ] **Step 4: 增加回滚型数据库断言脚本**

`supabase/tests/tenant_rendering_style_publication.sql` 以事务开始并最终 ROLLBACK，断言：

- 无权限角色不能直接读写发布命令表；
- 同租户同版本并发只能领取一个命令；
- 同键同摘要重放、同键不同摘要冲突；
- complete 后快照完整且 `published_version=version`；
- 编辑当前标题后发布标题保持旧值；
- hide 保留快照；跨租户 file/style 组合被 FK/RPC 拒绝。

- [ ] **Step 5: 静态 GREEN**

Run:

```bash
cd apps/api
bun test src/services/tenant-rendering-publication/migration-contract.test.ts
cd ../..
git diff --check
```

Expected: PASS。此步不应用远端 migration。

- [ ] **Step 6: 提交**

```bash
git add supabase/migrations/20260913001512_publish_tenant_rendering_styles.sql supabase/tests/tenant_rendering_style_publication.sql apps/api/src/services/tenant-rendering-publication/migration-contract.test.ts
git commit -m "feat(rendering): 增加素材发布原子事务"
```

### Task 3：扩展 COS gateway 复制公开副本

**Files:**
- Modify: `apps/api/src/gateways/rendering-library-storage/client.ts`
- Modify: `apps/api/src/gateways/rendering-library-storage/client.test.ts`

- [ ] **Step 1: 核对已安装 SDK 类型并写 RED**

先运行：

```bash
rg -n "interface GetObjectParams|interface GetObjectResult|interface HeadObjectResult|interface PutObjectParams" apps/api/node_modules/cos-nodejs-sdk-v5/index.d.ts
```

版本必须仍为 2.15.4；使用真实导出的 `COS.GetObjectParams/GetObjectResult/HeadObjectParams/PutObjectParams`，禁止猜测类型。

新增测试断言：私有 get 使用精确 bucket/region/key；Body 必须是 1–10 MiB Buffer；公开 put 使用固定 key、`image/webp`、`ACL: public-read`、immutable cache、源 checksum 元数据；配置 `PLATFORM_COS_PUBLIC_BASE_URL` 有效时使用该 host，否则使用同 bucket COS HTTPS host；错误不泄露 SDK 内容。

- [ ] **Step 2: 运行 RED**

Run: `cd apps/api && bun test src/gateways/rendering-library-storage/client.test.ts`

Expected: FAIL，缺少公开复制方法。

- [ ] **Step 3: 实现严格 gateway port**

配置 schema 新增经过 HTTPS URL 校验的 `publicBaseUrl`。扩展 COS port：

```ts
export interface RenderingCosPort {
  putObject(params: COS.PutObjectParams): Promise<unknown>;
  getObject(params: COS.GetObjectParams): Promise<COS.GetObjectResult>;
  headObject(params: COS.HeadObjectParams): Promise<COS.HeadObjectResult>;
  getObjectUrl(params: COS.GetObjectUrlParams): string;
}
```

新增 `copyPublic(input)` 和 `hasPublicCopy(input)`：只接受 service/repository 已解析的 source/public location、tenant/style UUID、目标版本、checksum 和 size；内部重新构造期望路径并逐字段比对。`copyPublic` 读取受控私有对象、验证 Buffer/长度后写固定公开 key；`hasPublicCopy` 只在长度与 `x-cos-meta-source-sha256` 同时匹配时返回 true。公开 URL 通过 URL API 拼接并再次验证 HTTPS、无 userinfo/hash。

- [ ] **Step 4: 运行 GREEN**

Run:

```bash
cd apps/api
bun test src/gateways/rendering-library-storage/client.test.ts
bun run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/gateways/rendering-library-storage/client.ts apps/api/src/gateways/rendering-library-storage/client.test.ts
git commit -m "feat(rendering): 增加公开素材副本存储"
```

### Task 4：发布 Repository 与 Service

**Files:**
- Create: `apps/api/src/repositories/tenant-rendering-publication.ts`
- Create: `apps/api/src/repositories/tenant-rendering-publication.test.ts`
- Create: `apps/api/src/services/tenant-rendering-publication/service.ts`
- Create: `apps/api/src/services/tenant-rendering-publication/index.ts`
- Create: `apps/api/src/services/tenant-rendering-publication/service.test.ts`
- Modify: `apps/api/src/repositories/tenant-rendering-library.ts`
- Modify: `apps/api/src/services/tenant-rendering-library/test-fixtures.ts`
- Modify: `apps/api/src/services/tenant-rendering-library/service.test.ts`

- [ ] **Step 1: 写 Repository RED**

使用项目现有 Supabase query recorder，断言三个方法只调用命名 RPC 且参数完整：

```ts
begin({ tenantId, styleId, employeeId, expectedVersion,
  idempotencyKey, requestHash, leaseToken, publicFileId, location })
complete({ tenantId, commandId, leaseToken, employeeId, publicUrl })
fail({ tenantId, commandId, leaseToken, failureCode })
```

严格 schema 只接受 `claimed|in_progress|succeeded|idempotency_conflict|version_conflict|not_found` 等已定义 decision；未知/缺字段/外租户/原始 DB error 一律包装为固定 `Errors.dbError()`。

- [ ] **Step 2: 写 Service RED**

注入 repository、storage、accessPolicy 和 UUID/clock。覆盖：

- 无 read/manage all 在任何 DB/COS 调用前 403；
- body 严格解析且责任确认必为 true；
- source policy 再校验；
- claimed 且对象不存在时复制一次再 complete；
- 租约恢复且对象已存在时直接 complete，不复制；
- succeeded 重放直接读取最新素材；
- in_progress 返回 409 `RENDERING_STYLE_PUBLISH_IN_PROGRESS`；
- idempotency/version/not-found 映射稳定错误；
- 明确 COS 失败调用 fail 一次，保留原发布状态；complete DB 未知错误不调用 fail、不自动重复制。

- [ ] **Step 3: 运行 RED**

Run:

```bash
cd apps/api
bun test src/repositories/tenant-rendering-publication.test.ts src/services/tenant-rendering-publication/service.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 4: 最小实现**

Service 公共方法固定为：

```ts
async publish(auth: AuthContext, styleIdInput: string, bodyInput: unknown): Promise<RenderingLibraryStyle>
```

请求摘要使用 SHA-256(JSON.stringify([协议版本、tenant、style、expectedVersion]))，不包含密钥和 URL。先授权，再读取当前素材和 source file，最后 begin；不得让 body 中的 tenant/file/status 参与。Gateway 明确失败才 fail；repository/网络结果未知保持 preparing，供相同幂等键恢复。

现有内部 style row/schema/DTO 加入 `published_version/published_at/published_by_employee_id`，更新和隐藏不修改快照。

- [ ] **Step 5: 运行 GREEN 和回归**

Run:

```bash
cd apps/api
bun test src/repositories/tenant-rendering-publication.test.ts src/services/tenant-rendering-publication src/services/tenant-rendering-library src/repositories/tenant-rendering-library.test.ts
bun run typecheck
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/repositories/tenant-rendering-publication.ts apps/api/src/repositories/tenant-rendering-publication.test.ts apps/api/src/services/tenant-rendering-publication apps/api/src/repositories/tenant-rendering-library.ts apps/api/src/services/tenant-rendering-library
git commit -m "feat(rendering): 编排租户素材自助发布"
```

### Task 5：增加租户发布 HTTP 路由

**Files:**
- Modify: `apps/api/src/schema/tenant-rendering-library.ts`
- Modify: `apps/api/src/controllers/tenant-rendering-library/index.ts`
- Modify: `apps/api/src/controllers/tenant-rendering-library/index.test.ts`

- [ ] **Step 1: 写 HTTP RED**

路由清单从六个 handler 增至七个：

```text
POST /tenant/rendering-library/styles/:id/publish
```

Fastify inject 覆盖 200 发布、未知字段 400、未登录 401 优先于 body 校验、权限不足 403、旧版本 409、相同幂等结果重放，以及无裸 CRUD。

- [ ] **Step 2: 运行 RED**

Run: `cd apps/api && bun test src/controllers/tenant-rendering-library/index.test.ts`

Expected: FAIL，publish 路由 404。

- [ ] **Step 3: 实现薄 controller**

schema 文件重导出 `RenderingLibraryPublishSchema`。controller 构造函数分别注入已有 library service 与 publication service，handler 固定形态：

```ts
@Post('/tenant/rendering-library/styles/:id/publish')
async publishStyle(request: FastifyRequest) {
  const auth = await this.getRequiredTenantContext(request);
  const { id } = this.parse(RenderingLibraryParamsSchema, request.params);
  this.parse(RenderingLibraryEmptyQuerySchema, request.query ?? {});
  const body = this.parse(RenderingLibraryPublishSchema, request.body);
  return ResponseHandler.success(await this.publication.publish(auth, id, body));
}
```

controller 不访问 repository/COS，不接受 tenant/status/file/url。

- [ ] **Step 4: 运行 GREEN**

Run:

```bash
cd apps/api
bun test src/controllers/tenant-rendering-library/index.test.ts
bun run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/schema/tenant-rendering-library.ts apps/api/src/controllers/tenant-rendering-library
git commit -m "feat(rendering): 开放租户素材发布接口"
```

### Task 6：实现公开 Catalog Repository 与 Service

**Files:**
- Create: `apps/api/src/repositories/customer-rendering-catalog.ts`
- Create: `apps/api/src/repositories/customer-rendering-catalog.test.ts`
- Create: `apps/api/src/services/customer-rendering/catalog.ts`
- Create: `apps/api/src/services/customer-rendering/catalog.test.ts`
- Modify: `apps/api/src/services/customer-rendering/index.ts`

- [ ] **Step 1: 写 Repository RED**

列表查询必须是一次 Supabase 关联查询：

```ts
const PUBLIC_FIELDS = 'id,published_title,published_space,published_style,'
  + 'published_color_notes,published_material_notes,published_source_type,'
  + 'published_at,published_file:platform_file_objects!tenant_rendering_styles_published_file_fkey(public_url)';
```

断言 tenant/status/deleted 过滤、可选 published_space/style 过滤、sort_order/id 稳定排序、page2/size20 使用 range 20..39、无 `*`、不出现第二次文件查询。详情同样筛 published 并 maybeSingle。严格 parser 拒绝 public_url 非 HTTPS、空快照、数组关系、外租户字段和数据库错误。

- [ ] **Step 2: 写 Service RED**

注入 `CustomerRenderingContextService` 与 catalog repository。微信调用只用 `resolveWechat(user)`，抖音只用 `resolveDouyin(user)`；从 actor 只取 tenantId。列表返回共享 pagination；详情不存在统一 404 `RENDERING_STYLE_NOT_FOUND`。响应不能出现 tenant/file/object/employee/version。

- [ ] **Step 3: 运行 RED**

Run:

```bash
cd apps/api
bun test src/repositories/customer-rendering-catalog.test.ts src/services/customer-rendering/catalog.test.ts
```

Expected: FAIL，模块不存在。

- [ ] **Step 4: 最小实现**

Catalog service 提供：

```ts
type Channel = 'wechat' | 'douyin';
async listStyles(user: JwtPayload | undefined, channel: Channel, input: unknown): Promise<RenderingPublishedStyleList>
async getStyle(user: JwtPayload | undefined, channel: Channel, idInput: string): Promise<RenderingPublishedStyle>
```

Repository row 立即映射为 `RenderingPublishedStyleSchema`，不把原始 DB row 上抛。所有列表分页在数据库完成。

- [ ] **Step 5: 运行 GREEN**

Run:

```bash
cd apps/api
bun test src/repositories/customer-rendering-catalog.test.ts src/services/customer-rendering/catalog.test.ts
bun run typecheck
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/repositories/customer-rendering-catalog.ts apps/api/src/repositories/customer-rendering-catalog.test.ts apps/api/src/services/customer-rendering
git commit -m "feat(rendering): 增加客户公开素材目录"
```

### Task 7：开放微信和抖音浏览接口

**Files:**
- Modify: `apps/api/src/controllers/visitor-renderings/index.ts`
- Modify: `apps/api/src/controllers/visitor-renderings/index.test.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/renderings-controller.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/renderings-controller.test.ts`
- Modify: `apps/api/src/services/tenant-service-capability-map.test.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.test.ts`

- [ ] **Step 1: 写双端路由 RED**

两端各新增 session-only GET list/detail。测试断言精确 route inventory、user/channel/query/id 传递和严格参数：`pageSize=101`、`tenant_id`、非法 UUID 返回 400，未进入 catalog service。

- [ ] **Step 2: 运行 RED**

Run:

```bash
cd apps/api
bun test src/controllers/visitor-renderings/index.test.ts src/controllers/douyin-miniapp/renderings-controller.test.ts src/controllers/douyin-miniapp/index.test.ts src/services/tenant-service-capability-map.test.ts
```

Expected: FAIL，路由清单缺少 styles。

- [ ] **Step 3: 实现薄 controller**

Visitor 使用 decorators：

```ts
@Get('/visitor/renderings/styles', { tenantServiceAccess: 'session' })
@Get('/visitor/renderings/styles/:id', { tenantServiceAccess: 'session' })
```

Douyin 使用现有 `routeOptions` 注册对应路径。两端用共享
`RenderingListQuerySchema` 与严格 UUID params，不解析 body，也不信任 tenant query。

- [ ] **Step 4: 运行 GREEN 与权限清单回归**

Run:

```bash
cd apps/api
bun test src/controllers/visitor-renderings src/controllers/douyin-miniapp/renderings-controller.test.ts src/controllers/douyin-miniapp/index.test.ts src/services/tenant-service-capability-map.test.ts src/services/tenant-service-auth-call-boundary.test.ts
bun run typecheck
```

Expected: PASS。若既有 route inventory 仍出现与本功能无关的四个抖音认证路由差异，单独记录，不修改例外表掩盖。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/controllers/visitor-renderings apps/api/src/controllers/douyin-miniapp/renderings-controller.ts apps/api/src/controllers/douyin-miniapp/renderings-controller.test.ts apps/api/src/controllers/douyin-miniapp/index.test.ts apps/api/src/services/tenant-service-capability-map.test.ts
git commit -m "feat(rendering): 开放双端素材浏览接口"
```

### Task 8：完善 Admin 自助发布交互

**Files:**
- Modify: `apps/admin/components/rendering-library/contracts.ts`
- Modify: `apps/admin/components/rendering-library/requests.ts`
- Modify: `apps/admin/components/rendering-library/requests.test.ts`
- Modify: `apps/admin/components/rendering-library/style-card.tsx`
- Modify: `apps/admin/components/rendering-library/style-mutations.tsx`
- Modify: `apps/admin/components/rendering-library/library-client.tsx`
- Modify: `apps/admin/components/rendering-library/library-filters.tsx`
- Modify: `apps/admin/components/rendering-library/render.test.tsx`
- Modify: `apps/admin/e2e/rendering-library-mock-backend.mjs`
- Modify: `apps/admin/e2e/rendering-library-workflow.spec.ts`

- [ ] **Step 1: 执行 Admin 设计规范预检**

阅读 `admin-design` 和 `impeccable` skill；沿用当前页面深蓝后台体系、现有 Card/Dialog/AlertDialog/Badge/Button，不新增依赖或营销式 hero。检查 400px 与 1440px 两个尺寸。

- [ ] **Step 2: 写请求和静态渲染 RED**

`requests.test.ts` 断言 publish 请求为：

```ts
POST /api/backend/tenant/rendering-library/styles/<id>/publish
{
  expected_version: 2,
  idempotency_key: '<uuid>',
  responsibility_confirmed: true
}
```

静态渲染断言草稿“发布”、干净线上“重新发布”、脏线上“线上仍为上一版本/发布最新修改”、已发布“隐藏”；只读用户没有写按钮。过滤器支持 published。

- [ ] **Step 3: 运行 RED**

Run:

```bash
cd apps/admin
bun test --dots components/rendering-library
```

Expected: FAIL，published 合同及交互缺失。

- [ ] **Step 4: 实现请求和 UI**

`libraryRequests.publish()` 在一次弹窗生命周期内生成并保存 UUID，网络失败/409 恢复时复用；用户关闭后重新发起才生成新 UUID。发布弹窗必须有未选中的责任 checkbox，按钮 disabled 直到确认；展示当前预览和 metadata 摘要。

隐藏说明固定为：

```text
隐藏会停止新的客户浏览和生成，但不会删除历史引用，
也不能保证立即清除客户端或 CDN 已缓存的图片。
```

发布成功刷新列表；409 显示加载最新资料按钮；处理中阻止关闭和重复提交。页面头部改为“整理并发布公司装修风格素材”，不再声称仅内部草稿。

- [ ] **Step 5: 浏览器工作流 RED/GREEN**

mock backend 实现真实版本和发布快照行为。Playwright 覆盖：草稿发布、发布后编辑显示脏版本、重新发布、隐藏、责任未勾选、重复点击只记一次 POST、409 加载最新、只读权限、窄屏按钮/弹窗完整可见和 pageerror 为空。

Run:

```bash
cd apps/admin
bun test --dots components/rendering-library
bunx tsc -p tsconfig.typecheck.json --noEmit --incremental false
node scripts/check-file-size.mjs
bunx playwright test --config=playwright.rendering-library.config.ts
```

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/admin/components/rendering-library apps/admin/e2e/rendering-library-mock-backend.mjs apps/admin/e2e/rendering-library-workflow.spec.ts
git commit -m "feat(admin): 增加装修素材自助发布交互"
```

### Task 9：接口交接、总回归与代码审查

**Files:**
- Create: `docs/operations/customer-rendering-style-catalog-api.md`
- Modify: `docs/superpowers/specs/2026-09-11-customer-rendering-library-progress.md`

- [ ] **Step 1: 编写双端交接文档**

文档列出四个 GET 路径、请求参数、公开 DTO、认证前置、分页规则、404/租户暂停错误、缓存限制和 curl smoke；明确 orange 只读、微信页面由小程序团队实现。不得写真实 token、租户 ID 或 COS URL。

- [ ] **Step 2: 执行完整相关回归**

Run:

```bash
cd packages/domain
bun test --dots
bunx tsc --noEmit
cd ../../apps/api
env SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_PUBLISH=test-publish-key SUPABASE_SERVICE_ROLE_KEY=test-service-role-key bun test --dots src/gateways/rendering-library-storage src/repositories/tenant-rendering-library.test.ts src/repositories/tenant-rendering-publication.test.ts src/repositories/customer-rendering-catalog.test.ts src/services/tenant-rendering-library src/services/tenant-rendering-publication src/services/customer-rendering src/controllers/tenant-rendering-library src/controllers/visitor-renderings src/controllers/douyin-miniapp/renderings-controller.test.ts src/services/tenant-service-capability-map.test.ts src/services/tenant-service-auth-call-boundary.test.ts
bun run typecheck
cd ../admin
bun test --dots components/rendering-library components/layout/rendering-library-menu.test.ts 'app/api/backend/[...path]/route.test.ts'
bunx tsc -p tsconfig.typecheck.json --noEmit --incremental false
node scripts/check-file-size.mjs
bunx playwright test --config=playwright.rendering-library.config.ts
cd ../..
bun scripts/check-api-file-size.ts
git diff --check
```

Expected: 全部退出码 0。保留每组测试数量、断言数量和 Playwright 用时，不把 mock 说成真实数据库/COS 验证。

- [ ] **Step 3: 检查安全和规格覆盖**

逐项核对：controller/service/repository 分层、无 N+1、所有 list 分页、无真实密钥/签名/对象路径响应、外部复制失败不发布、幂等及 lease 恢复、跨租户隔离、隐藏保留快照、Admin 责任文案、orange 零改动。

- [ ] **Step 4: 更新进度证据并提交**

```bash
git add docs/operations/customer-rendering-style-catalog-api.md docs/superpowers/specs/2026-09-11-customer-rendering-library-progress.md
git commit -m "docs(rendering): 记录素材发布验收证据"
```

### Task 10：开发环境 migration、COS smoke 和发布

此任务是外部状态变更检查点。只有 Task 1–9 全部通过、列出确切 migration 且用户确认开发发布后执行。

- [ ] **Step 1: 列明待执行 migration 与非破坏性回退**

Run: `supabase migration list`

Expected: 只允许本功能新 migration 待应用；若发现其他未应用 migration，停止并报告。回退为关闭 Admin 发布和双端 styles 路由，不删除发布事实或对象。

- [ ] **Step 2: 按项目既有开发 migration 流程应用**

使用仓库已有 CI/运维入口，不在远端手工执行 DDL/DML。随后再次运行
`supabase migration list`，Local/Remote 必须对齐，并在隔离事务运行
`supabase/tests/tenant_rendering_style_publication.sql`。

- [ ] **Step 3: 开发 COS smoke**

使用授权的非客户样本：上传私有源 → 发布 → 匿名读取公开 URL → 验证私有源仍不能匿名读取 → 隐藏 → 验证双端 API 不再返回。记录文件 ID 需脱敏，不记录签名和凭据。

- [ ] **Step 4: 发布 API 和 Admin**

按现有开发发布流程发布兼容 migration 后的 API/Admin；验证 API root、无 token 401、租户 Admin 权限、双端已认证列表分页和隐藏 404。未部署微信 orange，也不声称微信页面完成。

- [ ] **Step 5: 保存证据并提交**

在 `docs/operations/evidence/` 新增日期化证据，包含 revision、migration 对齐、smoke 结果和剩余限制；禁止凭据及真实客户数据。

## 计划自检结果

- 规格覆盖：发布权限、快照、公私隔离、幂等、失败恢复、双端分页、Admin 状态和发布责任均有对应任务。
- 边界一致：本计划不含平台审核、客户上传、生成任务、Worker、方舟费用调用或 orange 修改。
- 性能边界：客户列表单次关联分页查询，最多 100；无 N+1。
- 发布边界：远端 migration/COS/部署集中在 Task 10，并设独立检查点。
- 占位检查：计划没有 TBD/TODO；migration 文件名已使用唯一时间戳，任务均给出文件、接口、断言和命令。
