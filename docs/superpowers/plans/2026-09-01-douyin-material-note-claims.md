# Douyin Material Note Claims Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为装企自建抖音小程序提供结构化文本资料的创建、版本发布、免手机号领取、我的资料、复制和聚合统计能力，并保持租户、匿名主体、权限及隐私边界完整。

**Architecture:** 新建独立的租户资料域，数据库通过 migration 提供资料、不可变版本、领取、命令幂等账本及原子 RPC；API 严格按 controller/service/repository 分层；装企后台复用现有内容块编辑器；抖音小程序通过现有匿名会话领取并读取锁定版本。资料领取与营销线索、短信及量房预约完全解耦。

**Tech Stack:** Bun、TypeScript、Fastify、Zod、Supabase/PostgreSQL、Next.js、shadcn/Radix、Tailwind、抖音原生 TTML/TTSS、Bun Test。

---

## File structure map

### Shared domain

- Create `packages/domain/src/douyin-material-note.ts`: statuses, narrowed text-block schemas, API DTO schemas, pagination schemas, event and error constants.
- Create `packages/domain/src/douyin-material-note.test.ts`: schema boundary, response redaction and state-value tests.
- Modify `packages/domain/src/douyin-miniapp.ts`: append material entry paths and marketing event names.
- Modify `packages/domain/src/douyin-miniapp.test.ts`: lock entry-path and event allowlists.
- Modify `packages/domain/src/permission.ts`: add read/manage/publish permission definitions and labels.
- Modify `packages/domain/src/permission.test.ts`: lock permission catalog and implied UI behavior.
- Modify `packages/domain/src/index.ts`: export the new domain module.

### Database and generated types

- Create `supabase/migrations/20260901120000_create_douyin_material_notes.sql`: tables, constraints, indexes, permission seed, event constraint update, atomic RPCs and grants.
- Create `apps/api/src/services/douyin-miniapp/material-note-migration-contract.test.ts`: migration source contract for tenant FKs, indexes, RPC atomicity and permission grants.
- Modify `apps/api/src/types/database.ts`: regenerate Supabase types only after the approved database migration is applied to the linked environment.

### API

- Create `apps/api/src/schema/douyin-material-notes.ts`: public query/params/response validation.
- Create `apps/api/src/schema/douyin-material-notes.test.ts`: public schema pagination, redaction and empty-command tests.
- Create `apps/api/src/schema/tenant-douyin-material-notes.ts`: tenant admin query, create/version and command validation.
- Create `apps/api/src/schema/tenant-douyin-material-notes.test.ts`: tenant schema and idempotency-header tests.
- Create `apps/api/src/repositories/douyin-material-notes.ts`: necessary-column selects and typed RPC gateway.
- Create `apps/api/src/repositories/douyin-material-notes.test.ts`: query shape, stable pagination, parsing and RPC argument tests.
- Create `apps/api/src/services/douyin-miniapp/material-note-context.ts`: resolve the authenticated installation, tenant and subject hash without accepting client-supplied identity.
- Create `apps/api/src/services/douyin-miniapp/material-notes.ts`: public discovery, preview, claim, owned detail, remove and clear orchestration.
- Create `apps/api/src/services/douyin-miniapp/material-notes.test.ts`: tenant/subject isolation, redaction, version-lock and status semantics.
- Create `apps/api/src/services/tenant-douyin-material-notes.ts`: tenant list, detail, versions and state-command orchestration.
- Create `apps/api/src/services/tenant-douyin-material-notes.test.ts`: permissions, transition conflicts, idempotency and aggregate-only behavior.
- Create `apps/api/src/controllers/tenant-douyin-material-notes/index.ts`: tenant HTTP routes.
- Create `apps/api/src/controllers/tenant-douyin-material-notes/index.test.ts`: exact route inventory and header/body validation.
- Modify `apps/api/src/controllers/douyin-miniapp/index.ts`: register the seven public material routes.
- Modify `apps/api/src/controllers/douyin-miniapp/index.test.ts`: lock public route inventory and response wrapping.
- Modify `apps/api/src/routes/index.ts`: register the tenant controller.
- Modify `apps/api/src/plugins/auth/legacy/douyin-routes.ts`: cover material routes under the existing mini-session policy without adding an auth bypass.
- Modify `apps/api/src/plugins/auth/legacy-plugin-douyin.test.ts`: prove material routes require a valid mini session.
- Modify `apps/api/src/services/tenant-service-capability-map.test.ts`: classify the new `/tenant` routes through the existing `not_trial_capability` exclusion.
- Modify `apps/api/src/schema/douyin-miniapp.ts`: permit client-writable material analytics except server-only claim.
- Modify `apps/api/src/services/douyin-miniapp/marketing.ts`: update the client event allowlist.
- Modify `apps/api/src/services/douyin-miniapp/marketing.test.ts`: reject forged `material_claim` and accept the other material events.

### Tenant admin

- Modify `apps/admin/components/layout/menu-config.ts`: add the “资料笔记” entry under “抖音小程序”.
- Modify `apps/admin/components/site-content/site-content-block-editor.tsx`: add an optional allowed-block-types input whose default preserves current site-content behavior.
- Create `apps/admin/components/douyin-miniapp/material-note-contract.ts`: strict client-side parsing and presentation types.
- Create `apps/admin/components/douyin-miniapp/material-note-contract.test.ts`: response and form boundary tests.
- Create `apps/admin/components/douyin-miniapp/material-note-api.ts`: authenticated backend calls, pagination and idempotency headers.
- Create `apps/admin/components/douyin-miniapp/material-note-api.test.ts`: request URL, payload and header tests.
- Create `apps/admin/components/douyin-miniapp/material-note-table.tsx`: paginated/filterable aggregate-only list.
- Create `apps/admin/components/douyin-miniapp/material-note-editor.tsx`: create/version editor and mini preview.
- Create `apps/admin/components/douyin-miniapp/material-note-actions.tsx`: publish/archive/withdraw confirmations.
- Create `apps/admin/app/(console)/douyin-miniapp/materials/page.tsx`: list page.
- Create `apps/admin/app/(console)/douyin-miniapp/materials/new/page.tsx`: create page.
- Create `apps/admin/app/(console)/douyin-miniapp/materials/[id]/page.tsx`: detail, version history and actions.
- Create `apps/admin/components/douyin-miniapp/material-note-ui.test.tsx`: permission and state-action matrix tests.

### Douyin mini-program

- Modify `apps/douyin-mini/src/app.json`: register three pages without changing the four-item tab bar.
- Modify `apps/douyin-mini/src/models/index.ts`: material DTOs and entry-path types.
- Create `apps/douyin-mini/src/api/materials.ts`: strict API client and parsers.
- Create `apps/douyin-mini/src/api/materials.test.ts`: redaction, pagination and error-code tests.
- Modify `apps/douyin-mini/src/platform/navigation.ts`: material list/detail/my-material routes.
- Modify `apps/douyin-mini/src/platform/navigation.test.ts`: navigation allowlist and encoded ID tests.
- Create `apps/douyin-mini/src/platform/clipboard.ts`: Promise wrapper for `tt.setClipboardData`.
- Create `apps/douyin-mini/src/platform/clipboard.test.ts`: success/failure adapter tests.
- Create `apps/douyin-mini/src/components/material-card/index.{ts,json,ttml,ttss}`: shared preview card.
- Create `apps/douyin-mini/src/pages/materials/index.{ts,json,ttml,ttss}` and `page-model.{ts,test.ts}`: search and pagination.
- Create `apps/douyin-mini/src/pages/material-detail/index.{ts,json,ttml,ttss}` and `page-model.{ts,test.ts}`: preview, claim, locked-version body and conversion CTAs.
- Create `apps/douyin-mini/src/pages/my-materials/index.{ts,json,ttml,ttss}` and `page-model.{ts,test.ts}`: owned list, remove and clear.
- Modify `apps/douyin-mini/src/pages/home/index.{ts,ttml,ttss,json}`: optional recent-material module with at most four items.
- Modify `apps/douyin-mini/src/pages/privacy/index.ttml`: explain claim history, no automatic lead, remove/clear distinction and deletion request channel.
- Modify `apps/douyin-mini/src/platform/analytics.ts`: client material event allowlist.
- Modify `apps/douyin-mini/src/platform/analytics.test.ts`: material event acceptance and server-only claim rejection.
- Modify `apps/douyin-mini/src/ui-contracts.test.ts`: lock page registration, home entry and privacy text.

### Documentation and rollout

- Create `docs/miniprogram/2026-09-01-douyin-material-note-claims-handoff.md`: client contract, field mapping, state/error matrix, smoke evidence and release gates.
- Modify `docs/superpowers/specs/2026-09-01-douyin-material-note-claim-design.md` only if implementation exposes a confirmed contract correction; record the correction before continuing implementation.

## Contract invariants

- Public routes are exactly:
  - `GET /douyin-mini/material-notes?page=1&pageSize=20&keyword=`
  - `GET /douyin-mini/material-notes/:id`
  - `POST /douyin-mini/material-notes/:id/claim`
  - `GET /douyin-mini/my-material-notes?page=1&pageSize=20`
  - `GET /douyin-mini/my-material-notes/:claimId`
  - `POST /douyin-mini/my-material-notes/:claimId/remove`
  - `POST /douyin-mini/my-material-notes/clear`
- Tenant routes are exactly:
  - `GET /tenant/douyin-material-notes?page=1&pageSize=20&status=&keyword=`
  - `POST /tenant/douyin-material-notes`
  - `GET /tenant/douyin-material-notes/:id`
  - `GET /tenant/douyin-material-notes/:id/versions?page=1&pageSize=20`
  - `POST /tenant/douyin-material-notes/:id/versions`
  - `POST /tenant/douyin-material-notes/:id/publish`
  - `POST /tenant/douyin-material-notes/:id/archive`
  - `POST /tenant/douyin-material-notes/:id/withdraw`
- Every list defaults to `page=1&pageSize=20`, caps `pageSize` at 100, filters before pagination, selects only necessary columns and orders by timestamp descending then ID descending.
- Only `published` notes can be discovered or newly claimed. `archived` notes disappear from discovery but retain locked content for active owners. `withdrawn` notes return no content to anyone.
- The server derives tenant, installation, AppID and subject hash from the authenticated session. These values are never accepted from a mini-program request and `subject_hash` is never returned or logged.
- Preview responses contain no `content_blocks`. Claim and owned-detail responses contain only the exact immutable version owned by the current subject.
- Claim, remove and clear accept no business body. Publish/archive/withdraw require a UUID `Idempotency-Key`; repeat keys replay only byte-equivalent canonical command parameters.
- Claim never creates a phone identity, SMS code, marketing lead or measurement appointment. Budget and measurement remain explicit post-claim navigation actions.
- All database objects and initialization data are delivered by migration. No implementation step may repair a remote database with manual DDL/DML.
- No remote migration, deployment, config mutation, template upload, audit submission or publication occurs without explicit environment-specific approval.

## Task 1: Lock shared contracts and permissions

**Files:**

- Create: `packages/domain/src/douyin-material-note.ts`
- Create: `packages/domain/src/douyin-material-note.test.ts`
- Modify: `packages/domain/src/douyin-miniapp.ts`
- Modify: `packages/domain/src/douyin-miniapp.test.ts`
- Modify: `packages/domain/src/permission.ts`
- Modify: `packages/domain/src/permission.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] Write failing domain tests for `draft | published | archived | withdrawn`, title/summary/category/applicable-to limits, and the allowed `heading | paragraph | list | quote | callout` block subset.
- [ ] Add tests proving HTML/image/gallery/metrics blocks, external URLs, more than 100 blocks and serialized content over 512 KiB are rejected.
- [ ] Add response-schema tests proving public previews cannot contain `content_blocks` and no public/admin DTO exposes `tenant_id` or `subject_hash`.
- [ ] Run `bun test packages/domain/src/douyin-material-note.test.ts` and confirm failure is caused by the missing module/exports.
- [ ] Implement the narrow Zod schemas by reusing the existing site-content scalar limits while defining a material-only discriminated union; do not relax global site-content schemas.
- [ ] Add the three permissions with labels: `查看抖音资料`, `管理抖音资料`, `发布抖音资料`.
- [ ] Append entry paths for material list, detail and my-materials; append analytics events `material_preview`, `material_claim`, `material_copy`, `material_budget_click`, `material_lead_click`.
- [ ] Run `bun test packages/domain/src/douyin-material-note.test.ts packages/domain/src/douyin-miniapp.test.ts packages/domain/src/permission.test.ts`; expect all tests to pass.
- [ ] Commit with `feat(domain): define douyin material note contracts`.

## Task 2: Add the database foundation and atomic commands

**Files:**

- Create: `supabase/migrations/20260901120000_create_douyin_material_notes.sql`
- Create: `apps/api/src/services/douyin-miniapp/material-note-migration-contract.test.ts`

- [ ] Confirm no migration with timestamp `20260901120000` exists. If it exists, stop and choose the next unused timestamp before creating the file; keep that final filename in the handoff.
- [ ] Write a failing source-contract test that requires all four tables: `douyin_material_notes`, `douyin_material_note_versions`, `douyin_material_note_claims`, and `douyin_material_note_command_events`.
- [ ] Extend the failing test to require composite tenant foreign keys, immutable-version trigger, unique `(note_id, version_no)`, unique `(douyin_miniapp_installation_id, subject_hash, note_id)`, status checks, `removed_at`, and command uniqueness `(tenant_id, idempotency_key)`.
- [ ] Require indexes for public list, tenant list, active owned list and trigram search, using the existing `extensions.gin_trgm_ops` operator class.
- [ ] Require permission upserts and `system_admin` role mappings for all three new permissions, with `access_scope='all'`.
- [ ] Require the marketing-event constraint to contain all five material events without dropping existing event values.
- [ ] Require SECURITY DEFINER RPCs to set a safe `search_path`, revoke public/anon/authenticated execution by default, and grant only the role actually used by the API Supabase client.
- [ ] Run `bun test apps/api/src/services/douyin-miniapp/material-note-migration-contract.test.ts`; expect failure because the migration does not exist.
- [ ] Implement tables with UUID primary keys, timestamps, audit actors, composite unique keys needed by the tenant foreign keys, and row-level security enabled. Do not add permissive client RLS policies; API access remains server mediated.
- [ ] Implement an immutability trigger that rejects UPDATE/DELETE of version rows. State changes only update the note pointer/status; edits insert a new version.
- [ ] Implement `create_douyin_material_note` and `append_douyin_material_note_version` RPCs so note creation plus version 1, and version-number allocation, are transactional and race safe.
- [ ] Implement one tenant state-command RPC accepting command, target version, expected state and reason. It must lock the note, validate transitions, store a canonical request digest in the command ledger, replay identical keys, and reject key reuse with a different digest.
- [ ] Implement `claim_douyin_material_note` so it locks/validates current publication, atomically inserts or revives the unique claim, locks the current published version on revival, and records `material_claim` only when a new active claim is established.
- [ ] Implement owned-detail, remove and clear semantics with tenant/installation/subject predicates. Clear must update all active rows in one statement and return `removed_count`.
- [ ] Add a service-role-only erasure RPC keyed by installation and subject hash that deletes claims and deletes or anonymizes linkable material marketing events according to the existing retention columns. Do not expose it as a public mini-program route.
- [ ] Run the migration-contract test again; expect all assertions to pass.
- [ ] Confirm the Supabase CLI target is the disposable local instance and that resetting its fixtures is acceptable; then run `supabase db reset` and `supabase migration list`. Expect the new migration to be applied locally with no migration error. If the target cannot be proven local or local Supabase is unavailable, do not reset it; record the verification gap.
- [ ] Run local SQL smoke for two tenants and two subjects: cross-tenant access rejected, concurrent duplicate claim count equals one, archive preserves owned detail, withdraw blocks it, remove/reclaim changes the locked version as designed.
- [ ] Run `EXPLAIN (ANALYZE, BUFFERS)` for public list, tenant keyword list and active owned list with representative local fixtures; confirm the intended indexes are eligible and no unbounded full-table result is returned.
- [ ] Commit with `feat(db): add douyin material note storage`.

## Task 3: Implement API schemas and the repository gateway

**Files:**

- Create: `apps/api/src/schema/douyin-material-notes.ts`
- Create: `apps/api/src/schema/douyin-material-notes.test.ts`
- Create: `apps/api/src/schema/tenant-douyin-material-notes.ts`
- Create: `apps/api/src/schema/tenant-douyin-material-notes.test.ts`
- Create: `apps/api/src/repositories/douyin-material-notes.ts`
- Create: `apps/api/src/repositories/douyin-material-notes.test.ts`

- [ ] Write failing schema tests for `page=1`, `pageSize=20`, maximum 100, optional trimmed keyword/status, UUID params, empty public command bodies and the admin command payloads.
- [ ] Specify admin command bodies exactly: publish `{ version_id, expected_status }`; archive/withdraw `{ expected_status, reason }`, with non-empty bounded reasons.
- [ ] Specify that `Idempotency-Key` is a required UUID-format HTTP header for publish/archive/withdraw and is not accepted in the JSON body.
- [ ] Write failing repository tests using a fake Supabase query builder/RPC client. Assert list queries select only preview/aggregate columns, use `.range(offset, offset + pageSize - 1)`, and order by timestamp descending then ID descending.
- [ ] Add tests for strict Zod parsing of database rows and RPC results, including malformed nullable fields and a missing published-version relation.
- [ ] Run the focused tests; expect missing implementation failures.
- [ ] Implement public and admin schemas using shared domain schemas and existing Chinese validation messages.
- [ ] Implement repository methods for tenant list/detail/version list and public list/preview/owned list; never select `content_blocks` in any list.
- [ ] Keep direct Supabase/SQL/RPC calls exclusively in the repository. Map database codes to typed repository failures without throwing raw `Error` from controllers/services.
- [ ] Implement command methods for create, append version, transition, claim, remove and clear using the migration RPC names and generated Supabase argument types where available.
- [ ] Run `bun test apps/api/src/schema/douyin-material-notes.test.ts apps/api/src/schema/tenant-douyin-material-notes.test.ts apps/api/src/repositories/douyin-material-notes.test.ts`; expect pass.
- [ ] Commit with `feat(api): add material note schemas and repository`.

## Task 4: Implement tenant-admin API behavior

**Files:**

- Create: `apps/api/src/services/tenant-douyin-material-notes.ts`
- Create: `apps/api/src/services/tenant-douyin-material-notes.test.ts`
- Create: `apps/api/src/controllers/tenant-douyin-material-notes/index.ts`
- Create: `apps/api/src/controllers/tenant-douyin-material-notes/index.test.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/services/tenant-service-capability-map.test.ts`

- [ ] Write failing service tests proving `read` gates list/detail/version history, `manage` gates create/new-version, and `publish` gates publish/archive/withdraw.
- [ ] Add tests that tenant and employee IDs come only from `accessPolicyService.assertTenantContext`, cross-tenant resources become `MATERIAL_NOTE_NOT_FOUND`, and list responses expose aggregate counts but no claimant rows or subject hashes.
- [ ] Add state tests for every allowed transition and reject draft withdrawal, archived archive, withdrawn recovery, mismatched target version, stale expected state and reused idempotency key with changed payload.
- [ ] Write controller inventory tests for all eight `/tenant/douyin-material-notes` endpoints and verify `ResponseHandler.success` wrapping.
- [ ] Add header tests for missing/invalid `Idempotency-Key`, body validation and default pagination.
- [ ] Run the focused service/controller tests; expect missing implementation failures.
- [ ] Implement the tenant service with access-policy checks, repository orchestration and error-factory mappings. Preserve 404 for cross-tenant access and 409 for state/version/idempotency conflicts.
- [ ] Implement the controller as HTTP-only glue: parse request, call service and wrap success. Do not query Supabase or perform state transitions in the controller.
- [ ] Register the controller in `apps/api/src/routes/index.ts`.
- [ ] Extend route capability classification tests to include every new tenant route and assert the existing top-level `tenant` exclusion reports `not_trial_capability`; do not add a new paid capability mapping.
- [ ] Run `bun test apps/api/src/services/tenant-douyin-material-notes.test.ts apps/api/src/controllers/tenant-douyin-material-notes/index.test.ts apps/api/src/services/tenant-service-capability-map.test.ts`; expect pass.
- [ ] Commit with `feat(api): expose tenant material note management`.

## Task 5: Implement public mini-program API and analytics semantics

**Files:**

- Create: `apps/api/src/services/douyin-miniapp/material-note-context.ts`
- Create: `apps/api/src/services/douyin-miniapp/material-notes.ts`
- Create: `apps/api/src/services/douyin-miniapp/material-notes.test.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.ts`
- Modify: `apps/api/src/controllers/douyin-miniapp/index.test.ts`
- Modify: `apps/api/src/plugins/auth/legacy/douyin-routes.ts`
- Modify: `apps/api/src/plugins/auth/legacy-plugin-douyin.test.ts`
- Modify: `apps/api/src/schema/douyin-miniapp.ts`
- Modify: `apps/api/src/services/douyin-miniapp/marketing.ts`
- Modify: `apps/api/src/services/douyin-miniapp/marketing.test.ts`

- [ ] Write failing context tests for wrong token type, inactive installation, AppID mismatch, inactive tenant and absent subject hash.
- [ ] Write failing public service tests for published-only discovery, preview redaction, claimed flag scoped to current installation/subject, and default/max pagination.
- [ ] Add claim tests for first claim, repeated claim, simulated concurrent unique conflict replay, removed claim revival and current-version locking.
- [ ] Add owned-detail tests: archived returns locked content, withdrawn returns HTTP 410/`MATERIAL_NOTE_WITHDRAWN`, removed/foreign claim returns 404, and no response exposes identity fields.
- [ ] Add remove/clear idempotency tests and assert neither operation changes another subject or installation.
- [ ] Add a negative assertion that claim creates no `marketing_leads`, verification code or measurement appointment repository call.
- [ ] Add route tests for the exact seven public endpoints and prove they are session-protected rather than added to the public bypass list.
- [ ] Add analytics tests: clients may submit preview/copy/budget-click/lead-click; client-submitted `material_claim` is rejected; successful claim writes its server event once.
- [ ] Run the focused tests; expect missing implementation failures.
- [ ] Implement the focused material session-context resolver using the same token/installation/tenant checks as current marketing content. Do not accept `tenant_id`, installation ID, AppID or subject hash from query/body/header.
- [ ] Implement the public service and map errors through `error-factory.ts`: 404 not found, 409 unavailable/conflict and 410 withdrawn.
- [ ] Register controller routes with strict query/params/body schemas and `ResponseHandler.success`.
- [ ] Update auth and analytics allowlists while preserving all existing routes/events.
- [ ] Run `bun test apps/api/src/services/douyin-miniapp/material-notes.test.ts apps/api/src/controllers/douyin-miniapp/index.test.ts apps/api/src/plugins/auth/legacy-plugin-douyin.test.ts apps/api/src/services/douyin-miniapp/marketing.test.ts`; expect pass.
- [ ] Run `bun run api:check`; expect API typecheck, build and file-size checks to pass before any server or browser smoke.
- [ ] Commit with `feat(api): expose douyin material note claims`.

## Task 6: Build the tenant-admin material workspace

**Files:**

- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/site-content/site-content-block-editor.tsx`
- Create: `apps/admin/components/douyin-miniapp/material-note-contract.ts`
- Create: `apps/admin/components/douyin-miniapp/material-note-contract.test.ts`
- Create: `apps/admin/components/douyin-miniapp/material-note-api.ts`
- Create: `apps/admin/components/douyin-miniapp/material-note-api.test.ts`
- Create: `apps/admin/components/douyin-miniapp/material-note-table.tsx`
- Create: `apps/admin/components/douyin-miniapp/material-note-editor.tsx`
- Create: `apps/admin/components/douyin-miniapp/material-note-actions.tsx`
- Create: `apps/admin/components/douyin-miniapp/material-note-ui.test.tsx`
- Create: `apps/admin/app/(console)/douyin-miniapp/materials/page.tsx`
- Create: `apps/admin/app/(console)/douyin-miniapp/materials/new/page.tsx`
- Create: `apps/admin/app/(console)/douyin-miniapp/materials/[id]/page.tsx`

- [ ] Write failing contract/API tests for list filters, page/pageSize, create-with-version, append-version and UUID idempotency headers on state commands.
- [ ] Write failing UI tests for the status/action matrix and permissions: read-only users see content; manage controls require manage; publish/archive/withdraw require publish.
- [ ] Add tests that withdrawn reason is required, withdrawal confirmation is distinct from archive, and no component renders claimant identity or a claimant-export action.
- [ ] Run the focused tests; expect missing implementation failures.
- [ ] Implement strict response parsing and calls through the existing authenticated `requestBackendJson` pattern.
- [ ] Extend `SiteContentBlockEditor` with an optional allowed-types property defaulting to its current complete set. Pass only heading/paragraph/list/quote/callout in the material editor and retain server-schema validation as the final authority.
- [ ] Implement the list with keyword/status controls, URL-backed page state, default 20, max 100, stable loading/empty/error states and aggregate columns only.
- [ ] Implement create so one submission creates the note and immutable version 1. Implement later saves as new versions; never mutate an existing version.
- [ ] Implement version preview and explicit target-version publish. Generate a new UUID idempotency key per user command and retain it only for retries of that exact request.
- [ ] Implement archive confirmation and high-risk withdrawal confirmation with required reason. Refresh the detail/version list after a completed or replayed command.
- [ ] Add the menu entry at `/douyin-miniapp/materials` guarded by `douyin_material_note.read`.
- [ ] Run the focused admin tests; expect pass.
- [ ] Run `bun run admin:check`; expect file-size checks and typecheck to pass.
- [ ] Commit with `feat(admin): manage douyin material notes`.

## Task 7: Add mini-program contracts, navigation and shared UI

**Files:**

- Modify: `apps/douyin-mini/src/app.json`
- Modify: `apps/douyin-mini/src/models/index.ts`
- Create: `apps/douyin-mini/src/api/materials.ts`
- Create: `apps/douyin-mini/src/api/materials.test.ts`
- Modify: `apps/douyin-mini/src/platform/navigation.ts`
- Modify: `apps/douyin-mini/src/platform/navigation.test.ts`
- Create: `apps/douyin-mini/src/platform/clipboard.ts`
- Create: `apps/douyin-mini/src/platform/clipboard.test.ts`
- Create: `apps/douyin-mini/src/components/material-card/index.ts`
- Create: `apps/douyin-mini/src/components/material-card/index.json`
- Create: `apps/douyin-mini/src/components/material-card/index.ttml`
- Create: `apps/douyin-mini/src/components/material-card/index.ttss`

- [ ] Write failing client parser tests for public preview, unclaimed detail with no body, claim response with body, owned detail, list pagination and each material business error.
- [ ] Add tests rejecting identity fields, unknown content-block types and malformed responses rather than trusting backend JSON.
- [ ] Write failing navigation tests for list/detail/my-material routes and UUID encoding; assert tab-bar configuration is unchanged.
- [ ] Write clipboard adapter tests with injected `tt` behavior for success and failure.
- [ ] Run the focused tests; expect missing implementation failures.
- [ ] Implement material API calls using the existing session-aware request layer and typed error normalization.
- [ ] Register `pages/materials/index`, `pages/material-detail/index` and `pages/my-materials/index` in `app.json`; do not add a tab-bar item.
- [ ] Implement navigation helpers and shared card with title, category, summary, applicable-to and claimed badge; do not render or cache content blocks in cards.
- [ ] Implement clipboard as a small Promise adapter over the installed `tt.setClipboardData` API signature already declared by the mini-program typings; verify the actual local type before importing or declaring anything new.
- [ ] Run `bun test apps/douyin-mini/src/api/materials.test.ts apps/douyin-mini/src/platform/navigation.test.ts apps/douyin-mini/src/platform/clipboard.test.ts`; expect pass.
- [ ] Commit with `feat(douyin-mini): add material client foundations`.

## Task 8: Build material pages, home entry, privacy copy and analytics

**Files:**

- Create: `apps/douyin-mini/src/pages/materials/index.ts`
- Create: `apps/douyin-mini/src/pages/materials/index.json`
- Create: `apps/douyin-mini/src/pages/materials/index.ttml`
- Create: `apps/douyin-mini/src/pages/materials/index.ttss`
- Create: `apps/douyin-mini/src/pages/materials/page-model.ts`
- Create: `apps/douyin-mini/src/pages/materials/page-model.test.ts`
- Create: `apps/douyin-mini/src/pages/material-detail/index.ts`
- Create: `apps/douyin-mini/src/pages/material-detail/index.json`
- Create: `apps/douyin-mini/src/pages/material-detail/index.ttml`
- Create: `apps/douyin-mini/src/pages/material-detail/index.ttss`
- Create: `apps/douyin-mini/src/pages/material-detail/page-model.ts`
- Create: `apps/douyin-mini/src/pages/material-detail/page-model.test.ts`
- Create: `apps/douyin-mini/src/pages/my-materials/index.ts`
- Create: `apps/douyin-mini/src/pages/my-materials/index.json`
- Create: `apps/douyin-mini/src/pages/my-materials/index.ttml`
- Create: `apps/douyin-mini/src/pages/my-materials/index.ttss`
- Create: `apps/douyin-mini/src/pages/my-materials/page-model.ts`
- Create: `apps/douyin-mini/src/pages/my-materials/page-model.test.ts`
- Modify: `apps/douyin-mini/src/pages/home/index.ts`
- Modify: `apps/douyin-mini/src/pages/home/index.ttml`
- Modify: `apps/douyin-mini/src/pages/home/index.ttss`
- Modify: `apps/douyin-mini/src/pages/home/index.json`
- Modify: `apps/douyin-mini/src/pages/privacy/index.ttml`
- Modify: `apps/douyin-mini/src/platform/analytics.ts`
- Modify: `apps/douyin-mini/src/platform/analytics.test.ts`
- Modify: `apps/douyin-mini/src/ui-contracts.test.ts`

- [ ] Write failing page-model tests for debounced keyword reset, append pagination, stale-request suppression, refresh and empty/error states.
- [ ] Add detail tests for disabled duplicate claim clicks, uncertain network result recovery by refetch, immediate body unlock, archived owned body, withdrawn body clearing and no persistent body cache.
- [ ] Add owned-list tests for single remove, confirmed atomic clear, reload after mutation and re-claim navigation.
- [ ] Add analytics tests for preview/copy/budget/lead events; assert claim is never submitted through client analytics.
- [ ] Add UI contract tests for the three pages, home “装修资料/查看全部/我的资料” entry, no tab-bar change, and privacy disclosures.
- [ ] Run focused tests; expect missing implementation failures.
- [ ] Implement the materials list with server pagination, keyword search, load-more guard and a visible “我的资料” entry.
- [ ] Implement detail as a state machine: preview -> claiming -> claimed, plus not-found/unavailable/withdrawn. Fetch server state on every entry; local state may suppress flicker but never authorizes content access.
- [ ] Render only supported text blocks with fixed local styles. Copy a deterministic plain-text serialization after a user tap and show explicit success/failure feedback.
- [ ] Place budget and free-measurement CTAs after claimed content. Navigate only on tap and emit their events immediately before navigation; do not submit phone, lead or appointment data during claim.
- [ ] Implement my-materials pagination, per-item confirmation and one clear-all confirmation calling the atomic clear endpoint once.
- [ ] Load at most four recent materials after home bootstrap. Treat this module as optional: a material-list failure hides/retries the module without turning the existing home into a global error state.
- [ ] Update privacy content to state the purpose of anonymous claim history, no automatic sales lead, remove/clear semantics, and the existing verified deletion-request contact channel.
- [ ] Run all focused page and analytics tests; expect pass.
- [ ] Run `bun run douyin-mini:check`; expect all Bun tests and TypeScript checks to pass.
- [ ] Commit with `feat(douyin-mini): deliver material claim experience`.

## Task 9: Regenerate database types and run repository-wide verification

**Files:**

- Modify: `apps/api/src/types/database.ts`
- Create or modify only generated artifacts reported by `bun run gen` that correspond to this feature.

- [ ] Before touching a remote database, show the exact pending migration and obtain explicit user approval for that environment. The implementation request alone does not authorize `supabase db push`.
- [ ] After approval, run `supabase migration list` and capture Local/Remote state before applying anything.
- [ ] Apply only the reviewed migration through the established migration command; do not run hand-written remote DDL/DML.
- [ ] Run `supabase migration list` again and confirm the new migration is aligned Local/Remote.
- [ ] Run the repository-pinned `bun run gen` command to regenerate `apps/api/src/types/database.ts`; inspect the diff for the four tables and RPC signatures.
- [ ] Run focused database contract and repository tests after type regeneration; expect pass without `as any` workarounds.
- [ ] Run `bun run api:check`.
- [ ] Run `bun run admin:check`.
- [ ] Run `bun run douyin-mini:check`.
- [ ] Run `bun run check:permission-boundaries`.
- [ ] Run `git diff --check` and inspect `git diff --stat`; expect no whitespace errors and no unrelated files.
- [ ] Commit with `chore(types): sync douyin material database types` if generated types changed. If no generated diff exists, record that result and do not create an empty commit.

## Task 10: Perform dev smoke, privacy-version rollout and handoff

**Files:**

- Create: `docs/miniprogram/2026-09-01-douyin-material-note-claims-handoff.md`

- [ ] Write the handoff before deployment with exact endpoint tables, query/body/header fields, response examples, error matrix, status behavior, anonymous identity rules and page-to-endpoint mapping.
- [ ] State explicitly that mini-program code must never send or persist `tenant_id`, installation ID or `subject_hash`, never infer body entitlement locally, and never turn claim into a lead.
- [ ] Include a release gate requiring explicit approval before API/admin dev deployment, platform config mutation, template upload, merchant experience build, audit submission or production publication.
- [ ] After deployment approval, deploy the reviewed commit to dev through the existing release process and record commit plus API/admin revision. Do not describe an undeployed local build as deployed.
- [ ] Create tenant A and tenant B dev fixtures through the tenant admin API/UI, not remote SQL. Include draft, published, archived and withdrawn notes and published versions with distinct titles.
- [ ] Smoke the public endpoints with two distinct Douyin test accounts: preview redaction, claim, repeat claim, my-materials, copy, remove, re-claim, clear, archive and withdraw.
- [ ] Verify tenant A/B isolation and permission denial with read-only, manager and publisher employee roles.
- [ ] Verify after claims that no new `marketing_leads`, SMS verification or `douyin_measurement_appointments` rows were created; record counts without recording subject hashes, tokens, phones or request headers.
- [ ] Capture `EXPLAIN ANALYZE` evidence in dev for public list, tenant keyword search and active owned list using redacted identifiers; confirm database pagination occurs before response construction.
- [ ] Update each target installation’s `privacy_policy_version` through the existing platform config API only after explicit approval, then verify the privacy page/version and existing consent flow. Do not mutate `runtime_config` directly in SQL.
- [ ] After template-upload approval, build and upload a new Douyin template version, create a merchant experience release, and run Android/iOS checks for long text, pagination, back-navigation recovery and clipboard success/failure.
- [ ] Add the final commit/revision/template version, migration alignment, redacted fixture matrix, smoke outcomes, known residual risks and rollback procedure to the handoff.
- [ ] Run `rg -n 'subject_hash|Authorization:|Bearer |phone|mobile' docs/miniprogram/2026-09-01-douyin-material-note-claims-handoff.md`; inspect every match and remove secrets/direct identifiers while preserving contractual field-name warnings.
- [ ] Commit with `docs(douyin): hand off material note claims`.

## Task 11: Final acceptance and release decision

- [ ] Run the full local verification suite again on the exact release commit: `bun run api:check`, `bun run admin:check`, `bun run douyin-mini:check`, and `bun run check:permission-boundaries`.
- [ ] Confirm `git status --short` contains no unexpected generated, fixture or secret-bearing files.
- [ ] Compare the implementation and handoff against every item in sections 5–13 of the approved design document; list evidence for each acceptance item rather than marking the feature complete by inspection alone.
- [ ] Validate rollback: old template hides all material entry points; API rollback preserves tables/claims; after real claim data exists, no rollback migration drops or rewrites historical rows.
- [ ] Request code review with emphasis on tenant composite FKs, SECURITY DEFINER grants/search path, idempotency digest replay, public body redaction, subject isolation and absence of lead side effects.
- [ ] Resolve review findings using root-cause verification and rerun affected focused tests plus the full checks.
- [ ] Obtain an explicit go/no-go decision before production migration, tenant template generation, audit submission or publication. A dev pass does not authorize production release.
- [ ] If approved, execute the established migration and release workflow, record production revisions and run non-destructive smoke. If not approved, keep dev state and document the blocking evidence without mutating production.

## Rollback boundaries

- Before any claim data exists, application code can be rolled back first; a separately reviewed forward migration may then revoke RPC execution and remove the new objects in dependency order.
- Once claim data exists, do not drop the tables or version history. Roll back the UI/template to hide entry points and deploy a forward migration or service guard that disables new claims while preserving owned/history data required by policy.
- Never edit an already-applied migration. Every schema, permission, function, trigger, constraint, index or seed correction must be a new migration.
- Do not claim that “移出我的资料” is privacy deletion. Verified deletion uses the service-only erasure path and must be audited without logging the raw subject hash.
