# Douyin Workspace Distill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the tenant Douyin miniapp workspace a flat, action-first page without nested cards.

**Architecture:** Keep server fetching and client action policy unchanged. Simplify markup in the four existing presentation components, then preserve and verify their contracts with focused component tests.

**Tech Stack:** Next.js 15, React 19, Tailwind, existing shadcn-style UI components, Bun tests.

---

### Task 1: Action-first workspace

**Files:** `apps/admin/components/douyin-miniapp/workspace.tsx`, `apps/admin/components/douyin-miniapp/workspace.test.tsx`

- [x] Put status badges and `TenantDouyinMiniappWorkspaceActions` first in a border-free page section; remove the outer `Card` and its nested action border.
- [x] Render brand, public content and release details as separated sections. Keep internal tenant name, public brand, counts, links, template attention and rejection reason.
- [x] Add a structural test that rejects the former “运营状态总览” heading and checks the status/action section appears before public content.
- [x] Run `bun test components/douyin-miniapp/workspace.test.tsx` from `apps/admin`; expect all workspace tests to pass.

### Task 2: Flatten secondary controls

**Files:** `apps/admin/components/douyin-miniapp/release-readiness-panel.tsx`, `apps/admin/components/douyin-miniapp/workspace-lead-capture-config.tsx`, `apps/admin/components/douyin-miniapp/workspace-qr-card.tsx`

- [x] Display readiness as a compact result, with blocker rows and existing action routes when blocked; remove the surrounding Card and metric grid borders.
- [x] Display lead capture as a plain section with the same switch, AppID, save request, error and permission gates; remove its section and Field borders.
- [x] Show QR in a compact plain row, retaining both QR titles and expiry cues.
- [x] Run `bun test components/douyin-miniapp/release-readiness-panel.test.ts components/douyin-miniapp/workspace-lead-capture-config.test.tsx` from `apps/admin`; expect all tests to pass.

### Task 3: Verify and integrate

**Files:** existing component tests and code above.

- [x] Run the four focused test files, `pnpm --filter @gooes/admin run check:file-size` and `pnpm --filter @gooes/admin run typecheck`; expect zero failures.
- [x] Inspect the final diff for unchanged API paths, action policy and permission checks.
- [x] Commit the focused change with a Conventional Commit message and integrate to local `main` once clean, preserving existing untracked files.
