# Douyin Task 4 Quality Hardening Design

## Scope

Harden the existing Douyin Open Platform credential flow without new dependencies. The
implementer generates the migration locally but does not push it remotely; the main
agent applies it after review. This change covers recoverable authorizer-token rotation,
atomic tenant binding, gateway error classification, and bounded best-effort cleanup.
Orange remains read-only.

## Selected approach

Use bounded persistence retries with encrypted readback before invoking the official
credential-recovery API. Immediate compensation was rejected because a lost database
response may already represent a successful write; retry-only recovery was rejected
because it cannot recover a truly lost single-use refresh token.

After a provider refresh succeeds, seal the returned access and refresh tokens once.
Attempt completion at most twice. Each completion and readback is bounded by both its
short operation timeout and the current lease deadline. After any false/rejected
completion, read the active installation and compare every stored access/refresh
envelope field with the sealed candidate. An exact match means the write committed and
only its response was lost.

If persistence remains unconfirmed, run compensation at most once and only when the
lease has enough headroom for retrieve, exchange, completion, and readback. Call
`POST /api/tpapp/v2/auth/retrieve_auth_code/` with the component token header and
`authorization_appid`, then exchange the returned authorization code through the
existing V2 token endpoint. Persist/read back the compensated pair with the same bounded
routine. Persistent database unavailability returns a stable recoverable 503; it must
not be converted to permanent reauthorization. No provider or completion operation
starts at or beyond its lease boundary.

## Atomic binding

Add `20260719110000_add_douyin_installation_binding_rpc.sql`. The SECURITY DEFINER RPC
uses `SET search_path = pg_catalog, public`, locks the merchant installation with
`FOR UPDATE`, then locks the active tenant row with `FOR SHARE` in that fixed order so a
concurrent tenant-status update cannot invalidate the check before commit.
`authorized_unbound` may bind once, setting tenant, deployment key, runtime config, and
active state. `active` accepts only an idempotent retry where tenant/deployment match and
JSONB runtime config is equal. Missing/inactive tenants and all other state transitions
raise stable conflict messages mapped by the repository to HTTP 409. PUBLIC, anon, and
authenticated receive no execute permission; only service_role does.

Rollback requires deploying repository code that no longer calls the RPC, then applying
a forward migration that drops
`public.bind_douyin_miniapp_installation(text, uuid, text, jsonb)`. Existing bindings are
not automatically reverted because they are business data.

## Gateway and cleanup boundaries

The gateway classifies non-2xx responses as HTTP errors before strict JSON parsing and
best-effort extracts only `log_id`. Retry callback `AppError` values are rethrown intact;
only unknown failures become the stable 502 refresh error. The new retrieve-auth-code
method validates the official response envelope and never exposes provider payloads.

Best-effort fail RPCs settle after a short injected timer. Operation success/rejection
clears the timer; timeout resolves without masking the original error, while attached
handlers consume any late rejection.

## Verification

Tests cover exact recovery requests, AppError preservation, HTML non-2xx classification,
bounded completion/readback/compensation calls, lease headroom, late fail-RPC rejection,
RPC SQL locking/ACL/state-machine contracts, and repository error mapping. Final gates
are the affected Bun suites, API typecheck/build, migration contract tests, file-size,
diff, and security scans. The migration is generated locally only; the main agent owns
dry-run, remote push, migration-list alignment, and database type regeneration.
