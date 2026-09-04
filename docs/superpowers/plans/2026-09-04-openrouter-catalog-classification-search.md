# OpenRouter Catalog Classification and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the OpenRouter preview into a safely applicable multimodal catalog with server-side function filters and model search.

**Architecture:** Fetch the four official OpenRouter catalog views atomically, normalize every source into a modality-scoped candidate, and persist one entry per `(provider, external model, modality)`. Keep search and filters in the repository before pagination, enforce apply eligibility again inside the database RPC, and extract the Admin preview surface so the existing near-limit component remains maintainable.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod 4, Supabase/PostgreSQL migrations and RPCs, Next.js 15, React 19, shadcn/Radix, Tailwind CSS, bun:test.

---

## File Map

**Create**

- `apps/api/src/services/ai-config/openrouter-catalog-projection.ts`: modality-scoped normalization, capability projection, hashes and stable catalog keys.
- `apps/api/src/services/ai-config/openrouter-catalog-projection.test.ts`: projection, eligibility, duplicate and code compatibility tests.
- `apps/api/src/services/ai-config/openrouter-multimodal-sync.test.ts`: atomic four-endpoint synchronization tests without growing the existing 499-line test.
- `apps/api/src/services/ai-generation/openrouter-media-catalog-contract.test.ts`: current official image and video catalog fixtures.
- `apps/api/src/services/ai-config/openrouter-catalog-classification-migration-contract.test.ts`: migration/RPC contract assertions.
- `apps/admin/components/platform-ai/ai-model-catalog-preview.tsx`: preview toolbar, table, blocked state and pagination.
- `apps/admin/components/platform-ai/ai-model-catalog-query.ts`: deterministic query-string and filter-state helpers.
- `apps/admin/components/platform-ai/ai-model-catalog-query.test.ts`: filter reset, escaping and URL tests.
- `apps/admin/components/platform-ai/ai-model-catalog-preview.test.tsx`: Chinese labels and blocked-row rendering tests.
- `supabase/migrations/20260904110000_extend_openrouter_catalog_classification.sql`: modality identity, apply eligibility, indexes and RPC replacement.

**Modify**

- `apps/api/src/services/ai-generation/openrouter-contract.ts`: accept only documented current image/video catalog fields.
- `apps/api/src/services/ai-config/openrouter-model-sync.ts`: orchestrate four endpoints and delegate projection.
- `apps/api/src/schema/ai-config.ts`: add `keyword` and `modality` to entry list query.
- `apps/api/src/repositories/ai-model-catalog.ts`: select eligibility fields and apply filters before `.range()`.
- `apps/api/src/repositories/ai-model-catalog.test.ts`: repository filter and escaped keyword tests.
- `apps/admin/components/platform-ai/ai-config-types.ts`: add eligibility fields and catalog filter types.
- `apps/admin/components/platform-ai/ai-model-catalog-tab.tsx`: retain synchronization/run state and render the extracted preview.
- `apps/admin/components/platform-ai/ai-model-catalog-tab.test.tsx`: update source label expectations only.

## Task 1: Update Strict Media Catalog Contracts

**Files:**

- Create: `apps/api/src/services/ai-generation/openrouter-media-catalog-contract.test.ts`
- Modify: `apps/api/src/services/ai-generation/openrouter-contract.ts`

- [ ] **Step 1: Add failing fixtures for current official fields**

Create fixtures that contain the fields observed from the live official endpoints without including credentials or full payloads:

```ts
expect(OpenRouterImageModelListSchema.safeParse({
  data: [{
    id: "openrouter/image-model",
    name: "Image Model",
    architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
    supported_parameters: {
      input_references: { type: "integer", min: 0, max: 4 },
      n: { type: "integer", min: 1, max: 4 },
      resolution: { type: "enum", values: ["1K", "2K"] },
    },
  }],
}).success).toBe(true);

expect(OpenRouterVideoModelListSchema.safeParse({
  data: [{
    id: "openrouter/video-model",
    name: "Video Model",
    creativity: 0.5,
    hugging_face_id: null,
    upscale_factor: 2,
    generate_audio: true,
    supported_aspect_ratios: ["16:9"],
    supported_durations: [5, 10],
    pricing_skus: { "per-video-second": "0.05" },
  }],
}).success).toBe(true);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
cd apps/api
bun test src/services/ai-generation/openrouter-media-catalog-contract.test.ts
```

Expected: FAIL because strict schemas reject `input_references`, `creativity`, `hugging_face_id` and `upscale_factor`.

- [ ] **Step 3: Add only documented schema fields**

Extend the existing strict schemas with the installed Zod APIs already used by the repository:

```ts
const imageSupportedParametersSchema = z.strictObject({
  // existing fields remain
  input_references: parameterSpecSchema.optional(),
});

const videoModelEntrySchema = z.strictObject({
  // existing fields remain
  creativity: z.number().finite().nullable().optional(),
  hugging_face_id: z.string().max(512).nullable().optional(),
  upscale_factor: z.number().finite().positive().nullable().optional(),
});
```

Do not use `.passthrough()` or `z.record()` for the model envelope.

- [ ] **Step 4: Run contract tests and file-size gate**

Run:

```bash
cd apps/api
bun test src/services/ai-generation/openrouter-contract.test.ts src/services/ai-generation/openrouter-media-catalog-contract.test.ts
cd ../..
bun run api:check-file-size
```

Expected: all tests PASS and every non-generated API file remains below 500 lines.

- [ ] **Step 5: Commit the contract update**

```bash
git add apps/api/src/services/ai-generation/openrouter-contract.ts apps/api/src/services/ai-generation/openrouter-media-catalog-contract.test.ts
git commit -m "fix(ai): 更新OpenRouter媒体目录契约"
```

## Task 2: Build Modality-Scoped Catalog Projection

**Files:**

- Create: `apps/api/src/services/ai-config/openrouter-catalog-projection.ts`
- Create: `apps/api/src/services/ai-config/openrouter-catalog-projection.test.ts`
- Modify: `apps/api/src/services/ai-config/openrouter-model-sync.ts`

- [ ] **Step 1: Write projection RED tests**

Cover these exact cases:

```ts
expect(catalogIdentity("openai/gpt-4o", "text")).toBe("openai/gpt-4o\u0000text");
expect(modelCode("openai/gpt-4o", "text")).toBe("openrouter.openai_gpt_4o");
expect(modelCode("openai/gpt-4o", "image")).toBe("openrouter.image.openai_gpt_4o");

expect(projectCandidate(completeVideoCandidate)).toMatchObject({
  modality: "video",
  apply_status: "eligible",
  apply_block_code: null,
});

expect(projectCandidate(incompleteSpeechCandidate)).toMatchObject({
  modality: "speech",
  apply_status: "blocked",
  apply_block_code: "CAPABILITY_METADATA_INCOMPLETE",
});
```

Also assert that OpenRouter `-1` prices are omitted, input modalities are de-duplicated, and conflicting duplicate `(external_model_id, modality)` candidates throw a fixed `Errors.business()` error.

- [ ] **Step 2: Run projection tests and confirm RED**

```bash
cd apps/api
bun test src/services/ai-config/openrouter-catalog-projection.test.ts
```

Expected: FAIL because the projection module does not exist.

- [ ] **Step 3: Implement the projection boundary**

Export explicit types and pure functions:

```ts
export type CatalogModality = "text" | "image" | "video" | "speech";
export type CatalogCandidate = {
  externalModelId: string;
  modelName: string;
  modality: CatalogModality;
  inputModalities: CatalogModality[];
  capabilityCandidate: Record<string, unknown>;
  rawPriceProjection: Record<string, string>;
};

export type CatalogEntryProjection = {
  external_model_id: string;
  model_code: string;
  model_name: string;
  modality: CatalogModality;
  input_modalities: CatalogModality[];
  capability_payload: Record<string, unknown>;
  raw_price_projection: Record<string, string>;
  apply_status: "eligible" | "blocked";
  apply_block_code: null | "CAPABILITY_METADATA_INCOMPLETE";
  catalog_hash: string;
  change_type: "new" | "changed" | "removed" | "unchanged";
};
```

Use `AiModelCapabilitySchema.safeParse(candidate.capabilityCandidate)` as the only eligibility decision. Preserve parsed data for eligible entries and the bounded candidate object for blocked preview entries. Move hashing, catalog identity, model code, price normalization and current-state comparison out of `openrouter-model-sync.ts` so both files remain below the size gate.

- [ ] **Step 4: Implement source-specific candidate builders**

Add pure builders with no network or database access:

```ts
type OpenRouterTextModel = z.infer<typeof OpenRouterModelListSchema>["data"][number];
type OpenRouterImageModel = z.infer<typeof OpenRouterImageModelListSchema>["data"][number];
type OpenRouterVideoModel = z.infer<typeof OpenRouterVideoModelListSchema>["data"][number];

export function textCandidates(models: OpenRouterTextModel[]): CatalogCandidate[];
export function imageCandidates(models: OpenRouterImageModel[]): CatalogCandidate[];
export function videoCandidates(models: OpenRouterVideoModel[]): CatalogCandidate[];
export function speechCandidates(models: OpenRouterTextModel[]): CatalogCandidate[];
```

Map only documented structured fields. For missing required capability fields, leave the candidate incomplete so strict eligibility becomes `blocked`; do not invent sizes, formats, voices, duration or character limits.

- [ ] **Step 5: Run projection and existing sync tests**

```bash
cd apps/api
bun test src/services/ai-config/openrouter-catalog-projection.test.ts src/services/ai-config/openrouter-model-sync.test.ts
```

Expected: PASS, including existing text model codes and price behavior.

- [ ] **Step 6: Commit the projection module**

```bash
git add apps/api/src/services/ai-config/openrouter-catalog-projection.ts apps/api/src/services/ai-config/openrouter-catalog-projection.test.ts apps/api/src/services/ai-config/openrouter-model-sync.ts
git commit -m "feat(ai): 增加多模态目录投影"
```

## Task 3: Add Database Identity and Apply Eligibility

**Files:**

- Create: `supabase/migrations/20260904110000_extend_openrouter_catalog_classification.sql`
- Create: `apps/api/src/services/ai-config/openrouter-catalog-classification-migration-contract.test.ts`

- [ ] **Step 1: Write migration contract RED tests**

Read the migration as text and assert all required controls:

```ts
expect(sql).toContain("apply_status text not null default 'eligible'");
expect(sql).toContain("apply_block_code text null");
expect(sql).toContain("unique (run_id, external_model_id, modality)");
expect(sql).toContain("on public.ai_models(provider_id, model_name, modality)");
expect(sql).toContain("on public.ai_model_catalog_entries(run_id, modality, change_type, entry_position)");
expect(applyFunction).toContain("v_entry.apply_status <> 'eligible'");
expect(applyFunction).toContain("identity_model.modality = entry.modality");
```

Also assert the migration does not disable RLS, grant table writes to `authenticated`, or drop audit rows.

- [ ] **Step 2: Run the migration contract and confirm RED**

```bash
cd apps/api
bun test src/services/ai-config/openrouter-catalog-classification-migration-contract.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Write the forward-only migration**

The migration must run in a transaction with a lock timeout and include these exact structural changes:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.ai_model_catalog_entries
  ADD COLUMN IF NOT EXISTS apply_status text NOT NULL DEFAULT 'eligible',
  ADD COLUMN IF NOT EXISTS apply_block_code text NULL;

ALTER TABLE public.ai_model_catalog_entries
  ADD CONSTRAINT ai_model_catalog_entries_apply_status_check
  CHECK (apply_status = ANY (ARRAY['eligible'::text, 'blocked'::text])),
  ADD CONSTRAINT ai_model_catalog_entries_apply_block_check
  CHECK (
    (apply_status = 'eligible' AND apply_block_code IS NULL)
    OR (apply_status = 'blocked' AND apply_block_code = 'CAPABILITY_METADATA_INCOMPLETE')
  );

ALTER TABLE public.ai_model_catalog_entries
  DROP CONSTRAINT IF EXISTS ai_model_catalog_entries_run_id_external_model_id_key,
  ADD CONSTRAINT ai_model_catalog_entries_run_model_modality_key
  UNIQUE (run_id, external_model_id, modality);

DROP INDEX IF EXISTS public.uniq_ai_models_catalog_managed_provider_model_name;
CREATE UNIQUE INDEX uniq_ai_models_catalog_managed_provider_model_modality
ON public.ai_models(provider_id, model_name, modality)
WHERE catalog_managed;

CREATE INDEX ai_model_catalog_entries_run_modality_change_position_idx
ON public.ai_model_catalog_entries(run_id, modality, change_type, entry_position);
```

Replace `save_openrouter_model_catalog_preview` so it validates and inserts both eligibility fields. Replace `apply_openrouter_model_catalog` from the current checked-in definition, adding modality to every identity join and rejecting blocked entries with:

```sql
RETURN public.ai_catalog_error(
  409,
  'AI_MODEL_CATALOG_ENTRY_BLOCKED',
  '所选模型能力信息不完整，暂不可应用'
);
```

Keep existing security definer, fixed `search_path`, permissions, row locks, hash/version checks, 100-entry bound and audit data unchanged. Add a rollback comment explaining that uniqueness must not be reverted while cross-modality duplicates exist.

- [ ] **Step 4: Run migration contracts**

```bash
cd apps/api
bun test src/services/ai-config/openrouter-catalog-classification-migration-contract.test.ts src/services/ai-multimodal-catalog-migration-contract.test.ts
```

Expected: PASS for both the new migration and original baseline contract.

- [ ] **Step 5: Commit the migration**

```bash
git add supabase/migrations/20260904110000_extend_openrouter_catalog_classification.sql apps/api/src/services/ai-config/openrouter-catalog-classification-migration-contract.test.ts
git commit -m "feat(ai): 扩展多模态目录数据约束"
```

## Task 4: Add Server-Side Catalog Search and Filters

**Files:**

- Modify: `apps/api/src/schema/ai-config.ts`
- Modify: `apps/api/src/repositories/ai-model-catalog.ts`
- Modify: `apps/api/src/repositories/ai-model-catalog.test.ts`

- [ ] **Step 1: Add schema and repository RED tests**

Assert accepted and rejected query shapes:

```ts
expect(AiCatalogEntryListQuerySchema.parse({
  page: "2",
  pageSize: "20",
  keyword: " claude ",
  modality: "image",
  changeType: "new",
})).toMatchObject({ page: 2, pageSize: 20, keyword: "claude", modality: "image" });

expect(AiCatalogEntryListQuerySchema.safeParse({ modality: "multimodal" }).success).toBe(false);
```

Repository tests must verify `run_id`, modality, change type and escaped keyword filters occur before the final `.range(20, 39)`, and that the selected columns include `apply_status` and `apply_block_code` but not `capability_payload`.

- [ ] **Step 2: Run focused tests and confirm RED**

```bash
cd apps/api
bun test src/schema/ai-config.test.ts src/repositories/ai-model-catalog.test.ts
```

Expected: FAIL because the entry query lacks `keyword`/`modality` and repository does not filter them.

- [ ] **Step 3: Extend the query schema**

```ts
export const AiCatalogEntryListQuerySchema = PaginationQuerySchema.extend({
  changeType: CatalogChangeTypeSchema.optional(),
  keyword: optionalText(120),
  modality: ModalitySchema.optional(),
});
```

- [ ] **Step 4: Apply filters before pagination**

Add a local helper that trims and escapes backslash, `%`, `_`, comma and PostgREST grouping characters before composing the two-column `.or()` filter. Build the query in this order:

```ts
let request = this.from("ai_model_catalog_entries")
  .select(ENTRY_SELECT, { count: "exact" })
  .eq("run_id", runId);
if (query.modality) request = request.eq("modality", query.modality);
if (query.changeType) request = request.eq("change_type", query.changeType);
if (query.keyword) {
  const keyword = escapeCatalogKeyword(query.keyword);
  request = request.or(
    `model_name.ilike.%${keyword}%,external_model_id.ilike.%${keyword}%`,
  );
}
const { data, error, count } = await request
  .order("entry_position", { ascending: true })
  .range(from, to);
```

- [ ] **Step 5: Run schema/repository tests and API typecheck**

```bash
cd apps/api
bun test src/schema/ai-config.test.ts src/repositories/ai-model-catalog.test.ts
bun run typecheck
```

Expected: PASS with exact filtered totals and no type assertions added.

- [ ] **Step 6: Commit query support**

```bash
git add apps/api/src/schema/ai-config.ts apps/api/src/repositories/ai-model-catalog.ts apps/api/src/repositories/ai-model-catalog.test.ts
git commit -m "feat(ai): 增加目录搜索与功能筛选"
```

## Task 5: Orchestrate Atomic Four-Endpoint Synchronization

**Files:**

- Create: `apps/api/src/services/ai-config/openrouter-multimodal-sync.test.ts`
- Modify: `apps/api/src/services/ai-config/openrouter-model-sync.ts`

- [ ] **Step 1: Write multimodal sync RED tests**

Use an injected fetch implementation keyed by URL. Assert:

- exactly four bounded requests are made;
- text, image, video and speech candidates are saved in deterministic modality/ID order;
- the same upstream ID in text and image creates two entries;
- current models are matched by `(model_name, modality)`;
- a failure or invalid contract from any endpoint saves no run;
- summary payload includes source endpoint list and per-modality counts;
- combined entries over 10,000 fail before the repository write.

The success assertion should include:

```ts
expect(saved.entries.map((entry) => [entry.external_model_id, entry.modality])).toEqual([
  ["openrouter/shared", "text"],
  ["openrouter/shared", "image"],
  ["openrouter/video", "video"],
  ["openrouter/speech", "speech"],
]);
```

- [ ] **Step 2: Run sync tests and confirm RED**

```bash
cd apps/api
bun test src/services/ai-config/openrouter-multimodal-sync.test.ts
```

Expected: FAIL because synchronization still fetches only `/api/v1/models` and forces `text`.

- [ ] **Step 3: Implement all-or-nothing fetch and parse**

Define a fixed endpoint manifest and use `Promise.all` over the four entries. Parse each payload with its exact strict schema before projection. Do not save a run until all four parsed results exist.

```ts
const CATALOG_ENDPOINTS = {
  text: "/api/v1/models",
  image: "/api/v1/images/models",
  video: "/api/v1/videos/models",
  speech: "/api/v1/models?output_modalities=speech",
} as const;
```

Normalize through Task 2 functions, de-duplicate exact identity matches, reject conflicting duplicates, stable-sort, cap at 10,000, then calculate one hash over modality-scoped projections.

- [ ] **Step 4: Preserve removed-model and compatibility semantics**

Build current model maps with `catalogIdentity(model.model_name, model.modality ?? "text")`. Produce removed entries only after all endpoints succeed. Preserve existing text model codes, current capability overrides and price snapshots; do not classify an existing non-text model as removed because it is absent from the text endpoint.

- [ ] **Step 5: Run all sync tests and typecheck**

```bash
cd apps/api
bun test src/services/ai-config/openrouter-model-sync.test.ts src/services/ai-config/openrouter-multimodal-sync.test.ts src/services/ai-config/openrouter-catalog-projection.test.ts
bun run typecheck
cd ../..
bun run api:check-file-size
```

Expected: PASS and no file-size exemption.

- [ ] **Step 6: Commit synchronization**

```bash
git add apps/api/src/services/ai-config/openrouter-model-sync.ts apps/api/src/services/ai-config/openrouter-multimodal-sync.test.ts
git commit -m "feat(ai): 同步OpenRouter多模态目录"
```

## Task 6: Build the Admin Preview Toolbar and Classified Table

**Files:**

- Create: `apps/admin/components/platform-ai/ai-model-catalog-preview.tsx`
- Create: `apps/admin/components/platform-ai/ai-model-catalog-preview.test.tsx`
- Create: `apps/admin/components/platform-ai/ai-model-catalog-query.ts`
- Create: `apps/admin/components/platform-ai/ai-model-catalog-query.test.ts`
- Modify: `apps/admin/components/platform-ai/ai-config-types.ts`
- Modify: `apps/admin/components/platform-ai/ai-model-catalog-tab.tsx`
- Modify: `apps/admin/components/platform-ai/ai-model-catalog-tab.test.tsx`

- [ ] **Step 1: Write query helper RED tests**

Define and test this state:

```ts
export type CatalogEntryFilters = {
  keyword: string;
  modality: "all" | "text" | "image" | "video" | "speech";
  changeType: "all" | "new" | "changed" | "removed" | "unchanged";
};
```

Assert the helper omits `all` and blank values, URL-encodes model IDs, resets page to 1 after filters change, and always includes `pageSize=20`.

- [ ] **Step 2: Write preview rendering RED tests**

Server-render entries containing one eligible text row and one blocked image row. Assert the markup includes:

```text
搜索模型名称或 OpenRouter ID
全部
文本
图片生成
视频生成
语音生成
功能
能力信息不足，暂不可应用
OpenRouter 多模态目录
```

Assert internal values are not rendered as the visible function label and the blocked checkbox is disabled.

- [ ] **Step 3: Run Admin tests and confirm RED**

```bash
pnpm --dir apps/admin exec bun test components/platform-ai/ai-model-catalog-query.test.ts components/platform-ai/ai-model-catalog-preview.test.tsx
```

Expected: FAIL because the extracted modules do not exist.

- [ ] **Step 4: Implement query state and extracted preview**

Use existing `Input`, `Tabs`, `Select`, `Badge`, `Button`, `Table` and Lucide `Search`/`X` icons. Keep controls in one compact wrapping toolbar, do not create a nested Card, and map labels through one constant:

```ts
export const MODALITY_LABELS = {
  text: "文本",
  image: "图片生成",
  video: "视频生成",
  speech: "语音生成",
} as const;
```

Disable blocked checkboxes from response data and show the stable Chinese reason. Distinguish “暂无目录条目” from “没有符合筛选条件的模型”.

- [ ] **Step 5: Connect debounced server requests**

Keep network state in `ai-model-catalog-tab.tsx`. Apply a 300ms debounce only to keyword input; modality and change state load immediately. Every filter/run/provider change must increment the existing request sequence, clear selected entry IDs, and request page 1. Page navigation reuses current filters.

Do not filter `entryPage.list` in React. The pagination total must come from the API response.

- [ ] **Step 6: Run Admin focused and static checks**

```bash
pnpm --dir apps/admin exec bun test components/platform-ai/ai-model-catalog-tab.test.tsx components/platform-ai/ai-model-catalog-query.test.ts components/platform-ai/ai-model-catalog-preview.test.tsx
pnpm --dir apps/admin run check
```

Expected: PASS, with all modified TS/TSX files below the Admin file-size threshold.

- [ ] **Step 7: Commit the Admin UI**

```bash
git add apps/admin/components/platform-ai/ai-config-types.ts apps/admin/components/platform-ai/ai-model-catalog-tab.tsx apps/admin/components/platform-ai/ai-model-catalog-tab.test.tsx apps/admin/components/platform-ai/ai-model-catalog-preview.tsx apps/admin/components/platform-ai/ai-model-catalog-preview.test.tsx apps/admin/components/platform-ai/ai-model-catalog-query.ts apps/admin/components/platform-ai/ai-model-catalog-query.test.ts
git commit -m "feat(admin): 优化OpenRouter目录预览"
```

## Task 7: Apply Development Migration and Verify End to End

**Files:**

- Modify after successful type generation only: `apps/api/src/types/database.ts`

- [ ] **Step 1: Verify migration target and dry run**

Load `/Users/leefo/Public/work/gooes/.env` without printing secrets, derive the approved direct development database URL, then run:

```bash
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --dry-run
```

Expected: only `20260904110000_extend_openrouter_catalog_classification.sql` is pending. Stop if any unrelated migration is pending.

- [ ] **Step 2: Apply migration and verify alignment**

```bash
supabase db push --db-url "$SUPABASE_DB_DIRECT_URL" --yes
supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"
```

Expected: Local/Remote aligned through `20260904110000`.

- [ ] **Step 3: Regenerate database types atomically**

Generate to a temporary file, require command success and non-empty output, then replace `apps/api/src/types/database.ts`. Never redirect a failing command directly over the checked-in type file.

```bash
supabase gen types typescript --project-id fclnkyatvfvmzgzdqlba > /tmp/gooes-database.ts
test -s /tmp/gooes-database.ts
mv /tmp/gooes-database.ts apps/api/src/types/database.ts
```

If DNS fails, leave the checked-in type file untouched and report the non-blocking typegen limitation only if no RPC signature used by TypeScript changed.

- [ ] **Step 4: Run development query-plan checks**

Create one real preview run, then run `EXPLAIN (ANALYZE, BUFFERS)` for:

```sql
SELECT id
FROM public.ai_model_catalog_entries
WHERE run_id = '<latest-run-id>'::uuid
  AND modality = 'image'
  AND change_type = 'new'
  AND (
    model_name ILIKE '%flux%'
    OR external_model_id ILIKE '%flux%'
  )
ORDER BY entry_position
LIMIT 20 OFFSET 0;
```

Expected: query first narrows by run/modality/change index, returns within the development performance budget, and does not scan all historical runs. Record planning/execution time and buffers without exposing credentials.

- [ ] **Step 5: Run real OpenRouter and API smoke**

Using the development secret only on the server side:

- fetch and strictly parse all four official catalogs;
- create a preview and verify nonzero text/image/video/speech category totals;
- search one model name and one external ID;
- verify `total` changes before pagination;
- verify a blocked entry cannot be applied;
- apply one eligible non-route entry and confirm no business route changes.

Do not print the API key or full third-party payload.

- [ ] **Step 6: Run repository-wide verification**

```bash
bun run api:check
pnpm --dir apps/admin run check
bun test apps/api/src/services/ai-generation/openrouter-contract.test.ts apps/api/src/services/ai-generation/openrouter-media-catalog-contract.test.ts apps/api/src/services/ai-config/openrouter-catalog-projection.test.ts apps/api/src/services/ai-config/openrouter-model-sync.test.ts apps/api/src/services/ai-config/openrouter-multimodal-sync.test.ts apps/api/src/services/ai-config/openrouter-catalog-classification-migration-contract.test.ts apps/api/src/repositories/ai-model-catalog.test.ts
pnpm --dir apps/admin exec bun test components/platform-ai/ai-model-catalog-tab.test.tsx components/platform-ai/ai-model-catalog-query.test.ts components/platform-ai/ai-model-catalog-preview.test.tsx
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 7: Inspect Admin in browser**

Start the existing Admin dev server with the development API, open the AI model routing page, and verify desktop plus narrow viewport screenshots:

- toolbar wraps without overlap;
- table scroll and sticky header remain usable;
- category/search/change filters combine correctly;
- blocked rows are visibly disabled;
- loading and empty states do not resize the layout.

- [ ] **Step 8: Commit generated types only when changed**

```bash
git add apps/api/src/types/database.ts
git diff --cached --quiet || git commit -m "chore(db): 更新OpenRouter目录类型"
```

Do not create an empty commit when generated types are unchanged or typegen was unavailable.

## Task 8: Final Review and Integration Readiness

**Files:**

- Review all files listed in the File Map.

- [ ] **Step 1: Review security and behavior boundaries**

Confirm no browser response contains an OpenRouter key or raw upstream payload, no controller accesses Supabase directly, no list endpoint returns unbounded data, and every error uses `Errors`/`error-factory.ts`.

- [ ] **Step 2: Review migration and compatibility boundaries**

Confirm existing text model IDs/codes remain unchanged, old runs remain readable, RPC permissions remain service-role-only, and cross-modality uniqueness cannot overwrite an existing model.

- [ ] **Step 3: Review Git scope**

```bash
git status --short --branch
git log --oneline --decorate -10
git diff origin/main...HEAD --stat
```

Expected: only the approved OpenRouter design/plan/implementation and generated database types are present; unrelated work is not staged or committed.

- [ ] **Step 4: Prepare integration result**

Report commit SHAs, migration alignment, real catalog counts at verification time, API/Admin checks, browser evidence, and any blocked third-party metadata limitations. Do not push, create a PR, merge or deploy until explicitly requested.
