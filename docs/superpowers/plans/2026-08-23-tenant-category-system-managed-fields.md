# Tenant Category System Managed Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 租户新建私有类目只需要填写名称，编码、平台映射和排序由系统维护；租户可通过“置顶”调整同级展示顺序。

**Architecture:** 保持平台目录主数据能力不变，只收敛租户私有类目的 HTTP 契约和 admin 表单。租户分类 create 在 service 层补齐稳定系统编码、默认排序和空平台映射；置顶复用现有 versioned update command，将目标分类排序移动到同级最前。

**Tech Stack:** Bun, TypeScript, Fastify, Zod, Supabase RPC repository, Next.js admin, shadcn/Radix, Tailwind.

---

## File Structure

- Modify `apps/api/src/schema/supplier-catalog-extensions.ts`
  - Tenant category create accepts missing `code`, `sort_order`, and `mapped_platform_category_id`.
  - Tenant category update no longer accepts `code`, `sort_order`, or `mapped_platform_category_id` from tenant UI contracts.
- Modify `apps/api/src/schema/supplier-catalog.test.ts`
  - Tests tenant category create with only `name` and optional `parent_id`.
  - Tests tenant category update rejects system-managed fields.
- Modify `apps/api/src/services/supplier-catalog-tenant.ts`
  - Generate deterministic tenant category code from `category_id`.
  - Default tenant category sort order to `100`.
  - Always create categories without platform mapping.
  - Add `pinTenantCategory` service method that computes the next top sort order and calls existing update command.
- Modify `apps/api/src/services/supplier-catalog-tenant.test.ts`
  - Tests generated create command fields.
  - Tests pin command preserves system fields and updates sort order.
- Modify `apps/api/src/controllers/supplier-catalog/index.ts`
  - Add `POST /catalog/categories/:id:pin` route.
- Modify `apps/admin/components/tenant-supplier-catalog/tenant-category-dialog.tsx`
  - Remove editable code, platform mapping, and sort controls.
  - Show disabled “保存后自动生成” code affordance on create.
- Modify `apps/admin/components/tenant-supplier-catalog/tenant-category-table.tsx`
  - Remove platform mapping emphasis from primary identity.
  - Add “置顶” action for tenant-owned rows.
- Add `apps/admin/components/tenant-supplier-catalog/tenant-category-pin-action.tsx`
  - Client action for idempotent pin command.
- Modify `apps/admin/components/tenant-supplier-catalog/tenant-catalog-display.tsx`
  - Simplify category identity copy.
- Modify `apps/admin/e2e/supplier-catalog-tenant-workflow.spec.ts`
  - Update tenant category creation flow.
  - Verify create payload omits system fields.
  - Verify pin action uses the new route.

## Tasks

- [x] Write failing schema tests for create-with-name-only and update rejecting system fields.
- [x] Implement tenant category schema contract.
- [x] Write failing service tests for generated code/default sort/no mapping and pin behavior.
- [x] Implement service-side generated fields and pin command.
- [x] Add controller pin route.
- [x] Update tenant category dialog/table UI.
- [x] Update supplier catalog E2E for simplified create and pin.
- [x] Run API tests, admin tests/typecheck, and supplier catalog E2E.
- [x] Commit only this feature branch's relevant files.
