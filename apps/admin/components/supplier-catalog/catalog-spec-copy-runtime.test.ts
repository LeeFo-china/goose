import { describe, expect, test } from "bun:test";

async function loadRuntime() {
  return import("./catalog-spec-copy-runtime").catch(() => null);
}

describe("目录规格复制运行时", () => {
  test("成功复制后采用服务端新版本并轮换幂等意图", async () => {
    const runtime = await loadRuntime();
    expect(runtime).not.toBeNull();
    if (!runtime) return;

    let keySequence = 0;
    const keyFactory = () => `spec-copy:${++keySequence}`;
    const first = runtime.completeCatalogSpecCopy(
      { status: "copied", copied_count: 1, ids: [], version: 2 },
      keyFactory,
    );
    const second = runtime.completeCatalogSpecCopy(
      { status: "copied", copied_count: 0, ids: [], version: 3 },
      keyFactory,
    );

    expect(first).toMatchObject({ expectedVersion: 2 });
    expect(second).toMatchObject({ expectedVersion: 3 });
    expect(first.intent.key).not.toBe(second.intent.key);
    expect(() => runtime.completeCatalogSpecCopy(
      { status: "copied", version: 0 },
      keyFactory,
    )).toThrow("复制结果缺少有效分类版本");
  });

  test("新规格列表请求会中止旧请求并拒绝旧响应落地", async () => {
    const runtime = await loadRuntime();
    expect(runtime).not.toBeNull();
    if (!runtime) return;

    const requests = runtime.createLatestCatalogSpecRequestSequence();
    const first = requests.begin();
    const second = requests.begin();

    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);
    second.finish();
    expect(second.isCurrent()).toBe(false);
  });
});
