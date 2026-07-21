import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const eq = mock((_column: string, _value: unknown) => query);
const or = mock((_filter: string) => query);
const order = mock((_column: string, _options: unknown) => query);
const range = mock(async (_from: number, _to: number) => ({
  data: [],
  error: null,
  count: 0,
}));
const select = mock((_columns: string, _options: unknown) => query);
const query = { eq, or, order, range };

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ from: () => ({ select }) }),
  },
}));

describe("WechatPayApplymentRepository list search", () => {
  beforeEach(() => {
    eq.mockClear();
    or.mockClear();
    order.mockClear();
    range.mockClear();
    select.mockClear();
  });

  test("searches a complete application UUID by the primary key", async () => {
    const { wechatPayApplymentRepository } = await import(
      "./wechat-pay-applyments"
    );
    const applymentId = "8026f87b-e6de-4bb1-80c6-6aa7066f1759";

    await wechatPayApplymentRepository.listApplyments({
      query: { page: 1, pageSize: 20, keyword: applymentId },
    });

    expect(eq).toHaveBeenCalledWith("id", applymentId);
    expect(or).not.toHaveBeenCalled();
    expect(range).toHaveBeenCalledWith(0, 19);
  });

  test("keeps ordinary keywords on the existing fuzzy search fields", async () => {
    const { wechatPayApplymentRepository } = await import(
      "./wechat-pay-applyments"
    );

    await wechatPayApplymentRepository.listApplyments({
      query: { page: 2, pageSize: 10, keyword: "晴天装饰" },
    });

    expect(eq).not.toHaveBeenCalled();
    expect(or).toHaveBeenCalledWith(
      expect.stringContaining("license_name.ilike.%晴天装饰%"),
    );
    expect(range).toHaveBeenCalledWith(10, 19);
  });
});
