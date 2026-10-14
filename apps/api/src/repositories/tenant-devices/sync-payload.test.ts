import { beforeAll, expect, test } from "bun:test";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role";
let upsert: typeof import("./legacy/mutations").upsertSynced;
beforeAll(async () => { ({ upsertSynced: upsert } = await import("./legacy/mutations")); });

test("legacy sync uses one atomic RPC rather than rewriting a stale asset snapshot", async () => {
  const calls: unknown[] = [];
  const context = { adminClient: { rpc: async (name: string, args: unknown) => {
    calls.push([name,args]); return { data: { device: { id: "asset", hardware_serial: "SN-NEW" }, created: false }, error: null };
  } } } as unknown as ThisParameterType<typeof upsert>;
  const input = { tenant_id: "tenant", vendor: "tencent_iotvideo_industry" as const, hardware_serial: "SN-OLD",
    vendor_device_serial: "cloud", vendor_channel_id: "channel", status: "online" as const };
  const result = await upsert.call(context, input);
  expect(calls).toEqual([["upsert_synced_tenant_device", { p_input: input }]]);
  expect(result.device.hardware_serial).toBe("SN-NEW");
});
test("legacy sync ownership conflict stays a business rejection", async () => {
  const context = { adminClient: { rpc: async () => ({ data: null, error: { code: "42501" } }) } } as unknown as ThisParameterType<typeof upsert>;
  await expect(upsert.call(context, { tenant_id: "tenant", vendor: "tencent_iotvideo_industry",
    vendor_device_serial: "cloud", status: "online" })).rejects.toMatchObject({ statusCode: 409 });
});
