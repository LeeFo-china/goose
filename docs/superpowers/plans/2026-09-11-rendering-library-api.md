# 租户效果素材管理 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已审查的私有草稿合同接入租户 HTTP 管理 API，验证权限、文件归属、分页和并发版本边界。

**Architecture:** 复用 TenantBaseController、AuthContext、accessPolicyService、ResponseHandler 和 SupabaseDB。只注册自定义路由，禁止暴露 BaseController 裸 CRUD；请求中不接收租户或状态，发布尚未开放。

**Tech Stack:** Bun、Fastify decorators、Zod、Supabase；不增加依赖。

---

依赖：`2026-09-11-rendering-library-drafts.md` 的 Task 1 通过规格及质量审查。实现中的代码组织可以围绕以下边界做小规模拆分，不可扩展为通用框架。没有真实上传场景前，创建接口只接受符合服务端文件索引条件的已有私有文件，不能拿旧图库图片演示成功。

## Task 1：完整私有草稿管理 API

三个紧密依赖的层组成一个可验证交付单元，逐层 TDD，最后统一进行规格审查和代码质量审查，不单独发布只有 Repository 的中间状态。

### Step 1：Repository

**Files:** create `apps/api/src/repositories/tenant-rendering-library.ts`、`tenant-rendering-library.test.ts`。

- [x] 先写查询记录器测试：注入数据库 client，记录 from/select/eq/is/order/range/insert/update；实现 PromiseLike 只模拟数据库边界，业务数据必须符合完整 domain schema。先运行测试看缺少模块/实现失败。
- [x] 实现下列类。`parseRow` 必须用 domain safeParse，核对 tenant_id；不透传原始 DB 行。错误只返回固定信息。

```ts
import { z } from 'zod';
import { RenderingLibraryStyleSchema, type RenderingLibraryStyle,
  type RenderingLibraryList, type RenderingLibraryCreate, type RenderingLibraryUpdate } from '@gooes/domain';
import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';

export const RENDERING_STYLE_COLUMNS = 'id,tenant_id,title,space,style,color_notes,material_notes,source_type,rights_confirmed,file_id,sort_order,status,version,created_by_employee_id,created_at,updated_at';
const FileSchema = z.object({ id: z.uuid(), tenant_id: z.uuid(), scene: z.string(),
  visibility: z.string(), status: z.string(), deleted_at: z.string().nullable(),
  mime_type: z.string(), size_bytes: z.number().int().positive(), object_key: z.string() });
export type RenderingSourceFile = z.infer<typeof FileSchema>;
type Client = Pick<ReturnType<typeof SupabaseDB.getAdminClient>, 'from'>;
type Changes = Partial<Omit<RenderingLibraryCreate, 'file_id' | 'rights_confirmed'>> & {
  status?: 'hidden'; deleted_at?: string;
};

export class TenantRenderingLibraryRepository {
  constructor(private readonly client: Client = SupabaseDB.getAdminClient()) {}
  async list(tenantId: string, query: RenderingLibraryList): Promise<{ rows: RenderingLibraryStyle[]; total: number }> {
    let request = this.client.from('tenant_rendering_styles').select(RENDERING_STYLE_COLUMNS, { count: 'exact' })
      .eq('tenant_id', tenantId).is('deleted_at', null);
    if (query.status) request = request.eq('status', query.status);
    if (query.space) request = request.eq('space', query.space);
    if (query.style) request = request.eq('style', query.style);
    const offset = (query.page - 1) * query.pageSize;
    const { data, count, error } = await request.order('sort_order', { ascending: true })
      .order('id', { ascending: true }).range(offset, offset + query.pageSize - 1);
    if (error || !Array.isArray(data) || !Number.isSafeInteger(count) || count === null || count < 0)
      throw Errors.dbError('查询效果素材失败');
    return { rows: data.map((row: unknown) => this.parseRow(tenantId, row)), total: count };
  }
  async find(tenantId: string, id: string): Promise<RenderingLibraryStyle | null> {
    const { data, error } = await this.client.from('tenant_rendering_styles').select(RENDERING_STYLE_COLUMNS)
      .eq('tenant_id', tenantId).eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw Errors.dbError('查询效果素材失败');
    return data ? this.parseRow(tenantId, data) : null;
  }
  async findSourceFile(tenantId: string, fileId: string): Promise<RenderingSourceFile | null> {
    const { data, error } = await this.client.from('platform_file_objects')
      .select('id,tenant_id,scene,visibility,status,deleted_at,mime_type,size_bytes,object_key')
      .eq('tenant_id', tenantId).eq('id', fileId).is('deleted_at', null).maybeSingle();
    if (error) throw Errors.dbError('查询素材文件失败');
    if (!data) return null;
    const parsed = FileSchema.safeParse(data);
    if (!parsed.success || parsed.data.tenant_id !== tenantId || parsed.data.id !== fileId)
      throw Errors.dbError('素材文件记录无效');
    return parsed.data;
  }
  async create(tenantId: string, employeeId: string, input: RenderingLibraryCreate): Promise<RenderingLibraryStyle> {
    const { data, error } = await this.client.from('tenant_rendering_styles')
      .insert({ ...input, tenant_id: tenantId, created_by_employee_id: employeeId })
      .select(RENDERING_STYLE_COLUMNS).single();
    if (error?.code === '23505') throw Errors.business(409, '该文件已创建素材，请刷新列表', 'RENDERING_STYLE_FILE_USED');
    if (error || !data) throw Errors.dbError('创建效果素材失败');
    return this.parseRow(tenantId, data);
  }
  async change(tenantId: string, id: string, expectedVersion: number, changes: Changes): Promise<RenderingLibraryStyle | null> {
    const { data, error } = await this.client.from('tenant_rendering_styles')
      .update({ ...changes, version: expectedVersion + 1 }).eq('tenant_id', tenantId)
      .eq('id', id).eq('version', expectedVersion).is('deleted_at', null)
      .select(RENDERING_STYLE_COLUMNS).maybeSingle();
    if (error) throw Errors.dbError('更新效果素材失败');
    return data ? this.parseRow(tenantId, data) : null;
  }
  private parseRow(tenantId: string, value: unknown): RenderingLibraryStyle {
    const result = RenderingLibraryStyleSchema.safeParse(value);
    if (!result.success || result.data.tenant_id !== tenantId) throw Errors.dbError('效果素材记录无效');
    return result.data;
  }
}
export const tenantRenderingLibraryRepository = new TenantRenderingLibraryRepository();
```

- [x] 测试必须断言：list page2/size20 range20..39，稳定 sort_order/id 排序，过滤 tenant/deleted/status/space/style；所有 select 不含 `*`；change 同时筛 tenant/id/version 且 increment 恰好 1；外租户 DB 行、非整数 count、DB error 都失败；create 唯一冲突不泄露原始信息。
- [x] `cd apps/api && bun test src/repositories/tenant-rendering-library.test.ts && bun run typecheck`，通过后接 Service。

### Step 2：Service

**Files:** create `apps/api/src/services/tenant-rendering-library/service.ts`、`index.ts`、`service.test.ts`。

- [x] 用注入 repository 编写失败用例：无 tenant/employee/read、旧平台 permission、self/department scope、跨租户文件、公共文件或错误 scene 均在写入前失败。使用真实 accessPolicyService，不模拟授权通过。
- [x] service 导出类，构造参数 `{ repository, accessPolicy }`，各依赖用 `Pick<typeof singleton,...>`。单例放 `index.ts`，该文件只导入/组合导出，不放业务逻辑。核心规则与方法如下。

```ts
// service.ts：以下方法属于 TenantRenderingLibraryService。
// import schema/types from @gooes/domain; Errors; AuthContext;
// repository/accessPolicy 只用 type import，避免类测试强制连接数据库。
private authorize(auth: AuthContext, manage = false): string {
  const tenantId = this.dependencies.accessPolicy.assertTenantContext(auth);
  if (!auth.employeeId) throw Errors.forbidden();
  const permissions = manage ? ['rendering_library.read', 'rendering_library.manage'] : ['rendering_library.read'];
  for (const permission of permissions) {
    if (this.dependencies.accessPolicy.assertPermission(auth, permission) !== 'all') throw Errors.forbidden();
  }
  return tenantId;
}
async list(auth: AuthContext, input: unknown) {
  const tenantId = this.authorize(auth);
  const query = this.parse(RenderingLibraryListSchema, input);
  const { rows, total } = await this.dependencies.repository.list(tenantId, query);
  return { list: rows, pagination: { page: query.page, pageSize: query.pageSize, total,
    totalPages: Math.ceil(total / query.pageSize) } };
}
async get(auth: AuthContext, id: string) {
  const tenantId = this.authorize(auth);
  return this.required(tenantId, this.parse(z.uuid('无效的素材 ID'), id));
}
async create(auth: AuthContext, input: unknown) {
  const tenantId = this.authorize(auth, true);
  const parsed = this.parse(RenderingLibraryCreateSchema, input);
  const file = await this.dependencies.repository.findSourceFile(tenantId, parsed.file_id);
  if (!file || file.tenant_id !== tenantId || file.id !== parsed.file_id || file.status !== 'active'
    || file.deleted_at !== null || file.visibility !== 'private' || file.scene !== RENDERING_LIBRARY_SOURCE_SCENE
    || file.size_bytes > RENDERING_UPLOAD_MAX_BYTES || file.size_bytes <= 0
    || !['image/jpeg','image/png','image/webp'].includes(file.mime_type)
    || !file.object_key.startsWith(`private/renovation-styles/${tenantId}/`)) {
    throw Errors.business(404, '素材文件不存在或不可用', 'RENDERING_STYLE_FILE_NOT_FOUND');
  }
  // authorize 保证员工存在；避免非空断言，用显式收窄。
  if (!auth.employeeId) throw Errors.forbidden();
  return this.dependencies.repository.create(tenantId, auth.employeeId, parsed);
}
async update(auth: AuthContext, id: string, input: unknown) {
  const tenantId = this.authorize(auth, true);
  const key = this.parse(z.uuid('无效的素材 ID'), id);
  const { expected_version, ...changes } = this.parse(RenderingLibraryUpdateSchema, input);
  return this.change(tenantId, key, expected_version, changes);
}
async hide(auth: AuthContext, id: string, input: unknown) {
  const tenantId = this.authorize(auth, true);
  const key = this.parse(z.uuid('无效的素材 ID'), id);
  const { expected_version } = this.parse(RenderingLibraryVersionSchema, input);
  return this.change(tenantId, key, expected_version, { status: 'hidden' });
}
async remove(auth: AuthContext, id: string, input: unknown) {
  const tenantId = this.authorize(auth, true);
  const key = this.parse(z.uuid('无效的素材 ID'), id);
  const { expected_version } = this.parse(RenderingLibraryVersionSchema, input);
  await this.change(tenantId, key, expected_version, { status: 'hidden', deleted_at: new Date().toISOString() });
  return { id: key, deleted: true as const };
}
private async change(tenantId: string, id: string, version: number,
  changes: Parameters<TenantRenderingLibraryRepository['change']>[3]) {
  const result = await this.dependencies.repository.change(tenantId, id, version, changes);
  if (result) return result;
  await this.required(tenantId, id);
  throw Errors.business(409, '素材已更新，请刷新后重试', 'RENDERING_STYLE_VERSION_CONFLICT');
}
private async required(tenantId: string, id: string) {
  const row = await this.dependencies.repository.find(tenantId, id);
  if (!row) throw Errors.business(404, '效果素材不存在', 'RENDERING_STYLE_NOT_FOUND');
  return row;
}
private parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}
```

- [x] 为公开方法声明实际返回类型（列表/素材/删除确认），不加入未用的接口。补测试 patch title 不重置默认值、CAS 未匹配分别 404/409、hide不删源文件、remove只软删。禁止发布或隐式批准。
- [x] `cd apps/api && bun test src/services/tenant-rendering-library/service.test.ts && bun run typecheck`，通过后接 HTTP。

### Step 3：Controller 和路由

**Files:** create `apps/api/src/schema/tenant-rendering-library.ts`、`controllers/tenant-rendering-library/index.ts`、`index.test.ts`；modify `apps/api/src/routes/index.ts`。

- [x] schema 重导出 domain Create/Update/List/Version，新增 Params=`z.strictObject({id:z.uuid('无效的素材 ID')})` 与 EmptyQuery=`z.strictObject({})`。
- [x] Controller 继承 TenantBaseController，super 使用 `tenant_rendering_styles`，注入 service port `Pick<TenantRenderingLibraryService,'list'|'get'|'create'|'update'|'hide'|'remove'>` 默认生产单例。GET/POST/PATCH/DELETE 六个自定义 handler 都先取 `getRequiredTenantContext`，safeParse 参数、body 和 query，错误经 Errors.fromZod，最后 ResponseHandler.success。

```ts
// 每个 handler 的固定组成；根据下表绑定方法及 schema，不复用裸 CRUD。
@Patch('/tenant/rendering-library/styles/:id')
async updateStyle(request: FastifyRequest) {
  const auth = await this.getRequiredTenantContext(request);
  const params = this.parse(RenderingLibraryParamsSchema, request.params);
  this.parse(RenderingLibraryEmptyQuerySchema, request.query || {});
  const body = this.parse(RenderingLibraryUpdateSchema, request.body);
  return ResponseHandler.success(await this.service.update(auth, params.id, body));
}
private parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Errors.fromZod(parsed.error);
  return parsed.data;
}
```

| Handler | Route | Body/query | Service |
| --- | --- | --- | --- |
| listStyles | GET /tenant/rendering-library/styles | List query | list(auth,query) |
| getStyle | GET /tenant/rendering-library/styles/:id | Empty query | get(auth,id) |
| createStyle | POST /tenant/rendering-library/styles | Create body, Empty query | create(auth,body) |
| updateStyle | PATCH /tenant/rendering-library/styles/:id | Update body, Empty query | update(auth,id,body) |
| hideStyle | POST /tenant/rendering-library/styles/:id/hide | Version body, Empty query | hide(auth,id,body) |
| removeStyle | DELETE /tenant/rendering-library/styles/:id | Version body, Empty query | remove(auth,id,body) |

路由入口紧邻 TenantCustomerLeadsController 导入新单例并调用 `.registerExtraRoutes(app)`；不调用 createResourceRoutes，不注册 publish，也不注册 visitor/douyin 客户接口。类同时 named export 供测试，default 为单例。

- [x] Fastify inject 测试通过测试 subclass 注入 auth（生产授权方法不改），使用真实 service+内存 repository 只替换外部持久化。证明 list分页、create→get→patch→hide→remove、跨租户404、缺权限403、未知字段400、旧版本409、publish404、无裸CRUD。错误 handler只用于测试返回 status/code；不模拟真实数据库原子性。
- [x] 运行该目录 Bun 测试，再 API typecheck；规格审查和质量审查通过后执行所有 rendering 与既有 AI/permission 回归。不运行远端 migration、上传或真实模型调用。

## 验收边界

该步只证明管理 API 和查询构造/业务隔离，尚不证明真实 PostgreSQL、COS或小程序链路。私有文件上传和预览缺失时，不声称 Admin 已能上传；全部数据库应用前仍需明确 migration 清单和隔离环境验证。

实施结果：三层新增 15 项测试、207 个断言通过；API 合并回归 75 项，domain 全量 203 项；API/domain/Admin 类型检查通过。独立规格及质量审查通过，路由集合测试已补强并用额外路由 mutation 验证。未提交、部署或应用 migration。完整命令及验证限制见 `../specs/2026-09-11-customer-rendering-library-progress.md`。
