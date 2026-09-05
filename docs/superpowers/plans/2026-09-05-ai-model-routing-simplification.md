# AI Model Routing Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify platform AI model routing so operators only work with `场景路由` and `供应商`, and configure a route by selecting a provider first, then searching and selecting a concrete model.

**Architecture:** Keep `ai_models` and OpenRouter catalog as internal platform data. Add provider-scoped route-model option APIs in the API layer, use those APIs from the route form, and hide the standalone `OpenRouter 目录` and `模型` tabs from the admin surface. Preserve the existing route persistence contract by resolving selected route options to stable `ai_models.id` before saving routes.

**Tech Stack:** Bun + TypeScript + Fastify + Zod + Supabase client for API; Next.js App Router + React + shadcn/Radix + Tailwind + lucide-react for admin.

---

## File Structure

- Modify `apps/api/src/schema/ai-config.ts`: add route model option query and resolve payload schemas.
- Modify `apps/api/src/controllers/ai-config/index.ts`: add two provider-scoped model option routes.
- Modify `apps/api/src/services/ai-config/index.ts`: orchestrate permission checks, route option reads, route option resolution, and scene-route validation.
- Modify `apps/api/src/repositories/ai-config.ts`: move bounded provider/model/route read APIs here and add model lookup/create helpers.
- Modify `apps/api/src/repositories/ai-model-catalog.ts`: keep OpenRouter catalog-only reads and add latest eligible catalog option lookup.
- Modify `apps/api/src/services/ai-gateway.ts`: fail closed when a route resolves to inactive model or provider.
- Modify `apps/admin/app/(console)/platform/ai-models/page.tsx`: stop eagerly loading model and catalog tab data for the default page.
- Modify `apps/admin/components/platform-ai/ai-config-types.ts`: add `AiRouteModelOptionRecord`.
- Modify `apps/admin/components/platform-ai/ai-model-routing-shared.ts`: add route option form state and label helpers.
- Modify `apps/admin/components/platform-ai/ai-model-routing-panel.tsx`: reduce visible tabs to `场景路由` and `供应商`.
- Modify `apps/admin/components/platform-ai/ai-model-route-tab.tsx`: replace global model selects with provider-first searchable model selectors and advanced route params collapse.
- Modify `apps/admin/components/platform-ai/ai-model-routing-sections.tsx`: update provider copy and table summary without exposing internal model/catalog management as primary workflow.
- Test files:
  - `apps/api/src/schema/ai-config.test.ts`
  - `apps/api/src/controllers/ai-config/index.test.ts`
  - `apps/api/src/repositories/ai-config.test.ts`
  - `apps/api/src/repositories/ai-model-catalog.test.ts`
  - `apps/api/src/services/ai-config/index.test.ts`
  - `apps/api/src/services/ai-gateway.test.ts`
  - `apps/admin/components/platform-ai/ai-model-routing-layout.test.ts`
  - `apps/admin/components/platform-ai/ai-model-route-tab.test.tsx`

## Task 1: Backend Schemas And Controller Routes

**Files:**
- Modify: `apps/api/src/schema/ai-config.ts`
- Modify: `apps/api/src/schema/ai-config.test.ts`
- Modify: `apps/api/src/controllers/ai-config/index.ts`
- Modify: `apps/api/src/controllers/ai-config/index.test.ts`

- [ ] **Step 1: Add failing schema tests**

Add tests that prove route option queries are paginated and bounded, and resolve payloads only accept catalog or manual inputs:

```ts
import {
  AiRouteModelOptionListQuerySchema,
  AiRouteModelOptionResolvePayloadSchema,
} from "./ai-config";

test("accepts provider-scoped route model option filters", () => {
  expect(AiRouteModelOptionListQuerySchema.parse({
    page: "2",
    pageSize: "20",
    keyword: " gpt-4o ",
    modality: "text",
  })).toMatchObject({
    page: 2,
    pageSize: 20,
    keyword: "gpt-4o",
    modality: "text",
  });

  expect(AiRouteModelOptionListQuerySchema.safeParse({
    pageSize: "101",
  }).success).toBe(false);
});

test("resolves route model options from catalog entries or manual text models", () => {
  expect(AiRouteModelOptionResolvePayloadSchema.safeParse({
    source: "catalog",
    value: "33333333-3333-4333-8333-333333333333",
  }).success).toBe(true);

  expect(AiRouteModelOptionResolvePayloadSchema.safeParse({
    source: "manual",
    model_name: "deepseek-chat",
    modality: "text",
  }).success).toBe(true);

  expect(AiRouteModelOptionResolvePayloadSchema.safeParse({
    source: "manual",
    model_name: "video-model",
    modality: "video",
  }).success).toBe(false);
});
```

- [ ] **Step 2: Run schema tests and confirm RED**

Run: `bun test apps/api/src/schema/ai-config.test.ts`

Expected: FAIL because `AiRouteModelOptionListQuerySchema` and `AiRouteModelOptionResolvePayloadSchema` are not exported.

- [ ] **Step 3: Implement schemas**

In `apps/api/src/schema/ai-config.ts`, export:

```ts
export const AiRouteModelOptionListQuerySchema = PaginationQuerySchema.extend({
  keyword: optionalText(120),
  modality: ModalitySchema.optional(),
  status: StatusSchema.optional(),
});

export const AiRouteModelOptionResolvePayloadSchema = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("catalog"),
    value: z.uuid("无效的目录模型 ID"),
  }),
  z.strictObject({
    source: z.literal("manual"),
    model_name: z.string().trim().min(1, "模型调用名称不能为空").max(200, "模型调用名称过长"),
    name: optionalText(120),
    modality: z.literal("text").default("text"),
  }),
]);

export type AiRouteModelOptionListQuery = z.infer<typeof AiRouteModelOptionListQuerySchema>;
export type AiRouteModelOptionResolvePayload = z.infer<typeof AiRouteModelOptionResolvePayloadSchema>;
```

- [ ] **Step 4: Add failing controller route test**

Update `apps/api/src/controllers/ai-config/index.test.ts` expected route list to include:

```ts
'@Get("/platform/ai-config/providers/:id/route-model-options")',
'@Post("/platform/ai-config/providers/:id/route-model-options:resolve")',
```

Also assert:

```ts
expect(code).toContain("AiRouteModelOptionListQuerySchema.safeParse");
expect(code).toContain("AiRouteModelOptionResolvePayloadSchema.safeParse");
```

- [ ] **Step 5: Run controller test and confirm RED**

Run: `bun test apps/api/src/controllers/ai-config/index.test.ts`

Expected: FAIL because the routes are not declared.

- [ ] **Step 6: Implement controller routes**

In `apps/api/src/controllers/ai-config/index.ts`, import the two schemas and add:

```ts
  @Get("/platform/ai-config/providers/:id/route-model-options")
  async listRouteModelOptions(request: FastifyRequest, reply: FastifyReply) {
    const paramsResult = AiConfigIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const queryResult = AiRouteModelOptionListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContext = await this.getAiConfigReadContext(request);
    const data = await aiConfigService.listRouteModelOptions(
      authContext,
      paramsResult.data.id,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post("/platform/ai-config/providers/:id/route-model-options:resolve")
  async resolveRouteModelOption(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getAiConfigManageContext(request);
    const paramsResult = AiConfigIdParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = AiRouteModelOptionResolvePayloadSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);
    const data = await aiConfigService.resolveRouteModelOption(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
```

- [ ] **Step 7: Verify Task 1 GREEN**

Run:

```bash
bun test apps/api/src/schema/ai-config.test.ts
bun test apps/api/src/controllers/ai-config/index.test.ts
```

Expected: both pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add apps/api/src/schema/ai-config.ts apps/api/src/schema/ai-config.test.ts apps/api/src/controllers/ai-config/index.ts apps/api/src/controllers/ai-config/index.test.ts
git commit -m "feat(ai): 增加路由模型候选接口契约"
```

## Task 2: Backend Route Option Repository And Service

**Files:**
- Modify: `apps/api/src/repositories/ai-config.ts`
- Modify: `apps/api/src/repositories/ai-config.test.ts`
- Modify: `apps/api/src/repositories/ai-model-catalog.ts`
- Modify: `apps/api/src/repositories/ai-model-catalog.test.ts`
- Modify: `apps/api/src/services/ai-config/index.ts`
- Create: `apps/api/src/services/ai-config/index.test.ts`

- [ ] **Step 1: Add failing repository tests for provider-scoped internal models**

In `apps/api/src/repositories/ai-config.test.ts`, add a chain builder and test that `listRouteModels` filters before pagination:

```ts
test("lists provider-scoped route models with search before pagination", async () => {
  const { AiConfigRepository } = await import("./ai-config");
  const builder = listBuilder([{ id: "44444444-4444-4444-8444-444444444444", name: "GPT-4o" }]);
  const repository = new AiConfigRepository({ from: () => builder } as never);

  await repository.listRouteModels("11111111-1111-4111-8111-111111111111", {
    page: 2,
    pageSize: 20,
    keyword: "gpt",
    modality: "text",
    status: "active",
  });

  expect(builder.calls).toContainEqual({ method: "eq", args: ["provider_id", "11111111-1111-4111-8111-111111111111"] });
  expect(builder.calls).toContainEqual({ method: "eq", args: ["modality", "text"] });
  expect(builder.calls).toContainEqual({ method: "eq", args: ["status", "active"] });
  expect(builder.calls.some((call) => call.method === "or" && String(call.args[0]).includes("gpt"))).toBe(true);
  expect(builder.calls).toContainEqual({ method: "range", args: [20, 39] });
});
```

- [ ] **Step 2: Run repository test and confirm RED**

Run: `bun test apps/api/src/repositories/ai-config.test.ts`

Expected: FAIL because `listRouteModels` does not exist.

- [ ] **Step 3: Implement repository reads and helpers**

In `apps/api/src/repositories/ai-config.ts`, add:

```ts
export type RouteModelOptionRecord = AiModelRecord & {
  source: "internal";
  value: string;
  label: string;
  description: string | null;
};

async listRouteModels(providerId: string, query: AiRouteModelOptionListQuery) {
  const { from, to } = pageRange(query);
  let request = this.from("ai_models")
    .select(MODEL_SELECT, { count: "exact" })
    .eq("provider_id", providerId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .range(from, to);
  if (query.modality) request = request.eq("modality", query.modality);
  if (query.status) request = request.eq("status", query.status);
  if (query.keyword) request = request.or(`name.ilike.%${query.keyword}%,model_name.ilike.%${query.keyword}%`);
  const { data, error, count } = await request;
  if (error) throw Errors.dbError("查询供应商模型候选失败", error);
  return {
    list: ((data || []) as AiModelRecord[]).map((item) => ({
      ...item,
      source: "internal" as const,
      value: item.id,
      label: item.name,
      description: item.model_name,
    })),
    pagination: { page: query.page, pageSize: query.pageSize, total: count ?? 0, totalPages: totalPages(count ?? 0, query.pageSize) },
  };
}
```

Also add `getProviderById`, `getModelById`, `findModelByProviderAndCallName`, and `createModel` helpers with selected fields only.

- [ ] **Step 4: Add failing catalog option tests**

In `apps/api/src/repositories/ai-model-catalog.test.ts`, add:

```ts
test("lists latest eligible OpenRouter catalog options before pagination", async () => {
  const { AiModelCatalogRepository } = await import("./ai-model-catalog");
  const builders: Record<string, ReturnType<typeof tableResponse>> = {};
  const client = {
    from(table: string) {
      builders[table] = tableResponse([{ id: ENTRY_ID, external_model_id: "openai/gpt-4o", model_name: "GPT-4o", modality: "text" }]);
      return builders[table];
    },
    rpc: async () => ({ data: null, error: null }),
  };

  await new AiModelCatalogRepository(client as never).listLatestEligibleCatalogRouteOptions(PROVIDER_ID, {
    page: 1,
    pageSize: 20,
    keyword: "gpt",
    modality: "text",
  });

  expect(builders.ai_model_catalog_sync_runs!.calls).toContainEqual({ method: "eq", args: ["provider_id", PROVIDER_ID] });
  expect(builders.ai_model_catalog_entries!.calls).toContainEqual({ method: "eq", args: ["apply_status", "eligible"] });
  expect(builders.ai_model_catalog_entries!.calls).toContainEqual({ method: "range", args: [0, 19] });
});
```

- [ ] **Step 5: Run catalog repository test and confirm RED**

Run: `bun test apps/api/src/repositories/ai-model-catalog.test.ts`

Expected: FAIL because `listLatestEligibleCatalogRouteOptions` does not exist.

- [ ] **Step 6: Implement catalog option read**

In `apps/api/src/repositories/ai-model-catalog.ts`, add a latest applied run lookup using `.eq("provider_id", providerId)`, `.eq("run_status", "applied")`, `.order("created_at", { ascending: false })`, `.limit(1)`, `.maybeSingle()`. Then read eligible entries for that run with `ENTRY_SELECT`, optional `keyword` and `modality`, exact count, range, and return option records shaped as:

```ts
{
  source: "catalog",
  value: entry.id,
  label: entry.model_name,
  description: entry.external_model_id,
  model_id: entry.current_model_id,
  modality: entry.modality,
  apply_status: entry.apply_status,
}
```

- [ ] **Step 7: Add failing service tests**

Create `apps/api/src/services/ai-config/index.test.ts` with tests using injected fake repositories if constructor injection is added, or focused source-level tests if constructor injection would over-expand this change:

```ts
test("requires an active provider before listing route model options", async () => {
  // Fake provider lookup returns inactive.
  // Expect AI_PROVIDER_INACTIVE and no catalog query.
});

test("resolves manual route model only for openai compatible providers", async () => {
  // Fake provider type openai_compatible returns created internal model.
  // Fake provider type openrouter rejects manual source.
});

test("rejects route save when primary and fallback are the same model", async () => {
  // Create/update scene route should throw AI_ROUTE_MODEL_DUPLICATED.
});
```

- [ ] **Step 8: Run service test and confirm RED**

Run: `bun test apps/api/src/services/ai-config/index.test.ts`

Expected: FAIL until service methods and constructor injection exist.

- [ ] **Step 9: Implement service orchestration**

In `apps/api/src/services/ai-config/index.ts`:

- Add `listRouteModelOptions(authContext, providerId, query)`.
- Add `resolveRouteModelOption(authContext, providerId, input)`.
- For `openrouter`, return internal active models plus latest eligible catalog options. Keep each list paginated and bounded; for the first pass use internal models when keyword is blank and catalog options when no internal match is selected by user search.
- For `openai_compatible`, return only internal models, plus a manual option when keyword is nonblank.
- Resolve `source: "catalog"` by returning `current_model_id` if present, otherwise create an internal active catalog-managed model from the catalog row.
- Resolve `source: "manual"` only for active `openai_compatible` providers and text modality.
- Validate `createSceneRoute` and `updateSceneRoute`: configured models must exist, be active, match route modality, belong to active providers, and primary/fallback cannot be identical.

- [ ] **Step 10: Verify Task 2 GREEN**

Run:

```bash
bun test apps/api/src/repositories/ai-config.test.ts
bun test apps/api/src/repositories/ai-model-catalog.test.ts
bun test apps/api/src/services/ai-config/index.test.ts
bun run api:typecheck
```

Expected: all pass.

- [ ] **Step 11: Commit Task 2**

```bash
git add apps/api/src/repositories/ai-config.ts apps/api/src/repositories/ai-config.test.ts apps/api/src/repositories/ai-model-catalog.ts apps/api/src/repositories/ai-model-catalog.test.ts apps/api/src/services/ai-config/index.ts apps/api/src/services/ai-config/index.test.ts
git commit -m "feat(ai): 支持供应商内搜索路由模型"
```

## Task 3: Runtime Route Safety

**Files:**
- Modify: `apps/api/src/services/ai-gateway.ts`
- Modify: `apps/api/src/services/ai-gateway.test.ts`

- [ ] **Step 1: Add failing gateway test**

Add a test proving inactive model/provider cannot be used at runtime:

```ts
test("fails closed when route model or provider is inactive", async () => {
  const gateway = new AiGateway({
    routeRepository: {
      findActiveRoute: async () => ({
        status: "active",
        primary_model: {
          status: "inactive",
          provider: { status: "active" },
        },
      }),
    },
  } as never);

  await expect(gateway.generateText({ sceneCode: "decoration_qa", messages: [] })).rejects.toMatchObject({
    code: "AI_MODEL_INACTIVE",
  });
});
```

- [ ] **Step 2: Run gateway test and confirm RED**

Run: `bun test apps/api/src/services/ai-gateway.test.ts`

Expected: FAIL because status gates are not enforced.

- [ ] **Step 3: Implement gateway status gates**

In `apps/api/src/services/ai-gateway.ts`, before calling a model, add a small validator that checks model and provider status:

```ts
if (model.status !== "active") {
  throw Errors.business(409, "AI 模型已停用，请调整场景路由", "AI_MODEL_INACTIVE");
}
if (model.provider?.status !== "active") {
  throw Errors.business(409, "AI 供应商已停用，请调整场景路由", "AI_PROVIDER_INACTIVE");
}
```

- [ ] **Step 4: Verify Task 3 GREEN**

Run:

```bash
bun test apps/api/src/services/ai-gateway.test.ts
bun run api:typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/api/src/services/ai-gateway.ts apps/api/src/services/ai-gateway.test.ts
git commit -m "fix(ai): 阻止停用模型进入运行时调用"
```

## Task 4: Admin Simplified Routing UI

**Files:**
- Modify: `apps/admin/app/(console)/platform/ai-models/page.tsx`
- Modify: `apps/admin/components/platform-ai/ai-config-types.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-shared.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-panel.tsx`
- Modify: `apps/admin/components/platform-ai/ai-model-route-tab.tsx`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-sections.tsx`
- Modify: `apps/admin/components/platform-ai/ai-model-routing-layout.test.ts`
- Create: `apps/admin/components/platform-ai/ai-model-route-tab.test.tsx`

- [ ] **Step 1: Add failing admin layout test**

Update `ai-model-routing-layout.test.ts` expectations:

```ts
expect(panel).toContain('<TabsTrigger value="routes">场景路由</TabsTrigger>');
expect(panel).toContain('<TabsTrigger value="providers">供应商</TabsTrigger>');
expect(panel).not.toContain('<TabsTrigger value="catalog">OpenRouter 目录</TabsTrigger>');
expect(panel).not.toContain('<TabsTrigger value="models">模型</TabsTrigger>');
expect(page).not.toContain("catalog-runs?page=1&pageSize=20");
expect(page).not.toContain("/platform/ai-config/models?page=1&pageSize=100");
expect(routeTab).toContain("选择供应商");
expect(routeTab).toContain("搜索模型");
expect(routeTab).toContain("route-model-options");
```

- [ ] **Step 2: Run admin layout test and confirm RED**

Run: `bun test apps/admin/components/platform-ai/ai-model-routing-layout.test.ts`

Expected: FAIL because four tabs and eager catalog/model loads still exist.

- [ ] **Step 3: Add failing route tab render test**

Create `apps/admin/components/platform-ai/ai-model-route-tab.test.tsx`:

```tsx
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";
import { AiModelRouteTab } from "./ai-model-route-tab";
import { emptyRouteForm } from "./ai-model-routing-shared";

describe("AiModelRouteTab simplified route form", () => {
  test("uses provider-first model selection and hides internal model IDs", () => {
    const html = renderToStaticMarkup(createElement(AiModelRouteTab, {
      routePage: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      providers: [{
        id: "11111111-1111-4111-8111-111111111111",
        code: "openrouter",
        name: "OpenRouter",
        provider_type: "openrouter",
        endpoint_url: null,
        api_key_setting_key: null,
        status: "active",
        sort_order: 0,
        created_at: "2026-09-05T00:00:00.000Z",
        updated_at: "2026-09-05T00:00:00.000Z",
      }],
      primaryOptions: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      fallbackOptions: { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      routeForm: emptyRouteForm(),
      isPending: false,
      isRouteLoading: false,
      onRouteFormChange: () => undefined,
      onRouteSubmit: async () => undefined,
      onRouteEdit: () => undefined,
      onRoutePageChange: () => undefined,
      onModelSearch: async () => undefined,
    }));

    expect(html).toContain("选择供应商");
    expect(html).toContain("搜索模型");
    expect(html).not.toContain("OpenRouter 目录");
    expect(html).not.toContain("模型编码");
  });
});
```

- [ ] **Step 4: Run route tab test and confirm RED**

Run: `bun test apps/admin/components/platform-ai/ai-model-route-tab.test.tsx`

Expected: FAIL because current component props and markup do not match.

- [ ] **Step 5: Implement shared frontend types**

In `ai-config-types.ts`, add:

```ts
export type AiRouteModelOptionRecord = {
  source: "internal" | "catalog" | "manual";
  value: string;
  model_id?: string | null;
  provider_id: string;
  label: string;
  description: string | null;
  modality: "text" | "image" | "video" | "speech";
  status?: "active" | "inactive" | string;
  apply_status?: string | null;
};
```

In `ai-model-routing-shared.ts`, change `RouteFormState` to include:

```ts
primary_provider_id: string;
primary_option_value: string;
fallback_provider_id: string;
fallback_option_value: string;
```

Keep `primary_model_id` and `fallback_model_id` for edit hydration and save compatibility until submit.

- [ ] **Step 6: Implement page and panel simplification**

In `page.tsx`, fetch only summary, provider page, route page, and provider options. Remove eager model options and catalog run/entry fetches from initial load.

In `ai-model-routing-panel.tsx`, render only:

```tsx
<TabsTrigger value="routes">场景路由</TabsTrigger>
<TabsTrigger value="providers">供应商</TabsTrigger>
```

Keep `ModelFormCard`, `ModelTable`, and `AiModelCatalogTab` files in the repository, but do not expose them as primary tabs.

- [ ] **Step 7: Implement provider-first route selector**

In `ai-model-route-tab.tsx`:

- Replace `models` prop with `providers`, `primaryOptions`, `fallbackOptions`, and `onModelSearch`.
- Primary model fields:
  - `Select` for provider.
  - Search input with placeholder `搜索模型名称或调用名称`.
  - Option select that shows label and description without internal IDs.
- Fallback model fields:
  - keep `无备用模型`.
  - same provider + searchable option structure when fallback is enabled.
- Move temperature, response format, timeout into a collapsed `高级参数` area using existing `Collapsible` if already installed, otherwise a compact native `<details>`.

- [ ] **Step 8: Implement route submit resolution**

In `ai-model-routing-panel.tsx`, before saving a route:

- If primary option is not already an internal model ID, call `POST /platform/ai-config/providers/:id/route-model-options:resolve`.
- Do the same for fallback unless value is `NONE_VALUE`.
- Use returned `model_id` for existing `primary_model_id` and `fallback_model_id` route payload.
- Reset route form after successful save.

- [ ] **Step 9: Verify Task 4 GREEN**

Run:

```bash
bun test apps/admin/components/platform-ai/ai-model-routing-layout.test.ts
bun test apps/admin/components/platform-ai/ai-model-route-tab.test.tsx
pnpm --dir apps/admin check
```

Expected: all pass.

- [ ] **Step 10: Commit Task 4**

```bash
git add 'apps/admin/app/(console)/platform/ai-models/page.tsx' apps/admin/components/platform-ai/ai-config-types.ts apps/admin/components/platform-ai/ai-model-routing-shared.ts apps/admin/components/platform-ai/ai-model-routing-panel.tsx apps/admin/components/platform-ai/ai-model-route-tab.tsx apps/admin/components/platform-ai/ai-model-routing-sections.tsx apps/admin/components/platform-ai/ai-model-routing-layout.test.ts apps/admin/components/platform-ai/ai-model-route-tab.test.tsx
git commit -m "feat(admin): 简化AI模型路由配置交互"
```

## Task 5: Final Verification And Branch Handoff

**Files:**
- Review all modified files.

- [ ] **Step 1: Run full focused verification**

```bash
bun test apps/api/src/schema/ai-config.test.ts
bun test apps/api/src/controllers/ai-config/index.test.ts
bun test apps/api/src/repositories/ai-config.test.ts
bun test apps/api/src/repositories/ai-model-catalog.test.ts
bun test apps/api/src/services/ai-config/index.test.ts
bun test apps/api/src/services/ai-gateway.test.ts
bun test apps/admin/components/platform-ai/ai-model-routing-layout.test.ts
bun test apps/admin/components/platform-ai/ai-model-route-tab.test.tsx
bun run api:typecheck
pnpm --dir apps/admin check
```

Expected: all commands exit 0.

- [ ] **Step 2: Inspect git diff and status**

```bash
git status --short --branch
git diff --stat main...HEAD
git log --oneline main..HEAD
```

Expected: only AI routing simplification commits are ahead of the worktree base.

- [ ] **Step 3: Do not merge to main**

Stop after branch verification. Report:

- worktree path
- branch name
- commits created
- verification commands and exit status
- exact next merge command for later, but do not run it

## Self-Review

- Spec coverage: the plan covers the two visible tabs, provider-first model search, OpenRouter/model internalization, model resolution before route save, active provider/model validation, and no immediate `main` merge.
- Placeholder scan: no unresolved implementation placeholders remain.
- Type consistency: `AiRouteModelOptionRecord`, `AiRouteModelOptionListQuerySchema`, and `AiRouteModelOptionResolvePayloadSchema` are introduced before they are referenced by service, controller, and admin code.
