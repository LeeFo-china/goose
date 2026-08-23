# Tenant Brand System Managed Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 租户新建和编辑私有品牌只需要维护品牌名称，编码、法定名称、平台映射和排序由系统维护。

**Architecture:** 沿用租户私有类目的收敛模式：API schema 不再接受租户提交的品牌系统字段，service 层补齐稳定编码、默认排序、空法定名称和空平台映射。Admin 表单和品牌列表移除映射与法定名称负担，保留已有平台共享品牌只读能力。

**Tech Stack:** Bun, TypeScript, Fastify, Zod, Supabase RPC repository, Next.js admin, shadcn/Radix, Tailwind.

---

## File Structure

- Modify `apps/api/src/schema/supplier-catalog-extensions.ts`
  - Tenant brand create only accepts `name` and optional `status`.
  - Tenant brand update only accepts `expected_version`, `name`, and optional `status`.
- Modify `apps/api/src/schema/supplier-catalog.test.ts`
  - Assert tenant brand create works with name-only payload.
  - Assert tenant brand update rejects `code`, `legal_name`, `sort_order`, and `mapped_platform_brand_id`.
- Modify `apps/api/src/services/supplier-catalog-tenant.ts`
  - Generate tenant brand code from `brand_id`.
  - Default `legal_name` to `null`, `sort_order` to `100`, and `mapped_platform_brand_id` to `null`.
  - Preserve existing system fields on tenant brand update.
- Modify `apps/api/src/services/supplier-catalog-tenant.test.ts`
  - Verify create command injects system fields.
  - Verify update command preserves system fields.
- Modify `apps/admin/components/tenant-supplier-catalog/tenant-brand-dialog.tsx`
  - Remove editable code, legal name, platform brand mapping, and sort controls.
  - Show disabled code field with “保存后自动生成” on create.
- Modify `apps/admin/components/tenant-supplier-catalog/tenant-brand-table.tsx`
  - Remove platform mapping column from tenant brand list.
- Modify `apps/admin/components/tenant-supplier-catalog/tenant-supplier-catalog.test.tsx`
  - Update tenant brand request examples to name-only payloads.
- Modify `apps/admin/e2e/supplier-catalog-tenant-workflow.spec.ts`
  - Remove tenant platform brand mapping workflow assertions.
  - Verify tenant brand dialog exposes only system-generated code and brand name.
- Modify `apps/admin/e2e/supplier-catalog-mock-handlers.mjs`
  - Generate tenant brand code/defaults in mock create flow and preserve system fields in update flow.

## Tasks

- [x] Write failing schema tests for brand name-only create and system-field update rejection.
- [x] Implement tenant brand schema contract.
- [x] Write failing service tests for generated brand code/defaults and update preservation.
- [x] Implement service-side generated brand fields and protected update fields.
- [x] Update admin brand dialog/table and component tests.
- [x] Update supplier catalog E2E and mock backend behavior.
- [x] Run API tests, admin tests/typecheck, and supplier catalog E2E.
- [x] Commit only this feature branch's relevant files.
