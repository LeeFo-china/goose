# Douyin Template Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the latest uploaded template-app draft into a merchant test release and QR code from one Gooes platform action, while retaining manual audit and publish gates.

**Architecture:** Add a typed Douyin V2 template-management gateway for template-app drafts, template promotion, and template listing. A platform-only orchestration service will identify the exact latest draft for the server-configured template AppID, promote or recover its matching template, then reuse the existing merchant release upload and test-QR state machine. A compact platform console page will display the fixed template source, let an authorized operator select a merchant installation, and run this action.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase-backed existing release state machine, Next.js, shadcn/Radix, Tailwind.

---

### Task 1: Douyin Template Management Gateway

**Files:**
- Create: `apps/api/src/gateways/douyin-open-platform/template-client.ts`
- Create: `apps/api/src/gateways/douyin-open-platform/template-client.test.ts`
- Modify: `apps/api/src/gateways/douyin-open-platform/client.ts`

- [x] Write failing tests for parsing template-app drafts, listing templates, adding a draft, and rejecting malformed or failed provider responses.
- [x] Run `bun test src/gateways/douyin-open-platform/template-client.test.ts` and verify the missing implementation failure.
- [x] Implement the three V2 calls with bounded schemas and sanitized provider errors.
- [x] Re-run the targeted gateway tests.

### Task 2: One-Action Promotion Service and Controller

**Files:**
- Create: `apps/api/src/services/platform-douyin-template-promotion.ts`
- Create: `apps/api/src/services/platform-douyin-template-promotion.test.ts`
- Modify: `apps/api/src/schema/platform-douyin-miniapps.ts`
- Modify: `apps/api/src/controllers/platform-douyin-miniapps/index.ts`
- Modify: `apps/api/src/controllers/platform-douyin-miniapps/index.test.ts`
- Create: `apps/api/src/services/platform-douyin-template-promotion/default-service.ts`

- [x] Write failing service tests for exact configured template AppID selection, existing-template reuse, new-template promotion, post-timeout recovery, ambiguous template rejection, and upload-plus-QR composition.
- [x] Run the targeted service test and verify RED.
- [x] Implement strict request validation and platform permission checks.
- [x] Add `POST /platform/douyin-miniapps/:id/releases/promote-latest-template` and compose the existing release service.
- [x] Re-run service and controller tests.

### Task 3: Platform Console Action

**Files:**
- Create: `apps/admin/app/(console)/platform/douyin-miniapps/page.tsx`
- Create: `apps/admin/components/platform-douyin-miniapps/platform-douyin-release-panel.tsx`
- Create: `apps/admin/components/platform-douyin-miniapps/platform-douyin-release-rules.ts`
- Create: `apps/admin/components/platform-douyin-miniapps/platform-douyin-release-rules.test.ts`
- Modify: `apps/admin/components/layout/menu-config.ts`

- [x] Write failing rules and navigation contracts for the fixed template source, publishable merchants, and permission-gated entry.
- [x] Run the targeted admin tests and verify RED.
- [x] Implement the server page and client action with existing backend request helpers and shadcn controls.
- [x] Re-run the targeted admin tests and type checks.

### Task 4: Verification and Delivery

**Files:**
- Modify only files required by verification findings.

- [x] Run focused API and admin tests.
- [x] Run API and admin type checks/build gates.
- [x] Start the admin dev server and verify the platform page at desktop and mobile widths.
- [x] Confirm no `ext.json`, deployment key, token, or secret is tracked or rendered.
- [ ] Commit, push, open a PR, inspect checks, and squash merge.
