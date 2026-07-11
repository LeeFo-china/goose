import { expect, test } from "@playwright/test";

test("a valid preview redirects to the bound article and remains noindex", async ({ page }) => {
  await page.goto("/api/preview?token=e2e-preview-token-that-is-long-enough");

  await expect(page).toHaveURL(/\/articles\/e2e-preview$/);
  await expect(page).not.toHaveURL(/token=/);
  await expect(page.getByRole("heading", { level: 1, name: "预览中的文章" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex.*nofollow/i,
  );
});

test("an invalid preview never reflects the token and stays noindex", async ({ page }) => {
  await page.goto("/api/preview?token=invalid-preview-token");

  await expect(page).toHaveURL(/\/preview-error$/);
  await expect(page).not.toHaveURL(/token=/);
  await expect(page.locator("body")).not.toContainText("invalid-preview-token");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex.*nofollow/i,
  );
});
