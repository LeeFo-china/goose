# Platform Service Fulfillment Attachment Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual `file_id` entry in admin platform service fulfillment records with direct attachment upload.

**Architecture:** Reuse the existing COS direct-upload flow and existing `file_ids` persistence on fulfillment records. Add a dedicated private upload scene for platform service fulfillment attachments, then update the admin record-fulfillment dialog to upload files and submit returned `file_id`s.

**Tech Stack:** Fastify + Zod + Supabase service role on API; Next.js + shadcn/ui + Tailwind + existing `uploadDirectToCos` helper on admin.

---

### Task 1: Backend upload scene

**Files:**
- Modify: `apps/api/src/controllers/uploads/index.ts`
- Modify: `apps/api/src/controllers/uploads/direct-upload-file-policy.ts`
- Test: `apps/api/src/controllers/uploads/index.test.ts`
- Test: `apps/api/src/controllers/uploads/direct-upload-file-policy.test.ts`

- [ ] Add `tenant_service_fulfillment_attachment` to direct-upload scenes.
- [ ] Allow only platform admins to use this scene.
- [ ] Mark the scene as private.
- [ ] Allow images and PDF up to 10MB.
- [ ] Verify direct-init and direct-complete reject non-platform users and accept platform admins.

### Task 2: Admin record-fulfillment upload UI

**Files:**
- Modify: `apps/admin/components/platform-service-orders/platform-service-work-order-actions.tsx`
- Test: `apps/admin/components/platform-service-orders/platform-service-orders-page.test.ts`

- [ ] Replace `file_id` textarea with a file input based upload control.
- [ ] Upload selected files through `uploadDirectToCos` using scene `tenant_service_fulfillment_attachment`.
- [ ] Show uploading state, uploaded file list, delete action, and upload errors.
- [ ] Submit `file_ids` from uploaded files when saving fulfillment record.
- [ ] Keep max 10 attachments and support image/PDF only.

### Task 3: Verification and integration

**Files:**
- No production file changes.

- [ ] Run targeted API tests for upload policy/controller.
- [ ] Run targeted admin platform service order tests.
- [ ] Run `bun run check` in `apps/api`.
- [ ] Run `pnpm run check` in `apps/admin`.
- [ ] Commit, push, create PR, squash merge, sync main, and monitor dev deployment.
