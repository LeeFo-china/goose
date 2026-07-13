import { expect, test } from "@playwright/test";

const detailCases = [
  {
    path: "/articles/e2e-article",
    title: "可发布的装修文章",
    schemaType: "Article",
  },
  {
    path: "/cases/e2e-case",
    title: "上海住宅交付案例",
    schemaType: "CreativeWork",
  },
  {
    path: "/cities/shanghai",
    title: "上海装修协作服务",
    schemaType: "Service",
  },
] as const;

for (const detail of detailCases) {
  test(`${detail.path} exposes canonical, Open Graph and JSON-LD`, async ({ page }) => {
    await page.goto(detail.path);

    await expect(page.getByRole("heading", { level: 1, name: detail.title })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${detail.path}$`),
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      detail.title,
    );
    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    expect(jsonLd).toContain(`\"@type\":\"${detail.schemaType}\"`);
  });
}

test("sitemap includes every paginated published article and core static route", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  const body = await response.text();

  expect(response.status()).toBe(200);
  for (const path of [
    "/",
    "/products",
    "/solutions",
    "/about",
    "/partners",
    "/articles",
    "/cases",
    "/articles/e2e-article-101",
    "/cases/e2e-case",
    "/cities/shanghai",
  ]) {
    expect(body).toContain(`https://www.goodcms.cn${path}`);
  }
  expect(body).not.toContain("draft-article");
  expect(body).not.toContain("archived-case");
  expect(body).not.toContain("/portal/");
});

test("dynamic metadata stays inside head for Chrome and Lighthouse user agents", async ({ request }) => {
  for (const userAgent of [
    "Mozilla/5.0 Chrome/136.0.0.0 Safari/537.36",
    "Mozilla/5.0 Chrome-Lighthouse/12.8.2",
  ]) {
    const response = await request.get("/cities/shanghai", {
      headers: { "user-agent": userAgent },
    });
    const html = await response.text();
    const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? "";

    expect(head).toContain("上海装修协作服务");
    expect(head).toContain('name="description"');
    expect(head).toContain('rel="canonical"');
    expect(head).toContain('property="og:title"');
  }
});

test("marketing and page-two lists do not inherit the home Open Graph URL", async ({ page }) => {
  await page.goto("/products");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", /\/products$/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /产品能力/);

  await page.goto("/articles?page=2");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    /\/articles\?page=2$/,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /第 2 页/);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /第 2 页/);
});

test("robots allows the public site while excluding private surfaces", async ({ request }) => {
  const response = await request.get("/robots.txt");
  const body = await response.text();

  expect(response.status()).toBe(200);
  expect(body).toContain("Allow: /");
  expect(body).toContain("Disallow: /api/");
  expect(body).toContain("Disallow: /portal/");
  expect(body).toContain("Sitemap: https://www.goodcms.cn/sitemap.xml");
});

test("partner application still focuses the first invalid field", async ({ page }) => {
  await page.goto("/partners");
  await page.getByRole("button", { name: "提交合作申请" }).click();

  await expect(page.getByLabel("申请主体")).toBeFocused();
  await expect(page.getByLabel("申请主体")).toHaveAttribute(
    "aria-describedby",
    "applicant-name-error",
  );
});
