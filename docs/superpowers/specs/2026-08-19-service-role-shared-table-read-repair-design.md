# Service Role Shared Table Read Repair Design

## Problem

Migration `20260818122000_materialize_tenant_supplier_catalog_schema.sql`
revoked table-level `SELECT` from `service_role` on
`public.employees` and `public.supplier_products`, then granted only the
columns needed by catalog trigger functions. The API uses the same trusted
`service_role` for repository reads. Login therefore cannot read
`employees.user_id` and `employees.phone`, and supplier-product reads cannot
load their normal projections.

The development deployment exposed this as PostgreSQL error `42501` during
the login smoke. The API container was already replaced, while subsequent
service deployments were skipped by the readiness gate.

## Decision

Add one forward-only repair migration after `20260819124000`. It restores
table-level `SELECT` on both shared tables to `service_role` and verifies
the resulting privileges with `has_table_privilege`.

The repair does not:

- edit any migration already applied to development;
- grant privileges to `PUBLIC`, `anon`, or `authenticated`;
- restore direct supplier-product write privileges;
- change RLS policies, application code, or production data.

This is the minimum compatible repair because the current API intentionally
uses `service_role` across many employee and supplier-product repositories.
Column-level trigger grants cannot isolate trigger execution from those API
queries when both run under the same database role.

## Regression Protection

A migration contract test must fail while the repair migration is absent. It
will require:

- a bounded forward-only transaction;
- full table-level `SELECT` grants for `employees` and
  `supplier_products`;
- post-grant privilege assertions;
- no privilege widening for untrusted roles;
- no later migration that revokes these two table-level reads.

Local verification will reset the Supabase database and execute representative
employee-login and supplier-product projections under
`SET LOCAL ROLE service_role`.

## Deployment

1. Push the hotfix branch and create a PR.
2. Run development migration plan, apply exactly the new migration, and verify
   Local/Remote alignment.
3. Verify the live development login and supplier-product API paths.
4. Squash-merge the PR so the normal image build and automatic development
   deployment run against the repaired migration history.
5. Keep production migration on hold.

## Rollback

The migration is non-destructive. A technical rollback would revoke the two
table-level grants and restore the previous column grants, but that would
recreate the outage. Re-restriction is allowed only after the API is moved to
a dedicated least-privilege role or audited RPC boundary and its login and
product paths no longer require these table reads.
