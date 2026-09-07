import { afterEach, expect, test } from "bun:test";
import {
  batchItem,
  batchRecord,
  catalog,
  ids,
  warehouses,
} from "../../e2e/supplier-purchase-batch-fixture.mjs";
import {
  commandResult,
  splitPreview,
} from "../../e2e/supplier-purchase-batch-command-fixture.mjs";
import { sendBatchCommand } from "./batch-api";
import {
  createBatchCommand,
  restoreBatchCommand,
  runBatchCommand,
} from "./batch-command";
import type { BatchCommandKind, BatchCommandPayload } from "./batch-types";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const record = batchRecord();
const items = catalog().slice(0, 2).map((item, index) =>
  batchItem(item, index)
);
const payload = {
  destination_type: "project" as const,
  project_id: record.project_id,
  warehouse_id: null,
  expected_version: 0,
  reason: record.reason,
  remark: null,
  expected_delivery_date: null,
  items: items.map((item) => ({
    supplier_sku_id: item.supplier_sku_id,
    quantity: item.quantity,
    cost_category_id: item.cost_category_id,
  })),
};
const saved = {
  status: "saved",
  idempotent: false,
  batch: record,
  version: 1,
  split_preview: splitPreview(items),
};
async function run(
  body: string,
  kind: BatchCommandKind = "save-draft",
  commandPayload: BatchCommandPayload = payload,
) {
  globalThis.fetch = Object.assign(
    async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    { preconnect: originalFetch.preconnect },
  );
  return runBatchCommand(
    createBatchCommand(kind, record.id, commandPayload, {
      destination_type: "project",
      project_id: record.project_id,
      warehouse_id: null,
    }),
    sendBatchCommand,
  );
}
for (
  const [name, body] of [
    ["truncated JSON", '{"success":true,"data":'],
    ["empty JSON", ""],
    ["missing data", "{}"],
    ["null data", '{"success":true,"data":null}'],
    ["wrong shape", '{"success":true,"data":{"status":"saved"}}'],
    [
      "error envelope with success HTTP status",
      '{"success":false,"message":"invalid response"}',
    ],
  ]
) {
  test(`HTTP 200 ${name} remains uncertain through the real sender`, async () => {
    expect((await run(body)).type).toBe("uncertain");
  });
}
for (
  const [name, change] of Object.entries({
    "wrong resource": { batch: { ...record, id: ids.employee } },
    "wrong version": { version: 2 },
    "stale version": { version: 1, batch: { ...record, version: 1 } },
    "wrong command status": {
      status: "cancelled",
      batch: { ...record, status: "cancelled" },
    },
    "wrong batch status": { batch: { ...record, status: "ordered" } },
    "wrong destination": {
      batch: {
        ...record,
        destination_type: "warehouse",
        project_id: null,
        warehouse_id: warehouses[0].id,
      },
    },
    "nonexclusive destination": {
      batch: { ...record, warehouse_id: warehouses[0].id },
    },
    "missing preview": { split_preview: undefined },
    "invalid preview": { split_preview: [{}] },
    "inconsistent preview amounts": {
      split_preview: splitPreview(items).map((row) => ({
        ...row,
        total_amount: "999.00",
      })),
    },
    "wrong saved reason": { batch: { ...record, reason: "different request" } },
    "missing idempotency flag": { idempotent: undefined },
    "missing batch facts": {
      batch: { id: record.id, version: 1, status: "draft" },
    },
  })
) {
  test(`invalid success evidence (${name}) does not resolve the frozen command`, async () => {
    expect(
      (await run(
        JSON.stringify({ success: true, data: { ...saved, ...change } }),
        "save-draft",
        name === "stale version"
          ? { ...payload, expected_version: 1 }
          : payload,
      )).type,
    ).toBe("uncertain");
  });
}
test("warehouse and legacy project destination receipts remain compatible", async () => {
  const warehouse = {
    ...record,
    destination_type: "warehouse" as const,
    project_id: null,
    warehouse_id: warehouses[0].id,
    budget_status: "not_applicable",
  };
  expect(
    (await run(
      JSON.stringify({ success: true, data: { ...saved, batch: warehouse } }),
      "save-draft",
      {
        ...payload,
        destination_type: "warehouse",
        project_id: null,
        warehouse_id: warehouses[0].id,
      },
    )).type,
  ).toBe("accepted");
  const { destination_type, warehouse_id, ...legacy } = record;
  expect(
    (await run(
      JSON.stringify({ success: true, data: { ...saved, batch: legacy } }),
    )).type,
  ).toBe("accepted");
});
for (
  const [name, kind, status, changes] of [
    ["missing requisitions", "submit", "pending_approval", {
      requisition_ids: undefined,
    }],
    ["missing orders", "review", "ordered", { orders: undefined }],
    ["review error status", "review", "ordered", {
      status: "revision_required",
    }],
    ["review action mismatch", "review", "rejected", {}],
    ["missing running workflow", "review", "pending_approval", {
      workflow_state: undefined,
    }],
    ["missing withdrawal workflow", "withdraw", "draft", {
      workflow_state: undefined,
    }],
  ] as const
) {
  test(`command-specific evidence required: ${name}`, async () => {
    const batch = {
      ...record,
      status,
      version: kind === "review" && status === "pending_approval" ? 1 : 2,
    };
    const receipt = { ...commandResult(kind, batch, items), ...changes };
    expect(
      (await run(JSON.stringify({ success: true, data: receipt }), kind, {
        expected_version: 1,
        action: "approve",
      })).type,
    ).toBe("uncertain");
  });
}
test("valid save and frozen success replay accept the original destination and version", async () => {
  for (const idempotent of [false, true]) {
    expect(
      (await run(
        JSON.stringify({ success: true, data: { ...saved, idempotent } }),
      )).type,
    ).toBe("accepted");
  }
});
test("legacy save restores destination evidence from its original payload without replacing its key", async () => {
  const { destination, ...pending } = createBatchCommand(
    "save-draft",
    record.id,
    payload,
  );
  const restored = restoreBatchCommand(
    JSON.stringify({ scope: "tenant:user", slot: "new", pending }),
    "tenant:user",
    "new",
  );
  expect(restored?.destination).toEqual(destination);
  expect(restored?.command.attempt).toEqual(pending.command.attempt);
  await run(JSON.stringify({ success: true, data: saved }));
  expect(restored).not.toBeNull();
  if (restored) {
    expect((await runBatchCommand(restored, sendBatchCommand)).type).toBe(
      "accepted",
    );
  }
});
for (
  const [kind, status, action] of [
    ["submit", "pending_approval", undefined],
    ["withdraw", "draft", undefined],
    ["cancel", "cancelled", undefined],
    ["review", "rejected", "reject"],
    ["review", "ordered", "approve"],
    ["review", "pending_approval", "approve"],
  ] as const
) {
  test(`valid ${kind}/${status} receipt remains compatible`, async () => {
    const batch = {
      ...record,
      status,
      version: status === "pending_approval" && kind === "review" ? 1 : 2,
    };
    const result = commandResult(kind, batch, items);
    expect(
      (await run(JSON.stringify({ success: true, data: result }), kind, {
        expected_version: 1,
        ...(action ? { action } : {}),
      })).type,
    ).toBe("accepted");
  });
}
