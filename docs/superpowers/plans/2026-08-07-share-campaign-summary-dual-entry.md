# Share Campaign Summary Dual Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independent pending-reward and current-active share campaign entries while preserving the legacy `focus_campaign` contract.

**Architecture:** Preserve the bounded legacy summary window for compatibility, and add bounded targeted queries for pending rewards and the current effective marketing campaign. A pure selector receives hydrated candidates plus the effective marketing campaign ID, then exposes all three selections through the existing standalone summary and detail-bootstrap payloads. Extend the shared summary DTO with explicit instance and parent marketing campaign identifiers.

**Tech Stack:** Bun, TypeScript, Fastify, Supabase, Bun test.

---

### Task 1: Lock the selection contract with tests

**Files:**
- Create: `apps/api/src/services/customer-project-log-shares/campaign-summary-selection.ts`
- Create: `apps/api/src/services/customer-project-log-shares/campaign-summary-selection.test.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/campaign-summary-contract.test.ts`

- [x] **Step 1: Write a failing test for simultaneous pending and active entries**

Create candidates where an old campaign has an active reward voucher and the current effective marketing campaign has an active instance. Assert that `pendingRewardCampaign` returns the old achieved instance, `activeCampaign` returns the current instance, and `focusCampaign` remains the old achieved instance.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd apps/api
bun test src/services/customer-project-log-shares/campaign-summary-selection.test.ts src/services/customer-project-log-shares/campaign-summary-contract.test.ts
```

Expected: failure because the selector and new summary fields do not exist.

- [x] **Step 3: Implement the pure selector**

The selector must:

```typescript
return {
  pendingRewardCampaign,
  activeCampaign,
  focusCampaign,
};
```

`pendingRewardCampaign` uses voucher status `active`; `activeCampaign` must belong to the current effective marketing campaign and must not also be pending reward; `focusCampaign` preserves the legacy pending, any active, then claimed order.

- [x] **Step 4: Run the focused tests and verify GREEN**

Run the command from Step 2 and require zero failures.

### Task 2: Expose the additive response fields

**Files:**
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/customer-campaigns.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/base.ts`
- Modify: `apps/api/src/services/customer-project-log-shares/legacy/shared-types.ts`
- Modify: `apps/api/src/controllers/customer-project-log-shares/customer-controller.ts`
- Modify: `apps/api/src/controllers/customer-self-service/detail-bootstrap-controller.ts`

- [x] **Step 1: Build selection candidates from hydrated campaigns**

For every hydrated campaign, include the existing legacy claimable decision and current reward voucher status. Pass `configResult.effective?.campaign_id`, distinguishing no effective config from a legacy effective config whose campaign ID is `null`.

- [x] **Step 2: Serialize all three entries with one DTO builder**

Extend `buildCampaignSummary()` so every entry returns:

```typescript
{
  instance_id: campaign.id,
  id: campaign.id,
  campaign_id: campaign.id,
  marketing_campaign_id: campaign.campaign_id,
  project_id: campaign.project_id,
  log_id: campaign.log_id,
}
```

Keep existing progress, token, status, and reward fields unchanged.

- [x] **Step 3: Keep fallback payloads structurally stable**

Both disabled summary builders and the service empty branch must always return `pending_reward_campaign: null` and `active_campaign: null`.

- [x] **Step 4: Run focused and type checks**

```bash
cd apps/api
bun test src/services/customer-project-log-shares/campaign-summary-selection.test.ts src/services/customer-project-log-shares/campaign-summary-contract.test.ts
cd ../..
bun run api:typecheck
```

Expected: all tests pass and TypeScript exits successfully.

### Task 3: Document and verify the Orange handoff

**Files:**
- Create: `docs/miniprogram/2026-08-07-share-campaign-summary-dual-entry-backend-handoff.md`

- [x] **Step 1: Document both endpoints and field semantics**

Record the additive fields, canonical `instance_id`, compatibility aliases, parent `marketing_campaign_id`, selection priority, null behavior, and Orange display rules.

- [x] **Step 2: Run the complete verification set**

```bash
bun run api:typecheck
bun run api:build
bun run api:check-file-size
git diff --check
```

Also run a read-only dev-data smoke for customer `13200001008`, verifying that pending instance `f170…0012` and current active instance `ca852c10…` are returned simultaneously while `focus_campaign` remains compatible.

- [x] **Step 3: Commit the focused change**

```bash
git add apps/api/src/services/customer-project-log-shares \
  apps/api/src/repositories/customer-project-log-share-campaigns.ts \
  apps/api/src/repositories/customer-project-log-share-campaigns \
  apps/api/src/controllers/customer-project-log-shares/customer-controller.ts \
  apps/api/src/controllers/customer-self-service/detail-bootstrap-controller.ts \
  docs/miniprogram/2026-08-07-share-campaign-summary-dual-entry-backend-handoff.md \
  docs/superpowers/plans/2026-08-07-share-campaign-summary-dual-entry.md
git commit -m "feat(share): 拆分奖励与当前助力入口"
```
