import assert from "node:assert/strict";

export interface InventoryPlanNotice {
  label: string;
  durationMs: number;
  plan: Record<string, unknown>;
}

export function assertInventoryScanBound(entry: InventoryPlanNotice, maxRows: number): void {
  let scans = 0;
  function visit(value: unknown): void {
    assert.ok(isRecord(value), "Invalid inventory plan node");
    if (value["Relation Name"] === "inventory_transactions") {
      const rows = value["Actual Rows"];
      const loops = value["Actual Loops"];
      const removed = value["Rows Removed by Filter"] ?? 0;
      const rechecked = value["Rows Removed by Index Recheck"] ?? 0;
      assert.ok(typeof rows === "number" && typeof loops === "number" &&
        typeof removed === "number" && typeof rechecked === "number", "Missing inventory scan counters");
      const scanned = (rows + removed + rechecked) * loops;
      assert.ok(Number.isFinite(scanned) && scanned >= 0 && scanned <= maxRows,
        `Inventory selective scan exceeds bound: ${entry.label} (${scanned} > ${maxRows})`);
      scans++;
    }
    if (value.Plans !== undefined) {
      assert.ok(Array.isArray(value.Plans), "Invalid inventory child plans");
      value.Plans.forEach(visit);
    }
  }
  visit(entry.plan.Plan);
  assert.ok(scans > 0, `Missing inventory scans: ${entry.label}`);
}

export function parseInventoryPlanNotices(
  stderr: string,
  expectedCases: readonly string[],
): InventoryPlanNotice[] {
  const expected = new Set(expectedCases);
  assert.equal(expected.size, expectedCases.length, "Duplicate expected inventory case");
  const notices: InventoryPlanNotice[] = [];
  const seen = new Set<string>();
  const startedCases = new Set<string>();
  let currentCase: string | undefined;
  const lines = stderr.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const marker = /^NOTICE:\s+STAGE_B_RPC_PLAN_CASE ([a-z0-9-]+)$/.exec(line);
    if (marker) {
      assert.equal(currentCase, undefined, "Unclosed inventory plan case");
      currentCase = marker[1]!;
      assert.ok(expected.has(currentCase), `Unexpected inventory plan case: ${currentCase}`);
      assert.ok(!startedCases.has(currentCase), `Duplicate inventory plan case: ${currentCase}`);
      startedCases.add(currentCase);
      continue;
    }
    const end = /^NOTICE:\s+STAGE_B_RPC_PLAN_END ([a-z0-9-]+)$/.exec(line);
    if (end) {
      assert.equal(end[1], currentCase, "Inventory plan end mismatch");
      assert.ok(currentCase && seen.has(currentCase), `Missing inventory plan in case: ${currentCase}`);
      currentCase = undefined;
      continue;
    }
    const duration = /^NOTICE:\s+duration: ([\d.]+) ms\s+plan:$/.exec(line);
    if (!duration) continue;
    // auto_explain JSON is a pretty-printed object, with its closing root brace
    // at column zero. Do not accept an incomplete plan as missing/no-op evidence.
    const start = index + 1;
    do { index++; } while (index < lines.length && lines[index] !== "}");
    assert.ok(index < lines.length, "Truncated auto_explain JSON");
    const value: unknown = JSON.parse(lines.slice(start, index + 1).join("\n"));
    assert.ok(isRecord(value) && typeof value["Query Text"] === "string", "Invalid auto_explain JSON");
    if (!/^\s*WITH filtered AS (?:NOT )?MATERIALIZED\s*\(/.test(value["Query Text"]) ||
        !value["Query Text"].includes("public.inventory_transactions")) continue;
    assert.ok(currentCase, "Unmarked inventory plan");
    assert.ok(!seen.has(currentCase), `Duplicate inventory plan: ${currentCase}`);
    assert.ok(isRecord(value.Plan) && typeof value.Plan["Node Type"] === "string", "Invalid inventory plan");
    assert.equal(value.Plan["Temp Written Blocks"], 0, `Inventory RPC plan spills or lacks buffers: ${currentCase}`);
    const durationMs = Number(duration[1]);
    assert.ok(Number.isFinite(durationMs) && durationMs >= 0, "Invalid plan duration");
    notices.push({ label: currentCase, durationMs, plan: value });
    seen.add(currentCase);
  }
  for (const label of expected) assert.ok(seen.has(label), `Missing inventory plan: ${label}`);
  assert.equal(currentCase, undefined, "Unclosed inventory plan case");
  assert.deepEqual(notices.map(({ label }) => label), expectedCases, "Inventory plan order mismatch");
  return notices;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
