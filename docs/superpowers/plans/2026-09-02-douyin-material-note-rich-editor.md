# Douyin Material Note Rich Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add controlled image support and a Tiptap-based admin authoring surface for Douyin material notes while preserving structured mini-program contracts.

**Architecture:** Tiptap is an admin-only editor adapter. Stored tenant drafts remain `content_blocks`; mini-program claimed bodies receive public image assets resolved by the API service. Database validation stays authoritative through a forward migration.

**Tech Stack:** Next.js admin, React 19, Tiptap v3, shadcn/ui, Bun tests, Fastify API, Supabase/Postgres, Douyin mini-program TTML/TTSS.

---

### Task 1: Domain And Wire Contracts

**Files:**
- Modify: `packages/domain/src/douyin-material-note.ts`
- Modify: `packages/domain/src/douyin-material-note.test.ts`
- Modify: `apps/douyin-mini/src/models/index.ts`
- Modify: `apps/douyin-mini/src/api/materials.ts`
- Modify: `apps/douyin-mini/src/api/materials.test.ts`

- [ ] **Step 1: Write failing domain tests**

Add tests proving draft image blocks are accepted and public claimed image blocks use `asset`, not raw `fileId`.

Run:

```bash
bun test packages/domain/src/douyin-material-note.test.ts
```

Expected: FAIL because image blocks are currently rejected.

- [ ] **Step 2: Implement domain schemas**

Add an image draft schema with `fileId`, `alt`, and optional `caption`. Add public image asset and public image block schemas for claimed/owned material bodies.

- [ ] **Step 3: Write failing mini-program parser tests**

Extend parser tests so claimed and owned material bodies accept image blocks with trusted `asset.src`, and reject raw `fileId` image blocks.

Run:

```bash
bun --cwd apps/douyin-mini test src/api/materials.test.ts
```

Expected: FAIL because image blocks are not parsed.

- [ ] **Step 4: Implement mini-program parser types**

Update mini-program model and parser to support image blocks with `asset.fileId`, `asset.src`, `asset.alt`, optional width/height, and optional caption.

- [ ] **Step 5: Verify task**

Run:

```bash
bun test packages/domain/src/douyin-material-note.test.ts
bun --cwd apps/douyin-mini test src/api/materials.test.ts
```

Expected: PASS.

### Task 2: Database Validation

**Files:**
- Create: `supabase/migrations/20260902160000_allow_douyin_material_note_image_blocks.sql`
- Modify: `apps/api/src/services/douyin-miniapp/material-note-migration-contract.test.ts`

- [ ] **Step 1: Write failing migration contract**

Add assertions that the newest migration replaces `is_valid_douyin_material_note_content_blocks`, accepts strict image blocks, and rejects raw `src`, base64, external URLs, missing alt, and unknown keys.

Run:

```bash
bun --cwd apps/api test ./src/services/douyin-miniapp/material-note-migration-contract.test.ts
```

Expected: FAIL because no image-block migration exists.

- [ ] **Step 2: Add forward migration**

Replace the validator function. Keep the existing text block rules and add strict image validation.

- [ ] **Step 3: Verify task**

Run:

```bash
bun --cwd apps/api test ./src/services/douyin-miniapp/material-note-migration-contract.test.ts
```

Expected: PASS.

### Task 3: API Asset Resolution

**Files:**
- Modify: `apps/api/src/schema/douyin-material-notes.ts`
- Modify: `apps/api/src/schema/douyin-material-notes.test.ts`
- Modify: `apps/api/src/repositories/douyin-material-notes.ts`
- Modify: `apps/api/src/repositories/douyin-material-notes.test.ts`
- Modify: `apps/api/src/services/douyin-miniapp/material-notes.ts`
- Modify: `apps/api/src/services/douyin-miniapp/material-notes.test.ts`

- [ ] **Step 1: Write failing API schema/service tests**

Add tests proving public claim and owned detail responses resolve image `fileId` into trusted `asset` objects, and unusable file records fail with a stable backend error.

Run:

```bash
bun --cwd apps/api test ./src/schema/douyin-material-notes.test.ts ./src/services/douyin-miniapp/material-notes.test.ts
```

Expected: FAIL because service returns stored blocks unchanged.

- [ ] **Step 2: Add repository file lookup**

Add a bounded `findMaterialImageAssets(tenantId, fileIds)` method using only required columns and `.in('id', ids)`.

- [ ] **Step 3: Implement service resolution**

Collect image file IDs from claimed version blocks, load assets once, validate active/public/image/tenant scope, and map images to public blocks.

- [ ] **Step 4: Verify task**

Run:

```bash
bun --cwd apps/api test ./src/schema/douyin-material-notes.test.ts ./src/repositories/douyin-material-notes.test.ts ./src/services/douyin-miniapp/material-notes.test.ts
```

Expected: PASS.

### Task 4: Admin Tiptap Editor

**Files:**
- Modify: `apps/admin/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/admin/components/douyin-miniapp/material-note-rich-editor.tsx`
- Create: `apps/admin/components/douyin-miniapp/material-note-rich-editor-adapter.ts`
- Create: `apps/admin/components/douyin-miniapp/material-note-rich-editor-adapter.test.ts`
- Modify: `apps/admin/components/douyin-miniapp/material-note-editor.tsx`
- Modify: `apps/admin/components/douyin-miniapp/material-note-ui.test.tsx`

- [ ] **Step 1: Install Tiptap packages**

Run:

```bash
pnpm --dir apps/admin add @tiptap/core @tiptap/pm @tiptap/react @tiptap/starter-kit @tiptap/extension-image
```

Expected: package and lockfile update only for Tiptap dependencies.

- [ ] **Step 2: Write failing adapter tests**

Add adapter tests for `content_blocks -> Tiptap JSON -> content_blocks`, image block preservation, unsupported node rejection, and no raw HTML.

Run:

```bash
bun --cwd apps/admin test ./components/douyin-miniapp/material-note-rich-editor-adapter.test.ts
```

Expected: FAIL because adapter does not exist.

- [ ] **Step 3: Implement adapter**

Implement pure conversion helpers with no React dependency so tests stay fast.

- [ ] **Step 4: Write failing UI contract test**

Update UI contract tests to require the rich editor, Tiptap imports, image upload action, and continued restricted block set.

Run:

```bash
bun --cwd apps/admin test ./components/douyin-miniapp/material-note-ui.test.tsx
```

Expected: FAIL before wiring the UI.

- [ ] **Step 5: Implement rich editor UI**

Compose Tiptap `EditorContent`, a compact toolbar, existing `SiteContentImageField` for upload, conversion errors, and existing preview/submit flow.

- [ ] **Step 6: Verify task**

Run:

```bash
bun --cwd apps/admin test ./components/douyin-miniapp/material-note-rich-editor-adapter.test.ts ./components/douyin-miniapp/material-note-ui.test.tsx
pnpm --dir apps/admin check
```

Expected: PASS.

### Task 5: Mini-Program Rendering

**Files:**
- Modify: `apps/douyin-mini/src/pages/material-detail/page-model.ts`
- Modify: `apps/douyin-mini/src/pages/material-detail/page-model.test.ts`
- Modify: `apps/douyin-mini/src/pages/material-detail/page.ts`
- Modify: `apps/douyin-mini/src/pages/material-detail/page.test.ts`
- Modify: `apps/douyin-mini/src/pages/material-detail/index.ttml`
- Modify: `apps/douyin-mini/src/pages/material-detail/index.ttss`

- [ ] **Step 1: Write failing page tests**

Add tests for image block projection, stable keys, image copy serialization, and image render markup.

Run:

```bash
bun --cwd apps/douyin-mini test src/pages/material-detail/page-model.test.ts src/pages/material-detail/page.test.ts
```

Expected: FAIL because image blocks are not projected or serialized.

- [ ] **Step 2: Implement projection and serialization**

Project image blocks into TTML data with `src`, `alt`, `caption`, and a stable key. Serialize copy text as `[图片：alt]` plus caption when present.

- [ ] **Step 3: Implement TTML/TTSS**

Render image blocks with `mode="widthFix"`, lazy loading, and a compact caption.

- [ ] **Step 4: Verify task**

Run:

```bash
bun --cwd apps/douyin-mini test src/pages/material-detail/page-model.test.ts src/pages/material-detail/page.test.ts src/api/materials.test.ts
bun --cwd apps/douyin-mini check
```

Expected: PASS.

### Task 6: Final Verification And Handoff

**Files:**
- Create: `docs/miniprogram/2026-09-02-douyin-material-note-rich-editor-handoff.md`

- [ ] **Step 1: Write handoff document**

Document the final image block contract, admin behavior, mini-program behavior, errors, and smoke checklist.

- [ ] **Step 2: Run focused verification**

Run:

```bash
bun test packages/domain/src/douyin-material-note.test.ts
bun --cwd apps/api test ./src/schema/douyin-material-notes.test.ts ./src/schema/tenant-douyin-material-notes.test.ts ./src/repositories/douyin-material-notes.test.ts ./src/services/douyin-miniapp/material-notes.test.ts ./src/services/tenant-douyin-material-notes.test.ts ./src/services/douyin-miniapp/material-note-migration-contract.test.ts
bun --cwd apps/admin test ./components/douyin-miniapp/material-note-rich-editor-adapter.test.ts ./components/douyin-miniapp/material-note-ui.test.tsx ./components/douyin-miniapp/material-note-api.test.ts ./components/douyin-miniapp/material-note-contract.test.ts
bun --cwd apps/douyin-mini test src/api/materials.test.ts src/pages/material-detail/page-model.test.ts src/pages/material-detail/page.test.ts
pnpm --dir apps/admin check
bun --cwd apps/douyin-mini check
pnpm --dir apps/api exec tsc -p tsconfig.json --noEmit
```

Expected: PASS.

- [ ] **Step 3: Review diff and commit**

Run:

```bash
git status --short
git diff --stat
git add docs/superpowers/specs/2026-09-02-douyin-material-note-rich-editor-design.md docs/superpowers/plans/2026-09-02-douyin-material-note-rich-editor.md docs/miniprogram/2026-09-02-douyin-material-note-rich-editor-handoff.md packages/domain/src/douyin-material-note.ts packages/domain/src/douyin-material-note.test.ts apps/api/src/schema/douyin-material-notes.ts apps/api/src/schema/douyin-material-notes.test.ts apps/api/src/repositories/douyin-material-notes.ts apps/api/src/repositories/douyin-material-notes.test.ts apps/api/src/services/douyin-miniapp/material-notes.ts apps/api/src/services/douyin-miniapp/material-notes.test.ts apps/api/src/services/douyin-miniapp/material-note-migration-contract.test.ts supabase/migrations/20260902160000_allow_douyin_material_note_image_blocks.sql apps/admin/package.json pnpm-lock.yaml apps/admin/components/douyin-miniapp/material-note-rich-editor.tsx apps/admin/components/douyin-miniapp/material-note-rich-editor-adapter.ts apps/admin/components/douyin-miniapp/material-note-rich-editor-adapter.test.ts apps/admin/components/douyin-miniapp/material-note-editor.tsx apps/admin/components/douyin-miniapp/material-note-ui.test.tsx apps/douyin-mini/src/models/index.ts apps/douyin-mini/src/api/materials.ts apps/douyin-mini/src/api/materials.test.ts apps/douyin-mini/src/pages/material-detail/page-model.ts apps/douyin-mini/src/pages/material-detail/page-model.test.ts apps/douyin-mini/src/pages/material-detail/page.ts apps/douyin-mini/src/pages/material-detail/page.test.ts apps/douyin-mini/src/pages/material-detail/index.ttml apps/douyin-mini/src/pages/material-detail/index.ttss
git commit -m "feat(douyin): 支持资料笔记图文编辑"
```

Expected: commit succeeds after verification.

## Self-Review

- Spec coverage: admin Tiptap adapter, image upload, domain schemas, database validator, API asset resolution, mini-program parser/rendering, and handoff are covered.
- Placeholder scan: clean.
- Type consistency: draft image uses `fileId`; public image uses `asset.fileId` and `asset.src`.
