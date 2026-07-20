# Phase 9 Payment Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Completed steps use checked boxes.

**Goal:** Make platform WeChat Pay profiles verifiably usable, make tenant activation inherit the validated service-provider profile, and expose secret-free readiness blockers before a real one-fen payment smoke.

**Architecture:** Add a read-only APIv3 credential probe around the official `GET /v3/certificates` endpoint, persist only sanitized validation evidence, and derive readiness from stored non-secret metadata. Tenant activation will copy payment runtime fields from the validated platform service-provider profile and retain a provenance foreign key; tenant-specific state remains limited to applyment and `sub_mchid` data.

**Tech Stack:** Bun, TypeScript, Fastify decorators, Supabase migrations, Next.js 15, shadcn/ui, Bun test.

**Status:** Completed on 2026-07-20. Implementation, review remediation, remote
migration, and verification are complete. Local/Remote versions are aligned.
The platform profiles remain operationally blocked until their secret bundles
are re-saved, validated, and reported ready; no real payment smoke was executed.

---

### Task 1: Persist validation evidence and profile provenance

**Files:**

- Create: `supabase/migrations/20260720223000_platform_payment_validation_readiness.sql`
- Modify: `apps/api/src/types/database.ts`
- Test: `apps/api/src/services/wechat-pay-migration-contract.test.ts`

- [x] **Step 1: Write the failing migration contract test**

Assert that the new migration adds `last_validation_error_code`,
`last_validation_error_message`, and `last_validation_request_id` to
`platform_payment_configs`, plus `platform_payment_config_id` with a foreign key
and index on `tenant_payment_configs`.

- [x] **Step 2: Run the migration contract test and verify RED**

Run: `cd apps/api && bun test src/services/wechat-pay-migration-contract.test.ts`

Expected: FAIL because the migration file and columns do not exist.

- [x] **Step 3: Add the migration**

Use additive nullable columns, non-blank checks for validation evidence, a
foreign key to `platform_payment_configs(id)`, and an index on the provenance
column. Add comments explaining that the columns must never contain secret
material or raw WeChat payloads.

- [x] **Step 4: Synchronize database types and verify GREEN**

The Supabase Management API rejected full type generation for the historical
project id, and `--db-url` generation required a local Docker daemon. The
complete 27-column platform config table, its two relationships, the tenant
provenance relationship, and the RPC signature were therefore synced from the
remote catalog and applied migrations without replacing the file with an empty
generator result.

Run: `cd apps/api && bun test src/services/wechat-pay-migration-contract.test.ts`

Run: `bun run api:typecheck`

Expected: PASS.

### Task 2: Add the APIv3 profile validation action

**Files:**

- Create: `apps/api/src/services/wechat-pay-profile-validator.ts`
- Create: `apps/api/src/services/wechat-pay-profile-validator.test.ts`
- Modify: `apps/api/src/services/wechat-pay-gateway.ts`
- Modify: `apps/api/src/services/wechat-pay-gateway.test.ts`
- Modify: `apps/api/src/services/platform-payment-configs.ts`
- Modify: `apps/api/src/services/platform-payment-configs.test.ts`
- Modify: `apps/api/src/repositories/platform-payment-configs.ts`
- Modify: `apps/api/src/controllers/platform-payment-configs/index.ts`
- Modify: `apps/api/src/controllers/platform-payment-configs/routes.test.ts`

- [x] **Step 1: Write failing validator and service tests**

Cover the following behavior:

```typescript
expect(await validator.validate(config)).toMatchObject({
  ok: true,
  probe_mode: 'platform_certificate',
});

expect(
  await service.validateWechatPayProfile(platformAuth, profileCode),
).toMatchObject({ validation: { ok: true } });
```

Also cover malformed private/public keys, APIv3 keys not exactly 32 bytes,
non-HTTPS callback URLs, signed WeChat failures, and persistence of sanitized
failure code/message/request ID without raw response text.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd apps/api
bun test src/services/wechat-pay-profile-validator.test.ts \
  src/services/platform-payment-configs.test.ts \
  src/controllers/platform-payment-configs/routes.test.ts
```

Expected: FAIL because the validator and route do not exist.

- [x] **Step 3: Implement the official read-only credential probe**

Add `WechatPayGateway.validateMerchantCredentials()` using the existing APIv3
authorization builder and the official `GET /v3/certificates` endpoint. Verify
the WeChat response with the configured WeChat Pay public key. On a successful
certificate response, decrypt one encrypted certificate with the APIv3 key to
prove the key is usable. Treat the documented signed `RESOURCE_NOT_EXISTS`
response as public-key mode after validating the APIv3 key length.

- [x] **Step 4: Persist validation status safely**

Add repository update support and
`PlatformPaymentConfigService.validateWechatPayProfile()`. A successful probe
sets `validation_status=valid`; a failed probe sets `invalid`. Both set
`last_validated_at`; only stable error code, operator-facing sanitized message,
and Request-ID may be persisted.

- [x] **Step 5: Expose the validation route and verify GREEN**

Add:

```text
POST /platform/payment/wechat-pay/profiles/:profileCode/validate
```

Require platform payment manage permission and return the safe profile view plus
the validation result. Re-run the focused tests and expect PASS.

### Task 3: Derive secret-free readiness and enforce runtime gates

**Files:**

- Create: `apps/api/src/services/platform-payment-readiness.ts`
- Create: `apps/api/src/services/platform-payment-readiness.test.ts`
- Modify: `apps/api/src/services/platform-payment-configs.ts`
- Modify: `apps/api/src/controllers/platform-payment-configs/index.ts`
- Modify: `apps/api/src/controllers/platform-payment-configs/routes.test.ts`
- Modify: `apps/api/src/services/billing-recharge-payment-config.ts`
- Modify: `apps/api/src/services/billing-recharge-payment-request.test.ts`
- Modify: `apps/api/src/services/wechat-pay-order-retry.ts`
- Modify: `apps/api/src/services/wechat-pay-order-retry.test.ts`

- [x] **Step 1: Write failing readiness and runtime gate tests**

Require stable blockers for missing config, inactive status, invalid validation,
missing merchant/AppID/certificate/secret/callback fields, wrong merchant mode,
missing required channels, and a non-HTTPS callback URL. Verify that both direct
recharge and tenant project-payment order creation reject any config whose
`validation_status` is not `valid`.

- [x] **Step 2: Run focused tests and verify RED**

Run:

```bash
cd apps/api
bun test src/services/platform-payment-readiness.test.ts \
  src/services/billing-recharge-payment-request.test.ts \
  src/services/wechat-pay-order-retry.test.ts
```

Expected: FAIL on the new readiness and validation gates.

- [x] **Step 3: Implement readiness and route**

Return pageless fixed-profile readiness because the source is the repository's
two bounded internal profiles:

```text
GET /platform/payment/wechat-pay/readiness
```

The response contains only profile code, `ready`, stable blocker objects,
validation status/date, and safe booleans. It must never load or return a secret
bundle.

- [x] **Step 4: Enforce runtime validation and verify GREEN**

Add `validation_status === "valid"` to direct recharge and tenant project
payment gates. Re-run focused tests and expect PASS.

### Task 4: Source tenant activation from the validated platform profile

**Files:**

- Modify: `apps/api/src/schema/wechat-pay-applyments.ts`
- Modify: `apps/api/src/schema/wechat-pay-applyments.test.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments-types.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments-platform.ts`
- Modify: `apps/api/src/services/wechat-pay-applyments.test.ts`
- Modify: `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyment-actions.tsx`
- Modify: `apps/admin/components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts`

- [x] **Step 1: Write failing activation tests**

Verify activation rejects when the central `tenant_service_provider` profile is
missing, inactive, invalid, incomplete, or lacks required channels. Verify a
valid activation copies service-provider merchant/AppID/serial/callback/secret
reference from the central profile, stores `platform_payment_config_id`, sets
`sub_app_id=null`, and copies only tenant-specific `sub_mchid` and applyment
state from the application.

- [x] **Step 2: Run activation tests and verify RED**

Run:

```bash
cd apps/api
bun test src/schema/wechat-pay-applyments.test.ts \
  src/services/wechat-pay-applyments.test.ts
```

Expected: FAIL because activation still trusts caller-supplied service-provider
credentials.

- [x] **Step 3: Implement activation hard gate**

Inject the platform payment repository into the applyment service. Reduce the
activation body to an empty strict object, fetch the central service-provider
profile server-side, apply the same readiness policy, and write tenant config
from that profile. Preserve the existing applyment opened/bound/`sub_mchid`
gate.

- [x] **Step 4: Simplify Admin activation interaction and verify GREEN**

Remove merchant, AppID, secret-reference, serial, and callback input fields from
the applyment detail action. Display that these values come from the validated
platform service-provider profile and submit `{}`. Re-run API and Admin focused
tests and expect PASS.

### Task 5: Add Admin readiness and validation controls

**Files:**

- Modify: `apps/admin/components/settings/platform-payment-settings-types.ts`
- Modify: `apps/admin/components/settings/platform-payment-settings-panel.tsx`
- Modify: `apps/admin/components/settings/platform-payment-settings-panel.test.ts`

- [x] **Step 1: Write failing Admin source/behavior tests**

Require a `validate` request, a validation button, last validation evidence, and
readiness blockers rendered with existing shadcn components.

- [x] **Step 2: Run Admin tests and verify RED**

Run: `cd apps/admin && bun test components/settings/platform-payment-settings-panel.test.ts`

Expected: FAIL because the controls are absent.

- [x] **Step 3: Implement the Admin controls**

Use existing `Button`, `Badge`, `StatusAlert`, and list primitives. Disable
validation when the profile is unconfigured or the user is read-only. Never
render private keys, APIv3 keys, raw WeChat responses, or full certificate
serial numbers.

- [x] **Step 4: Verify GREEN**

Run the focused Admin tests and `bun run admin:check`.

### Task 6: Apply migration and complete verification

**Files:**

- Modify: `docs/decoration-finance/2026-07-20-phase9-task5-readiness-retry-hardening.md`

- [x] **Step 1: Run complete focused verification**

```bash
(cd apps/api && bun test \
  src/services/wechat-pay-profile-validator.test.ts \
  src/services/platform-payment-configs.test.ts \
  src/services/platform-payment-readiness.test.ts \
  src/services/wechat-pay-applyments.test.ts \
  src/services/wechat-pay-order-retry.test.ts \
  src/services/billing-recharge-payment-request.test.ts \
  src/controllers/platform-payment-configs/routes.test.ts)
(cd apps/admin && bun test \
  components/settings/platform-payment-settings-panel.test.ts \
  components/platform-wechat-pay/platform-wechat-pay-applyments-page-layout.test.ts)
bun run api:check
bun run admin:check
git diff --check
```

Expected: all focused tests and static checks PASS.

- [x] **Step 2: Apply and verify the migration**

Inspect the exact pending migration, run `supabase db push`, then run
`supabase migration list` and confirm Local/Remote alignment. The rollback is
to stop using the nullable columns first, then drop the index, foreign key, and
new nullable columns in a new forward migration.

- [x] **Step 3: Record operational state**

Update the Phase 9 readiness document with the new endpoints, hard gates,
migration result, remaining real-world onboarding blockers, and the requirement
to rotate all credentials previously exposed outside the secret manager.

- [x] **Step 4: Review and commit**

Run a spec-compliance review and a code-quality review, then commit focused
changes using Conventional Commits.

Review remediation completed:

- Tenant Admin and tenant API cannot mutate centrally managed service-provider
  configuration.
- Callback URLs follow the official HTTPS callback constraints instead of only
  checking the scheme.
- Concurrent first-order unique conflicts return the winning order only after
  its `prepay_id` exists; while the winner is still creating it, the loser gets
  a stable retryable 409 and makes no duplicate upstream prepay request.
- Public profile responses no longer expose the internal secret setting key.
- Tenant responses and forms no longer expose or accept internal encrypted
  config locators, and the legacy billing editor routes to the canonical
  payment settings workflow.
- Generated types include the complete platform config table, the provenance
  relationship, and atomic project-order RPC; repositories use typed paths.

Final evidence:

- Phase 9 API changed tests: 39 files, 376 pass, 0 fail.
- Phase 9 Admin changed tests: 4 files, 34 pass, 0 fail.
- `bun run api:check`, `bun run admin:check`, and `git diff --check` pass.
- Stable repository suite: 589 pass and two pre-existing contract failures,
  covering a stale explicit-migration count and the Web/Nginx server-block
  count; both reproduce unchanged on main.
- Remote migration list is aligned through `20260720224000`; all Phase 9
  catalog, lock/CAS, trigger, and RPC permission checks pass.
