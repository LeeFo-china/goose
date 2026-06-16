# Acceptance Template Management Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tenant admin page for managing existing project acceptance templates across stage and final acceptance workflows.

**Architecture:** Reuse the existing project acceptance template API and admin component vocabulary. Add one route-level server page to load filtered templates and one focused client shell to select, edit, and save a template inline. Extract template update payload serialization into a small utility with Bun tests so the existing dialog and new page can share the same contract.

**Tech Stack:** Next.js App Router, React client components, shadcn/Radix UI, Tailwind, Bun test, existing Gooes backend proxy.

---

### Task 1: Template Payload Utility

**Files:**
- Create: `apps/admin/components/acceptance-templates/acceptance-template-editor-utils.ts`
- Create: `apps/admin/components/acceptance-templates/acceptance-template-editor-utils.test.ts`
- Modify: `apps/admin/components/projects/project-final-acceptance-template-dialog.tsx`

- [x] **Step 1: Write the failing test**

Create a Bun test that imports `buildAcceptanceTemplateUpdatePayload`, passes a template with two sections and checks that ids, sort order, booleans, photo limits, and nullable fields are serialized for `PATCH /project-acceptance-templates/:id`.

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
cd apps/admin
bun test components/acceptance-templates/acceptance-template-editor-utils.test.ts
```

Expected: FAIL because the utility module does not exist yet.

- [x] **Step 3: Implement the utility**

Add `cloneAcceptanceTemplateForEdit`, `buildAcceptanceTemplateUpdatePayload`, and small stage/type label helpers. Keep the payload shape identical to `UpdateProjectAcceptanceTemplateSchema`.

- [x] **Step 4: Reuse utility in the final acceptance dialog**

Replace duplicated save payload mapping in `project-final-acceptance-template-dialog.tsx` with `buildAcceptanceTemplateUpdatePayload` and move the clone import to the new utility.

### Task 2: Management Page

**Files:**
- Create: `apps/admin/app/(console)/acceptance-templates/page.tsx`
- Create: `apps/admin/components/acceptance-templates/acceptance-template-management-shell.tsx`
- Create: `apps/admin/components/acceptance-templates/acceptance-template-types.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [x] **Step 1: Add the server page**

Load `/project-acceptance-templates` with optional `acceptance_type`, `stage_code`, and `status` filters from search params. Render a compact page header and pass templates into the client shell.

- [x] **Step 2: Add the client shell**

Implement a split layout: filter toolbar and template list on the left, selected template editor on the right. Support inline editing of template name, description, status, sections, and items. Support add/remove sections and add/remove items within an existing template.

- [x] **Step 3: Add navigation**

Add `/acceptance-templates` under tenant business navigation with an operational icon and `employee.permission_manage` permission.

### Task 3: Verification

**Files:** no new files.

- [x] **Step 1: Run focused utility test**

```bash
cd apps/admin
bun test components/acceptance-templates/acceptance-template-editor-utils.test.ts
```

- [x] **Step 2: Run admin checks**

```bash
cd apps/admin
pnpm run check
```

- [x] **Step 3: Run admin build**

```bash
cd apps/admin
pnpm run build
```
