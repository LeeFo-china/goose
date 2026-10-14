import { expect, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { TenantDeviceRow } from "@/repositories/tenant-devices";
import { registerTenantTencentDevice, type RegistrationDependencies } from "./tencent-registration";
import type { TencentRegistration, RegistrationClaim } from "@/repositories/tenant-devices/tencent-registration";

const input: Parameters<typeof registerTenantTencentDevice>[0] = { tenantId: "tenant-a", employeeId: "employee-a", payload: {
  hardware_serial: " sn-a ", device_type: 2, password: null,
} };
function fixture() {
  const claims = new Map<string, TencentRegistration>();
  const assets = new Map<string, TenantDeviceRow>();
  let creates = 0;
  let failCreate = false;
  let failSave = false;
  let failComplete = false;
  let recoverable = false;
  let password: string | null = "cloud_secret";
  const cloud = { device_id: "cloud-a", device_code: "34020000001320000001", virtual_group_id: null, request_id: "create-a" };
  const dependencies: RegistrationDependencies = {
    repository: {
      async claim(args): Promise<RegistrationClaim> {
        const key = `${args.tenantId}:${args.hardwareSerial}`;
        let registration = claims.get(key);
        const canCreate = !registration;
        if (!registration) {
          registration = { id: crypto.randomUUID(), tenant_id: args.tenantId, hardware_serial: args.hardwareSerial,
            device_type: args.deviceType, state: "pending", cloud_device_id: null, cloud_device_code: null,
            cloud_virtual_group_id: null, cloud_request_id: null, asset_id: null };
          claims.set(key, registration);
        }
        return { registration: { ...registration }, can_create: canCreate,
          asset: registration.asset_id ? assets.get(registration.asset_id)! : null };
      },
      async saveCloud(args) {
        if (failSave) { failSave = false; throw Errors.dbError("save failed"); }
        const row = [...claims.values()].find(row => row.id === args.registrationId)!;
        Object.assign(row, { state: "cloud_created", cloud_device_id: args.cloud.device_id,
          cloud_device_code: args.cloud.device_code, cloud_virtual_group_id: args.cloud.virtual_group_id,
          cloud_request_id: args.cloud.request_id });
      },
      async complete(args) {
        if (failComplete) { failComplete = false; throw Errors.dbError("insert failed"); }
        const row = [...claims.values()].find(row => row.id === args.registrationId)!;
        if (row.asset_id) return assets.get(row.asset_id)!;
        const asset = { id: crypto.randomUUID(), tenant_id: row.tenant_id, hardware_serial: row.hardware_serial,
          vendor: "tencent_iotvideo_industry", vendor_device_serial: row.cloud_device_id,
          vendor_device_code: row.cloud_device_code, vendor_device_name: row.hardware_serial,
          device_type: row.device_type === 3 ? "NVR" : "IPC" } as TenantDeviceRow;
        assets.set(asset.id, asset);
        Object.assign(row, { state: "completed", asset_id: asset.id });
        return asset;
      },
    },
    gateway: {
      async create() { creates++; if (failCreate) throw Errors.dbError("unknown cloud result"); return cloud; },
      async recover() { return recoverable ? cloud : null; },
      async getPassword() { return { password, request_id: "password-a" }; },
      async getSipServer() { return null; },
    },
    generatePassword: () => "generated_secret",
  };
  return { dependencies, claims, assets, creates: () => creates,
    failCreate: () => { failCreate = true; }, failSave: () => { failSave = true; },
    failComplete: () => { failComplete = true; }, recover: () => { recoverable = true; },
    noPassword: () => { password = null; } };
}

test("same normalized SN resumes compatible configuration with current cloud password", async () => {
  const f = fixture();
  const first = await registerTenantTencentDevice(input, f.dependencies);
  const again = await registerTenantTencentDevice({ ...input, payload: { ...input.payload, hardware_serial: "SN-A", password: "ignored" } }, f.dependencies);
  expect(again.asset.id).toBe(first.asset.id);
  expect(again.device).toMatchObject({ hardware_serial: "SN-A", device_name: "SN-A", device_type: 2,
    device_type_label: "IPC", sip_password: "cloud_secret", sip_transport_protocol: "TCP" });
  expect(again).toHaveProperty("sip_server", null);
  expect(f.creates()).toBe(1);
  expect(JSON.stringify([...f.claims.values(), ...f.assets.values()])).not.toContain("secret");
});

test("concurrent same-SN requests send at most one cloud create", async () => {
  const f = fixture();
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => registerTenantTencentDevice(input, f.dependencies)));
  expect(results.some(result => result.status === "fulfilled")).toBe(true);
  expect(f.creates()).toBe(1);
  expect(f.assets.size).toBe(1);
});

test("tenant keys are isolated", async () => {
  const f = fixture();
  await registerTenantTencentDevice(input, f.dependencies);
  await registerTenantTencentDevice({ ...input, tenantId: "tenant-b" }, f.dependencies);
  expect(f.claims.size).toBe(2);
  expect(f.creates()).toBe(2);
});

test("unknown cloud result returns stable reconciliation conflict and never re-creates", async () => {
  const f = fixture(); f.failCreate();
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ statusCode: 409,
      details: { registration_state: "reconciliation_required" } });
  }
  expect(f.creates()).toBe(1);
  expect(f.assets.size).toBe(0);
});

test("a later exact marker result recovers unknown cloud success", async () => {
  const f = fixture(); f.failCreate();
  await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ statusCode: 409 });
  f.recover();
  const result = await registerTenantTencentDevice(input, f.dependencies);
  expect(result.device.device_id).toBe("cloud-a");
  expect(result.device.sip_password).toBe("cloud_secret");
  expect(f.creates()).toBe(1);
});

test("cloud result save failure remains recoverable by marker", async () => {
  const f = fixture(); f.failSave();
  await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ code: "DB_ERROR" });
  f.recover();
  await registerTenantTencentDevice(input, f.dependencies);
  expect(f.creates()).toBe(1);
  expect(f.assets.size).toBe(1);
});

test("asset insert failure resumes persisted cloud result without cloud lookup/create", async () => {
  const f = fixture(); f.failComplete();
  await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ code: "DB_ERROR" });
  expect([...f.claims.values()][0]?.state).toBe("cloud_created");
  const result = await registerTenantTencentDevice(input, f.dependencies);
  expect(result.device.sip_password).toBe("cloud_secret");
  expect(f.creates()).toBe(1);
});

test("repeat does not reinterpret the original device type", async () => {
  const f = fixture();
  await registerTenantTencentDevice({ ...input, payload: { ...input.payload, device_type: 3 } }, f.dependencies);
  const result = await registerTenantTencentDevice(input, f.dependencies);
  expect(result.device.device_type).toBe(3);
  expect(result.device.device_type_label).toBe("NVR");
});

test("missing cloud password fails config read but preserves the completed registration", async () => {
  const f = fixture();
  await registerTenantTencentDevice(input, f.dependencies);
  f.noPassword();
  await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ statusCode: 503 });
  expect(f.creates()).toBe(1);
  expect(f.assets.size).toBe(1);
});

test("first registration preserves the Tencent creation request ID", async () => {
  const f = fixture();
  const result = await registerTenantTencentDevice(input, f.dependencies);
  expect(result.device.request_id).toBe("create-a");
});

test("a committed claim whose owner crashed before cloud send cannot be reacquired", async () => {
  const f = fixture();
  await f.dependencies.repository.claim({ tenantId: input.tenantId, hardwareSerial: "SN-A", deviceType: 2, employeeId: input.employeeId });
  await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ statusCode: 409 });
  expect(f.creates()).toBe(0);
  expect([...f.claims.values()][0]?.state).toBe("pending");
});

test("failed claim prevents all cloud calls", async () => {
  const f = fixture();
  f.dependencies.repository.claim = async () => { throw Errors.dbError("claim failed"); };
  await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ code: "DB_ERROR" });
  expect(f.creates()).toBe(0);
});

test("lookup errors keep unknown registrations pending without leaking upstream details", async () => {
  const f = fixture(); f.failCreate();
  f.dependencies.gateway.recover = async () => { throw Errors.dbError("sensitive-upstream"); };
  await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ statusCode: 409,
    details: { registration_state: "reconciliation_required" } });
  expect([...f.claims.values()][0]?.state).toBe("pending");
  expect(f.creates()).toBe(1);
});

test("successful completion with lost local response is safe to repeat", async () => {
  const f = fixture();
  const complete = f.dependencies.repository.complete;
  let lost = true;
  f.dependencies.repository.complete = async (args) => {
    const result = await complete(args);
    if (lost) { lost = false; throw Errors.dbError("response lost"); }
    return result;
  };
  await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ code: "DB_ERROR" });
  const result = await registerTenantTencentDevice(input, f.dependencies);
  expect(result.device.device_id).toBe("cloud-a");
  expect(f.creates()).toBe(1);
  expect(f.assets.size).toBe(1);
});


test("a rename between claim and completion never returns B config to an A request", async () => {
  const f = fixture();
  const complete = f.dependencies.repository.complete;
  let passwordReads = 0;
  f.dependencies.repository.complete = async (args) => {
    const asset = await complete(args);
    return { ...asset, hardware_serial: "SN-B" };
  };
  f.dependencies.gateway.getPassword = async () => { passwordReads++; return { password: "B-secret", request_id: null }; };
  await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ statusCode: 409,
    details: { registration_state: "reconciliation_required" } });
  expect(passwordReads).toBe(0);
});


test("registering the new SN after atomic rename resumes the same cloud without recreate", async () => {
  const f = fixture();
  const first = await registerTenantTencentDevice(input, f.dependencies);
  const row = [...f.claims.values()][0]!;
  const operationId = row.id;
  row.hardware_serial = "SN-B";
  f.claims.delete("tenant-a:SN-A");
  f.claims.set("tenant-a:SN-B", row);
  f.assets.get(first.asset.id)!.hardware_serial = "SN-B";
  const result = await registerTenantTencentDevice({ ...input, payload: { ...input.payload, hardware_serial: "SN-B" } }, f.dependencies);
  expect(result.device.hardware_serial).toBe("SN-B");
  expect(result.asset.id).toBe(first.asset.id);
  expect(result.device.device_id).toBe(first.device.device_id);
  expect(result.device.sip_password).toBe("cloud_secret");
  expect([...f.claims.values()][0]?.id).toBe(operationId);
  expect(f.creates()).toBe(1);
});

for (const state of ["completed", "cloud_created"] as const) {
  test(`password read throws after ${state}: returns recoverable asset without recreating`, async () => {
    const f = fixture();
    if (state === "cloud_created") {
      f.failComplete();
      await expect(registerTenantTencentDevice(input, f.dependencies)).rejects.toMatchObject({ code: "DB_ERROR" });
    } else {
      await registerTenantTencentDevice(input, f.dependencies);
    }
    const getPassword = f.dependencies.gateway.getPassword;
    f.dependencies.gateway.getPassword = async () => { throw Errors.dbError("sensitive-upstream-password"); };
    const error = await registerTenantTencentDevice(input, f.dependencies).catch((value: unknown) => value);
    const assetId = [...f.assets.keys()][0];
    expect(error).toMatchObject({ statusCode: 503, code: "TENCENT_IOT_VIDEO_API_ERROR",
      details: { tenant_device_id: assetId } });
    expect(JSON.stringify(error)).not.toContain("sensitive-upstream-password");
    expect([...f.claims.values()][0]).toMatchObject({ state: "completed", asset_id: assetId });
    f.dependencies.gateway.getPassword = getPassword;
    const recovered = await registerTenantTencentDevice(input, f.dependencies);
    expect(assetId).toBe(recovered.asset.id);
    expect(recovered.device.sip_password).toBe("cloud_secret");
    expect(f.creates()).toBe(1);
    expect(f.assets.size).toBe(1);
  });
}
