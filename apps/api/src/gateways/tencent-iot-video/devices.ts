import { request } from "./request";
import {
  MAX_PAGES,
  PAGE_SIZE,
  normalizeStatus,
  readNumber,
  readString,
  type CreateDeviceResponse,
  type DeleteDeviceResponse,
  type DescribeDeviceListResponse,
  type DescribeDevicePasswordResponse,
  type DescribeSipServerResponse,
  type TencentDeviceRecord,
  type TencentIotVideoCreatedDevice,
  type TencentIotVideoDeleteDeviceResult,
  type TencentIotVideoDevice,
  type TencentIotVideoDevicePassword,
  type TencentIotVideoPasswordUpdate,
  type TencentIotVideoSipServerConfig,
  type UpdateDevicePasswordResponse,
} from "./shared";

export async function listDevices(keyword?: string | null) {
  const devices: TencentDeviceRecord[] = [];
  const normalizedKeyword = keyword?.trim();

  for (let offset = 0; offset < MAX_PAGES * PAGE_SIZE; offset += PAGE_SIZE) {
    const response = await request<DescribeDeviceListResponse>(
      "DescribeDeviceList",
      {
        Offset: offset,
        Limit: PAGE_SIZE,
        ...(normalizedKeyword ? { NickName: normalizedKeyword } : {}),
      },
    );
    const pageDevices = Array.isArray(response.Devices) ? response.Devices : [];
    devices.push(...pageDevices);

    const total = typeof response.TotalCount === "number" ? response.TotalCount : null;
    if (pageDevices.length < PAGE_SIZE || (total !== null && devices.length >= total)) {
      break;
    }
  }

  return devices;
}

export async function listDeviceSummaries(
  keyword?: string | null,
): Promise<TencentIotVideoDevice[]> {
  const devices = await listDevices(keyword);
  return devices
    .map((device) => {
      const deviceId = readString(device.DeviceId);
      if (!deviceId) return null;

      return {
        device_id: deviceId,
        device_code: readString(device.DeviceCode),
        device_name:
          readString(device.NickName) ||
          readString(device.ExtraInformation) ||
          readString(device.DeviceCode),
        device_type: typeof device.DeviceType === "number" ? device.DeviceType : null,
        status: normalizeStatus(device.Status ?? null),
        raw_status: device.Status ?? null,
        protocol: readString(device.Protocol),
        group_id: readString(device.GroupId),
        group_name: readString(device.GroupName),
      };
    })
    .filter((device): device is TencentIotVideoDevice => Boolean(device));
}

export async function findDeviceSummary(deviceId: string): Promise<TencentIotVideoDevice | null> {
  const devices = await listDeviceSummaries();
  return devices.find((device) => device.device_id === deviceId) || null;
}

export async function getSipServerConfig(): Promise<TencentIotVideoSipServerConfig> {
  const response = await request<DescribeSipServerResponse>(
    "DescribeSIPServer",
    {},
  );
  const record =
    response.Data ||
    response.ServerConfiguration ||
    response.SipServer ||
    response;
  const serial = readString(record.Serial);

  return {
    sip_server_id: serial,
    sip_domain: readString(record.Realm) || serial?.slice(0, 10) || null,
    sip_host: readString(record.Host),
    sip_port: readNumber(record.Port),
    transport_protocol: "TCP",
    request_id: response.RequestId || null,
  };
}

export async function createDevice(input: {
  name: string;
  password: string;
  deviceType: number;
  groupId?: string | null;
}): Promise<TencentIotVideoCreatedDevice> {
  const response = await request<CreateDeviceResponse>(
    "CreateDevice",
    {
      NickName: input.name,
      PassWord: input.password,
      DeviceType: input.deviceType,
      ...(input.groupId ? { GroupId: input.groupId } : {}),
    },
  );

  return {
    device_id: readString(response.DeviceId),
    device_code: readString(response.DeviceCode),
    virtual_group_id: readString(response.VirtualGroupId),
    request_id: response.RequestId || null,
  };
}

export async function getDevicePassword(deviceId: string): Promise<TencentIotVideoDevicePassword> {
  const response = await request<DescribeDevicePasswordResponse>(
    "DescribeDevicePassWord",
    {
      DeviceId: deviceId,
    },
  );

  return {
    password: readString(response.PassWord),
    request_id: response.RequestId || null,
  };
}

export async function updateDevicePassword(input: {
  deviceId: string;
  password: string;
}): Promise<TencentIotVideoPasswordUpdate> {
  const response = await request<UpdateDevicePasswordResponse>(
    "UpdateDevicePassWord",
    {
      DeviceId: input.deviceId,
      PassWord: input.password,
    },
  );

  return {
    status: readString(response.Status),
    request_id: response.RequestId || null,
  };
}

export async function deleteDevice(deviceId: string): Promise<TencentIotVideoDeleteDeviceResult> {
  const response = await request<DeleteDeviceResponse>(
    "DeleteDevice",
    {
      DeviceId: deviceId,
    },
  );

  return {
    request_id: response.RequestId || null,
  };
}
