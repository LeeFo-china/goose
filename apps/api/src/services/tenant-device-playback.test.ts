import { describe, expect, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { TenantDeviceRow } from "@/repositories/tenant-devices";

process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
process.env.SUPABASE_PUBLISH ||= "test-publish-key";

async function subject() {
  return (await import("./tenant-devices/legacy/playback")).getTenantDevicePlayParams;
}

const authContext = {} as AuthContext;

function asset(overrides: Partial<TenantDeviceRow> = {}): TenantDeviceRow {
  return {
    id: "asset-1",
    tenant_id: "tenant-1",
    vendor: "tencent_iotvideo_industry",
    hardware_serial: "DS-ABC123",
    vendor_device_serial: "device-1",
    vendor_device_code: "34020000001320000001",
    vendor_device_name: "DS-ABC123",
    vendor_channel_id: "channel-1",
    vendor_channel_code: "34020000001310000001",
    vendor_channel_name: "主码流",
    device_type: "IPC",
    source_project_id: null,
    bound_project_id: null,
    bound_camera_id: null,
    status: "online",
    raw_status: null,
    metadata: {},
    created_by: null,
    updated_by: null,
    last_synced_at: null,
    deleted_at: null,
    created_at: "2026-09-25T00:00:00.000Z",
    updated_at: "2026-09-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("tenant device playback", () => {
  test("previews an unbound Tencent channel within the current tenant", async () => {
    const getTenantDevicePlayParams = await subject();
    const calls: unknown[] = [];
    const result = await getTenantDevicePlayParams({ authContext, id: "asset-1" }, {
      assertAccess: () => "tenant-1",
      findById: async (id, tenantId) => {
        calls.push([id, tenantId]);
        return asset();
      },
      getLiveStreamUrl: async (input) => {
        calls.push(input);
        return {
          flv_url: "https://example.test/live.flv",
          rtmp_url: null,
          hls_url: "https://example.test/live.m3u8",
          rtsp_url: null,
          request_id: "request-1",
        };
      },
    });

    expect(calls).toEqual([
      ["asset-1", "tenant-1"],
      { deviceId: "device-1", channelId: "channel-1" },
    ]);
    expect(result.camera.name).toBe("DS-ABC123");
    expect(result.player.hls_url).toBe("https://example.test/live.m3u8");
  });

  test("previews an unbound Ezviz asset from device management", async () => {
    const getTenantDevicePlayParams = await subject();
    const result = await getTenantDevicePlayParams({ authContext, id: "asset-1" }, {
      assertAccess: () => "tenant-1",
      findById: async () => asset({
        vendor: "ezviz",
        vendor_channel_id: null,
        metadata: { channel_no: 2 },
      }),
      getEzvizAccessToken: async () => ({
        access_token: "ezviz-token",
        expires_at: "2026-09-25T01:00:00.000Z",
      }),
      getEzplayerPluginVersion: async () => "1.5.2",
      buildEzvizLiveUrl: (serial, channelNo) => `rtmp://example/${serial}/${channelNo}`,
    });

    expect(result.player).toMatchObject({
      provider: "ezplayer",
      access_token: "ezviz-token",
      play_url: "rtmp://example/device-1/2",
      plugin_version: "1.5.2",
    });
  });

  test("rejects a root asset that has no playable channel", async () => {
    const getTenantDevicePlayParams = await subject();
    await expect(getTenantDevicePlayParams({ authContext, id: "asset-1" }, {
      assertAccess: () => "tenant-1",
      findById: async () => asset({ vendor_channel_id: null }),
      getLiveStreamUrl: async () => {
        throw new Error("must not call gateway");
      },
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  test("rejects an offline channel before requesting a stream", async () => {
    const getTenantDevicePlayParams = await subject();
    await expect(getTenantDevicePlayParams({ authContext, id: "asset-1" }, {
      assertAccess: () => "tenant-1",
      findById: async () => asset({ status: "offline" }),
      getLiveStreamUrl: async () => {
        throw new Error("must not call gateway");
      },
    })).rejects.toMatchObject({ statusCode: 409 });
  });
});
