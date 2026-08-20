# Douyin Unified Project Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicate case/site presentation with one tenant-safe, paginated “项目实景” experience backed by a single published project profile.

**Architecture:** Add one public-profile table keyed by tenant and project, expose unified project list/detail/log endpoints through the existing Douyin controller/service/repository layers, and keep old case/site routes as compatibility adapters. Reuse the current cases page as the unified tab, keep legacy site routes non-tabbed during migration, and add tenant-admin controls for publishing sanitized project content.

**Tech Stack:** Bun, TypeScript, Fastify, Zod 4, Supabase/PostgreSQL migrations, Next.js 15, React 19, Douyin mini-program TTML/TTSS.

**Execution order:** Run this plan first. The budget plan reuses its unified tab/navigation structure; the release-readiness plan assumes its public-profile facts exist.

---

## File structure

Create:

- `packages/domain/src/douyin-public-project.ts` — shared phase and publication contracts.
- `supabase/migrations/20260820100000_create_douyin_project_public_profiles.sql` — table, indexes, RLS, grants, and rollback notes.
- `apps/api/src/schema/tenant-douyin-projects.ts` — tenant-admin list/update schemas.
- `apps/api/src/schema/tenant-douyin-projects.test.ts` — strict pagination and update schema tests.
- `apps/api/src/repositories/tenant-douyin-projects.ts` — tenant-admin project publication queries.
- `apps/api/src/services/tenant-douyin-projects.ts` — authorization and update orchestration.
- `apps/api/src/controllers/tenant-douyin-projects/index.ts` — paginated tenant-admin routes.
- `apps/admin/app/(console)/douyin-miniapp/projects/page.tsx` — project-publication page.
- `apps/admin/components/douyin-miniapp/project-publication.tsx` — list and edit UI.
- `apps/admin/components/douyin-miniapp/project-publication.test.ts` — display/contract tests.
- `apps/douyin-mini/src/api/projects.ts` — unified public project client.
- `apps/douyin-mini/src/api/projects.test.ts` — client validation tests.
- `apps/douyin-mini/src/pages/cases/project-phase.ts` — filter state and phase presentation.
- `apps/douyin-mini/src/pages/cases/project-phase.test.ts` — phase presentation tests.

Modify:

- `packages/domain/src/shared.ts` — export shared project contracts.
- `apps/api/src/types/database.ts` — regenerate after migration.
- `apps/api/src/schema/douyin-miniapp.ts` — unified list query and public ID schemas.
- `apps/api/src/repositories/douyin-miniapp-content.ts` — one profile-backed project query.
- `apps/api/src/repositories/douyin-miniapp-content.test.ts` — query shape, pagination, tenant isolation.
- `apps/api/src/services/douyin-miniapp/content.ts` — one mapper and compatibility adapters.
- `apps/api/src/services/douyin-miniapp/content.test.ts` — phase mapping and redaction.
- `apps/api/src/controllers/douyin-miniapp/index.ts` — register unified routes.
- `apps/api/src/controllers/douyin-miniapp/index.test.ts` — route delegation contract.
- `apps/api/src/routes/index.ts` — register tenant project controller.
- `apps/douyin-mini/src/models/index.ts` — add `phase` and unified bootstrap fields.
- `apps/douyin-mini/src/api/content-validation.ts` — validate phase-aware responses.
- `apps/douyin-mini/src/api/content.test.ts` — reject malformed project DTOs.
- `apps/douyin-mini/src/pages/cases/index.ts` — unified list and filters.
- `apps/douyin-mini/src/pages/cases/index.ttml` — “全部 / 施工中 / 已完工”.
- `apps/douyin-mini/src/pages/cases/index.ttss` — filter styling.
- `apps/douyin-mini/src/pages/case-detail/index.ts` — unified detail/log loading.
- `apps/douyin-mini/src/pages/case-detail/index.ttml` — phase-aware detail.
- `apps/douyin-mini/src/pages/home/index.ts` — one featured project collection.
- `apps/douyin-mini/src/pages/home/index.ttml` — remove duplicate project sections.
- `apps/douyin-mini/src/app.json` — label the cases tab “项目实景” and remove sites from tab bar in the budget plan.
- `apps/douyin-mini/src/platform/navigation.ts` — route all project selections to unified detail.
- `apps/douyin-mini/src/platform/navigation.test.ts` — unified project navigation.
- `apps/admin/components/layout/menu-config.ts` — add project-publication entry under Douyin workspace.

### Task 1: Define shared project publication contracts

**Files:**
- Create: `packages/domain/src/douyin-public-project.ts`
- Modify: `packages/domain/src/shared.ts`
- Test: `packages/domain/src/douyin-public-project.test.ts`

- [ ] **Step 1: Write the failing domain test**

```ts
import { describe, expect, test } from "bun:test";
import {
  DOUYIN_PROJECT_PHASE_VALUES,
  DOUYIN_PROJECT_PUBLICATION_STATUS_VALUES,
  toDouyinProjectPhase,
} from "./douyin-public-project";

describe("douyin public project", () => {
  test("maps only public lifecycle phases", () => {
    expect(DOUYIN_PROJECT_PHASE_VALUES).toEqual(["in_progress", "completed"]);
    expect(DOUYIN_PROJECT_PUBLICATION_STATUS_VALUES).toEqual([
      "draft", "published", "hidden",
    ]);
    expect(toDouyinProjectPhase("started")).toBe("in_progress");
    expect(toDouyinProjectPhase("constructing")).toBe("in_progress");
    expect(toDouyinProjectPhase("acceptance")).toBe("completed");
    expect(toDouyinProjectPhase("pending_start")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun test packages/domain/src/douyin-public-project.test.ts`

Expected: FAIL because `./douyin-public-project` does not exist.

- [ ] **Step 3: Implement the contract**

```ts
export const DOUYIN_PROJECT_PHASE_VALUES = ["in_progress", "completed"] as const;
export type DouyinProjectPhase = (typeof DOUYIN_PROJECT_PHASE_VALUES)[number];

export const DOUYIN_PROJECT_PUBLICATION_STATUS_VALUES = [
  "draft", "published", "hidden",
] as const;
export type DouyinProjectPublicationStatus =
  (typeof DOUYIN_PROJECT_PUBLICATION_STATUS_VALUES)[number];

export function toDouyinProjectPhase(status: string | null | undefined): DouyinProjectPhase | null {
  if (status === "started" || status === "constructing") return "in_progress";
  if (status === "acceptance") return "completed";
  return null;
}
```

Export the constants, types, and mapper from `packages/domain/src/shared.ts`.

- [ ] **Step 4: Run the test and domain consumer verification**

Run: `bun test packages/domain/src/douyin-public-project.test.ts packages/domain/src/shared.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/douyin-public-project.ts packages/domain/src/douyin-public-project.test.ts packages/domain/src/shared.ts
git commit -m "feat(domain): add douyin public project contract"
```

### Task 2: Create the public project profile migration

**Files:**
- Create: `supabase/migrations/20260820100000_create_douyin_project_public_profiles.sql`
- Create: `apps/api/src/services/douyin-miniapp/public-project-profile-migration-contract.test.ts`
- Modify: `apps/api/src/types/database.ts`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { describe, expect, test } from "bun:test";

const path = new URL(
  "../../../../../supabase/migrations/20260820100000_create_douyin_project_public_profiles.sql",
  import.meta.url,
);

describe("douyin public project profile migration", () => {
  test("enforces tenant ownership, publication state and private writes", async () => {
    const sql = await Bun.file(path).text();
    expect(sql).toContain("CREATE TABLE public.douyin_project_public_profiles");
    expect(sql).toContain("UNIQUE (tenant_id, project_id)");
    expect(sql).toContain("publication_status IN ('draft', 'published', 'hidden')");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON TABLE public.douyin_project_public_profiles");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `bun test apps/api/src/services/douyin-miniapp/public-project-profile-migration-contract.test.ts`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Write the migration**

Create the table with UUID primary key, `tenant_id` and `project_id` foreign keys, non-blank public title/description checks, `public_image_urls text[]`, `style_tags text[]`, optional `budget_band`, publication state, timestamps, unique `(tenant_id, project_id)`, and a trigger that rejects rows where the referenced project belongs to another tenant. Require HTTPS image URLs, at most 30 selected images and no duplicate URL. Add indexes for `(tenant_id, publication_status, updated_at desc)` and `(tenant_id, project_id)`. Enable RLS, revoke direct access from public/anon/authenticated, and grant service-role access.

The migration header must include a forward rollback: disable new public-project writes, retain compatibility routes, then drop policies/triggers/indexes/table only after confirming no released client depends on it.

- [ ] **Step 4: Run the migration contract test**

Run: `bun test apps/api/src/services/douyin-miniapp/public-project-profile-migration-contract.test.ts`

Expected: PASS.

- [ ] **Step 5: Dry-run and apply the migration**

Run: `/bin/zsh -lc 'set -a && source .env && set +a && supabase db push --dry-run --db-url "$SUPABASE_DB_DIRECT_URL"'`

Expected: only `20260820100000_create_douyin_project_public_profiles.sql` plus previously approved pending migrations are listed. Stop if any unexpected migration appears.

Run after review: `/bin/zsh -lc 'set -a && source .env && set +a && supabase db push --db-url "$SUPABASE_DB_DIRECT_URL"'`

Expected: migration applies successfully.

Run: `supabase migration list`

Expected: Local and Remote entries for `20260820100000` align.

- [ ] **Step 6: Regenerate database types and verify**

Run: `bun run gen`

Expected: `apps/api/src/types/database.ts` contains `douyin_project_public_profiles`.

Run: `bun run api:typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260820100000_create_douyin_project_public_profiles.sql apps/api/src/services/douyin-miniapp/public-project-profile-migration-contract.test.ts apps/api/src/types/database.ts
git commit -m "feat(douyin): add public project profiles"
```

### Task 3: Replace case/site repository reads with one project feed

**Files:**
- Modify: `apps/api/src/repositories/douyin-miniapp-content.ts`
- Modify: `apps/api/src/repositories/douyin-miniapp-content.test.ts`

- [ ] **Step 1: Add failing repository tests**

Add tests proving that `listProjects({ tenantId, phase, page, pageSize })`:

```ts
expect(select).toHaveBeenCalledWith(expect.stringContaining("public_profile:douyin_project_public_profiles!inner"), { count: "exact" });
expect(eq).toHaveBeenCalledWith("public_profile.publication_status", "published");
expect(range).toHaveBeenCalledWith(20, 39);
```

Also assert that `phase = in_progress` uses `started/constructing`, `phase = completed` uses `acceptance`, selected fields exclude customer/phone/address, and the public DTO uses the explicitly selected `public_image_urls` rather than exposing every internal project-log image.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `bun test apps/api/src/repositories/douyin-miniapp-content.test.ts`

Expected: FAIL because `listProjects` and the profile join do not exist.

- [ ] **Step 3: Implement the unified repository methods**

Expose:

```ts
listProjects(input: {
  tenantId: string;
  phase?: "in_progress" | "completed";
  page: number;
  pageSize: number;
}): Promise<{ rows: DouyinContentProject[]; count: number }>;

findProject(input: { tenantId: string; id: string }): Promise<DouyinContentProject | null>;
```

Join the public profile with `!inner`, require `publication_status = published`, apply status filters server-side, order by `updated_at desc`, and use `.range()`. Update `PROJECT_SELECT` and Zod schemas to read only public profile fields, including its selected public images, plus the minimum project/property facts.

- [ ] **Step 4: Keep compatibility methods as thin adapters**

`listCases`, `listSites`, `findCase`, and `findSite` must call the unified methods. They must not build independent Supabase queries.

- [ ] **Step 5: Run repository tests**

Run: `bun test apps/api/src/repositories/douyin-miniapp-content.test.ts`

Expected: PASS with pagination, phase and isolation assertions.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repositories/douyin-miniapp-content.ts apps/api/src/repositories/douyin-miniapp-content.test.ts
git commit -m "refactor(douyin): unify public project queries"
```

### Task 4: Add unified public service and routes

**Files:**
- Modify: `apps/api/src/schema/douyin-miniapp.ts`
- Modify: `apps/api/src/services/douyin-miniapp/content.ts`
- Modify: `apps/api/src/services/douyin-miniapp/content.test.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.test.ts`

- [ ] **Step 1: Write failing schema/service tests**

Test that:

```ts
expect(DouyinProjectListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
expect(DouyinProjectListQuerySchema.parse({ phase: "completed" }).phase).toBe("completed");
expect(() => DouyinProjectListQuerySchema.parse({ pageSize: 101 })).toThrow();
```

Add service expectations that public `title`, `description`, `style_tags`, and `budget_band` come from the public profile, `phase` comes from project status, and no internal project name or address is returned.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `bun test apps/api/src/services/douyin-miniapp/content.test.ts apps/api/src/controllers/douyin-miniapp/index.test.ts`

Expected: FAIL because unified schema/methods/routes are absent.

- [ ] **Step 3: Implement service methods**

Add `listProjects`, `getProject`, and `listProjectLogs`. Use `toDouyinProjectPhase` and throw a public not-found error if the status has no public phase. The DTO shape must include:

```ts
{
  id: string;
  title: string;
  phase: "in_progress" | "completed";
  cover_image_url: string | null;
  public_images: string[];
  style_tags: string[];
  layout: string | null;
  area: number | null;
  budget_band: string | null;
  community: string;
  city: string | null;
  district: string | null;
  start_date: string | null;
  updated_at: string;
  description: string;
}
```

Extend bootstrap with `content.featured_projects`, populated from the same unified service and de-duplicated by project ID. Keep the existing `featured_cases` and `active_sites` fields during the compatibility window so already released clients continue to parse bootstrap.

- [ ] **Step 4: Register controller routes**

```ts
fastify.get("/douyin-mini/projects", this.listProjects);
fastify.get("/douyin-mini/projects/:id", this.getProject);
fastify.get("/douyin-mini/projects/:id/logs", this.listProjectLogs);
```

Parse all request parts with Zod and wrap results with `ResponseHandler.success`.

- [ ] **Step 5: Run focused and type checks**

Run: `bun test apps/api/src/services/douyin-miniapp/content.test.ts apps/api/src/controllers/douyin-miniapp/index.test.ts`

Expected: PASS.

Run: `bun run api:typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/douyin-miniapp.ts apps/api/src/services/douyin-miniapp/content.ts apps/api/src/services/douyin-miniapp/content.test.ts apps/api/src/controllers/douyin-miniapp/index.ts apps/api/src/controllers/douyin-miniapp/index.test.ts
git commit -m "feat(douyin): expose unified public projects"
```

### Task 5: Add tenant project-publication APIs

**Files:**
- Create: `apps/api/src/schema/tenant-douyin-projects.ts`
- Create: `apps/api/src/schema/tenant-douyin-projects.test.ts`
- Create: `apps/api/src/repositories/tenant-douyin-projects.ts`
- Create: `apps/api/src/repositories/tenant-douyin-projects.test.ts`
- Create: `apps/api/src/services/tenant-douyin-projects.ts`
- Create: `apps/api/src/services/tenant-douyin-projects.test.ts`
- Create: `apps/api/src/controllers/tenant-douyin-projects/index.ts`
- Create: `apps/api/src/controllers/tenant-douyin-projects/index.test.ts`
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Step 1: Write failing schema and service tests**

Define a paginated list query and strict update body:

```ts
{
  public_title: string;          // 2..100
  public_description: string;    // 20..2000
  public_image_urls: string[];   // 3..30 when published, HTTPS only
  style_tags: string[];          // 0..8, each 1..40
  budget_band?: string | null;   // max 80
  publication_status: "draft" | "published" | "hidden";
}
```

Tests must assert `douyin_miniapp.manage`, tenant scoping, no client-supplied tenant ID, page defaults, maximum page size, and rejection of `published` when title/description/image requirements are not satisfied.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `bun test apps/api/src/schema/tenant-douyin-projects.test.ts apps/api/src/services/tenant-douyin-projects.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement repository, service and controller**

Routes:

```text
GET   /tenant/douyin-miniapp/projects?page=1&pageSize=20&publicationStatus=published
PATCH /tenant/douyin-miniapp/projects/:projectId/publication
```

The list uses `.range()` and necessary fields only. The update service verifies project ownership, validates that selected image URLs belong to a bounded set of images attached to that project, and prevents publication with fewer than three selected public images. Repository errors use `Errors.dbError`; business failures use stable `Errors.business` codes.

- [ ] **Step 4: Register and test real routes**

Add the controller import and `registerExtraRoutes(app)` call to `apps/api/src/routes/index.ts`. Controller tests must assert Zod failure occurs before service delegation and success is wrapped.

- [ ] **Step 5: Run focused and API checks**

Run: `bun test apps/api/src/repositories/tenant-douyin-projects.test.ts apps/api/src/services/tenant-douyin-projects.test.ts apps/api/src/controllers/tenant-douyin-projects/index.test.ts`

Expected: PASS.

Run: `bun run api:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/schema/tenant-douyin-projects.ts apps/api/src/repositories/tenant-douyin-projects.ts apps/api/src/repositories/tenant-douyin-projects.test.ts apps/api/src/services/tenant-douyin-projects.ts apps/api/src/services/tenant-douyin-projects.test.ts apps/api/src/controllers/tenant-douyin-projects apps/api/src/routes/index.ts
git commit -m "feat(douyin): manage public project profiles"
```

### Task 6: Build the unified mini-program project experience

**Files:**
- Create: `apps/douyin-mini/src/api/projects.ts`
- Create: `apps/douyin-mini/src/api/projects.test.ts`
- Create: `apps/douyin-mini/src/pages/cases/project-phase.ts`
- Create: `apps/douyin-mini/src/pages/cases/project-phase.test.ts`
- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/api/content-validation.ts`
- Modify: `apps/douyin-mini/src/api/content.test.ts`
- Modify: `apps/douyin-mini/src/pages/cases/index.ts`
- Modify: `apps/douyin-mini/src/pages/cases/index.ttml`
- Modify: `apps/douyin-mini/src/pages/cases/index.ttss`
- Modify: `apps/douyin-mini/src/pages/case-detail/index.ts`
- Modify: `apps/douyin-mini/src/pages/case-detail/index.ttml`
- Modify: `apps/douyin-mini/src/pages/home/index.ts`
- Modify: `apps/douyin-mini/src/pages/home/index.ttml`
- Modify: `apps/douyin-mini/src/platform/navigation.ts`
- Modify: `apps/douyin-mini/src/platform/navigation.test.ts`
- Modify: `apps/douyin-mini/src/app.json`

- [ ] **Step 1: Write failing client parsing tests**

```ts
expect(parseProject({ ...validProject, phase: "in_progress" })?.phase)
  .toBe("in_progress");
expect(parseProject({ ...validProject, phase: "unknown" })).toBeNull();
```

Test `fetchProjects` query validation, pagination echo checks, detail ID checks and logs pagination.

- [ ] **Step 2: Run tests and verify failure**

Run: `bun test apps/douyin-mini/src/api/projects.test.ts apps/douyin-mini/src/api/content.test.ts`

Expected: FAIL because unified project API and phase parsing are absent.

- [ ] **Step 3: Implement API/model changes**

Add `phase: "in_progress" | "completed"` to `PublicProject` and add `content.featured_projects` to `BootstrapData` while tolerating the compatibility fields. Implement `fetchProjects`, `fetchProjectDetail`, and `fetchProjectLogs` against the new routes. Keep old modules until compatibility removal is separately approved.

- [ ] **Step 4: Implement list and detail behavior**

The cases page becomes “项目实景”, with one state machine:

```ts
type ProjectFilter = "all" | "in_progress" | "completed";
const phase = filter === "all" ? undefined : filter;
```

Changing filter resets page, items and pagination. The detail page always loads the unified project endpoint and loads progress logs only when `phase === "in_progress"`.

- [ ] **Step 5: Remove duplicate home presentation**

Replace `featuredCases` and `activeSites` UI state with `featuredProjects`. Show one “项目实景” section with a phase badge and one CTA to the project tab. Do not render the same project ID twice.

- [ ] **Step 6: Update navigation and tab label**

Set the existing cases tab text to “项目实景”. Route both legacy case/site selections to `pages/case-detail/index?id=...` during compatibility. Keep the sites page in `pages` so old deep links do not break, but stop presenting it as a primary tab after the budget tab is added in the next plan.

- [ ] **Step 7: Run mini-program checks**

Run: `bun run douyin-mini:check`

Expected: all Bun tests and TypeScript checks PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/douyin-mini/src
git commit -m "feat(douyin-mini): unify project showcase"
```

### Task 7: Add tenant-admin project publication UI

**Files:**
- Create: `apps/admin/app/(console)/douyin-miniapp/projects/page.tsx`
- Create: `apps/admin/components/douyin-miniapp/project-publication.tsx`
- Create: `apps/admin/components/douyin-miniapp/project-publication.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [ ] **Step 1: Write failing UI contract tests**

Test that the component exposes readable fields rather than IDs, shows publication status, image count and project phase, disables publish below three images, and paginates at 20 rows.

```ts
expect(source).toContain("项目实景内容");
expect(source).toContain("publication_status");
expect(source).not.toContain("手工输入项目 ID");
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `bun test apps/admin/components/douyin-miniapp/project-publication.test.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the page using existing admin primitives**

Use existing `Button`, `Card`, `Dialog`, `Input`, `Textarea`, table and pagination components. Fetch the tenant endpoints server-side for initial data, then use a focused client component for editing. Display title, phase, image count, completeness warnings and publication state.

- [ ] **Step 4: Add navigation under the Douyin workspace**

Add `/douyin-miniapp/projects` with label “项目实景内容” and permission `douyin_miniapp.manage`.

- [ ] **Step 5: Run admin checks**

Run: `bun test apps/admin/components/douyin-miniapp/project-publication.test.ts`

Expected: PASS.

Run: `bun run admin:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/'(console)'/douyin-miniapp/projects apps/admin/components/douyin-miniapp/project-publication.tsx apps/admin/components/douyin-miniapp/project-publication.test.ts apps/admin/components/layout/menu-config.ts
git commit -m "feat(admin): manage douyin project publication"
```

### Task 8: Verify the project-content slice end to end

**Files:**
- Modify only if a verification failure identifies a root cause in files already listed above.

- [ ] **Step 1: Run focused tests**

Run: `bun test packages/domain/src/douyin-public-project.test.ts apps/api/src/repositories/douyin-miniapp-content.test.ts apps/api/src/services/douyin-miniapp/content.test.ts apps/api/src/controllers/douyin-miniapp/index.test.ts apps/douyin-mini/src/api/projects.test.ts apps/douyin-mini/src/api/content.test.ts apps/douyin-mini/src/pages/cases/project-phase.test.ts apps/admin/components/douyin-miniapp/project-publication.test.ts`

Expected: PASS.

- [ ] **Step 2: Run package checks**

Run: `bun run api:check`

Expected: PASS.

Run: `bun run douyin-mini:check`

Expected: PASS.

Run: `bun run admin:check`

Expected: PASS.

- [ ] **Step 3: Verify database migration alignment**

Run: `supabase migration list`

Expected: `20260820100000` is aligned Local/Remote.

- [ ] **Step 4: Browser/simulator smoke**

Verify the home page contains one project section, filters reset pagination, details never expose internal names/addresses, progress logs appear only for in-progress projects, and legacy site deep links still reach a valid detail.

- [ ] **Step 5: Stop on any smoke failure**

If smoke fails, record the failing route, project ID, response code and console message, then invoke `systematic-debugging` before changing implementation. After the root-cause fix is committed in the affected task, repeat Steps 1–4 until all checks pass.
