import { expect, mock, test } from "bun:test";
import { saveWorkspaceStatuses } from "./workspace-status";

const base = { tenantId: "tenant", projectId: "project", signal: new AbortController().signal };
type Stored = { status: string; checkedAt: string | null };
function database(camera: Stored, asset: Stored, cameraWait?: Promise<void>) {
  const calls: Array<{ table: string; updates: Record<string, unknown>; filters: unknown[]; signal?: AbortSignal }> = [];
  const from = mock((table: string) => {
    const entry = { table, updates: {} as Record<string, unknown>, filters: [] as unknown[], signal: undefined as AbortSignal | undefined };
    calls.push(entry);
    let condition: string | undefined;
    const execute = async () => {
      if (table === "project_cameras") await cameraWait;
      const row = table === "project_cameras" ? camera : asset;
      const field = table === "project_cameras" ? "last_status_checked_at" : "last_synced_at";
      const checkedAt = entry.updates[field] as string;
      // This fake applies the actual emitted timestamp filter; absent CAS really
      // does overwrite the newer fixture, reproducing the reviewed repository bug.
      if (condition) {
        expect(condition).toBe(`${field}.is.null,${field}.lt.${checkedAt}`);
        if (row.checkedAt && row.checkedAt >= checkedAt) return { data: [], error: null };
      }
      row.status = entry.updates.status as string;
      row.checkedAt = checkedAt;
      return { data: [{ id: "camera" }], error: null };
    };
    const query = {
      update: (updates: Record<string, unknown>) => { entry.updates = updates; return query; },
      eq: (field: string, value: string) => { entry.filters.push([field, value]); return query; },
      in: (field: string, value: string[]) => { entry.filters.push([field, value]); return query; },
      is: (field: string, value: null) => { entry.filters.push([field, value]); return query; },
      or: (value: string) => { condition = value; return query; },
      select: () => query,
      abortSignal: (signal: AbortSignal) => { entry.signal = signal; return query; },
      then: (resolve: (value: Awaited<ReturnType<typeof execute>>) => unknown, reject: (error: unknown) => unknown) => execute().then(resolve, reject),
    };
    return query;
  });
  return { client: { from } as unknown as Parameters<typeof saveWorkspaceStatuses>[0], calls };
}

test("repository CAS preserves newer camera and asset status when an older observation arrives later", async () => {
  const camera = { status: "unknown", checkedAt: null } as Stored;
  const asset = { ...camera };
  const db = database(camera, asset);
  const newer = "2026-10-14T01:00:02.000Z";
  expect(await saveWorkspaceStatuses(db.client, { ...base, checkedAt: newer,
    statuses: [{ cameraId: "camera", status: "online" }] })).toEqual(["camera"]);
  expect(await saveWorkspaceStatuses(db.client, { ...base, checkedAt: "2026-10-14T01:00:01.000Z",
    statuses: [{ cameraId: "camera", status: "offline" }] })).toEqual([]);
  expect(await saveWorkspaceStatuses(db.client, { ...base, checkedAt: newer,
    statuses: [{ cameraId: "camera", status: "offline" }] })).toEqual([]);
  expect(camera).toEqual({ status: "online", checkedAt: newer });
  expect(asset).toEqual(camera);
  expect(db.calls[0]?.filters).toEqual([
    ["tenant_id", "tenant"], ["project_id", "project"], ["id", ["camera"]], ["deleted_at", null],
  ]);
  expect(db.calls[1]?.filters).toEqual([
    ["tenant_id", "tenant"], ["bound_project_id", "project"], ["bound_camera_id", ["camera"]], ["deleted_at", null],
  ]);
  expect(db.calls.every((call) => call.signal === base.signal)).toBe(true);
});

test("asset CAS independently preserves a newer asset observation", async () => {
  const camera = { status: "unknown", checkedAt: null } as Stored;
  const asset = { status: "online", checkedAt: "2026-10-14T01:00:03.000Z" };
  const db = database(camera, asset);
  await saveWorkspaceStatuses(db.client, { ...base, checkedAt: "2026-10-14T01:00:02.000Z",
    statuses: [{ cameraId: "camera", status: "offline" }] });
  expect(camera.status).toBe("offline");
  expect(asset).toEqual({ status: "online", checkedAt: "2026-10-14T01:00:03.000Z" });
});

test("blocked database wait is cancelled; late completion cannot start asset or later-batch writes", async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const db = database({ status: "unknown", checkedAt: null }, { status: "unknown", checkedAt: null }, wait);
  const controller = new AbortController();
  const pending = saveWorkspaceStatuses(db.client, { ...base, signal: controller.signal,
    checkedAt: "2026-10-14T01:00:01.000Z",
    statuses: [{ cameraId: "camera", status: "online" }, { cameraId: "other", status: "offline" }],
  }).then(() => "finished", () => "cancelled");
  await Bun.sleep(5);
  controller.abort();
  const result = await Promise.race([pending, Bun.sleep(80).then(() => "blocked")]);
  release();
  await Bun.sleep(10);
  expect(result).toBe("cancelled");
  expect(db.calls.map((call) => call.table)).toEqual(["project_cameras"]);
  expect(db.calls[0]?.signal?.aborted).toBe(true);
});
