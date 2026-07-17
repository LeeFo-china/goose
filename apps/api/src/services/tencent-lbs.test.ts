import {
  afterAll,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { tencentLbsService as tencentLbsServiceSingleton } from "./tencent-lbs";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const originalFetch = globalThis.fetch;

mock.module("@/services/system-settings", () => ({
  systemSettingsService: {
    async getString(key: string) {
      if (key === "TENCENT_LBS_WEBSERVICE_KEY") return "test-webservice-key";
      return "";
    },
    async getSecretString() {
      return "";
    },
  },
}));

let tencentLbsService: typeof tencentLbsServiceSingleton;

beforeAll(async () => {
  ({ tencentLbsService } = await import("./tencent-lbs"));
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

function installSuggestionFetch() {
  const urls: URL[] = [];
  const fetchMock = mock(async (input: string | URL | Request) => {
    urls.push(toRequestUrl(input));
    return Response.json({
      status: 0,
      request_id: "request-1",
      count: 3,
      data: [
        {
          id: "poi-in-scope",
          title: "固始中心",
          address: "中山大街 1 号",
          location: { lat: 32.17, lng: 115.65 },
          province: "河南省",
          city: "信阳市",
          district: "固始县",
          adcode: "411525",
        },
        {
          id: "poi-cross-district",
          title: "平桥中心",
          address: "南京大道 1 号",
          location: { lat: 32.1, lng: 114.12 },
          province: "河南省",
          city: "信阳市",
          district: "平桥区",
          adcode: "411503",
        },
        {
          id: "poi-cross-city",
          title: "郑州中心",
          address: "金水路 1 号",
          location: { lat: 34.76, lng: 113.65 },
          province: "河南省",
          city: "郑州市",
          district: "金水区",
          adcode: "410105",
        },
      ],
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { urls };
}

function installSuggestionFetchWithoutAdcode() {
  const urls: URL[] = [];
  const fetchMock = mock(async (input: string | URL | Request) => {
    urls.push(toRequestUrl(input));
    return Response.json({
      status: 0,
      request_id: "request-2",
      count: 1,
      data: [
        {
          id: "poi-without-adcode",
          title: "固始门店",
          address: "蓼北路 1 号",
          location: { lat: 32.18, lng: 115.66 },
          province: "河南省",
          city: "信阳市",
          district: "固始县",
        },
      ],
    });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return { urls };
}

function toRequestUrl(input: string | URL | Request) {
  if (input instanceof Request) return new URL(input.url);
  return new URL(input.toString());
}

describe("TencentLbsService.suggestAddress", () => {
  test("limits address suggestions to the selected province, city, district and adcode", async () => {
    const { urls } = installSuggestionFetch();

    const result = await tencentLbsService.suggestAddress({
      keyword: "中心",
      region: "固始县",
      province: "河南省",
      city: "信阳市",
      district: "固始县",
      adcode: "411525",
      pageSize: 8,
    });

    expect(urls[0]?.searchParams.get("region")).toBe("信阳市");
    expect(urls[0]?.searchParams.get("region_fix")).toBe("1");
    expect(result.list.map((item) => item.title)).toEqual(["固始中心"]);
    expect(result.count).toBe(1);
  });

  test("uses selected city as the Tencent suggestion region", async () => {
    const { urls } = installSuggestionFetch();

    await tencentLbsService.suggestAddress({
      keyword: "中心",
      region: "固始县",
      province: "河南省",
      city: "信阳市",
      district: "固始县",
      adcode: "411525",
      pageSize: 8,
    });

    expect(urls[0]?.searchParams.get("region")).toBe("信阳市");
    expect(urls[0]?.searchParams.get("region_fix")).toBe("1");
  });

  test("keeps in-scope suggestions when Tencent omits adcode but province city and district match", async () => {
    installSuggestionFetchWithoutAdcode();

    const result = await tencentLbsService.suggestAddress({
      keyword: "门店",
      region: "固始县",
      province: "河南省",
      city: "信阳市",
      district: "固始县",
      adcode: "411525",
      pageSize: 8,
    });

    expect(result.list.map((item) => item.title)).toEqual(["固始门店"]);
    expect(result.count).toBe(1);
  });
});
