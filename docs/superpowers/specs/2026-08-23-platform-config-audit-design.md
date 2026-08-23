# Platform Configuration Audit Design

## Background

Production recently exposed two separate configuration gaps in the Douyin template workflow:

1. the production API container did not have the required `DOUYIN_*` environment variables;
2. the production database did not have an active `douyin_third_party_components` runtime row for the configured component appid.

Both problems were valid configuration drift, but they belonged to different classes. Environment variables are deploy-time configuration. Component ticket and access-token envelopes are runtime state. Callback URLs are environment-specific and must not be copied blindly from development to production.

The broader requirement is to manage platform integrations such as Douyin, WeChat Pay, mini-program login, OCR, COS, SMS, and LBS with a repeatable audit process before introducing any synchronization command.

## Goals

- Provide a read-only operator command that compares development and production platform configuration.
- Classify differences as `MUST_MATCH`, `ENV_SPECIFIC`, `RUNTIME_STATE`, or `UNKNOWN`.
- Produce redacted console, JSON, and Markdown reports.
- Never print secret values.
- Never modify local code, remote environment files, remote databases, containers, or GitHub settings during audit.
- Establish the foundation for a later explicit sync command with dry-run, backups, allowlists, and post-apply smoke checks.

## Non-goals

- No automatic sync in the first phase.
- No production writes.
- No migration or schema changes.
- No secret storage in Git.
- No attempt to make development and production fully identical.
- No changes to `/Users/leefo/Public/work/orange`.

## Configuration classes

### `MUST_MATCH`

These values should match when development and production intentionally use the same external platform account.

Examples:

- Douyin core component credentials:
  - `DOUYIN_COMPONENT_APP_ID`
  - `DOUYIN_COMPONENT_APP_SECRET`
  - `DOUYIN_COMPONENT_MESSAGE_TOKEN`
  - `DOUYIN_COMPONENT_MESSAGE_AES_KEY`
  - `DOUYIN_TEMPLATE_APP_ID`
  - `DOUYIN_TEMPLATE_APP_SECRET`
  - `DOUYIN_CREDENTIAL_KEYS_JSON`
  - `DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION`
  - `DOUYIN_SUBJECT_HASH_KEY`
- OCR encryption keys and provider credentials when the same provider account is used.
- WeChat Pay merchant identity and API credentials when the same merchant account is used.

### `ENV_SPECIFIC`

These values are expected to differ by environment.

Examples:

- public API/Admin/Web origins;
- callback and redirect URLs;
- database URLs and service-role keys;
- mini-program environment version flags;
- Nginx, Docker bind host, deployment runner, and host-specific paths.

`DOUYIN_TENANT_AUTHORIZATION_REDIRECT_URI` belongs here. It must not be copied from development to production without explicit review.

### `RUNTIME_STATE`

These values are generated or refreshed by external platform callbacks or token exchange flows. They may need controlled operational copy or repair, but must not be committed to Git or embedded in migrations.

Examples:

- `douyin_third_party_components.component_ticket_*`;
- `douyin_third_party_components.access_token_*`;
- merchant authorizer access/refresh token envelopes;
- WeChat Pay platform certificate cache if persisted;
- provider token lease rows.

### `UNKNOWN`

Any discovered platform-looking key that has not been classified must be reported as `UNKNOWN` and must not be synced.

## Phase 1: read-only audit command

Command:

```bash
bun run ops:audit-platform-config -- --from dev --to production
```

Required behavior:

- read development and production environment files through existing server access paths;
- query only necessary database columns from development and production;
- classify known keys;
- redact all values;
- output deterministic summaries and reports;
- exit non-zero only for audit execution failures, not for detected drift.

Suggested reports:

```text
reports/platform-config-audit/platform-config-audit-YYYYMMDD-HHMMSS.json
reports/platform-config-audit/platform-config-audit-YYYYMMDD-HHMMSS.md
```

The reports must be untracked runtime artifacts. They must not be added to Git.

## Data sources

### Development

- API env: `/opt/gooes-dev/docker/.env.dev.api`
- DB env if required: `/opt/gooes-dev/docker/.env.dev.db`
- Database container: `supabase-db`
- Expected runner/server identity: `gooes-dev-vm-0-11` / `VM-0-11-ubuntu`

### Production

- API env: `/opt/supabase/docker/.env.api`
- Admin env: `/opt/supabase/docker/.env.admin`
- Common compose env if needed: `/opt/supabase/docker/.env`
- Database container: `supabase-db`
- Expected runner/server identity: `gooes-prod-vm-0-3` / `VM-0-3-ubuntu`

## Redaction contract

For every string value, the audit may output only:

- presence;
- byte length;
- SHA-256 hash;
- optional public-safe tail for app IDs, no more than 6 characters;
- validity state such as `valid`, `missing`, `invalid_shape`, `expired`, `not_found`, `active`.

The audit must not output:

- full secret values;
- access tokens;
- refresh tokens;
- encrypted token envelope contents;
- database passwords;
- service-role keys;
- raw callback payloads.

## Douyin audit checks

Environment checks:

- verify the nine core `DOUYIN_*` keys exist in both environments;
- compare hash equality for `MUST_MATCH` keys;
- show appid tails for component and template app ids;
- classify `DOUYIN_TENANT_AUTHORIZATION_REDIRECT_URI` as `ENV_SPECIFIC`.

Database checks:

- query `douyin_third_party_components` by configured component appid;
- report row existence, `status`, ticket envelope completeness, access-token envelope completeness, and access-token expiry status;
- query the template development installation by configured template appid;
- report existence, `installation_kind`, `authorization_status`, tenant presence, and token envelope completeness;
- query current deployable template status for the default channel.

The audit must not attempt to refresh tokens.

## WeChat Pay / mini-program audit checks

The first implementation should discover and classify likely WeChat-related keys from environment files and platform `system_settings`.

Known examples include:

- `WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1`;
- WeChat mini-program app credentials if present;
- WeChat Pay merchant credentials;
- WeChat Pay callback URLs.

Callback URLs and environment version flags are `ENV_SPECIFIC`. Merchant/API credentials are `MUST_MATCH` only when the deployment intentionally uses the same merchant account.

If the repository does not yet expose a clean list of WeChat Pay config keys, the audit should report discovered `WECHAT_*` keys as `UNKNOWN` until they are explicitly classified.

## OCR / Tencent audit checks

The first implementation should discover and classify:

- `OCR_RESULT_ENCRYPTION_KEY`;
- `TENCENT_*` environment keys;
- platform `system_settings` keys matching `TENCENT_%`, `OCR_%`, `COS_%`, `SMS_%`, and `LBS_%`.

Provider credentials may be `MUST_MATCH` when the same Tencent account is intentionally shared. Public URLs, callback URLs, bucket names, and region-specific resources require explicit classification before any sync.

## Error handling

The audit should distinguish:

- local command failure;
- SSH/server access failure;
- expected file missing;
- malformed environment file;
- database query failure;
- unsupported or unknown key classification.

Detected drift should be represented in the report and should not by itself crash the command.

## Security boundaries

- All temporary files must be created under a task-specific temp directory with `0700` directory mode and `0600` file mode.
- Temporary files containing raw env payloads must be deleted before exit.
- The command must not use broad destructive cleanup paths.
- Reports must contain only redacted values.
- Reports should include enough hashes to compare values without revealing them.
- The audit command must be safe to run repeatedly.

## Phase 2: future sync command

Sync is intentionally out of scope for Phase 1. After reports are trusted, add a separate command:

```bash
bun run ops:sync-platform-config -- --from dev --to production --target douyin --dry-run
bun run ops:sync-platform-config -- --from dev --to production --target douyin --apply
```

Required future sync properties:

- explicit target domain, such as `douyin`, `wechat-pay`, or `ocr`;
- explicit allowlist;
- explicit denylist for environment-specific keys;
- dry-run report before apply;
- automatic backup of production files and runtime tables before writes;
- atomic file replacement for env changes;
- database writes only through scoped operational transactions;
- post-apply health checks;
- rollback instructions in the output.

Runtime state sync must remain separate from env sync.

## Acceptance criteria

- Running the audit command produces redacted JSON and Markdown reports.
- The command identifies the previously observed Douyin production drift:
  - missing or mismatched core env keys;
  - absent or inactive component row;
  - missing template-development installation.
- The command classifies callback URLs as `ENV_SPECIFIC`.
- The command does not write to production.
- The command does not output secret values.
- The command leaves Git worktree unchanged except for intentionally committed source files.

## Review notes

- This design deliberately avoids “dev and prod must be fully identical” as a rule.
- The correct rule is: core platform identity should match when sharing the same external account; environment-specific endpoints must differ; runtime state needs controlled operational handling.
