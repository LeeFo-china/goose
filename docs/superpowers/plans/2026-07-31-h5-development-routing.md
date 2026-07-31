# H5 Development Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `h5-dev.goodcms.cn` serve the standalone H5 application while preserving strict development/production API and H5 domain boundaries.

**Architecture:** Build `apps/h5` into an immutable Bun container, deploy it as `gooes-h5-dev` on loopback port `13030`, and atomically cut `h5-dev.goodcms.cn` over from the Web container after health checks. Keep public H5 API compatibility routes on the development API and leave the production static H5 topology unchanged.

**Tech Stack:** Bun, TypeScript/JavaScript, Docker Compose, GitHub Actions, Nginx.

---

### Task 1: Lock H5 runtime behavior

**Files:**
- Create: `apps/h5/server.test.ts`
- Modify: `apps/h5/server.ts`

- [x] Write a process-level test that starts the built H5 server, requests a deep
  `/p/:slug` route, and expects SPA HTML plus `X-Gooes-Service` and
  `X-Gooes-Revision`.
- [x] Run `bun test apps/h5/server.test.ts` and confirm it fails because the
  service headers are missing.
- [x] Add the service and revision headers to static-file and SPA-fallback
  responses.
- [x] Run `bun test apps/h5/server.test.ts` and confirm it passes.

### Task 2: Lock the development deployment contract

**Files:**
- Create: `scripts/h5-development-deployment-contract.test.ts`
- Modify: `scripts/resolve-dev-change-plan.mjs`
- Modify: `scripts/verify-dev-build-plan.mjs`
- Modify: `scripts/resolve-web-deployment.mjs`

- [x] Add failing tests for H5 change classification, ordered build/deploy
  evidence, explicit manual H5 resolution, and the required compose/Nginx/CI
  fragments.
- [x] Run the contract test and confirm it fails on the unsupported H5 service.
- [x] Add `h5` to the development planner, verifier, and manual service resolver
  without changing production H5 URLs.
- [x] Run the contract test and confirm the planner/verifier assertions pass.

### Task 3: Add the independent H5 image and compose service

**Files:**
- Create: `docker/h5.Dockerfile`
- Modify: `deploy/docker-compose.dev.yml`
- Modify: `.github/workflows/build-docker-images.yml`

- [x] Extend the failing deployment contract with the H5 image repository,
  build case, OCI labels, compose port `13030`, and container health check.
- [x] Build the smallest Bun image that copies only the built H5 application,
  exposes port `3020`, and carries immutable revision/run labels.
- [x] Add `gooes-h5-dev` to development compose and the image build matrix.
- [x] Run the deployment contract and confirm these assertions pass.

### Task 4: Cut over the development hostname safely

**Files:**
- Create: `deploy/nginx/gooes-dev.conf`
- Modify: `.github/workflows/deploy-dev.yml`
- Modify: `scripts/deploy-dev-workflow-contract.test.ts`

- [x] Extend the failing workflow contract for H5 manifest resolution,
  digest-based compose deployment, container verification, Nginx backup,
  `nginx -t`, reload, rollback, and external smoke.
- [x] Track the complete development API/Admin/H5 Nginx configuration with H5
  page traffic on `13030` and public API/session routes on `13000`.
- [x] Add H5 support to the reusable dev deploy workflow and perform Nginx
  cutover only after the immutable H5 container is healthy.
- [x] Run both deployment contract test files and confirm they pass.

### Task 5: Verify and publish the development fix

**Files:**
- Verify all files from Tasks 1-4.
- Create: `docs/miniprogram/2026-07-31-h5-activity-environment-handoff.md`

- [x] Build H5 and run its process-level smoke test.
- [x] Run the targeted deployment and orchestration contract tests.
- [x] Run `git diff --check` and inspect the scoped diff.
- [x] Commit and push the isolated branch.
- [x] Build and deploy the H5 development image from immutable workflow
  evidence.
- [x] Verify the real development page, config, and activity-list endpoints.
- [x] Record the Orange read-only integration changes and WeChat domain
  configuration checklist in the handoff document.

Execution evidence:

- Build run: `30599760611`
- Deploy run: `30599827226`
- Deployed revision: `7aee4e83217a48e7149e8ca90e3cd2ae7c255f2d`
