# Social Video Transcription History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /social-video/transcriptions?page=1&pageSize=5` for the current tenant employee's recent social-video transcription summaries without returning full `text` or `segments`.

**Architecture:** Keep the existing controller/service/repository split. The controller parses auth and query params, the transcription service enforces service availability, tenant isolation, employee permission, and owner access, and repositories perform paginated Supabase reads plus one batched script-summary query to avoid N+1.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Zod, Supabase PostgREST, existing `ResponseHandler` and `Errors`.

---

### Task 1: Contract and repository tests

**Files:**
- Modify: `apps/api/src/schema/social-video.ts`
- Modify: `apps/api/src/repositories/social-video-transcriptions.ts`
- Modify: `apps/api/src/repositories/social-video-scripts.ts`
- Create: `apps/api/src/schema/social-video-transcription-history.test.ts`
- Create: `apps/api/src/repositories/social-video-transcription-history.test.ts`

- [x] Write failing tests for query defaults/max, transcription list field selection excluding `text/segments`, pagination range, tenant/user filters, and batched script summary query.
- [x] Run the new tests and confirm they fail because the schema/repository methods do not exist.
- [x] Add `ListSocialVideoTranscriptionsQuerySchema`, `listRecentByUser`, and `listSummariesByTranscriptionIds`.
- [x] Run the new tests and confirm they pass.

### Task 2: Service and controller route

**Files:**
- Modify: `apps/api/src/controllers/social-video/index.ts`
- Modify: `apps/api/src/services/social-video-transcriptions/legacy-service.ts`
- Modify: `apps/api/src/services/social-video-transcriptions/legacy/tasks.ts`
- Modify: `apps/api/src/services/social-video-transcriptions/legacy/shared.ts`
- Create: `apps/api/src/services/social-video-transcription-history.test.ts`

- [x] Write failing service test proving the list call enforces service enablement, `social_video_transcription.create`, tenant resolution, current user filtering, text preview, text length, billing shape, `script_count`, and `latest_script`.
- [x] Run the service test and confirm it fails because `listTasks` does not exist.
- [x] Add `listTasks`, `serializeRecordSummary`, and `GET /social-video/transcriptions` before the `/:id` route.
- [x] Run the service test and confirm it passes.

### Task 3: Handoff document and verification

**Files:**
- Create: `docs/2026-08-24-social-video-transcription-history-api.md`

- [x] Write a concise mini-program handoff document with endpoint, auth, query, response fields, error behavior, and smoke checklist.
- [x] Run focused tests.
- [x] Run `bun run api:typecheck`.
- [x] Run `bun run api:build` if typecheck succeeds.
- [x] Review git diff for unrelated changes and confirm orange stayed untouched.
