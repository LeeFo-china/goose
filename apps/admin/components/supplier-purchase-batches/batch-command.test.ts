import { expect, test } from "bun:test";
import {
  commandStorageKey,
  createBatchCommand,
  restoreBatchCommand,
  runBatchCommand,
} from "./batch-command";
import { batchRecord } from "../../e2e/supplier-purchase-batch-fixture.mjs";
const destination = {
  destination_type: "project" as const,
  project_id: batchRecord().project_id,
  warehouse_id: null,
};

test("uncertain replay retains its original UUID, version, payload and key", async () => {
  const original = { expected_version: 4, action: "approve" as const };
  const pending = createBatchCommand(
    "review",
    "batch",
    original,
    destination,
  );
  original.expected_version = 8;
  const calls: unknown[] = [];
  const send = async (...args: unknown[]) => {
    calls.push(args);
    throw new TypeError("network interrupted");
  };
  expect((await runBatchCommand(pending, send)).type).toBe("uncertain");
  expect((await runBatchCommand(pending, send)).type).toBe("uncertain");
  expect(calls[0]).toEqual(calls[1]);
  expect(pending.command.payload.expected_version).toBe(4);
});

test("known revision conflicts resolve the attempt and expose server recovery", async () => {
  const pending = createBatchCommand("review", "batch", {
    expected_version: 4,
    action: "approve",
  }, destination);
  const result = await runBatchCommand(pending, async () => {
    throw {
      status: 409,
      payload: {
        details: {
          batch: { id: "batch", status: "draft" },
          version: 5,
          error_code: "price_changed",
          details: [],
        },
      },
    };
  });
  expect(result.type).toBe("rejected");
  if (result.type === "rejected") expect(result.revision?.version).toBe(5);
});

test("restored commands are scoped to tenant/user and slot; corrupt data fails closed", () => {
  const pending = createBatchCommand(
    "submit",
    "d18be9c9-2231-4000-8000-000000000001",
    { expected_version: 4 },
  );
  const stored = JSON.stringify({
    scope: "tenant-a:user-a",
    slot: "batch",
    pending,
  });
  expect(
    restoreBatchCommand(stored, "tenant-a:user-a", "batch")?.command.attempt
      .idempotencyKey,
  ).toBe(pending.command.attempt.idempotencyKey);
  expect(restoreBatchCommand(stored, "tenant-b:user-a", "batch")).toBeNull();
  expect(restoreBatchCommand(stored, "tenant-a:user-a", "other")).toBeNull();
  expect(restoreBatchCommand("{}", "tenant-a:user-a", "batch")).toBeNull();
  expect(commandStorageKey("tenant-a:user-a", "batch")).not.toBe(
    commandStorageKey("tenant-b:user-a", "batch"),
  );
});
