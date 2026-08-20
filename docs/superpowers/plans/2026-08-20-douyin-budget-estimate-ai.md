# Douyin Budget Estimate and AI Explanation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an anonymous, deterministic装修预算初算 that returns immediately and optionally adds a validated AI explanation without allowing AI to set or change prices.

**Architecture:** Store versioned tenant pricing rules in Supabase, calculate budget ranges in a pure TypeScript service, persist an immutable estimate snapshot, and invoke the existing AI Gateway through a separate idempotent endpoint. Add a tenant-admin pricing editor and a new Douyin mini-program budget tab/result experience.

**Tech Stack:** Bun, TypeScript, Fastify, Zod 4, Supabase/PostgreSQL, existing OpenAI-compatible AI Gateway, Next.js 15, React 19, Douyin TTML/TTSS.

**Execution order:** Run after the unified project-content plan. The appointment plan consumes the estimate UUID and public estimate number produced here.

---

## File structure

Create:

- `packages/domain/src/douyin-budget.ts` — public enums, request/result and AI-analysis schemas.
- `packages/domain/src/douyin-budget.test.ts` — shared contract tests.
- `supabase/migrations/20260820110000_create_douyin_budget_estimates.sql` — pricing versions/items, estimates, constraints, indexes and RLS.
- `apps/api/src/schema/douyin-budget.ts` — strict API input schemas.
- `apps/api/src/repositories/douyin-budget.ts` — active pricing and estimate persistence.
- `apps/api/src/repositories/douyin-budget.test.ts` — bounded query and persistence tests.
- `apps/api/src/services/douyin-budget/calculator.ts` — pure deterministic calculation.
- `apps/api/src/services/douyin-budget/calculator.test.ts` — formula, rounding and boundaries.
- `apps/api/src/services/douyin-budget/estimates.ts` — public estimate orchestration.
- `apps/api/src/services/douyin-budget/estimates.test.ts` — active version, ownership and snapshot tests.
- `apps/api/src/services/douyin-budget/ai-explanation.ts` — sanitized AI prompt and parser.
- `apps/api/src/services/douyin-budget/ai-explanation.test.ts` — PII and amount-boundary tests.
- `apps/api/src/controllers/douyin-budget/index.ts` — public config/estimate/AI routes.
- `apps/api/src/controllers/douyin-budget/index.test.ts` — HTTP contract tests.
- `apps/api/src/schema/tenant-douyin-budget.ts` — tenant pricing management schemas.
- `apps/api/src/repositories/tenant-douyin-budget.ts` — paginated version/item management.
- `apps/api/src/services/tenant-douyin-budget.ts` — draft/publish/archive rules.
- `apps/api/src/controllers/tenant-douyin-budget/index.ts` — tenant management routes.
- `apps/admin/app/(console)/douyin-miniapp/budget/page.tsx` — pricing configuration page.
- `apps/admin/components/douyin-miniapp/budget-pricing.tsx` — version/item editor.
- `apps/admin/components/douyin-miniapp/budget-pricing.test.ts` — UI contract tests.
- `apps/douyin-mini/src/api/budget.ts` — budget and AI client.
- `apps/douyin-mini/src/api/budget.test.ts` — response validation tests.
- `apps/douyin-mini/src/pages/budget/form-model.ts` — form validation and option state.
- `apps/douyin-mini/src/pages/budget/form-model.test.ts` — form model tests.
- `apps/douyin-mini/src/pages/budget/index.ts`
- `apps/douyin-mini/src/pages/budget/index.json`
- `apps/douyin-mini/src/pages/budget/index.ttml`
- `apps/douyin-mini/src/pages/budget/index.ttss`
- `apps/douyin-mini/src/assets/tabbar/budget.svg`
- `apps/douyin-mini/src/assets/tabbar/budget-active.svg`
- `apps/douyin-mini/src/assets/tabbar/budget.png`
- `apps/douyin-mini/src/assets/tabbar/budget-active.png`

Modify:

- `packages/domain/src/shared.ts` — export budget contracts.
- `apps/api/src/types/database.ts` — regenerate after migration.
- `apps/api/src/routes/index.ts` — register public and tenant controllers.
- `apps/douyin-mini/src/models/index.ts` — budget public types and entry path.
- `apps/douyin-mini/src/app.json` — add budget page and replace the sites tab.
- `apps/douyin-mini/src/platform/navigation.ts` — add `budget` tab target.
- `apps/douyin-mini/src/platform/navigation.test.ts` — budget navigation.
- `apps/douyin-mini/src/pages/home/index.ts` — budget CTA.
- `apps/douyin-mini/src/pages/home/index.ttml` — surface budget as primary function.
- `apps/admin/components/layout/menu-config.ts` — add budget configuration entry.

### Task 1: Define the shared budget contract

**Files:**
- Create: `packages/domain/src/douyin-budget.ts`
- Create: `packages/domain/src/douyin-budget.test.ts`
- Modify: `packages/domain/src/shared.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, test } from "bun:test";
import {
  DouyinBudgetEstimateRequestSchema,
  DouyinBudgetEstimateResultSchema,
} from "./douyin-budget";

describe("douyin budget contracts", () => {
  test("accepts a bounded anonymous estimate and rejects an inverted result", () => {
    expect(DouyinBudgetEstimateRequestSchema.parse({
      area: 110,
      property_condition: "rough",
      decoration_tier: "comfortable",
      decoration_scope: "whole_house",
      option_codes: ["custom_cabinet"],
      demand: "需要较多收纳",
    }).area).toBe(110);

    expect(() => DouyinBudgetEstimateResultSchema.parse({
      id: "22222222-2222-4222-8222-222222222222",
      estimate_no: "DYYS-20260820-000001",
      minimum_total: 200000,
      maximum_total: 100000,
      categories: [],
      pricing_version: "1",
      disclaimer: "初步估算，不构成最终报价",
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `bun test packages/domain/src/douyin-budget.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement strict Zod contracts**

Define stable values for property condition, tier, scope, AI status and visit-safe option codes. Use `.strict()` objects, area `10..1000`, demand maximum 1000, at most 20 unique option codes, non-negative money values, and refinements requiring every category and total to satisfy `minimum <= maximum`.

Export inferred TypeScript types and re-export them from `shared.ts`.

- [ ] **Step 4: Run tests**

Run: `bun test packages/domain/src/douyin-budget.test.ts packages/domain/src/shared.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/douyin-budget.ts packages/domain/src/douyin-budget.test.ts packages/domain/src/shared.ts
git commit -m "feat(domain): add douyin budget contracts"
```

### Task 2: Add versioned pricing and estimate persistence

**Files:**
- Create: `supabase/migrations/20260820110000_create_douyin_budget_estimates.sql`
- Create: `apps/api/src/services/douyin-budget/migration-contract.test.ts`
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { describe, expect, test } from "bun:test";

const migration = new URL(
  "../../../../../supabase/migrations/20260820110000_create_douyin_budget_estimates.sql",
  import.meta.url,
);

describe("douyin budget migration", () => {
  test("creates versioned private pricing and immutable snapshots", async () => {
    const sql = await Bun.file(migration).text();
    expect(sql).toContain("CREATE TABLE public.douyin_budget_pricing_versions");
    expect(sql).toContain("CREATE TABLE public.douyin_budget_pricing_items");
    expect(sql).toContain("CREATE TABLE public.douyin_budget_estimates");
    expect(sql).toContain("CREATE UNIQUE INDEX douyin_budget_one_active_version");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/douyin-budget/migration-contract.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the migration**

Create the three tables described in the design. Add checks for non-negative min/max amounts, `minimum_amount <= maximum_amount`, valid status values, object-shaped JSON, subject hash format, and future `expires_at`. Add one-active-version partial unique index per tenant, list indexes, estimate ownership indexes and a trigger that prevents mutation of pricing rules after activation except `active -> archived`.

Add `request_ip_hash` for anonymous database-backed rate limiting, plus `ai_claimed_at`, `ai_attempt_count` and `ai_last_error_code` for idempotent AI generation. Store only a SHA-256 IP hash, never the raw IP, and index `(tenant_id, request_ip_hash, created_at desc)`.

Enable RLS and revoke public/anon/authenticated direct access. Grant service-role access. Do not seed guessed prices.

- [ ] **Step 4: Test, dry-run, apply and regenerate**

Run: `bun test apps/api/src/services/douyin-budget/migration-contract.test.ts`

Expected: PASS.

Run: `/bin/zsh -lc 'set -a && source .env && set +a && supabase db push --dry-run --db-url "$SUPABASE_DB_DIRECT_URL"'`

Expected: the pricing migration is listed with no unexpected migration.

Run after review: `/bin/zsh -lc 'set -a && source .env && set +a && supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"'`

Expected: success.

Run: `supabase migration list`

Expected: Local/Remote `20260820110000` align.

Run: `bun run gen && bun run api:typecheck`

Expected: generated types include all three tables and typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260820110000_create_douyin_budget_estimates.sql apps/api/src/services/douyin-budget/migration-contract.test.ts apps/api/src/types/database.ts
git commit -m "feat(douyin): add budget pricing persistence"
```

### Task 3: Implement the deterministic calculator

**Files:**
- Create: `apps/api/src/services/douyin-budget/calculator.ts`
- Create: `apps/api/src/services/douyin-budget/calculator.test.ts`

- [ ] **Step 1: Write failing formula tests**

```ts
import { describe, expect, test } from "bun:test";
import { calculateDouyinBudget } from "./calculator";

const rules = {
  versionId: "11111111-1111-4111-8111-111111111111",
  versionNo: 1,
  disclaimer: "初步估算，不构成最终报价",
  items: [
    { code: "base.comfortable.rough", category: "base", unit: "sqm", min: 900, max: 1100 },
    { code: "custom_cabinet", category: "custom", unit: "fixed", min: 20000, max: 30000 },
  ],
} as const;

describe("calculateDouyinBudget", () => {
  test("calculates stable category and total ranges", () => {
    const result = calculateDouyinBudget(rules, {
      area: 100,
      property_condition: "rough",
      decoration_tier: "comfortable",
      decoration_scope: "whole_house",
      option_codes: ["custom_cabinet"],
    });
    expect(result.minimum_total).toBe(110000);
    expect(result.maximum_total).toBe(140000);
    expect(result.categories.map((item) => item.category_code)).toEqual(["base", "custom"]);
  });

  test("does not mutate input and returns the same result twice", () => {
    const input = Object.freeze({
      area: 100,
      property_condition: "rough" as const,
      decoration_tier: "comfortable" as const,
      decoration_scope: "whole_house" as const,
      option_codes: [] as string[],
    });
    expect(calculateDouyinBudget(rules, input)).toEqual(calculateDouyinBudget(rules, input));
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/douyin-budget/calculator.test.ts`

Expected: FAIL because the calculator does not exist.

- [ ] **Step 3: Implement the pure calculator**

Use integer fen internally, multiply per-square-metre items by area, apply explicit fixed items, aggregate by category, and round displayed yuan amounts consistently. Reject missing base rule, duplicate rule codes, inverted ranges and unknown selected options using `Errors.business` at the orchestration boundary; keep the pure calculator returning typed domain failures rather than accessing database or environment state.

- [ ] **Step 4: Add boundary tests**

Cover 10 and 1000 square metres, partial decoration, old-house coefficients, no options, multiple options, duplicate options, unknown options and inverted rule data.

- [ ] **Step 5: Run tests and typecheck**

Run: `bun test apps/api/src/services/douyin-budget/calculator.test.ts`

Expected: PASS.

Run: `bun run api:typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/douyin-budget/calculator.ts apps/api/src/services/douyin-budget/calculator.test.ts
git commit -m "feat(douyin): calculate deterministic budgets"
```

### Task 4: Add public configuration and estimate APIs

**Files:**
- Create: `apps/api/src/schema/douyin-budget.ts`
- Create: `apps/api/src/repositories/douyin-budget.ts`
- Create: `apps/api/src/repositories/douyin-budget.test.ts`
- Create: `apps/api/src/services/douyin-budget/estimates.ts`
- Create: `apps/api/src/services/douyin-budget/estimates.test.ts`
- Create: `apps/api/src/controllers/douyin-budget/index.ts`
- Create: `apps/api/src/controllers/douyin-budget/index.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing repository and service tests**

Assert the repository selects the one active version effective at the injected clock, limits pricing items to 100, saves request/result snapshots with the resolved tenant and installation, and never accepts a tenant ID from the body.

Use this expected service result:

```ts
expect(result).toEqual(expect.objectContaining({
  id: expect.any(String),
  estimate_no: expect.stringMatching(/^DYYS-[0-9]{8}-[0-9]{6}$/),
  minimum_total: expect.any(Number),
  maximum_total: expect.any(Number),
  ai_status: "pending",
  disclaimer: "初步估算，不构成最终报价",
}));
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/repositories/douyin-budget.test.ts apps/api/src/services/douyin-budget/estimates.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement repository and service**

The service must load the same installation/tenant context used by existing Douyin public services, load the effective active pricing version, calculate synchronously, generate the public estimate number server-side, and persist the snapshot. Hash the trusted client IP and reject more than 20 estimates per subject or IP in 10 minutes with `DOUYIN_BUDGET_RATE_LIMITED`; perform the count with a bounded indexed query. Return both `id` (UUID used by later API calls) and `estimate_no` (the only identifier shown to users). Return `DOUYIN_BUDGET_NOT_CONFIGURED` when no active version exists.

- [ ] **Step 4: Implement controller routes**

```ts
fastify.get("/douyin-mini/budget-config", this.getConfig);
fastify.post("/douyin-mini/budget-estimates", this.createEstimate);
```

Controller tests assert strict Zod parsing, Douyin session delegation and `ResponseHandler.success` wrapping.

- [ ] **Step 5: Run focused and API checks**

Run: `bun test apps/api/src/repositories/douyin-budget.test.ts apps/api/src/services/douyin-budget/estimates.test.ts apps/api/src/controllers/douyin-budget/index.test.ts`

Expected: PASS.

Run: `bun run api:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/douyin-budget.ts apps/api/src/repositories/douyin-budget.ts apps/api/src/repositories/douyin-budget.test.ts apps/api/src/services/douyin-budget apps/api/src/controllers/douyin-budget apps/api/src/routes/index.ts
git commit -m "feat(douyin): expose budget estimates"
```

### Task 5: Add the bounded AI explanation endpoint

**Files:**
- Create: `apps/api/src/services/douyin-budget/ai-explanation.ts`
- Create: `apps/api/src/services/douyin-budget/ai-explanation.test.ts`
- Modify: `apps/api/src/repositories/douyin-budget.ts`
- Modify: `apps/api/src/repositories/douyin-budget.test.ts`
- Modify: `apps/api/src/controllers/douyin-budget/index.ts`
- Modify: `apps/api/src/controllers/douyin-budget/index.test.ts`

- [ ] **Step 1: Write failing AI boundary tests**

```ts
expect(chat).toHaveBeenCalledWith(expect.objectContaining({
  sceneCode: "douyin_budget_explanation",
  responseFormat: "json_object",
  temperature: 0.2,
  source: "douyin_miniapp",
  billable: true,
}));

const prompt = JSON.stringify(chat.mock.calls[0]?.[0]?.messages);
expect(prompt).not.toContain("13800138000");
expect(prompt).not.toContain("详细地址");
expect(result.minimum_total).toBe(engineResult.minimum_total);
expect(result.maximum_total).toBe(engineResult.maximum_total);
```

Test malformed JSON, new amount fields, overlong text, cross-tenant estimate, expired estimate, repeated successful call, AI timeout and concurrent `pending` state.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/douyin-budget/ai-explanation.test.ts`

Expected: FAIL because the AI explanation service does not exist.

- [ ] **Step 3: Implement sanitized prompt and strict parser**

The system prompt must state that the model can only explain the supplied rule result and must return JSON. Before prompt construction, replace phone-number and exact-address patterns found inside the free-text demand with `[已脱敏]`. Allow only `summary`, `allocation_advice`, `risk_factors`, and `onsite_questions`; do not allow numeric price fields in the AI payload. Parse with the shared Zod schema and trim every string.

- [ ] **Step 4: Implement idempotent AI orchestration**

Atomically set `ai_claimed_at` and increment `ai_attempt_count` when the claim is absent or older than 60 seconds. Return saved analysis when `succeeded`; return a processing response when another request owns a live claim; mark `failed` with a stable code on AI errors. Permit one explicit retry from `failed` up to three total attempts. The HTTP response for AI failure must still include the deterministic estimate and `ai_status = failed`.

- [ ] **Step 5: Add the controller route**

```ts
fastify.post(
  "/douyin-mini/budget-estimates/:id/ai-analysis",
  this.generateAiAnalysis,
);
```

- [ ] **Step 6: Run focused and API tests**

Run: `bun test apps/api/src/services/douyin-budget/ai-explanation.test.ts apps/api/src/repositories/douyin-budget.test.ts apps/api/src/controllers/douyin-budget/index.test.ts`

Expected: PASS.

Run: `bun run api:check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/douyin-budget/ai-explanation.ts apps/api/src/services/douyin-budget/ai-explanation.test.ts apps/api/src/repositories/douyin-budget.ts apps/api/src/repositories/douyin-budget.test.ts apps/api/src/controllers/douyin-budget
git commit -m "feat(douyin): explain budgets with ai"
```

### Task 6: Add tenant pricing management APIs and admin UI

**Files:**
- Create: `apps/api/src/schema/tenant-douyin-budget.ts`
- Create: `apps/api/src/repositories/tenant-douyin-budget.ts`
- Create: `apps/api/src/repositories/tenant-douyin-budget.test.ts`
- Create: `apps/api/src/services/tenant-douyin-budget.ts`
- Create: `apps/api/src/services/tenant-douyin-budget.test.ts`
- Create: `apps/api/src/controllers/tenant-douyin-budget/index.ts`
- Create: `apps/api/src/controllers/tenant-douyin-budget/index.test.ts`
- Create: `apps/admin/app/(console)/douyin-miniapp/budget/page.tsx`
- Create: `apps/admin/components/douyin-miniapp/budget-pricing.tsx`
- Create: `apps/admin/components/douyin-miniapp/budget-pricing.test.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: Write failing management tests**

Test paginated version listing, draft creation, item replacement bounded to 100 items, activation with optimistic version, rejection of empty/inverted pricing, archiving the prior active version, permission `douyin_miniapp.manage`, and no direct mutation of active pricing.

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/api/src/services/tenant-douyin-budget.test.ts apps/api/src/controllers/tenant-douyin-budget/index.test.ts`

Expected: FAIL because the management modules do not exist.

- [ ] **Step 3: Implement management routes**

```text
GET  /tenant/douyin-miniapp/budget/pricing-versions?page=1&pageSize=20
POST /tenant/douyin-miniapp/budget/pricing-versions
PUT  /tenant/douyin-miniapp/budget/pricing-versions/:id/items
POST /tenant/douyin-miniapp/budget/pricing-versions/:id/activate
POST /tenant/douyin-miniapp/budget/pricing-versions/:id/archive
```

Use a database command for activation so old-version archive and new-version activation are atomic.

- [ ] **Step 4: Implement the admin page**

The page shows current active version, effective dates, disclaimer and a category/item editor. It must use human labels, yuan inputs converted to integer fen at the API boundary, validation summaries, a preview calculator and an activation confirmation dialog. It must not expose AI provider keys or internal rule expressions.

- [ ] **Step 5: Run API and admin checks**

Run: `bun test apps/api/src/repositories/tenant-douyin-budget.test.ts apps/api/src/services/tenant-douyin-budget.test.ts apps/api/src/controllers/tenant-douyin-budget/index.test.ts apps/admin/components/douyin-miniapp/budget-pricing.test.ts`

Expected: PASS.

Run: `bun run api:check && bun run admin:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/tenant-douyin-budget.ts apps/api/src/repositories/tenant-douyin-budget.ts apps/api/src/repositories/tenant-douyin-budget.test.ts apps/api/src/services/tenant-douyin-budget.ts apps/api/src/services/tenant-douyin-budget.test.ts apps/api/src/controllers/tenant-douyin-budget apps/api/src/routes/index.ts apps/admin/app/'(console)'/douyin-miniapp/budget apps/admin/components/douyin-miniapp/budget-pricing.tsx apps/admin/components/douyin-miniapp/budget-pricing.test.ts apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): manage douyin budget pricing"
```

### Task 7: Build the mini-program budget tab

**Files:**
- Create: `apps/douyin-mini/src/api/budget.ts`
- Create: `apps/douyin-mini/src/api/budget.test.ts`
- Create: `apps/douyin-mini/src/pages/budget/form-model.ts`
- Create: `apps/douyin-mini/src/pages/budget/form-model.test.ts`
- Create: `apps/douyin-mini/src/pages/budget/index.ts`
- Create: `apps/douyin-mini/src/pages/budget/index.json`
- Create: `apps/douyin-mini/src/pages/budget/index.ttml`
- Create: `apps/douyin-mini/src/pages/budget/index.ttss`
- Create: `apps/douyin-mini/src/assets/tabbar/budget.svg`
- Create: `apps/douyin-mini/src/assets/tabbar/budget-active.svg`
- Create: `apps/douyin-mini/src/assets/tabbar/budget.png`
- Create: `apps/douyin-mini/src/assets/tabbar/budget-active.png`
- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/app.json`
- Modify: `apps/douyin-mini/src/platform/navigation.ts`
- Modify: `apps/douyin-mini/src/platform/navigation.test.ts`
- Modify: `apps/douyin-mini/src/pages/home/index.ts`
- Modify: `apps/douyin-mini/src/pages/home/index.ttml`

- [ ] **Step 1: Write failing API and form-model tests**

Test strict config parsing, estimate/result parsing, AI states, invalid/inverted ranges, area validation, option de-duplication and form-to-request mapping.

```ts
expect(buildEstimateRequest({
  areaText: "110",
  propertyCondition: "rough",
  decorationTier: "comfortable",
  decorationScope: "whole_house",
  selectedOptions: ["custom_cabinet", "custom_cabinet"],
  demand: "  需要收纳  ",
})).toEqual({
  area: 110,
  property_condition: "rough",
  decoration_tier: "comfortable",
  decoration_scope: "whole_house",
  option_codes: ["custom_cabinet"],
  demand: "需要收纳",
});
```

- [ ] **Step 2: Run and verify failure**

Run: `bun test apps/douyin-mini/src/api/budget.test.ts apps/douyin-mini/src/pages/budget/form-model.test.ts`

Expected: FAIL because modules are absent.

- [ ] **Step 3: Implement the API client and state machine**

The page states are `loading_config`, `ready`, `calculating`, `result`, and `unavailable`. On calculate, show the deterministic result immediately, then invoke AI analysis and update only the AI section. Preserve form and result when AI fails.

- [ ] **Step 4: Implement the accessible UI**

Render area input, radio-style condition/tier/scope options, optional items, demand textarea, result category cards, included/excluded explanation, disclaimer, AI status and a CTA that opens the lead tab with the estimate UUID, public estimate number and displayed range in transient storage. Only the public number is rendered.

- [ ] **Step 5: Replace the sites tab with budget**

Add `pages/budget/index` to pages and tab bar, remove `pages/sites/index` from tab bar but keep it in pages for old deep links. Use calculator-specific normal/active icons rendered as 81×81 PNGs from the committed SVG sources.

Use a 24×24 calculator outline in `budget.svg` with stroke `#625F5B` and the same path in `budget-active.svg` with stroke `#191817`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#625F5B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <rect x="4" y="2.5" width="16" height="19" rx="2"/>
  <path d="M7 6.5h10v3H7zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/>
</svg>
```

Render both PNGs with the already installed `sharp` dependency:

```bash
bun -e 'import sharp from "sharp"; for (const name of ["budget", "budget-active"]) await sharp(`apps/douyin-mini/src/assets/tabbar/${name}.svg`).resize(81,81).png().toFile(`apps/douyin-mini/src/assets/tabbar/${name}.png`)'
```

Expected: both PNGs are 81×81 and load in the Douyin simulator.

- [ ] **Step 6: Run mini-program checks**

Run: `bun run douyin-mini:check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/douyin-mini/src
git commit -m "feat(douyin-mini): add budget estimate tab"
```

### Task 8: Verify the budget slice end to end

**Files:**
- Modify only files already in this plan when a failing check demonstrates a root cause.

- [ ] **Step 1: Configure one reviewed active pricing version**

Use the tenant admin page to create a draft for 固始晴天装饰工程有限公司, enter company-approved local price ranges, preview the 100㎡ comfortable/rough/whole-house scenario, and activate it. Do not invent prices in code or migration.

- [ ] **Step 2: Run full checks**

Run: `bun run api:check && bun run admin:check && bun run douyin-mini:check`

Expected: PASS.

- [ ] **Step 3: Run API smoke**

Verify config retrieval, deterministic estimate creation, repeated identical calculation consistency, AI success, AI failure fallback, cross-tenant estimate rejection and anonymous access without phone.

- [ ] **Step 4: Verify migration alignment**

Run: `supabase migration list`

Expected: Local/Remote `20260820110000` align.

- [ ] **Step 5: Commit verified corrections if necessary**

Stage only the files changed to fix a reproduced verification failure and use:

```bash
git commit -m "fix(douyin): harden budget estimate flow"
```
