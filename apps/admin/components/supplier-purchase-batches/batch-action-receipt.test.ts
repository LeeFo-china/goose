import { afterEach, expect, test } from "bun:test";
import {
  batchItem,
  batchRecord,
  catalog,
  warehouses,
} from "../../e2e/supplier-purchase-batch-fixture.mjs";
import { commandResult } from "../../e2e/supplier-purchase-batch-command-fixture.mjs";
import {
  createBatchCommand,
  type PendingBatchCommand,
  restoreBatchCommand,
  runBatchCommand,
} from "./batch-command";
import { sendBatchCommand } from "./batch-api";
import type { BatchDestination } from "./batch-types";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const project: BatchDestination = {
  destination_type: "project",
  project_id: batchRecord().project_id,
  warehouse_id: null,
};
const warehouse: BatchDestination = {
  destination_type: "warehouse",
  project_id: null,
  warehouse_id: warehouses[0].id,
};
const items = catalog().slice(0, 2).map((item, index) =>
  batchItem(item, index)
);
async function send(
  pending: PendingBatchCommand,
  result: unknown,
  calls: RequestInit[] = [],
) {
  globalThis.fetch = Object.assign(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init) calls.push(init);
      return Response.json({ success: true, data: result });
    },
    { preconnect: originalFetch.preconnect },
  );
  return runBatchCommand(pending, sendBatchCommand);
}
for (const destination of [project, warehouse]) {
  for (
    const [kind, status, action] of [
      ["submit", "pending_approval", undefined],
      ["withdraw", "draft", undefined],
      ["cancel", "cancelled", undefined],
      ["review", "ordered", "approve"],
      ["review", "rejected", "reject"],
      ["review", "pending_approval", "approve"],
    ] as const
  ) {
    test(`${destination.destination_type} ${kind}/${status} rejects changed receipt destination and accepts the original`, async () => {
      const batch = batchRecord({
        ...destination,
        status,
        version: kind === "review" && status === "pending_approval" ? 1 : 2,
      });
      const payload = { expected_version: 1, ...(action ? { action } : {}) };
      const pending = {
        ...createBatchCommand(kind, batch.id, payload),
        destination,
      };
      const receipt = commandResult(kind, batch, items);
      const other = destination === project ? warehouse : project;
      expect(
        (await send(pending, { ...receipt, batch: { ...batch, ...other } }))
          .type,
      ).toBe("uncertain");
      expect((await send(pending, receipt)).type).toBe("accepted");
    });
  }
}
test("same-type warehouse identity is frozen, not just the destination type", async () => {
  const batch = batchRecord({ ...warehouse, status: "cancelled", version: 2 });
  const pending = {
    ...createBatchCommand("cancel", batch.id, { expected_version: 1 }),
    destination: warehouse,
  };
  expect(
    (await send(
      pending,
      commandResult(
        "cancel",
        { ...batch, warehouse_id: warehouses[1].id },
        items,
      ),
    )).type,
  ).toBe("uncertain");
});
test("terminal HTTP review receipts omit workflow_state; running or completed extras are not accepted", async () => {
  const batch = batchRecord({ status: "ordered", version: 2 });
  const pending = {
    ...createBatchCommand("review", batch.id, {
      expected_version: 1,
      action: "approve",
    }),
    destination: project,
  };
  const receipt = commandResult("review", batch, items);
  const workflow = {
    definition_id: batch.id,
    instance_id: batch.id,
    instance_status: "running",
    current_node_key: "approval",
    current_node_title: "采购审批",
    current_business_kind: null,
    pending_task_count: 1,
  };
  for (const instance_status of ["running", "completed"]) {
    expect(
      (await send(pending, {
        ...receipt,
        workflow_state: { ...workflow, instance_status },
      })).type,
    ).toBe("uncertain");
  }
  expect((await send(pending, receipt)).type).toBe("accepted");
});
test("action creation copies the original destination without changing request payload or fingerprint", () => {
  const source = { ...project };
  const payload = { expected_version: 1, action: "approve" as const };
  const pending = createBatchCommand(
    "review",
    batchRecord().id,
    payload,
    source,
  );
  source.project_id = warehouses[0].id;
  expect(pending.destination).toEqual(project);
  expect(Object.isFrozen(pending.destination)).toBe(true);
  expect(pending.command.payload).toEqual(payload);
  expect(pending.command.attempt.fingerprint).toBe(
    createBatchCommand("review", batchRecord().id, payload).command.attempt
      .fingerprint,
  );
});
test("stored action restores the original destination and original replay identity", async () => {
  const pending = {
    ...createBatchCommand("cancel", batchRecord().id, { expected_version: 1 }),
    destination: project,
  };
  const restored = restoreBatchCommand(
    JSON.stringify({ scope: "tenant:user", slot: "batch", pending }),
    "tenant:user",
    "batch",
  );
  expect(restored?.destination).toEqual(project);
  expect(restored?.command.attempt).toEqual(pending.command.attempt);
  expect(restored?.command.payload).toEqual(pending.command.payload);
  const result = commandResult(
    "cancel",
    batchRecord({ ...project, status: "cancelled", version: 2 }),
    items,
  );
  if (!restored) return;
  expect((await send(restored, result)).type).toBe("accepted");
  expect(
    (await send(restored, {
      ...result,
      batch: { ...result.batch, ...warehouse },
    })).type,
  ).toBe("uncertain");
});
test("legacy action without destination evidence retains its key and does not send a new write", async () => {
  const pending = createBatchCommand("cancel", batchRecord().id, {
    expected_version: 1,
  });
  const restored = restoreBatchCommand(
    JSON.stringify({ scope: "tenant:user", slot: "batch", pending }),
    "tenant:user",
    "batch",
  );
  expect(restored?.command.attempt.idempotencyKey).toBe(
    pending.command.attempt.idempotencyKey,
  );
  const calls: RequestInit[] = [];
  if (!restored) return;
  const outcome = await send(
    restored,
    commandResult(
      "cancel",
      batchRecord({ status: "cancelled", version: 2 }),
      items,
    ),
    calls,
  );
  expect(outcome.type).toBe("uncertain");
  if (outcome.type === "uncertain") {
    expect(outcome.message).toContain("缺少原目的地快照");
  }
  expect(calls).toHaveLength(0);
});
