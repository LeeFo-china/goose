# Tenant Production Transfer

This directory contains the reviewed one-tenant transfer used for tenant
`3eebca47-961f-4899-b976-a3d3208d326b`.

The source transaction is read-only. The scope consists of tables with a direct
foreign key to `public.tenants`, a reviewed indirect business-table allowlist,
and only active login identities. Environment credentials, payment and billing
state, short-lived sessions, notification inboxes, audit/location state, and
development placeholder files are excluded. The known dev-only marketing claim
voucher fixture IDs, the known finance smoke project and its FK descendants,
notification inbox rows, and platform/release permissions are also denied
explicitly. OCR audit rows are retained as expired records, but environment-key
ciphertext, result payloads, provider request IDs, and billable units are cleared.
The one-off tool is pinned to source migration `20260826113000`; any schema
version change requires a new review.

The generated artifact contains personal and authentication data. Keep it in a
mode `0700` directory, never commit or upload it, and delete it after the
migration result has been verified.

## Commands

```bash
scripts/ops/tenant-transfer/tenant-transfer.sh audit
scripts/ops/tenant-transfer/tenant-transfer.sh export

TENANT_TRANSFER_ARTIFACT_DIR=/tmp/transfer scripts/ops/tenant-transfer/tenant-transfer.sh dry-run

TENANT_TRANSFER_ARTIFACT_DIR=/tmp/transfer \
TENANT_TRANSFER_BACKUP_FILE=/srv/backups/tenant-transfer.sql \
TENANT_TRANSFER_WORKERS_PAUSED=confirmed \
TENANT_TRANSFER_CONFIRMATION='确认迁移租户 3eebca47-961f-4899-b976-a3d3208d326b 到生产' \
  scripts/ops/tenant-transfer/tenant-transfer.sh apply
```

`dry-run` executes the same import in production and rolls the transaction
back after count and foreign-key checks. Its receipt is bound to the production
database system identifier, latest migration version, artifact checksum, import
script checksum, and is valid for 30 minutes. Preflight also compares a contract
hash of every selected table's columns, constraints, and indexes. The generated
preflight covers ordinary column-based
unique indexes; the actual rolled-back inserts remain the fail-closed check for
partial and expression unique indexes.

`apply` requires a matching receipt and a full custom-format production backup.
The backup path must have adjacent `.sha256`, `.list`, and `.metadata.json`
files; the gate verifies its checksum, `pg_restore` readability, the `public`,
`auth`, `storage`, and `supabase_migrations` schemas, target database identity,
migration version, and age. The dump, restore list, checksum, and metadata must
all describe the same archive. It also checks all three write-capable worker
containers are actually stopped, in addition to the operator confirmation.

A successful apply leaves the tenant `suspended`; enable it only after database,
login, endpoint, and file-access smoke checks. Restore workers to their recorded
pre-migration state only after verification. Remove local and remote transfer
artifacts after the audit result is complete.
