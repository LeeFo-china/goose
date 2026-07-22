import { describe, expect, test } from "bun:test";

const REPOSITORY_ROOT = new URL("../", import.meta.url);
const WORKFLOW = new URL(
  ".github/workflows/ocr-result-cleanup.yml",
  REPOSITORY_ROOT,
);

describe("OCR result cleanup scheduler contract", () => {
  test("runs the production cleanup hourly without overlapping", async () => {
    const workflow = await Bun.file(WORKFLOW).text();

    expect(workflow).toContain("cron: '17 * * * *'");
    expect(workflow).toContain(
      "github.event_name == 'workflow_dispatch' || vars.OCR_CLEANUP_SCHEDULE_ENABLED == 'true'",
    );
    expect(workflow).toContain("group: ocr-result-cleanup-production");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain("timeout-minutes: 10");
    expect(workflow).toContain(
      "runs-on: [self-hosted, Linux, X64, gooes-prod-deploy]",
    );
  });

  test("uses the deployed API image and keeps manual runs dry by default", async () => {
    const workflow = await Bun.file(WORKFLOW).text();

    expect(workflow).toContain("default: dry-run");
    expect(workflow).toContain('if [ "${GITHUB_EVENT_NAME}" = "schedule" ]; then');
    expect(workflow).toContain("mode=apply");
    expect(workflow).toContain(
      "docker exec gooes-api bun src/scripts/ocr-result-cleanup.ts",
    );
    expect(workflow).not.toContain("TENCENT_OCR_SECRET");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("reports bounded multi-batch cleanup and fails on remaining backlog", async () => {
    const workflow = await Bun.file(WORKFLOW).text();

    expect(workflow).toContain(".batch_limit_reached == false");
    expect(workflow).toContain("OCR cleanup backlog remains after bounded batches");
    expect(workflow).toContain('["batch_count", (.batch_count | tostring)]');
    expect(workflow).toContain(
      '["max_apply_batches", (.max_apply_batches | tostring)]',
    );
    expect(workflow).toContain("\${GITHUB_STEP_SUMMARY}");
    expect(workflow).toContain(
      "uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f # v6",
    );
    expect(workflow).not.toContain("uses: actions/upload-artifact@v6");
    expect(workflow).toContain("retention-days: 30");
  });
});
