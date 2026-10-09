import { expect, test } from "bun:test";
import type { AdminSession } from "@/lib/backend";
import { createActivityViewReporter, getActivityScreen, getActivityStorageScope, getPermittedActivityScreen, isActivityViewAcknowledged } from "./tenant-activity-tracker-rules";

const session: AdminSession = {
  user_id: "user", login_channel: "admin_web", tenant: { id: "tenant", name: null, slug: null, status: "active" },
  employee: { id: "employee", name: null, status: "active", tenant_department_id: null, department_name: null,
    post_id: null, post_name: null, avatar: null }, roles: [], permissions: [],
};
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

test("only real business routes are eligible", () => {
  for (const route of ["/customers", "/customers/11111111-1111-4111-8111-111111111111"]) expect(getActivityScreen(route)).toBe("customers");
  expect(getActivityScreen("/projects/health")).toBe("projects");
  expect(getActivityScreen("/dashboard")).toBe("dashboard");
  expect(getActivityScreen("/finance/wechat-pay/orders")).toBe("finance");
  for (const route of ["/platform/tenants", "/platform/customers", "/customer-service", "/customers/no/such/page", "/projects-fake", "/finance/unknown", "/dashboard/unknown", "/login"]) expect(getActivityScreen(route)).toBeNull();
});

test("identity excludes all platform staff and isolates tenant, employee and user", () => {
  const scope = getActivityStorageScope(session);
  expect(scope).toBeTruthy();
  for (const input of [{ is_platform_staff: true }, { is_platform_super_admin: true }, { roles: ["platform_admin"] }, { roles: ["platform_staff"] }, { tenant: null }, { employee: { ...session.employee, id: null } }]) {
    expect(getActivityStorageScope({ ...session, ...input })).toBeNull();
  }
  expect(getActivityStorageScope({ ...session, tenant: { ...session.tenant!, id: "other" } })).not.toBe(scope);
  expect(getActivityStorageScope({ ...session, employee: { ...session.employee, id: "other" } })).not.toBe(scope);
  expect(getActivityStorageScope({ ...session, user_id: "other" })).not.toBe(scope);
});

test("five minute dedup is per screen and identity, survives reporter recreation", async () => {
  let now = 1000;
  let calls = 0;
  const store = storage();
  const options = { storage: store, now: () => now, send: async () => { calls++; return true; } };
  const report = createActivityViewReporter(options);
  await report("one", "customers");
  await report("one", "customers");
  await report("one", "projects");
  await report("two", "customers");
  expect(calls).toBe(3);
  await createActivityViewReporter(options)("one", "customers");
  expect(calls).toBe(3);
  now += 300_000;
  await report("one", "customers");
  expect(calls).toBe(4);
});

test("concurrent StrictMode events coalesce; failure retries only on a subsequent event", async () => {
  let finish: (success: boolean) => void = () => {};
  let calls = 0;
  const store = storage();
  const report = createActivityViewReporter({ storage: store, now: () => 1000,
    send: () => { calls++; return new Promise<boolean>((resolve) => { finish = resolve; }); } });
  const first = report("one", "customers");
  await report("one", "customers");
  expect(calls).toBe(1);
  finish(false);
  await first;
  expect(calls).toBe(1);
  const next = report("one", "customers");
  expect(calls).toBe(2);
  finish(true);
  await next;
  await report("one", "customers");
  expect(calls).toBe(2);
});

test("network/storage failures stay nonblocking and do not poison dedup", async () => {
  let calls = 0;
  const report = createActivityViewReporter({ now: () => 1000,
    storage: { getItem: () => { throw new DOMException("unavailable"); }, setItem: () => { throw new DOMException("unavailable"); } },
    send: async () => { calls++; if (calls === 1) throw new TypeError("network"); return true; } });
  await report("one", "customers");
  await report("one", "customers");
  await report("one", "customers");
  expect(calls).toBe(2);
});


test("each activity screen requires its corresponding read permission", () => {
  for (const [path, permission, screen] of [
    ["/customers", "customer.read", "customers"],
    ["/projects", "project.read", "projects"],
    ["/dashboard", "dashboard.read", "dashboard"],
    ["/finance/ledger", "finance.reports.read", "finance"],
  ] as const) {
    expect(getPermittedActivityScreen(path, session.permissions)).toBeNull();
    expect(getPermittedActivityScreen(path, [{ code: permission, scope: "self" }])).toBe(screen);
    expect(getPermittedActivityScreen(path, [{ code: "unrelated.read", scope: "all" }])).toBeNull();
  }
});

test("readable stale storage with failed writes cannot defeat memory dedup", async () => {
  let calls = 0;
  const report = createActivityViewReporter({ now: () => 600_000,
    storage: { getItem: () => "1000", setItem: () => { throw new DOMException("quota"); } },
    send: async () => { calls++; return true; } });
  await report("one", "customers");
  await report("one", "customers");
  expect(calls).toBe(1);
});


test("accepts the actual API envelope including an already recorded event", async () => {
  for (const recorded of [true, false]) {
    const payload = { data: { recorded }, message: "success" };
    expect(isActivityViewAcknowledged(payload)).toBe(true);
    let calls = 0;
    const report = createActivityViewReporter({ storage: storage(), now: () => 1000,
      send: async () => { calls++; return isActivityViewAcknowledged(payload); } });
    await report("one", "dashboard");
    await report("one", "dashboard");
    expect(calls).toBe(1);
  }
});

test("rejects error envelopes and missing or nonboolean recorded values", () => {
  for (const payload of [null, [], "success", {}, { success: true }, { data: null },
    { data: {} }, { data: { recorded: 1 } }, { data: { recorded: "false" } },
    { success: false, data: { recorded: true } },
    { error: "failed", data: { recorded: true } },
    { error: null, data: { recorded: false } }]) {
    expect(isActivityViewAcknowledged(payload)).toBe(false);
  }
});

test("Beijing midnight starts a new activity day inside the five minute dedup interval", async () => {
  for (const recreate of [false, true]) {
    let now = Date.parse("2026-10-09T15:59:00Z"); // Beijing 23:59
    let calls = 0;
    const options = { storage: storage(), now: () => now,
      send: async () => { calls++; return true; } };
    let report = createActivityViewReporter(options);
    await report("one", "dashboard");
    now = Date.parse("2026-10-09T15:59:30Z");
    await report("one", "dashboard");
    expect(calls).toBe(1);
    if (recreate) report = createActivityViewReporter(options);
    now = Date.parse("2026-10-09T16:01:00Z"); // Beijing next day 00:01
    await report("one", "dashboard");
    expect(calls).toBe(2);
    now = Date.parse("2026-10-09T16:02:00Z");
    await report("one", "dashboard");
    expect(calls).toBe(2);
  }
});

test("a response crossing Beijing midnight keeps the attempt day until a new visible event", async () => {
  for (const recreate of [false, true]) {
    const startedAt = Date.parse("2026-10-09T15:59:59Z");
    let now = startedAt;
    let calls = 0;
    let finish: (success: boolean) => void = () => {};
    const store = storage();
    const options = { storage: store, now: () => now,
      send: () => {
        calls++;
        return calls === 1
          ? new Promise<boolean>((resolve) => { finish = resolve; })
          : Promise.resolve(true);
      } };
    let report = createActivityViewReporter(options);
    const pending = report("one", "dashboard");
    expect(store.getItem("one:dashboard")).toBeNull();
    now = Date.parse("2026-10-09T16:00:01Z");
    finish(true);
    await pending;
    expect(store.getItem("one:dashboard")).toBe(String(startedAt));
    expect(calls).toBe(1);
    if (recreate) report = createActivityViewReporter(options);
    now = Date.parse("2026-10-09T16:00:02Z");
    await report("one", "dashboard");
    expect(calls).toBe(2);
    await report("one", "dashboard");
    expect(calls).toBe(2);
  }
});
