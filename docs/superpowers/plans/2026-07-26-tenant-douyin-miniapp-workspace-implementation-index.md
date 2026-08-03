# Tenant Douyin Miniapp Workspace Implementation Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the confirmed tenant-side Douyin miniapp workspace, self-service authorization and audit submission, dedicated Douyin lead operations, and production hardening in four independently verifiable phases.

**Architecture:** Reuse `douyin_miniapp_installations`, `douyin_miniapp_releases`, `marketing_leads`, `douyin_miniapp_lead_submissions`, existing public content, customer, permission, and notification capabilities. Add tenant-safe service facades and narrowly scoped migrations; keep platform secrets and formal publishing behind existing platform services.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase/PostgreSQL migrations and RPC, Next.js 15 App Router, React 19, shadcn/Radix, Tailwind CSS, TanStack Table.

---

## Execution Order

Execute and verify the plans in this order:

1. [Phase 1: Tenant Workspace Foundation](./2026-07-26-tenant-douyin-miniapp-phase1-workspace-foundation.md)
2. [Phase 2: Self-Service Authorization, Preview, and Audit](./2026-07-26-tenant-douyin-miniapp-phase2-authorization-preview-audit.md)
3. [Phase 3: Douyin Lead Pool and Customer Conversion](./2026-07-26-tenant-douyin-miniapp-phase3-leads-conversion.md)
4. [Phase 4: Assistance, Hardening, and Rollout](./2026-07-26-tenant-douyin-miniapp-phase4-assistance-hardening.md)

Each phase ends with a deployable, testable result. Do not start the next phase until the current phase passes its exit gate.

## Non-Negotiable Boundaries

- Database changes use versioned files under `supabase/migrations/`; never repair production data manually.
- Before any development database migration, list the exact pending files and obtain environment-specific authorization.
- After an authorized migration, run `supabase migration list` and require Local/Remote alignment.
- Tenant APIs derive `tenant_id` from `AuthContext`; they never accept a caller-selected tenant ID.
- Miniapp public APIs derive tenant and installation from the verified miniapp session.
- Tenant responses never include component secrets, authorizer tokens, refresh tokens, deployment keys, message Token/AES, or template internal identifiers.
- Formal publish remains available only through `platform.douyin_miniapp.manage`.
- Every list is paginated with default `page=1&pageSize=20`, maximum `pageSize=100`.
- Reuse `marketing_leads.source = 'douyin_miniapp'`; do not create a duplicate lead table.
- Preserve unrelated dirty worktree files and never modify `/Users/leefo/Public/work/orange`.

## UI Implementation Gate

Before writing Admin UI in each phase:

1. Apply `$shadcn`, `$design-taste-frontend`, `$impeccable`, and the local `admin-design` rules.
2. Run project context inspection from `apps/admin`:

```bash
pnpm dlx shadcn@latest info --json
```

3. Inspect installed components before adding anything.
4. For every shadcn component used, retrieve current documentation:

```bash
pnpm dlx shadcn@latest docs button badge card alert empty skeleton table tabs dialog
```

5. Use the confirmed product settings:

```text
DESIGN_VARIANCE: 3
MOTION_INTENSITY: 2
VISUAL_DENSITY: 7
```

6. Preserve Gooes Admin tokens, 8px maximum default radius, yellow/black identity, compact Chinese typography, and flat operational surfaces.
7. Do not use marketing Hero composition, glass effects, gradients, nested cards, decorative motion, or duplicated CTA intent.

## Official Douyin References

- Authorization overview: https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/authorization
- Direct authorization link V2: https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/authorization/gen-link-v2
- Authorization code: https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/authorization/auth-code
- Authorizer access token: https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/API/smallprogram/authorization/authorizer-access-token
- Permission sets: https://developer.open-douyin.com/docs/resource/zh-CN/thirdparty/overview-guide/smallprogram/permissions

## Global Verification Commands

Run focused tests first, then workspace checks:

```bash
bun test apps/api/src/services/tenant-douyin-miniapp
bun test apps/api/src/controllers/tenant-douyin-miniapp
bun test apps/admin/components/douyin-miniapp
bun run api:check
pnpm --dir apps/admin check
bun run douyin-mini:check
bun run check:permission-boundaries
```

Expected result: every command exits `0`; focused tests report no failures.

## Commit Policy

Commit after each task using Conventional Commits. Stage only the exact files named by that task.

Recommended sequence:

```text
feat(db): add tenant douyin workspace permissions
feat(api): expose tenant douyin workspace
feat(admin): add tenant douyin workspace
feat(douyin): add tenant authorization flow
feat(api): add tenant douyin release actions
feat(admin): add douyin preview and audit flow
feat(db): extend douyin lead operations
feat(api): add tenant douyin lead operations
feat(admin): add douyin lead pool
feat(douyin): add tenant assistance and rollout checks
```

## Final Completion Gate

The whole feature is complete only when:

- one tenant cannot have two active merchant installations;
- tenant admin can authorize, preview, and submit audit without receiving secrets;
- platform operator alone can formally publish;
- miniapp content resolves the correct tenant and only published content;
- a consultation enters the correct tenant's lead pool, can be assigned, followed, and converted once;
- notification, permission, error, empty, long-text, narrow-screen, and revoked-authorization states are verified;
- all migration histories align in the authorized target environment;
- mobile smoke verifies brand, cases, sites, and consultation.
