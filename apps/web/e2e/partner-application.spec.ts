import { expect, test } from "@playwright/test";

test("partner page is indexable and validates the first field", async ({ page }) => {
  await page.goto("/partners");
  await expect(page).toHaveTitle(/城市合伙人招募/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/partners$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "提交合作申请" }).click();
  const firstField = page.getByLabel("申请主体");
  await expect(firstField).toBeFocused();
  await expect(firstField).toHaveAttribute("aria-describedby", "applicant-name-error");
});

test("mobile navigation remains operable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/partners");
  await page.getByRole("button", { name: "打开菜单" }).click();
  await expect(page.getByRole("link", { name: "首页" }).last()).toBeVisible();
});

test("UI contract: attribution, SMS cooldown and double submission", async ({ page }) => {
  let submissionCount = 0;
  let submittedBody: Record<string, unknown> = {};
  await page.route("**/api/public/partner-applications/send-code", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { cooldown_seconds: 2 } }),
    }),
  );
  await page.route("**/api/public/partner-applications", async (route) => {
    submissionCount += 1;
    submittedBody = route.request().postDataJSON() as Record<string, unknown>;
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { application_no: "WEB-1" } }),
    });
  });

  const longUtm = "x".repeat(300);
  await page.goto(`/partners?utm_source=${longUtm}&utm_medium=search&utm_campaign=launch`);
  await page.getByLabel("联系电话").fill("13800138000");
  await page.getByRole("button", { name: "发送验证码" }).click();
  await expect(page.getByRole("button", { name: "2 秒后重试" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "发送验证码" })).toBeEnabled({ timeout: 3_500 });

  await page.getByLabel("申请主体").fill("测试装企");
  await page.getByLabel("联系人").fill("测试联系人");
  await page.getByLabel("意向代理城市").fill("上海");
  await page.getByLabel(/我确认填写信息真实/).click();
  const submit = page.getByRole("button", { name: "提交合作申请" });
  await submit.dblclick();
  await expect(page.getByRole("status")).toContainText("申请已提交");
  expect(submissionCount).toBe(1);
  expect(String(submittedBody.utm_source)).toHaveLength(120);
  expect(String(submittedBody.source_url).length).toBeLessThanOrEqual(500);
});

test("BFF integration signs Nginx client IP and sets the visitor cookie", async ({ request }) => {
  const response = await request.post("/api/public/partner-applications/send-code", {
    headers: {
      "content-type": "application/json",
      "x-real-ip": "203.0.113.77",
      "x-gooes-client-ip": "forged",
      "x-gooes-client-ip-signature": "forged",
    },
    data: { phone: "13800138000" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["set-cookie"]).toContain("HttpOnly");
  const body = await response.json();
  expect(body.upstream_path).toBe("/public/partner-applications/send-code");
  expect(body.upstream_headers["x-gooes-client-ip"]).toBe("203.0.113.77");
  expect(body.upstream_headers["x-gooes-client-ip-signature"]).toMatch(/^[a-f0-9]{64}$/);
  expect(body.upstream_headers["x-forwarded-for"]).toBeUndefined();
});
