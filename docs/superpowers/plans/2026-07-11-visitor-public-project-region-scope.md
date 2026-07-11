# Visitor 公开项目公司服务区域过滤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 仅向定位匹配公司或身份公司的用户展示公开项目；无可见公司时不跨区域兜底。

**Architecture:** 保留 /front/projects 路径，Service 根据 JWT 解析公开项目受众范围，Repository 在数据库按 tenant_id、公开状态和分页查询。详情与日志在读取缓存或下游数据前复用同一范围校验；列表缓存按公司范围和分页隔离。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgREST、Bun Test、Taro（orange 仅交接）。

---

## 已确认约束

- visitor_session 使用当前有效定位上下文的 matched_tenants[].tenant_id。
- 多个匹配公司都可展示；selected_tenant_id 只排在前面，不缩小集合。
- customer/employee 使用 JWT tenant_id，优先于 visitor 定位。
- 无上下文、无匹配公司或无身份公司时：列表为空分页，详情和日志为 404。
- 不按项目地址、property.adcode、区县或城市过滤。
- orange 不传 tenant_ids，gooes 不修改 orange。

## 文件清单

| 文件 | 操作 | 责任 |
| --- | --- | --- |
| apps/api/src/services/projects/legacy/public-audience-scope.ts | 新建 | 从 JWT 和定位上下文解析公司范围。 |
| apps/api/src/services/projects/legacy/public-audience-scope.test.ts | 新建 | 范围解析及越界测试。 |
| apps/api/src/repositories/projects/legacy/public.ts | 修改 | 数据库范围查询、精确分页、优选公司排序。 |
| apps/api/src/repositories/projects/legacy/public.test.ts | 新建 | 分页段计算测试。 |
| apps/api/src/repositories/projects/legacy-repository.ts | 修改 | 暴露新的范围查询方法。 |
| apps/api/src/services/projects/legacy/shared.ts | 修改 | 范围化列表输入和输出类型。 |
| apps/api/src/services/projects/legacy/public-cache.ts | 修改 | 范围缓存、批量员工关联、详情范围检查。 |
| apps/api/src/services/projects/legacy/public-cache.test.ts | 新建 | 缓存键及缓存命中越界测试。 |
| apps/api/src/services/projects/legacy-service.ts | 修改 | Service 的缓存字段和方法挂载。 |
| apps/api/src/controllers/projects/public-controller.ts | 修改 | 列表分页契约、详情/日志防 ID 绕过。 |
| apps/api/src/controllers/projects/public-controller.test.ts | 新建 | 列表参数 Schema 测试。 |
| apps/api/src/services/wechat-auth-legacy/common.ts | 修改 | 去除 visitor 登录时的全平台项目预热。 |
| supabase/migrations/20260711153000_add_projects_public_scope_index.sql | 条件创建 | 仅在 EXPLAIN 证实现有索引不足时新增部分索引。 |
| docs/application_integration_documentation/2026-07-11-miniprogram-visitor-public-project-region-scope.md | 新建 | orange API 交接和验收。 |

## Task 1: 创建受众范围解析单元

**Files:**

- Create: apps/api/src/services/projects/legacy/public-audience-scope.ts
- Create: apps/api/src/services/projects/legacy/public-audience-scope.test.ts

- [ ] **Step 1: 写失败测试**

    import { describe, expect, test } from 'bun:test';
    import type { JwtPayload } from '@/utils/jwt';
    import {
      assertPublicProjectInAudience,
      createPublicProjectAudienceScopeResolver,
    } from './public-audience-scope';

    const tenantA = '11111111-1111-4111-8111-111111111111';
    const tenantB = '22222222-2222-4222-8222-222222222222';

    describe('public project audience scope', () => {
      test('uses all distinct visitor matched tenants and prefers selection', async () => {
        const resolve = createPublicProjectAudienceScopeResolver({
          findLatestActiveForVisitor: async () => ({
            matched_tenants: [{ tenant_id: tenantB }, { tenant_id: tenantA }, { tenant_id: tenantB }],
            selected_tenant_id: tenantB,
          }),
        });
        const payload: JwtPayload = { token_type: 'visitor_session', visitor_id: 'visitor-1' };
        await expect(resolve(payload)).resolves.toEqual({
          kind: 'visitor_location', tenantIds: [tenantA, tenantB], preferredTenantId: tenantB,
        });
      });

      test('returns empty scope without active visitor context', async () => {
        const resolve = createPublicProjectAudienceScopeResolver({
          findLatestActiveForVisitor: async () => null,
        });
        await expect(resolve({ token_type: 'visitor_session', visitor_id: 'visitor-1' })).resolves.toEqual({
          kind: 'empty', tenantIds: [], preferredTenantId: null,
        });
      });

      test('uses identity tenant without reading visitor context', async () => {
        let calls = 0;
        const resolve = createPublicProjectAudienceScopeResolver({
          findLatestActiveForVisitor: async () => { calls += 1; return null; },
        });
        await expect(resolve({ token_type: 'auth', tenant_id: tenantA })).resolves.toEqual({
          kind: 'identity_tenant', tenantIds: [tenantA], preferredTenantId: tenantA,
        });
        expect(calls).toBe(0);
      });

      test('does not permit an out-of-scope project', () => {
        expect(() => assertPublicProjectInAudience(
          { kind: 'visitor_location', tenantIds: [tenantA], preferredTenantId: null }, tenantB,
        )).toThrow('项目不存在');
      });
    });

- [ ] **Step 2: 运行失败测试**

    cd apps/api && bun test src/services/projects/legacy/public-audience-scope.test.ts

Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现最小范围解析器**

    import { Errors } from '@/errors/error-factory';
    import { userLocationContextRepository } from '@/repositories/user-location-contexts';
    import type { JwtPayload } from '@/utils/jwt';

    export type PublicProjectAudienceScope = {
      kind: 'visitor_location' | 'identity_tenant' | 'empty';
      tenantIds: string[];
      preferredTenantId: string | null;
    };

    type ContextReader = {
      findLatestActiveForVisitor(visitorId: string): Promise<{
        matched_tenants: Array<{ tenant_id: string }>;
        selected_tenant_id: string | null;
      } | null>;
    };

    export function createPublicProjectAudienceScopeResolver(repository: ContextReader) {
      return async (payload: JwtPayload | undefined): Promise<PublicProjectAudienceScope> => {
        if (payload?.token_type === 'visitor_session') {
          if (!payload.visitor_id) return emptyPublicProjectAudienceScope();
          const context = await repository.findLatestActiveForVisitor(payload.visitor_id);
          const tenantIds = [...new Set((context?.matched_tenants ?? [])
            .map((item) => item.tenant_id).filter(Boolean))].sort();
          if (!tenantIds.length) return emptyPublicProjectAudienceScope();
          return {
            kind: 'visitor_location',
            tenantIds,
            preferredTenantId: tenantIds.includes(context?.selected_tenant_id ?? '')
              ? context?.selected_tenant_id ?? null : null,
          };
        }
        if (payload?.token_type === 'auth' && payload.tenant_id) {
          return { kind: 'identity_tenant', tenantIds: [payload.tenant_id], preferredTenantId: payload.tenant_id };
        }
        return emptyPublicProjectAudienceScope();
      };
    }

    export const resolvePublicProjectAudienceScope =
      createPublicProjectAudienceScopeResolver(userLocationContextRepository);
    export const emptyPublicProjectAudienceScope = (): PublicProjectAudienceScope =>
      ({ kind: 'empty', tenantIds: [], preferredTenantId: null });
    export function assertPublicProjectInAudience(scope: PublicProjectAudienceScope, tenantId: string | null): void {
      if (!tenantId || !scope.tenantIds.includes(tenantId)) throw Errors.notFound('项目不存在');
    }

- [ ] **Step 4: 验证并提交**

    cd apps/api && bun test src/services/projects/legacy/public-audience-scope.test.ts
    git add src/services/projects/legacy/public-audience-scope.ts src/services/projects/legacy/public-audience-scope.test.ts
    git commit -m "feat(project): 解析公开项目受众范围"

Expected: 4 个测试通过。

## Task 2: 在 Repository 实现范围分页和优选公司排序

**Files:**

- Modify: apps/api/src/services/projects/legacy/shared.ts
- Modify: apps/api/src/repositories/projects/legacy/public.ts
- Modify: apps/api/src/repositories/projects/legacy-repository.ts
- Create: apps/api/src/repositories/projects/legacy/public.test.ts

- [ ] **Step 1: 写分页段计算的失败测试**

    import { describe, expect, test } from 'bun:test';
    import { buildPublicProjectPageSegments } from './public';

    describe('public project page segments', () => {
      test('fills a page with preferred company rows then other matched companies', () => {
        expect(buildPublicProjectPageSegments({
          page: 2, pageSize: 3, preferredCount: 4, preferredTenantId: 'tenant-a', otherTenantIds: ['tenant-b'],
        })).toEqual([
          { tenantIds: ['tenant-a'], from: 3, to: 3 },
          { tenantIds: ['tenant-b'], from: 0, to: 1 },
        ]);
      });

      test('queries all matched tenants when nothing is selected', () => {
        expect(buildPublicProjectPageSegments({
          page: 1, pageSize: 20, preferredCount: 0, preferredTenantId: null, otherTenantIds: ['tenant-a', 'tenant-b'],
        })).toEqual([{ tenantIds: ['tenant-a', 'tenant-b'], from: 0, to: 19 }]);
      });
    });

- [ ] **Step 2: 运行失败测试**

    cd apps/api && bun test src/repositories/projects/legacy/public.test.ts

Expected: FAIL，分页段函数尚不存在。

- [ ] **Step 3: 定义类型并实施数据库查询**

在 shared.ts 增加：

    export type PublicProjectListQuery = {
      tenantIds: string[];
      preferredTenantId: string | null;
      page: number;
      pageSize: number;
    };

    export type PublicProjectListResult = {
      rows: Array<Record<string, unknown>>;
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    };

将 Repository 方法改为 listPublicProjects(input: PublicProjectListQuery)，遵循：

1. tenantIds 为空时直接返回空分页，绝不查询全量 projects。
2. 每条查询复用 applyPublicProjectVisibilityQuery，再加 .in('tenant_id', tenantIds)、count: 'exact'、.order('created_at', { ascending: false })、.order('id', { ascending: false }) 和 .range(from, to)。
3. selected 公司存在时，先 count 优选公司，再 count 其余公司；用 buildPublicProjectPageSegments 从优选公司的结果段和其他公司的结果段拼接当前页。禁止先拉全量后内存排序。
4. 无 selected 公司时只执行一次全匹配公司 count 和一次当前页查询。
5. PUBLIC_PROJECT_LIST_SELECT 和 PUBLIC_PROJECT_DETAIL_SELECT 的根字段新增 tenant_id。
6. 在 legacy-repository.ts 导出新签名；旧无参首页调用全部替换。

- [ ] **Step 4: 验证并提交**

    cd apps/api && bun test src/repositories/projects/legacy/public.test.ts
    bun run typecheck
    git add src/repositories/projects/legacy/public.ts src/repositories/projects/legacy/public.test.ts src/repositories/projects/legacy-repository.ts src/services/projects/legacy/shared.ts
    git commit -m "feat(project): 按公司范围分页查询公开项目"

Expected: 分页段测试通过，类型检查无错误。

## Task 3: 改造 Service 缓存并为详情建立范围门面

**Files:**

- Modify: apps/api/src/services/projects/legacy-service.ts
- Modify: apps/api/src/services/projects/legacy/public-cache.ts
- Create: apps/api/src/services/projects/legacy/public-cache.test.ts

- [ ] **Step 1: 写缓存隔离和缓存命中越界的失败测试**

    import { describe, expect, test } from 'bun:test';
    import { buildPublicProjectListCacheKey } from './public-cache';
    import { assertPublicProjectInAudience } from './public-audience-scope';

    describe('scoped public project cache', () => {
      test('normalizes tenant IDs in a scoped cache key', () => {
        expect(buildPublicProjectListCacheKey({
          tenantIds: ['tenant-b', 'tenant-a'], preferredTenantId: 'tenant-a', page: 1, pageSize: 20,
        })).toBe(buildPublicProjectListCacheKey({
          tenantIds: ['tenant-a', 'tenant-b'], preferredTenantId: 'tenant-a', page: 1, pageSize: 20,
        }));
      });

      test('does not expose a cached project outside scope', () => {
        expect(() => assertPublicProjectInAudience(
          { kind: 'visitor_location', tenantIds: ['tenant-a'], preferredTenantId: null }, 'tenant-b',
        )).toThrow('项目不存在');
      });
    });

- [ ] **Step 2: 运行失败测试**

    cd apps/api && bun test src/services/projects/legacy/public-cache.test.ts

Expected: FAIL，新缓存 API 尚不存在。

- [ ] **Step 3: 实现范围缓存和详情门面**

将 ProjectService 的单例 publicProjectsCache/publicProjectsInFlight 替换为：

    private publicProjectListCache = new Map<string, CacheEntry<PublicProjectListResult>>();
    private publicProjectListInFlight = new Map<string, Promise<PublicProjectListResult>>();

新 listPublicProjects 接收 { scope, page, pageSize }。空范围直接返回空分页；缓存键含排序后的 tenant IDs、preferredTenantId、page 和 pageSize；缓存 miss 才调用 Task 2 Repository；当前页只调用一次 attachPrimaryAssignees；只为当前页 seed 详情缓存；invalidatePublicProjectsCache 清空两个 Map。

新增 getPublicProjectDetailInAudience({ projectId, scope })：先调用既有 getPublicProjectDetail(projectId)，从根 tenant_id 调用 assertPublicProjectInAudience，再返回项目。缓存命中也必须经过此校验，不得以缓存绕过范围。

- [ ] **Step 4: 验证并提交**

    cd apps/api && bun test src/services/projects/legacy/public-cache.test.ts
    bun run typecheck
    git add src/services/projects/legacy-service.ts src/services/projects/legacy/public-cache.ts src/services/projects/legacy/public-cache.test.ts
    git commit -m "feat(project): 隔离公开项目范围缓存"

Expected: 2 个测试通过，类型检查无错误。

## Task 4: 接入 Controller 并封堵详情与日志绕过

**Files:**

- Modify: apps/api/src/controllers/projects/public-controller.ts
- Create: apps/api/src/controllers/projects/public-controller.test.ts

- [ ] **Step 1: 写列表分页 Schema 的失败测试**

    import { describe, expect, test } from 'bun:test';
    import { PublicProjectsQuerySchema } from './public-controller';

    describe('public project list query', () => {
      test('uses page 1 and pageSize 20 by default', () => {
        expect(PublicProjectsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
      });

      test('rejects pageSize above 100', () => {
        expect(() => PublicProjectsQuerySchema.parse({ pageSize: 101 })).toThrow();
      });
    });

- [ ] **Step 2: 运行失败测试**

    cd apps/api && bun test src/controllers/projects/public-controller.test.ts

Expected: FAIL，当前列表没有导出的分页 Schema。

- [ ] **Step 3: 修改三个路由**

导出并使用：

    export const PublicProjectsQuerySchema = z.object({
      page: z.coerce.number().int().min(1, '页码必须大于 0').default(1),
      pageSize: z.coerce.number().int().min(1, '每页条数必须大于 0').max(100, '每页条数不能超过 100').default(20),
    });

列表实现：

    const queryResult = PublicProjectsQuerySchema.safeParse(request.query ?? {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const scope = await projectSer.resolvePublicProjectAudienceScope(request.user);
    const result = await projectSer.listPublicProjects({ scope, ...queryResult.data });
    return ResponseHandler.success({
      list: result.rows.map((item) => serializeProjectListItem(item)),
      pagination: result.pagination,
    });

详情和日志都先解析 scope，再调用：

    await projectSer.getPublicProjectDetailInAudience({ projectId, scope });

日志只在检查成功后查询分页日志；详情只在检查成功后加载日志、成员、咨询与关注。范围不符必须经 Errors.notFound('项目不存在') 返回 404，不返回 403，也不暴露项目或公司信息。

- [ ] **Step 4: 验证并提交**

    cd apps/api && bun test src/controllers/projects/public-controller.test.ts
    bun run typecheck
    git add src/controllers/projects/public-controller.ts src/controllers/projects/public-controller.test.ts
    git commit -m "fix(project): 限制访客公开项目公司范围"

Expected: Schema 测试通过，类型检查无错误。

## Task 5: 移除全局预热并以真实计划决定索引

**Files:**

- Modify: apps/api/src/services/wechat-auth-legacy/common.ts
- Modify: apps/api/src/services/wechat-auth-legacy/common.test.ts（不存在则新建）
- Conditionally create: supabase/migrations/20260711153000_add_projects_public_scope_index.sql
- Create: docs/audit/2026-07-11-public-project-scope-query-plan.md

- [ ] **Step 1: 写 visitor 登录不预热全量项目的失败测试**

在 common.test.ts 用 Bun mock.module 替换 decoration-qa 和 projects 模块，再对
prewarmVisitorHomeData.call(context, request) 传入与 partner-login.test.ts 同样的
runAuthBackgroundTask stub，断言：

    expect(projectService.listPublicProjects).not.toHaveBeenCalledWith();
    expect(decorationQaService.getDecorationQaSuggestions).toHaveBeenCalledTimes(1);

- [ ] **Step 2: 运行失败测试**

    cd apps/api && bun test src/services/wechat-auth-legacy/common.test.ts

Expected: FAIL，现有实现调用无范围 projectSer.listPublicProjects()。

- [ ] **Step 3: 仅保留问答建议预热**

从 prewarmVisitorHomeData 删除全平台项目列表和详情预热，保留 getDecorationQaSuggestions。认证阶段不猜测位置范围，首页列表会使用请求时最新定位上下文。

- [ ] **Step 4: 检查查询计划后再决定 migration**

使用代表性 tenant ID 对目标环境只读执行：

    EXPLAIN (ANALYZE, BUFFERS)
    SELECT id, tenant_id, created_at
    FROM public.projects
    WHERE tenant_id IN ('<tenant-a>', '<tenant-b>')
      AND visibility_status <> 'hidden'
      AND (status IN ('signed', 'design_finalized', 'pending_start', 'started', 'constructing', 'acceptance') OR visibility_status = 'public')
    ORDER BY created_at DESC, id DESC
    LIMIT 20;

将计划、耗时、扫描行数及是否使用现有 idx_projects_tenant_created_at 写入审计文档。如果已有索引满足查询，不创建 migration。如果确有顺序扫描或昂贵排序，创建：

    CREATE INDEX IF NOT EXISTS idx_projects_public_scope_tenant_created
    ON public.projects (tenant_id, created_at DESC, id DESC)
    WHERE visibility_status <> 'hidden'
      AND (status IN ('signed', 'design_finalized', 'pending_start', 'started', 'constructing', 'acceptance') OR visibility_status = 'public');

索引只通过 supabase/migrations 管理；应用前确认文件，应用后运行 supabase migration list，禁止手工远端 DDL。

- [ ] **Step 5: 验证并提交**

    cd apps/api && bun test src/services/wechat-auth-legacy/common.test.ts
    bun run typecheck
    supabase migration list
    git add src/services/wechat-auth-legacy/common.ts src/services/wechat-auth-legacy/common.test.ts docs/audit/2026-07-11-public-project-scope-query-plan.md
    git add supabase/migrations/20260711153000_add_projects_public_scope_index.sql
    git commit -m "perf(project): 避免预热全局公开项目"

Expected: 预热测试和类型检查通过；仅在创建 migration 时执行对应 git add；审计文档说明是否新增索引。

## Task 6: 交接 orange 的分页响应与缓存失效

**Files:**

- Create: docs/application_integration_documentation/2026-07-11-miniprogram-visitor-public-project-region-scope.md

- [ ] **Step 1: 写固定接口契约**

    GET /front/projects?page=1&pageSize=20
    Authorization: Bearer <visitor/customer/employee token>

    {
      "data": {
        "list": [{ "id": "project-id", "tenant_id": "tenant-id" }],
        "pagination": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
      }
    }

明确：范围由后端根据 token 和 server-side 定位上下文计算；小程序不能传 tenant_ids 或 adcode。无可见公司是正常空分页。

- [ ] **Step 2: 写入具体小程序改动与时序**

| 文件 | 动作 |
| --- | --- |
| src/services/projects/frontCache.ts | 接受 data.list 和 pagination，不再假定数组响应。 |
| src/services/projects/methods/frontCustomer.ts | 传递 page/pageSize 并标准化分页结果。 |
| src/pages/visitor/index.tsx | 首屏读 data.list；加载更多读取 pagination。 |
| src/pages/visitor/model.ts | 定位 bootstrap、confirm、skip、重新定位或身份变化时清除本地项目缓存。 |

调用时序固定为 ensureSessionReady → location context ready → GET /front/projects。

- [ ] **Step 3: 写入可执行 smoke 清单并提交**

必须覆盖 A/B 两个不重叠区域、无服务区域、多匹配公司、selected 排序、详情/日志越界 404、customer/employee 身份范围、pageSize=101 与定位切换缓存清理。

    rg -n 'T[B]D|TO[D]O|待补充|待定' docs/application_integration_documentation/2026-07-11-miniprogram-visitor-public-project-region-scope.md
    git add docs/application_integration_documentation/2026-07-11-miniprogram-visitor-public-project-region-scope.md
    git commit -m "docs(project): 交接公开项目区域过滤"

Expected: rg 无输出；只提交 gooes 文档，orange 不发生写入。

## Task 7: 最终验证与交付

**Files:**

- Modify: docs/audit/2026-07-11-public-project-scope-query-plan.md
- Modify: docs/application_integration_documentation/2026-07-11-miniprogram-visitor-public-project-region-scope.md

- [ ] **Step 1: 运行新增与相邻回归测试**

    cd apps/api && bun test \
      src/services/projects/legacy/public-audience-scope.test.ts \
      src/repositories/projects/legacy/public.test.ts \
      src/services/projects/legacy/public-cache.test.ts \
      src/controllers/projects/public-controller.test.ts \
      src/plugins/auth/legacy/routes.test.ts

Expected: 所有指定测试通过。

- [ ] **Step 2: 运行完整 API 静态校验**

    bun run api:check
    git diff --check main...HEAD
    git status --short

Expected: 类型检查、构建和文件大小检查通过；无 diff 空白错误；无未预期文件。

- [ ] **Step 3: 在测试环境执行 API smoke 并记录证据**

    curl -sS -H "Authorization: Bearer $VISITOR_A_TOKEN" "$API_BASE_URL/front/projects?page=1&pageSize=20"
    curl -sS -H "Authorization: Bearer $VISITOR_A_TOKEN" "$API_BASE_URL/front/projects/$TENANT_B_PROJECT_ID"
    curl -sS -H "Authorization: Bearer $VISITOR_A_TOKEN" "$API_BASE_URL/front/projects/$TENANT_B_PROJECT_ID/logs?page=1&pageSize=10"

Expected: A 区列表仅含 A 范围公司；B 项目详情及日志为 404；无匹配范围为 list=[]；每个列表都有合法 pagination。日志和文档不得记录真实 token。

- [ ] **Step 4: 核对 migration 并提交验证记录**

    supabase migration list
    git add docs/audit/2026-07-11-public-project-scope-query-plan.md docs/application_integration_documentation/2026-07-11-miniprogram-visitor-public-project-region-scope.md
    git commit -m "docs(project): 记录公开项目区域验证"
    git status --short --branch

Expected: 若有 migration，Local/Remote 对齐；若没有 migration，审计文档明确已有索引满足代表性查询。最终交付报告包含实际 commit、测试和构建输出、API smoke、migration 状态、orange 待执行项，并说明 orange 未改动。

## 执行前约束

- 开始代码变更前使用 using-git-worktrees 建立隔离 worktree。
- 每个 Task 先执行失败测试，再做最小实现，再执行通过测试并单独提交。
- 不引入新依赖，不手工执行远端 DDL，不在 /Users/leefo/Public/work/orange 写入或运行可能写盘的命令。
