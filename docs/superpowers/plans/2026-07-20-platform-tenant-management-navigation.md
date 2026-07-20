# Platform Tenant Management Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the platform tenant and service-provider onboarding navigation into one permission-aware tenant management workspace with lifecycle links.

**Architecture:** Keep the existing pages, backend endpoints, and domain state machines. Add one shared shadcn tab navigation component, teach the sidebar item about the onboarding route alias, and expose the existing application-to-tenant relationship in both detail surfaces.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, shadcn/ui with Radix Tabs, Bun tests.

---

### Task 1: Lock navigation behavior with tests

**Files:**
- Modify: `apps/admin/components/layout/admin-nav-utils.test.ts`
- Modify: `apps/admin/components/layout/admin-nav-visibility.test.ts`
- Modify: `apps/admin/components/tenant-onboarding/tenant-onboarding-page-layout.test.ts`
- Modify: `apps/admin/components/platform-tenants/platform-tenant-detail-page-layout.test.ts`

- [x] Add assertions that one “租户管理” sidebar item covers `/platform/tenants` and `/platform/tenant-onboarding`.
- [x] Add assertions for the shared `租户列表 / 入驻申请 / 公开发布` tabs and their independent permissions.
- [x] Add assertions for application-to-tenant and tenant-to-application links.
- [x] Run the focused Bun tests and confirm they fail because the new behavior does not exist.

### Task 2: Implement the unified workspace navigation

**Files:**
- Create: `apps/admin/components/platform-tenants/tenant-management-tabs.tsx`
- Modify: `apps/admin/components/layout/menu-config.ts`
- Modify: `apps/admin/components/layout/admin-nav.tsx`
- Modify: `apps/admin/app/(console)/platform/tenants/page.tsx`
- Modify: `apps/admin/app/(console)/platform/tenant-onboarding/page.tsx`

- [x] Add `activeHrefs` support to the menu item and sidebar active-state calculation.
- [x] Replace the two sidebar items with one “租户管理” item.
- [x] Render shared line tabs using the installed shadcn `TabsList` and `TabsTrigger` components.
- [x] Compute application-review and publication permissions independently from the admin session.
- [x] Use “租户管理” as the shared page title while keeping task-specific descriptions and actions.
- [x] Run focused tests and confirm the navigation assertions pass.

### Task 3: Connect the lifecycle details

**Files:**
- Modify: `apps/admin/components/tenant-onboarding/tenant-onboarding-detail-dialog.tsx`
- Modify: `apps/admin/app/(console)/platform/tenants/[id]/page.tsx`

- [x] Add a “查看已创建租户” button when an approved application has `converted_tenant_id`.
- [x] Use the tenant credit code to link back to the approved onboarding-list result without changing the existing API contract.
- [x] Display the onboarding-review source or the explicit platform-created/history fallback in the tenant detail.
- [x] Run focused tests and confirm lifecycle-link assertions pass.

### Task 4: Verify and commit

**Files:**
- Review all modified files from Tasks 1-3.

- [x] Run focused Bun tests for navigation and tenant onboarding.
- [x] Run `pnpm --dir apps/admin check`.
- [x] Run `pnpm --dir apps/admin build`.
- [x] Start the admin dev server and inspect desktop and mobile layouts in the browser.
- [x] Review `git diff --check`, the final diff, and repository status.
- [x] Commit with `feat(admin): 合并租户管理入口`.
