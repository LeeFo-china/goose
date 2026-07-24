import { describe, expect, test } from "bun:test";

const BASE_ID = "11111111-1111-4111-8111-111111111111";

async function loadModules() {
  const [api, rules] = await Promise.all([
    import("./supplier-catalog-api").catch(() => null),
    import("./supplier-catalog-rules").catch(() => null),
  ]);
  return { api, rules };
}

describe("供应标准目录运行时行为", () => {
  test("基准单位候选使用独立的分页搜索接口", async () => {
    const { api } = await loadModules();
    expect(api).not.toBeNull();
    if (!api) return;

    expect(api.buildBaseUnitListPath({
      page: 2,
      pageSize: 20,
      keyword: "包装 箱",
    })).toBe(
      "/platform/catalog/units?status=active&unit_kind=base&page=2&pageSize=20&keyword=%E5%8C%85%E8%A3%85+%E7%AE%B1",
    );
  });

  test("候选页缺少当前关联时固定回显后端投影", async () => {
    const { rules } = await loadModules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    const pinned = {
      id: BASE_ID,
      code: "UNIT-M",
      name: "米",
      symbol: "m",
      status: "active" as const,
    };
    const candidate = {
      id: "22222222-2222-4222-8222-222222222222",
      code: "UNIT-KG",
      name: "千克",
      symbol: "kg",
      status: "active" as const,
    };

    expect(rules.mergePinnedBaseUnit([candidate], pinned)).toEqual([
      pinned,
      candidate,
    ]);
    expect(rules.mergePinnedBaseUnit([pinned, candidate], pinned)).toEqual([
      pinned,
      candidate,
    ]);
  });

  test("同一创建意图复用幂等键，payload变化和重新打开时轮换", async () => {
    const { rules } = await loadModules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    const keys = ["key-1", "key-2", "key-3"];
    const keyFactory = () => keys.shift() ?? "unexpected";
    const firstPayload = { code: "BR-01", name: "雨虹", sort_order: 100 };
    const opened = rules.initializeCatalogCreateIntent(keyFactory);
    const first = rules.resolveCatalogCreateIntent(
      opened,
      firstPayload,
      keyFactory,
    );
    const networkRetry = rules.resolveCatalogCreateIntent(
      first,
      { name: "雨虹", sort_order: 100, code: "BR-01" },
      keyFactory,
    );
    const changed = rules.resolveCatalogCreateIntent(
      networkRetry,
      { ...firstPayload, name: "东方雨虹" },
      keyFactory,
    );
    const reopened = rules.initializeCatalogCreateIntent(keyFactory);

    expect(first.key).toBe("key-1");
    expect(networkRetry.key).toBe("key-1");
    expect(changed.key).toBe("key-2");
    expect(reopened.key).toBe("key-3");
  });

  test("三类POST请求携带固定意图键和原始payload", async () => {
    const { api, rules } = await loadModules();
    expect(api).not.toBeNull();
    expect(rules).not.toBeNull();
    if (!api || !rules) return;

    const payload = { code: "UNIT-M", name: "米" };
    const intent = rules.resolveCatalogCreateIntent(
      null,
      payload,
      () => "intent-key",
    );

    for (const [kind, plural] of [
      ["category", "categories"],
      ["brand", "brands"],
      ["unit", "units"],
    ] as const) {
      expect(api.buildCatalogMutationRequest({
        kind,
        payload,
        intent,
      })).toEqual({
        path: `/platform/catalog/${plural}`,
        init: {
          method: "POST",
          headers: { "Idempotency-Key": "intent-key" },
          body: JSON.stringify(payload),
        },
      });
    }
  });

  test("基准单位加载失败后可用同一查询重试", async () => {
    const { api } = await loadModules();
    expect(api).not.toBeNull();
    if (!api) return;

    let attempts = 0;
    const request = async (path: string) => {
      attempts += 1;
      expect(path).toContain("unit_kind=base");
      if (attempts === 1) throw new Error("暂时不可用");
      return {
        list: [],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        },
      };
    };

    await expect(api.loadBaseUnitPage({
      page: 1,
      pageSize: 20,
      keyword: "",
    }, request)).rejects.toThrow("暂时不可用");
    await expect(api.loadBaseUnitPage({
      page: 1,
      pageSize: 20,
      keyword: "",
    }, request)).resolves.toMatchObject({
      pagination: { page: 1, pageSize: 20 },
    });
    expect(attempts).toBe(2);
  });

  test("换算系数按数据库精度返回字段错误", async () => {
    const { rules } = await loadModules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    expect(rules.validateConversionFactor("123456789012.123456")).toBeNull();
    expect(rules.validateConversionFactor("1234567890123.1")).toBe(
      "换算系数整数部分不能超过 12 位",
    );
    expect(rules.validateConversionFactor("1.1234567")).toBe(
      "换算系数小数部分不能超过 6 位",
    );
    expect(rules.validateConversionFactor("0")).toBe(
      "换算系数必须大于 0",
    );
  });

  test("返回上级恢复该层的分页和筛选状态", async () => {
    const { rules } = await loadModules();
    expect(rules).not.toBeNull();
    if (!rules) return;

    expect(rules.parentCategoryHref([{
      id: BASE_ID,
      name: "主材",
      returnState: {
        page: 3,
        pageSize: 40,
        keyword: "瓷砖",
        status: "active",
      },
    }])).toBe(
      "/platform/catalog?page=3&pageSize=40&keyword=%E7%93%B7%E7%A0%96&status=active",
    );
  });
});
