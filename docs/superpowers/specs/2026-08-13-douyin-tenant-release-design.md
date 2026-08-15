# Douyin Tenant Release Design

## Goal

Separate shared template governance from tenant-owned mini-program releases.
Platform operators confirm one deployable template, while tenant Admin users see
new-version availability and can generate a test version, submit it for audit,
and publish the approved release for their own authorized mini-program.

## Boundaries

- The template development AppID remains server-owned configuration and is fixed
  to `tt0d647bd99301341b01`.
- Platform confirmation is the only operation that mutates the shared template
  library and current deployable-template pointer.
- Tenant requests never accept tenant ID, AppID, installation ID, or template ID.
- Tenant operations resolve the current tenant and its active merchant
  installation from the authenticated context.
- Audit submission and production publishing remain explicit actions.

## Data Model

Add `douyin_miniapp_deployable_templates` as an immutable confirmation history.
Each row stores provider template identity and metadata, channel, confirmation
actor, and confirmation time. A partial unique index permits one current row per
channel. Reconfirming the same provider template is idempotent.

Add `douyin_miniapp.publish` as a tenant permission and grant it to the tenant
Admin bootstrap role. Database changes are migration-only.

## Platform Flow

The platform page displays the configured template-development app, the latest
provider draft, and the current deployable template. `Confirm latest template`
returns the current record when that draft is already confirmed. Otherwise it
adds the draft to the provider template library and atomically marks the newly
appearing exact template current. It does not select or deploy a merchant
mini-program. Platform merchant release mutation routes are removed; the
paginated release-history route remains read-only for support and audit.

## Tenant Flow

The existing `/douyin-miniapp/workspace` response includes the current
deployable template and a derived state:

- `new_available`: current template differs from the tenant's latest release.
- `in_progress`: the latest tenant release uses the current template and is not
  released.
- `up_to_date`: the latest tenant release uses the current template and is
  released.

The workspace shows a persistent version notice. Tenant Admin users can create
or recover the current template's test version, submit audit, synchronize audit
status, and publish an approved release. A newer confirmed template never
overwrites an in-progress release. `audit_rejected`, `failed`, and `released`
are terminal for replacement purposes, so a tenant can start the next confirmed
template after an audit rejection without a manual database repair. If an older
release stopped at `created`, the create action resumes that server-owned release
before considering the newer template; uploaded, testing, and audit states keep
their existing continuation actions.

## Security And Reliability

- Every tenant mutation checks tenant context, exact permission, active merchant
  authorization, deployment key, and development permission.
- Release creation reuses the existing atomic delivery-key and operation-claim
  RPC behavior.
- A partial unique index enforces at most one unfinished release per merchant
  installation. The insert trigger also treats another version's unexpired
  operation claim as in progress. Together they prevent both a new insert from
  racing an active old operation and an old terminal release from reactivating
  beside a newer unfinished release.
- Publish requires `douyin_miniapp.publish` and an owned audited release.
- Provider retries and uncertain outcomes continue through the existing release
  operation recovery model.
- The provider template-list contract does not expose the source draft ID. The
  confirmation service therefore compares template IDs before and after adding
  the draft, then accepts exactly one newly appearing record with matching
  version, description, and creation time. It fails closed if no unique new
  record appears and never binds a pre-existing metadata match.
- Template confirmation and tenant mutations record stable actor metadata.

## Rollout

Deploy migration, API, then Admin. The deployable-template table starts empty,
so no tenant sees a new-version prompt until a platform operator confirms the
first template. Rollback disables the new UI/API first, then removes the new
permission and table only after confirming no workflow depends on them.
