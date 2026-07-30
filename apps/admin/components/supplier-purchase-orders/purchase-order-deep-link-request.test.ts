import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  PurchaseOrderDeepLinkRequestGate,
} from "./purchase-order-deep-link-request";

function readWorkspace() {
  const url = new URL("./purchase-order-workspace.tsx", import.meta.url);
  expect(existsSync(url)).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("采购单 deep-link 请求代际", () => {
  test("延迟 A 在手动打开 B 后失效且不能覆盖 B", () => {
    const gate = new PurchaseOrderDeepLinkRequestGate();
    const delayedA = gate.begin();

    gate.invalidate();

    expect(gate.isCurrent(delayedA)).toBe(false);
    const nextDeepLink = gate.begin();
    expect(gate.isCurrent(nextDeepLink)).toBe(true);
  });

  test("手动打开、编辑和关闭都退出 deep-link 请求代际并清理 URL", () => {
    const workspace = readWorkspace();

    expect(workspace).toContain("function openOrderDetail");
    expect(workspace).toContain("function openOrderEditor");
    expect(workspace).toContain("function handleDetailOpenChange");
    expect(workspace).toContain("leavePurchaseOrderDeepLink()");
    expect(workspace).toContain("onOpen={openOrderDetail}");
    expect(workspace).toContain("onEdit={openOrderEditor}");
    expect(workspace).toContain(
      "onOpenChange={handleDetailOpenChange}",
    );
    expect(workspace).not.toContain("onOpen={(order) =>");
    expect(workspace).not.toContain("onEdit={(order) =>");
  });
});
