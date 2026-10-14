# Employee Camera Onboarding Implementation Plan

> **For agentic workers:** Use executing-plans / dispatching-parallel-agents to implement the independent work scopes below; integrate and verify together.

**Goal:** Make employee camera onboarding recoverable, bounded, tenant-scoped and consistent before mini-program integration.

**Architecture:** Keep controller/service/repository/gateway boundaries. Use database migrations for durable registration claims and transactional device binding/sync, reuse Tencent request signing and existing employee permissions. Preserve current admin payloads; add only scoped endpoints required by onboarding.

**Tech Stack:** Bun, TypeScript, Fastify, Zod, Supabase/PostgreSQL.

## Work scopes

- [x] Read current code, handoff, permissions, schemas and migrations; isolated worktree created, existing 9 contract checks pass.
- [x] Registration worker: tenant + normalized SN claim before cloud creation, persist cloud result, replay/reconcile without duplicate CreateDevice; own registration service/repository/gateway/tests and migration 20261014090000.
- [x] Binding worker: one database transaction for camera and asset creation/occupation/release; lock and recheck status/tenant, translate unique conflicts; own project-camera mutations/repository/tests and migration 20261014091000.
- [x] Main: reproduce dropped SN with captured DB payload test; fix actual payload and stop sync overwriting binding state.
- [x] Main: single device page sync gateway (one DescribeChannels request, deadline) and batch repository RPC; controller validates UUID/page limits, service checks employee/project.update + tenant device ownership. Own migration 20261014092000.
- [x] Main: add GET /tenant-devices/:id/channels for exact cloud-device paginated local channels (project.read); preserve legacy assets endpoint.
- [x] Review integration: registration replay shape, no plaintext persisted secrets, sync/atomic-bind shared locking, permissions and cancellation, schema compatibility.
- [x] Verify API typecheck/build, focused behavior tests, disposable PostgreSQL migration/rollback/concurrency checks. No production mutations in this implementation task.
- [x] Update handoff with actual implemented routes, limits, recovery semantics and explicit not-deployed status.

## Verification commands

Run Bun tests from apps/api so @/ resolves; first reproduce each defect before changing behavior. Use existing postgres:15-alpine disposable container pattern, no remote DB or credentials. Run `bun run typecheck`, `bun run build`, `git diff --check`, and repository file-size guard after integration. Keep changes inside gooes; orange is read-only.

## Completed validation

106 tests passed, 0 failed, 622 assertions across 23 files, including isolated PostgreSQL migration/transaction/concurrency fixtures. API typecheck/build, file-size and permission guards, and diff whitespace check passed. See docs/operations/evidence/2026-10-14-employee-camera-onboarding/. No production operations or orange edits.
