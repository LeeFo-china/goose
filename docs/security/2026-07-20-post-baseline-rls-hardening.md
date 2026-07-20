# Post-Baseline Service-Role Table RLS Hardening - 2026-07-20

## Scope

This follow-up closes two RLS gaps introduced after the repository-wide
deny-by-default baseline in
`20260706110000_harden_public_direct_access.sql`:

- `public.platform_partner_member_rebind_requests`
- `public.tenant_credit_refund_requests`

No business rows were inserted, updated, or deleted by this hardening.

## Trigger And Root Cause

Supabase Security Advisor reported both tables with `rls_disabled`. They were
created by migrations after the 2026-07-06 baseline, but their create
migrations did not explicitly enable RLS.

The pre-change privilege audit showed that `anon` and `authenticated` already
had no table privileges. The immediate exposure was therefore narrower than a
blanket public grant, but the tables still violated the repository's required
defense-in-depth invariant and remained vulnerable to future grant drift.

The audit also found seven remote migration versions that were absent from
`main`. They had been applied from the tracked
`feature/douyin-decoration-miniapp` worktree:

```text
20260719100000_create_douyin_miniapp_foundation.sql
20260719101000_create_douyin_miniapp_marketing.sql
20260719102000_create_douyin_miniapp_releases.sql
20260719110000_add_douyin_installation_binding_rpc.sql
20260719190232_create_douyin_authorization_event_ledger.sql
20260720100000_harden_douyin_platform_installation_management.sql
20260720110000_add_douyin_authorizer_force_refresh_claim.sql
```

`supabase migration fetch` was run into a temporary directory. After comments
and blank lines were normalized, every tracked worktree file had identical SQL
to the remote migration history. Those files were restored to `main` before a
new migration version was selected. This avoided reusing the already occupied
`20260720110000` version.

## Access-Path Audit

Application access remains API-only and service-role-only:

- `apps/api/src/repositories/platform-partner-member-rebind.ts` uses
  `SupabaseDB.getAdminClient()` for table reads, inserts, updates, and the
  controlled approval RPC.
- `apps/api/src/repositories/platform-billing-recharge-refunds.ts` uses
  `SupabaseDB.getAdminClient()` for paginated reads, reviews, and refund state
  updates.
- `apps/api/src/repositories/billing-recharge-refund-callbacks.ts` uses the same
  admin client for callback lookup and controlled refund RPCs.
- Reconciliation RPCs are `SECURITY DEFINER`, revoked from
  `PUBLIC`/`anon`/`authenticated`, and executable by `service_role` only.

No repository path requires direct `DELETE`, `TRUNCATE`, `REFERENCES`, or
`TRIGGER` privileges on either table.

## Applied Design

Migration:

```text
20260720120000_harden_sensitive_service_role_tables_rls.sql
```

The migration:

1. Enables RLS on both tables.
2. Revokes all table privileges from `PUBLIC`, `anon`, and `authenticated`.
3. Does not create client policies, so direct client access remains denied by
   default.
4. Does not use `FORCE ROW LEVEL SECURITY`, preserving existing table-owner
   `SECURITY DEFINER` RPC behavior.
5. Grants `service_role` only `SELECT`, `INSERT`, and `UPDATE`.
6. Explicitly revokes `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER` from
   `service_role`.

## Verification Evidence

Pre-push gate:

```text
supabase db push --dry-run:
  only 20260720120000_harden_sensitive_service_role_tables_rls.sql

focused Bun tests:
  72 pass, 0 fail, 467 expect() calls

apps/api bun run check:
  TypeScript typecheck passed
  API build passed
  API file-size check passed

git diff --check:
  passed
```

Post-migration database state:

```text
Local/Remote migration history:
  aligned through 20260720120000

Both target tables:
  relrowsecurity=true
  relforcerowsecurity=false
  pg_policies count=0

anon/authenticated:
  SELECT=false
  INSERT=false
  UPDATE=false
  DELETE=false

service_role:
  rolbypassrls=true
  SELECT=true
  INSERT=true
  UPDATE=true
  DELETE=false

Supabase Security Advisor:
  No issues found

Supabase JS service-role read smoke:
  platform_partner_member_rebind_requests: ok
  tenant_credit_refund_requests: ok
```

The new contract test
`apps/api/src/services/sensitive-service-role-tables-rls-contract.test.ts`
also scans every public table created after the 2026-07-06 baseline and fails
when no post-baseline migration enables RLS for that table.

## Rollback Boundary

Rollback must be delivered as a new migration. First prove that a regression
comes from RLS or a removed table privilege rather than from API authorization,
tenant context, or repository behavior.

For an emergency rollback:

1. Change only the affected table.
2. Restore only the specific `service_role` privilege proven necessary.
3. Do not grant direct access to `PUBLIC`, `anon`, or `authenticated`.
4. Do not restore `DELETE` unless a repository call path and test demonstrate
   that it is required.
5. If RLS must be disabled temporarily, record the exception and add a bounded
   follow-up migration before restoring traffic.
