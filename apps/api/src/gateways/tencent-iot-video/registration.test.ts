import { expect, test } from "bun:test";
import { createTencentRegistrationGateway, type RegistrationRequest } from "./registration";
const marker = "gooes-reg-00000000-0000-4000-8000-000000000001";
function gateway(response: unknown) {
  const calls: { action: string; payload: Record<string, unknown>; signal?: AbortSignal }[] = [];
  const request: RegistrationRequest = async <T>(action: string, payload: Record<string, unknown>, options: { signal?: AbortSignal }) => {
    calls.push({ action, payload, signal: options.signal });
    return response as T;
  };
  return { api: createTencentRegistrationGateway(request), calls };
}
const device = { DeviceId: "cloud-a", DeviceCode: "code-a", NickName: marker, DeviceType: 2 };
test("recovery requires one complete page and an exact operation name and device type", async () => {
  const f = gateway({ Devices: [device], TotalCount: 1 });
  expect(await f.api.recover({ marker, deviceType: 2 })).toMatchObject({ device_id: "cloud-a" });
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]?.payload).toEqual({ NickName: marker, Offset: 0, Limit: 50 });
  expect(f.calls[0]?.signal).toBeInstanceOf(AbortSignal);
});
for (const [name, response] of Object.entries({
  prefix: { Devices: [{ ...device, NickName: marker + "-other" }], TotalCount: 1 },
  wrongType: { Devices: [{ ...device, DeviceType: 3 }], TotalCount: 1 },
  truncated: { Devices: [device], TotalCount: 51 },
  missingCount: { Devices: [device] },
  duplicate: { Devices: [device, { ...device, DeviceId: "cloud-b" }], TotalCount: 2 },
  malformed: { Devices: [{ ...device, DeviceId: null }], TotalCount: 1 },
  empty: { Devices: [], TotalCount: 0 },
})) {
  test(`recovery cannot adopt ${name} results`, async () => {
    expect(await gateway(response).api.recover({ marker, deviceType: 2 })).toBeNull();
  });
}
test("create sends the operation marker once and has a deadline", async () => {
  const f = gateway({ DeviceId: "cloud-a", DeviceCode: "code-a" });
  await f.api.create({ marker, password: "test-secret", deviceType: 2 });
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]?.payload).toEqual({ NickName: marker, PassWord: "test-secret", DeviceType: 2 });
  expect(f.calls[0]?.signal).toBeInstanceOf(AbortSignal);
});
