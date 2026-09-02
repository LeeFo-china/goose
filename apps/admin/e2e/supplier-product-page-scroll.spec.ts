import { expect, test } from "@playwright/test";

const mockBackendBaseUrl = "http://127.0.0.1:3996";
const relationshipId = "23000000-0000-4000-8000-000000000021";
const productId = "21000000-0000-4000-8000-000000000031";

test("SKU 下钻内容超出后台视口时可以完整纵向滚动", async ({ page, request }) => {
  const resetResponse = await request.post(`${mockBackendBaseUrl}/__test/reset`, {
    data: {},
  });
  expect(resetResponse.ok()).toBe(true);
  const loginResponse = await page.request.post("/api/auth/login", {
    data: { phone: "18637605353", code: "" },
  });
  expect(loginResponse.ok()).toBe(true);

  await page.setViewportSize({ width: 1280, height: 560 });
  await page.goto(
    `/supplier-products?tenantSupplierId=${relationshipId}&productId=${productId}`,
    { waitUntil: "networkidle" },
  );
  await expect(page.getByRole("heading", { name: "平台共享瓷砖 · SKU" }))
    .toBeVisible();

  const workspace = page.getByTestId("supplier-product-workspace");
  await expect(workspace).toHaveCSS("overflow-y", "auto");
  const dimensions = await workspace.evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);

  await workspace.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(() => workspace.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
});
