import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const runbook = readFileSync(
  new URL(
    "../../../../docs/runbooks/supplier-purchase-batch-workflow-release.md",
    import.meta.url,
  ),
  "utf8",
);

describe("supplier purchase batch workflow release runbook", () => {
  test("pins every database command to the same explicit dev target", () => {
    expect(runbook).toContain(
      'supabase db push --dry-run --db-url "$DEV_SUPABASE_DB_DIRECT_URL"',
    );
    expect(runbook).toContain(
      'supabase migration list --db-url "$DEV_SUPABASE_DB_DIRECT_URL"',
    );
    expect(runbook).toContain(
      'supabase gen types typescript --db-url "$DEV_SUPABASE_DB_DIRECT_URL" --schema public,graphql_public',
    );
    expect(runbook).toContain('GENERATED_TYPES_FILE="$(mktemp');
    expect(runbook).toContain(
      'git diff --no-index apps/api/src/types/database.ts "$GENERATED_TYPES_FILE"',
    );
    expect(runbook).not.toContain("$SUPABASE_DB_DIRECT_URL");
  });

  test("drains running workflow instances before disabling the flag", () => {
    const rollback = runbook.slice(runbook.indexOf("## 紧急止血与前向回滚"));
    const blockTraffic = rollback.indexOf("阻断采购 submit 和新旧 review 入口");
    const inventory = rollback.indexOf("盘点所有 running 实例");
    const drain = rollback.indexOf("完成、withdraw 或受控 cancel");
    const zeroRunning = rollback.indexOf("running=0");
    const disableFlag = rollback.indexOf("purchase_batch_workflow_enabled=false");
    const rollbackApi = rollback.indexOf("回退 API/Admin revision");

    expect(blockTraffic).toBeGreaterThan(-1);
    expect(inventory).toBeGreaterThan(blockTraffic);
    expect(drain).toBeGreaterThan(inventory);
    expect(zeroRunning).toBeGreaterThan(drain);
    expect(disableFlag).toBeGreaterThan(zeroRunning);
    expect(rollbackApi).toBeGreaterThan(disableFlag);
    expect(rollback).toContain(
      "若紧急情况下必须立即关 flag，必须同时阻断旧 review 入口",
    );
  });

  test("compares legacy review and task complete on different dev batches", () => {
    expect(runbook).toContain(
      "POST /supplier-purchase-batches/:id/review",
    );
    expect(runbook).toContain("POST /workflow-tasks/:taskId/complete");
    expect(runbook).toContain("必须使用两个不同批次");
    expect(runbook).toContain("禁止在同一批次串行调用两个入口");
    for (const evidence of [
      "batch.status",
      "budget_status",
      "approval_round",
      "orderIds",
      "supplierCount",
      "status=submitted",
    ]) expect(runbook).toContain(evidence);
    for (const errorCode of [
      "WORKFLOW_TASK_NOT_PENDING",
      "SUPPLIER_PURCHASE_BATCH_VERSION_CONFLICT",
      "SUPPLIER_PURCHASE_BATCH_SELF_REVIEW",
    ]) expect(runbook).toContain(errorCode);
  });
});
