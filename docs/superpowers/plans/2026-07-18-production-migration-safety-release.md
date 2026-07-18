# Production Migration Safety and Website Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Eliminate the audited production-migration safety defects, publish an immutable replacement candidate, and release the API and official website at https://www.goodcms.cn with a valid renewable certificate.

**Architecture:** Keep the ordered migration and GitHub Actions release architecture. Correct the two migrations that have not reached production, make explicit-transaction history recording atomic, and use a new immutable tag for all production evidence. Merge reviewed Web and Admin changes into the actual containerized Supabase Nginx template without replacing unrelated domains.

**Tech Stack:** Bun tests, Bash in GitHub Actions, PostgreSQL/Supabase migrations, Docker Compose, Nginx, Certbot 5.3.0, systemd.

---

## File map

- apps/api/src/services/billing-subscriptions-contract.test.ts rejects targeted billing repair data in generic migrations.
- scripts/release-orchestration-contract.test.ts exercises migration rendering and ingress-renewal contracts.
- supabase/migrations/20260709103000_workflow_task_accessible_rpc.sql creates service-role-only RPCs.
- supabase/migrations/20260714170000_ensure_tenant_subscription_invoices.sql retains reusable billing logic without one-off business data.
- .github/workflows/migrate-production-database.yml atomically records explicit migrations.
- deploy/nginx/gooes-web.conf is the reviewed Docker-ingress baseline.
- deploy/systemd/gooes-www-cert-renew.service and .timer renew only the www certificate.
- docs/operations/official-website-production-cutover-runbook.md documents the actual production ingress.

### Task 1: Remove tenant mutation and transient RPC exposure

**Files:**
- Modify: apps/api/src/services/billing-subscriptions-contract.test.ts
- Modify: scripts/release-orchestration-contract.test.ts
- Modify: supabase/migrations/20260709103000_workflow_task_accessible_rpc.sql
- Modify: supabase/migrations/20260714170000_ensure_tenant_subscription_invoices.sql

- [ ] **Step 1: Write failing security contracts**

Change the billing contract to reject both known repair identifiers:

~~~~ts
expect(migrationSource).not.toContain(
  "2026-07-14-gushi-qingtian-subscription-billing-repair",
);
expect(migrationSource).not.toContain(
  "3eebca47-961f-4899-b976-a3d3208d326b",
);
~~~~

Read the workflow RPC migration in the release contract test and add:

~~~~ts
test("never grants accessible workflow RPCs to authenticated", () => {
  expect(workflowTaskAccessibleMigration).not.toMatch(
    /grant execute on function public\.list_accessible_[\s\S]+?to authenticated/i,
  );
  expect(workflowTaskAccessibleMigration).toMatch(
    /grant execute on function public\.list_accessible_workflow_tasks[\s\S]+?to service_role;/i,
  );
});
~~~~

- [ ] **Step 2: Run RED**

~~~~bash
bun test \
  apps/api/src/services/billing-subscriptions-contract.test.ts \
  scripts/release-orchestration-contract.test.ts
~~~~

Expected: FAIL on the repair marker and authenticated grants.

- [ ] **Step 3: Apply the minimal SQL changes**

In 20260709103000, grant both final RPC signatures only to service_role:

~~~~sql
grant execute on function public.list_accessible_workflow_tasks(
  uuid, uuid, text[], text[], text, text, text, uuid, integer, integer
) to service_role;

grant execute on function public.list_accessible_project_workflow_tasks(
  uuid, uuid, text[], text[], text[], integer
) to service_role;
~~~~

Delete only the final targeted DO block in 20260714170000 that declares the known tenant UUID. Preserve all reusable billing functions and permission statements.

- [ ] **Step 4: Run GREEN and commit**

~~~~bash
bun test \
  apps/api/src/services/billing-subscriptions-contract.test.ts \
  scripts/release-orchestration-contract.test.ts
git add \
  apps/api/src/services/billing-subscriptions-contract.test.ts \
  scripts/release-orchestration-contract.test.ts \
  supabase/migrations/20260709103000_workflow_task_accessible_rpc.sql \
  supabase/migrations/20260714170000_ensure_tenant_subscription_invoices.sql
git commit -m "fix(db): 移除迁移越权与定向账单修复"
~~~~

Expected: zero failures and one focused commit.

### Task 2: Make explicit migration history atomic

**Files:**
- Modify: scripts/release-orchestration-contract.test.ts
- Modify: .github/workflows/migrate-production-database.yml

- [ ] **Step 1: Add failing executable helper tests**

Extract emit_explicit_transaction_migration from the Plan and apply migrations step. Run it against one fixture containing a single transaction and one fixture containing two commits:

~~~~ts
expect(validResult.exitCode).toBe(0);
expect(validSql.indexOf("select 1;")).toBeLessThan(
  validSql.indexOf("insert into supabase_migrations.schema_migrations"),
);
expect(
  validSql.indexOf("insert into supabase_migrations.schema_migrations"),
).toBeLessThan(validSql.toLowerCase().lastIndexOf("commit;"));

expect(invalidResult.exitCode).not.toBe(0);
expect(invalidResult.stderr.toString("utf8")).toContain(
  "explicit_transaction_shape_invalid",
);
~~~~

- [ ] **Step 2: Run RED**

~~~~bash
bun test scripts/release-orchestration-contract.test.ts
~~~~

Expected: FAIL because the helper is absent and history currently follows COMMIT.

- [ ] **Step 3: Implement the guarded renderer**

Add this helper before the pending-file loop:

~~~~bash
emit_explicit_transaction_migration() {
  local file="$1"
  local history_statement="$2"
  local begin_count
  local commit_count

  begin_count="$(grep -Eic '^[[:space:]]*begin[[:space:]]*;[[:space:]]*(--.*)?$' "$file" || true)"
  commit_count="$(grep -Eic '^[[:space:]]*commit[[:space:]]*;[[:space:]]*(--.*)?$' "$file" || true)"

  if [ "$begin_count" -ne 1 ] || [ "$commit_count" -ne 1 ]; then
    echo "error=explicit_transaction_shape_invalid file=$file begin=$begin_count commit=$commit_count" >&2
    return 1
  fi

  awk -v history_statement="$history_statement" '
    tolower($0) ~ /^[[:space:]]*commit[[:space:]]*;[[:space:]]*(--.*)?$/ {
      print history_statement
    }
    { print }
  ' "$file"
}
~~~~

Validate version as 14 digits and name as lowercase letters, digits, and underscores. Build one history_statement. Pipe the helper to psql_prod for explicit files; retain the existing outer begin/history/commit sequence for non-explicit files.

- [ ] **Step 4: Run GREEN and commit**

~~~~bash
bun test scripts/release-orchestration-contract.test.ts
bun test apps/api/src/services/release-deployments/legacy/migrations.test.ts
git add scripts/release-orchestration-contract.test.ts \
  .github/workflows/migrate-production-database.yml
git commit -m "ci(prod): 原子登记显式事务迁移历史"
~~~~

Expected: both suites pass.

### Task 3: Align container ingress and isolated certificate renewal

**Files:**
- Modify: scripts/release-orchestration-contract.test.ts
- Modify: deploy/nginx/gooes-web.conf
- Create: deploy/systemd/gooes-www-cert-renew.service
- Create: deploy/systemd/gooes-www-cert-renew.timer
- Modify: docs/operations/official-website-production-cutover-runbook.md

- [ ] **Step 1: Add failing config contracts**

~~~~ts
expect(productionWebNginx).toContain(
  "set $gooes_web_upstream http://gooes-web:3020;",
);
expect(productionWebNginx).toContain(
  "ssl_certificate /etc/letsencrypt/live/www.goodcms.cn/fullchain.pem;",
);
expect(productionWebNginx).toContain(
  "return 301 https://www.goodcms.cn/partners$is_args$args;",
);
expect(wwwCertRenewService).toContain(
  "certbot renew --cert-name www.goodcms.cn",
);
expect(wwwCertRenewService).toContain(
  '--deploy-hook "nginx -s reload"',
);
expect(wwwCertRenewTimer).toContain("OnCalendar=*-*-* 00,12:00:00");
expect(wwwCertRenewTimer).toContain("Persistent=true");
~~~~

Run bun test scripts/release-orchestration-contract.test.ts and expect RED.

- [ ] **Step 2: Implement the reviewed Nginx baseline**

Change both blocks to TLS on 443. The Web block uses certificate paths under /etc/letsencrypt/live/www.goodcms.cn, Docker DNS upstream http://gooes-web:3020, forwarded headers, and this static location:

~~~~nginx
location ^~ /_next/static/ {
    set $gooes_web_upstream http://gooes-web:3020;
    proxy_pass $gooes_web_upstream;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
~~~~

The Admin block keeps http://gooes-admin:3010 for all existing paths and adds only:

~~~~nginx
location = /partners {
    return 301 https://www.goodcms.cn/partners$is_args$args;
}
~~~~

- [ ] **Step 3: Add renewal units**

Service:

~~~~ini
[Unit]
Description=Renew the www.goodcms.cn certificate in Supabase Nginx
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/docker exec supabase-nginx certbot renew --cert-name www.goodcms.cn --non-interactive --quiet --deploy-hook "nginx -s reload"
~~~~

Timer:

~~~~ini
[Unit]
Description=Schedule www.goodcms.cn certificate renewal

[Timer]
OnCalendar=*-*-* 00,12:00:00
Persistent=true
RandomizedDelaySec=1800
Unit=gooes-www-cert-renew.service

[Install]
WantedBy=timers.target
~~~~

Update the runbook to use /opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl, the mounted Certbot volume, Docker upstreams, render/reload rollback, and these units. Preserve unrelated API, H5, and Supabase blocks.

- [ ] **Step 4: Run GREEN and commit**

~~~~bash
bun test scripts/release-orchestration-contract.test.ts
git diff --check
git add \
  scripts/release-orchestration-contract.test.ts \
  deploy/nginx/gooes-web.conf \
  deploy/systemd/gooes-www-cert-renew.service \
  deploy/systemd/gooes-www-cert-renew.timer \
  docs/operations/official-website-production-cutover-runbook.md
git commit -m "ops(web): 对齐容器入口与证书续期"
~~~~

### Task 4: Verify and publish the replacement candidate

**Files:** Verify every Task 1-3 path.

- [ ] **Step 1: Run release verification**

~~~~bash
git diff --check origin/main...HEAD
bun test \
  apps/api/src/services/billing-subscriptions-contract.test.ts \
  apps/api/src/services/release-deployments/legacy/migrations.test.ts \
  scripts/release-orchestration-contract.test.ts
bun run api:check
pnpm --dir apps/web check
bun run test
~~~~

Expected: all focused and stable suites, API checks, Web checks, production build, and Lighthouse freshness pass.

- [ ] **Step 2: Review the complete candidate**

Review origin/main...HEAD for SQL final state, executable workflow behavior, Nginx scope, renewal isolation, and rollback. Correct only blocking findings and repeat Step 1.

- [ ] **Step 3: Push and tag**

~~~~bash
release_sha="$(git rev-parse HEAD)"
test "$(printf %s "$release_sha" | wc -c | tr -d ' ')" = 40
test -z "$(git status --porcelain)"
git push origin HEAD:main
git tag -a v2026.07.18.2 "$release_sha" \
  -m "Production official website v2026.07.18.2"
git push origin v2026.07.18.2
remote_tag_sha="$(git ls-remote origin 'refs/tags/v2026.07.18.2^{}' | awk '{print $1}')"
test "$remote_tag_sha" = "$release_sha"
~~~~

Expected: main and the peeled new tag equal release_sha; v2026.07.18.1 is unchanged.

### Task 5: Plan and apply all 21 production migrations

**Files:**
- Workflow: .github/workflows/migrate-production-database.yml
- Backup directory: /opt/supabase/docker/backups

- [ ] **Step 1: Dispatch a fresh plan**

~~~~bash
gh workflow run migrate-production-database.yml \
  --ref v2026.07.18.2 -f mode=plan -f confirm_text=
migration_plan_run="$(gh run list \
  --workflow migrate-production-database.yml \
  --branch v2026.07.18.2 --event workflow_dispatch --limit 1 \
  --json databaseId --jq '.[0].databaseId')"
gh run watch "$migration_plan_run" --exit-status
~~~~

Download production-migration-precheck. Require before/after latest 20260707223000, pending_count 21, and applied_count 0.

- [ ] **Step 2: Dispatch a new apply run**

~~~~bash
gh workflow run migrate-production-database.yml \
  --ref v2026.07.18.2 \
  -f mode=apply -f confirm_text=确认迁移生产数据库
migration_apply_run="$(gh run list \
  --workflow migrate-production-database.yml \
  --branch v2026.07.18.2 --event workflow_dispatch --limit 1 \
  --json databaseId --jq '.[0].databaseId')"
gh run watch "$migration_apply_run" --exit-status
~~~~

Expected: a non-empty public plus supabase_migrations backup is created first; 21 versions apply; latest becomes 20260716093000.

- [ ] **Step 3: Verify history and permissions read-only**

Use the repository-approved migration status workflow plus production read-only SQL. Require Local/Remote alignment and service-role-only execution on both accessible-task RPCs. If a file fails, inspect schema versus schema_migrations before any new run; never blindly rerun an explicit migration.

### Task 6: Build and deploy API

**Files:** .github/workflows/release-production.yml and production gooes-api.

- [ ] **Step 1: Build**

~~~~bash
gh workflow run release-production.yml --ref v2026.07.18.2 \
  -f operation=build -f service=api \
  -f confirm_text=确认构建生产候选 \
  -f reason=official-website-production-prerequisite
~~~~

Capture api_build_run, watch success, and verify its candidate commit equals release_sha.

- [ ] **Step 2: Deploy**

~~~~bash
gh workflow run release-production.yml --ref v2026.07.18.2 \
  -f operation=deploy -f service=api \
  -f build_run_id="$api_build_run" \
  -f commit_sha="$release_sha" \
  -f confirm_text=确认部署生产环境 \
  -f reason=official-website-production-prerequisite
~~~~

Require a deployment receipt, healthy gooes-api, stable restarts, successful /health, exact OCI revision, and unchanged unrelated containers.

### Task 7: Publish content, build, gate, and deploy Web

**Files:** the Web build, gate, and deploy workflows plus production gooes-web.

- [ ] **Step 1: Resolve a published detail path**

~~~~bash
curl -fsS 'https://api.goodcms.cn/public/site/articles?page=1&pageSize=20'
curl -fsS 'https://api.goodcms.cn/public/site/cases?page=1&pageSize=20'
curl -fsS 'https://api.goodcms.cn/public/site/cities?page=1&pageSize=20'
~~~~

Use the first published detail path. If all are empty, use authenticated Admin route https://admin.goodcms.cn/platform/site-content/new to publish one factual article titled GoodCMS 企业官网正式上线, slug goodcms-official-website-launch, with no invented customer claims. Confirm its public detail returns 200 and save the path in web_smoke_content_path.

- [ ] **Step 2: Build and gate Web**

~~~~bash
gh workflow run build-docker-images.yml --ref v2026.07.18.2 \
  -f target_environment=production -f service=web
gh workflow run verify-production-web-deployment-gate.yml \
  --ref v2026.07.18.2 \
  -f commit_sha="$release_sha" \
  -f migration_version=20260716093000
~~~~

Capture web_build_run and web_gate_run. Require both to succeed and refer to release_sha.

- [ ] **Step 3: Deploy without public cutover**

~~~~bash
gh workflow run deploy-docker-services.yml --ref v2026.07.18.2 \
  -f service=web \
  -f built_image_sha="$release_sha" \
  -f build_run_id="$web_build_run" \
  -f gate_run_id="$web_gate_run" \
  -f web_smoke_content_path="$web_smoke_content_path" \
  -f confirm_text=确认部署生产环境
~~~~

Require summary state container_ready_for_manual_cutover plus loopback smoke for home, partners, sitemap, preview failure, and the content detail with exact service and revision headers.

### Task 8: Issue certificate, cut over Nginx, and observe

**Files:**
- Source baseline: deploy/nginx/gooes-web.conf
- Production template: /opt/supabase/docker/volumes/proxy/nginx/supabase-nginx.conf.tpl
- Production units: /etc/systemd/system/gooes-www-cert-renew.service and .timer

- [ ] **Step 1: Revalidate prerequisites**

Require www.goodcms.cn to resolve to 1.13.20.39, the live template checksum to match the stored pre-release checksum, port 80 ACME webroot to be active, and no existing www lineage.

- [ ] **Step 2: Issue the isolated certificate before adding TLS config**

~~~~bash
docker exec supabase-nginx certbot certonly \
  --webroot --webroot-path /var/www/letsencrypt \
  --non-interactive --agree-tos \
  --email 27723691@163.com \
  --server https://acme-v02.api.letsencrypt.org/directory \
  --preferred-challenges http-01 \
  --key-type ecdsa --elliptic-curve secp256r1 \
  --cert-name www.goodcms.cn -d www.goodcms.cn
~~~~

Require non-empty fullchain, privkey, and chain files and SAN www.goodcms.cn.

- [ ] **Step 3: Generate and review the full template candidate**

Copy the live template locally, preserve every existing block, modify only Admin /partners, and append the Web TLS block. Reject any other diff.

- [ ] **Step 4: Install with rollback**

Create a timestamped checksum-verified host backup. Install the reviewed template, back up the effective container config, render the mounted template with the container PROXY_DOMAIN, run nginx -t, and reload. On test or reload failure, restore both files, re-test, reload the previous config, and exit non-zero.

- [ ] **Step 5: Install and validate renewal**

~~~~bash
sudo systemd-analyze verify \
  /etc/systemd/system/gooes-www-cert-renew.service \
  /etc/systemd/system/gooes-www-cert-renew.timer
sudo systemctl daemon-reload
sudo systemctl enable --now gooes-www-cert-renew.timer
sudo systemctl start gooes-www-cert-renew.service
systemctl is-enabled gooes-www-cert-renew.timer
systemctl is-active gooes-www-cert-renew.timer
systemctl list-timers gooes-www-cert-renew.timer --no-pager
~~~~

Require the one-shot and timer to succeed without touching other certificate lineages.

- [ ] **Step 6: Strict smoke and observation**

Require strict TLS for home, partners, sitemap, and web_smoke_content_path; exact Web revision headers; immutable static cache; exact query-preserving Admin /partners redirect; and no redirect for Admin /login or /platform/partners. Record Nginx/API/Web errors, container health, restarts, and public responses at 0, 5, 10, 15, 20, 25, and 30 minutes. Roll back Nginx immediately on P0/P1, persistent 5xx, revision mismatch, TLS failure, lost query parameters, or restart loops.

- [ ] **Step 7: Produce the release summary**

Report commit/tag, migration plan/apply IDs and backup path, applied version range, API/Web build and deploy IDs, image revisions/digests, content smoke path, Nginx backup/checksum, certificate SAN/expiry, timer state, public smoke results, observation outcome, and unchanged-container comparison.
