import type {
  CreateDeviceResponse, DescribeDeviceListResponse, DescribeDevicePasswordResponse,
  DescribeSipServerResponse, TencentIotVideoCreatedDevice, TencentIotVideoDevicePassword,
  TencentIotVideoSipServerConfig,
} from "./shared";

export type RegistrationRequest = <T>(action: string, payload: Record<string, unknown>, options: { signal?: AbortSignal }) => Promise<T>;
export interface TencentRegistrationGateway {
  create(input: { marker: string; password: string; deviceType: number }): Promise<TencentIotVideoCreatedDevice>;
  recover(input: { marker: string; deviceType: number }): Promise<TencentIotVideoCreatedDevice | null>;
  getPassword(deviceId: string): Promise<TencentIotVideoDevicePassword>;
  getSipServer(): Promise<TencentIotVideoSipServerConfig | null>;
}
const readString = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

// Verified against Tencent's iotvideoindustry/v20201201 official SDK models:
// CreateDevice has NickName/PassWord/DeviceType, no idempotency token;
// DescribeDeviceList.NickName is a PREFIX filter, never proof of identity alone.
// https://github.com/TencentCloud/tencentcloud-sdk-nodejs/blob/master/src/services/iotvideoindustry/v20201201/iotvideoindustry_models.ts
export function createTencentRegistrationGateway(send: RegistrationRequest): TencentRegistrationGateway {
  const request = <T>(action: string, payload: Record<string, unknown>, timeout = 5_000) =>
    send<T>(action, payload, { signal: AbortSignal.timeout(timeout) });
  return {
    async create(input) {
      const result = await request<CreateDeviceResponse>("CreateDevice", {
        NickName: input.marker, PassWord: input.password, DeviceType: input.deviceType,
      }, 10_000);
      return { device_id: readString(result.DeviceId), device_code: readString(result.DeviceCode),
        virtual_group_id: readString(result.VirtualGroupId), request_id: readString(result.RequestId) };
    },
    async recover(input) {
      const result = await request<DescribeDeviceListResponse>("DescribeDeviceList", {
        NickName: input.marker, Offset: 0, Limit: 50,
      });
      // One bounded page. Missing/inconsistent totals or truncation cannot establish uniqueness.
      if (!Array.isArray(result.Devices) || !Number.isInteger(result.TotalCount)
        || result.TotalCount !== result.Devices.length || result.Devices.length > 50) return null;
      const matches = result.Devices.filter(device => device.NickName === input.marker);
      const device = matches[0];
      if (matches.length !== 1 || !device || device.DeviceType !== input.deviceType || !readString(device.DeviceId)) return null;
      return { device_id: readString(device.DeviceId), device_code: readString(device.DeviceCode),
        virtual_group_id: null, request_id: readString(result.RequestId) };
    },
    async getPassword(deviceId) {
      const result = await request<DescribeDevicePasswordResponse>("DescribeDevicePassWord", { DeviceId: deviceId });
      return { password: readString(result.PassWord), request_id: readString(result.RequestId) };
    },
    async getSipServer() {
      const result = await request<DescribeSipServerResponse>("DescribeSIPServer", {});
      const record = result.Data || result.ServerConfiguration || result.SipServer || result;
      const serial = readString(record.Serial);
      const port = typeof record.Port === "number" ? record.Port : Number(record.Port);
      return { sip_server_id: serial, sip_domain: readString(record.Realm) || serial?.slice(0, 10) || null,
        sip_host: readString(record.Host), sip_port: Number.isFinite(port) && port > 0 ? port : null,
        transport_protocol: "TCP", request_id: readString(result.RequestId) };
    },
  };
}

export const tencentRegistrationGateway = createTencentRegistrationGateway(async <T>(action: string, payload: Record<string, unknown>, options: { signal?: AbortSignal }) => {
  const { request } = await import("./request");
  return request<T>(action, payload, options);
});
