import { expect, test } from "@playwright/test";

test("desktop navigation reaches every primary public route", async ({ page }) => {
  await page.goto("/");

  for (const [name, path] of [
    ["产品", "/products"],
    ["解决方案", "/solutions"],
    ["案例", "/cases"],
    ["关于我们", "/about"],
    ["城市合伙人", "/partners"],
  ] as const) {
    const link = page.getByRole("navigation").getByRole("link", { name, exact: true }).first();
    await expect(link).toHaveAttribute("href", path);
  }
});

test("keyboard navigation exposes a visible focus target", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const focused = page.locator(":focus-visible");
  await expect(focused).toBeVisible();
  await expect(focused).toHaveAttribute("href", /.+/);
});

test("article pagination keeps page two navigable", async ({ page }) => {
  await page.goto("/articles");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("装修经营文章");
  await page.getByRole("link", { name: "查看下一页" }).click();

  await expect(page).toHaveURL(/\/articles\?page=2$/);
  await expect(page.getByRole("heading", { name: "分页文章 21" })).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/articles\?page=2$/,
  );
});

test("unknown routes render the navigable 404", async ({ page }) => {
  const response = await page.goto("/not-a-real-route");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "页面未找到" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "返回首页" }))
    .toHaveAttribute("href", "/");
});
