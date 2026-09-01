import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(
  new URL("../../package.json", import.meta.url),
  "utf8",
)) as { scripts?: Record<string, string> };
const workflow = readFileSync(new URL(
  "../../../../.github/workflows/verify-dev-douyin-material-note-explain.yml",
  import.meta.url,
), "utf8");

const STEPS = [
  "Guard development runner and request",
  "Checkout verified commit",
  "Verify immutable checkout and deployed revision",
  "Set up Node",
  "Set up Bun",
  "Install API workflow dependencies",
  "Verify development database target and migration history",
  "Run read-only material note EXPLAIN",
  "Verify material note EXPLAIN summary",
  "Upload material note EXPLAIN evidence",
] as const;

function stepSource(name: string): string {
  const marker = `      - name: ${name}\n`;
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - ", start + marker.length);
  return workflow.slice(start, next === -1 ? undefined : next);
}

describe("protected dev material note EXPLAIN workflow", () => {
  test("publishes the fixed API package command", () => {
    expect(packageJson.scripts?.["douyin:material-note:explain"]).toBe(
      "bun src/scripts/douyin-material-note-explain.ts",
    );
  });

  test("accepts only explicit manual exact-SHA dispatch", () => {
    expect(workflow).toContain([
      "on:",
      "  workflow_dispatch:",
      "    inputs:",
      "      commit_sha:",
      "        required: true",
      "        type: string",
      "      confirmation:",
      "        required: true",
      "        type: string",
    ].join("\n"));
    expect(workflow).toContain([
      "permissions:",
      "  contents: read",
      "  actions: read",
    ].join("\n"));
    expect(workflow).toContain(
      "group: admin-release-development",
    );
    expect(workflow).toContain(
      "runs-on: [self-hosted, Linux, X64, gooes-dev-deploy]",
    );
    expect(workflow).toContain("environment: development");
  });

  test("locks runner, main checkout, deployed API, and dev database", () => {
    for (const value of [
      "DEV_DB_ENV_FILE: /opt/gooes-dev/docker/.env.dev.db",
      "DEV_PROJECT_REF: fclnkyatvfvmzgzdqlba",
      "DEV_DB_HOST: api-dev.goodcms.cn",
      "BLOCKED_PROJECT_REFS: unqhypivjkpwldhufpjc",
      "BLOCKED_DB_HOSTS: api.goodcms.cn 1.13.20.39",
      "COMMIT_SHA: ${{ inputs.commit_sha }}",
      "CONFIRMATION: ${{ inputs.confirmation }}",
      "DISPATCH_REF: ${{ github.ref }}",
      "DISPATCH_SHA: ${{ github.sha }}",
    ]) {
      expect(workflow).toContain(value);
    }
    const guard = stepSource("Guard development runner and request");
    expect(guard).toContain(
      '[[ "${CONFIRMATION:-}" != "development-read-only" ]]',
    );
    expect(guard).toContain(
      '[[ "${RUNNER_NAME:-}" != "gooes-dev-vm-0-11" ||',
    );
    expect(guard).toContain(
      '"${DISPATCH_REF:-}" != "refs/heads/main" ||',
    );
    expect(guard).toContain(
      '! "${COMMIT_SHA:-}" =~ ^[a-f0-9]{40}$ ||',
    );
    expect(guard).toContain(
      '"${COMMIT_SHA:-}" != "${DISPATCH_SHA:-}" ]]',
    );
    expect(workflow).toContain(
      "ref: ${{ inputs.commit_sha }}\n          clean: true",
    );
    const revision = stepSource(
      "Verify immutable checkout and deployed revision",
    );
    expect(revision).toContain("git rev-parse HEAD");
    expect(revision).toContain("git status --porcelain");
    expect(revision).toContain("gooes-api-dev");
    expect(revision).toContain(
      '"${deployed_revision}" != "${COMMIT_SHA}"',
    );
  });

  test("uses the exact ordered fail-closed steps", () => {
    let previous = -1;
    for (const name of STEPS) {
      const current = workflow.indexOf(`      - name: ${name}\n`);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
    expect(workflow.match(/^      - name:/gm)).toHaveLength(STEPS.length);
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow).not.toContain("|| true");
    expect(workflow).not.toMatch(/enable[_ -]?seqscan\s*=\s*off/i);
  });

  test("verifies migration alignment and the material migration", () => {
    const migration = stepSource(
      "Verify development database target and migration history",
    );
    expect(migration).toContain(
      "node scripts/validate-dev-database-target.mjs --direct-migration-history",
    );
    expect(migration).toContain(
      'supabase@2.99.0 migration list --db-url "${SUPABASE_DB_DIRECT_URL}"',
    );
    expect(migration).toContain(
      '"${RUNNER_TEMP}/douyin-material-note-migration-history.txt" supabase/migrations 20260901120030',
    );
    expect(migration).toContain(
      '> "${RUNNER_TEMP}/douyin-material-note-migration-history.txt"',
    );
    expect(migration).toContain(
      '> "${RUNNER_TEMP}/douyin-material-note-migration-evidence.json"',
    );
    expect(migration).not.toMatch(/(?:^|[ >])migration-(?:history\.txt|evidence\.json)/m);
  });

  test("passes only the protected target and confirmation to CLI", () => {
    const run = stepSource("Run read-only material note EXPLAIN");
    expect(run).toContain(
      'DOUYIN_MATERIAL_NOTE_EXPLAIN_CONFIRM="${CONFIRMATION}"',
    );
    expect(run).toContain(
      'DOUYIN_MATERIAL_NOTE_EXPLAIN_DB_URL="${SUPABASE_DB_DIRECT_URL}"',
    );
    expect(run).toContain(
      "bun run --silent --cwd apps/api douyin:material-note:explain",
    );
    expect(run).toContain(
      '> "${GITHUB_WORKSPACE}/material-note-explain-summary.json"',
    );
    expect(run).not.toMatch(
      /(?:echo|printf)[^\n]*(?:SUPABASE_DB_DIRECT_URL|SUPABASE_DB_URL)/,
    );
    expect(run.match(/git rev-parse HEAD/g)).toHaveLength(1);
    expect(run.match(/git status --porcelain/g)).toHaveLength(1);
    expect(run.match(/gooes-api-dev/g)).toHaveLength(1);
    expect(run).toContain(
      '"${deployed_revision}" != "${COMMIT_SHA}"',
    );
  });

  test("validates and uploads only sanitized evidence", () => {
    const verify = stepSource("Verify material note EXPLAIN summary");
    expect(verify).toContain(
      '.gate == "douyin_material_note_queries"',
    );
    expect(verify).toContain(".queryCount == 3");
    expect(verify).toContain('"owned_active_list","public_list","tenant_keyword_list"');
    expect(verify).toContain("OUTPUT_REDACTION_FAILED");
    expect(verify).toContain("INVALID_EVIDENCE_INPUT");
    expect(verify).toContain('conclusion: "passed"');
    expect(verify).toContain('commitSha: $commitSha');
    expect(verify).toContain("[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}");
    const upload = stepSource("Upload material note EXPLAIN evidence");
    expect(upload).toContain("uses: actions/upload-artifact@v6");
    expect(upload).toContain("material-note-explain-summary.json");
    expect(upload).toContain(
      "${{ runner.temp }}/douyin-material-note-migration-evidence.json",
    );
    for (const forbidden of [
      "migration-history.txt",
      "SUPABASE_DB_DIRECT_URL",
      "subject_hash",
      "raw-plan",
    ]) {
      expect(upload).not.toContain(forbidden);
    }
  });
});
