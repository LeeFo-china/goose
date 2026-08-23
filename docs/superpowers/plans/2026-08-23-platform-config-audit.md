# Platform config audit implementation plan

## Objective

Implement Phase 1 of the platform configuration governance design: a read-only operator command that compares development and production platform configuration, redacts all sensitive values, and writes JSON/Markdown audit reports.

## Scope

- Add `bun run ops:audit-platform-config -- --from dev --to production`.
- Compare development and production environment metadata for Douyin, WeChat, OCR/Tencent/COS/SMS/LBS-looking keys.
- Query only redacted operational state from the development and production databases.
- Write runtime reports under `reports/platform-config-audit/`.
- Do not write remote env files, databases, containers, GitHub settings, or orange.

## TDD steps

1. Add pure tests for classification and redaction.
   - Known Douyin core keys are `MUST_MATCH`.
   - Douyin redirect URL is `ENV_SPECIFIC`.
   - Unknown platform-looking keys are `UNKNOWN`.
   - Reports never contain raw sentinel values.
2. Add tests for comparison/report generation.
   - Detect missing keys and hash mismatches without exposing values.
   - Render deterministic Markdown sections.
3. Add tests for command construction.
   - Remote commands must not contain write verbs such as `UPDATE`, `INSERT`, `DELETE`, `TRUNCATE`, `DROP`, `ALTER`, `CREATE`, `docker restart`, or `docker compose`.
   - Remote env collection outputs only key metadata, not raw values.
4. Add tests for CLI orchestration using a mocked command runner.
   - Invalid args fail.
   - Successful audit writes JSON and Markdown reports.
   - Detected drift exits 0.
5. Implement the minimal production code to pass.
6. Run one real read-only audit against dev/prod and verify report redaction.

## Verification

```bash
bun test --cwd apps/api ../../scripts/ops/platform-config-audit.test.ts
bun run ops:audit-platform-config -- --from dev --to production
git diff --check
```

If the real remote audit fails because of SSH/network access, keep the automated mocked tests as the proof and report the access failure explicitly.
