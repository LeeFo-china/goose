import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("Platform tenant detail page layout", () => {
  test("keeps the detail page scrollable inside the admin shell without clipping the bottom panel", () => {
    const page = readSource("../../app/(console)/platform/tenants/[id]/page.tsx");
    const loading = readSource("../../app/(console)/platform/tenants/[id]/loading.tsx");

    for (const source of [page, loading]) {
      expect(source).toContain("h-full min-h-0");
      expect(source).toContain("overflow-y-auto");
      expect(source).toContain("pb-6");
      expect(source).toContain("[scrollbar-gutter:stable]");
    }
  });

  test("shows service-provider public profile separately from tenant primary address", () => {
    const page = readSource("../../app/(console)/platform/tenants/[id]/page.tsx");
    const card = readSource("./service-provider-public-profile-card.tsx");

    expect(page).toContain("getPlatformServiceProviderProfile");
    expect(page).toContain("/platform/service-provider-publications/");
    expect(page).toContain("<ServiceProviderPublicProfileCard");
    expect(card).toContain("服务商公开资料");
    expect(card).toContain("公开地址");
    expect(card).toContain("公开电话");
    expect(card).toContain("发布状态");
    expect(card).toContain("发布时间");
    expect(page).toContain('InfoRow label="公司地址" value={text(tenant.address)}');
    expect(card).toContain("formatServiceProviderAddress(profile)");
  });
});
