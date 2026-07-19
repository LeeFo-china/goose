import { describe, expect, mock, test } from "bun:test";
import type { JwtPayload } from "@/utils/jwt";
import { DouyinMiniappContentService } from "./content";

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const user: JwtPayload = {
  sub: "a".repeat(64), subject_hash: "a".repeat(64), token_type: "douyin_miniapp",
  login_channel: "douyin", roles: ["douyin_miniapp"], tenant_id: TENANT_ID,
  douyin_installation_id: INSTALLATION_ID, douyin_app_id: "tt-authorizer-1",
};
const runtime = {
  brand: { logo_url: "https://cdn.example.com/logo.png", qualifications: [] },
  theme: { primary_color: "#C45A32", navigation_text_color: "black" },
  features: { cases: true, sites: true, sms_lead: true, douyin_phone: false,
    phone_capture_mode: "sms" },
  home_banners: [{ image_url: "https://cdn.example.com/banner.png", title: "放心装",
    subtitle: "透明施工" }],
  trust_metrics: [{ label: "服务家庭", value: "1200+" }],
  privacy_policy_version: "2026-07-19",
};
const installation = {
  id: INSTALLATION_ID, tenant_id: TENANT_ID, authorizer_appid: "tt-authorizer-1",
  authorization_status: "active" as const, template_version: "1.0.0",
  runtime_config: runtime, tenant: { id: TENANT_ID, status: "active" as const },
};
const company = {
  public_name: "示例装饰", introduction: "公司公开简介", public_phone: "4000000000",
  address_province: "河南省", address_city: "郑州市", address_district: "金水区",
  address: "公开门店地址", status: "published" as const,
  published_at: "2026-07-01T00:00:00.000Z",
};
const project = {
  id: PROJECT_ID, name: "现代简约案例", status: "constructing", budget: 260000,
  start_date: "2026-07-01", created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z", style_tags: ["现代"],
  property: { community: "示例花园", layout: "三室两厅", area: 120,
    city: "郑州市", district: "金水区" },
};

function dependencies(overrides: Record<string, unknown> = {}) {
  const repository = {
    findActiveInstallation: mock(async () => installation),
    findPublishedCompany: mock(async () => company),
    listServiceAreas: mock(async () => [{ province: "河南省", city: "郑州市",
      district: "金水区", priority: 10 }]),
    listCases: mock(async () => ({ rows: [project], total: 1 })),
    findCase: mock(async () => project),
    listSites: mock(async () => ({ rows: [project], total: 1 })),
    findSite: mock(async () => project),
    listSiteLogs: mock(async () => ({ rows: [{
      id: "44444444-4444-4444-8444-444444444444", stage_code: "water-electric",
      node_name: "水电施工", images: ["http://unsafe.test/a.jpg",
        ...Array.from({ length: 12 }, (_, index) => `https://cdn.example.com/${index}.jpg`)],
      created_at: "2026-07-20T00:00:00.000Z",
    }], total: 1 })),
    ...overrides,
  };
  return { repository };
}

describe("DouyinMiniappContentService", () => {
  test("loads company, six cases and six sites in one bounded parallel bootstrap", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const deps = dependencies();
    for (const method of ["findPublishedCompany", "listServiceAreas", "listCases", "listSites"] as const) {
      const value = await deps.repository[method]();
      deps.repository[method] = mock(async () => { await gate; return value; }) as never;
    }
    const service = new DouyinMiniappContentService(deps as never);
    const pending = service.bootstrap(user);
    await Bun.sleep(0);

    expect(deps.repository.findPublishedCompany).toHaveBeenCalledTimes(1);
    expect(deps.repository.listServiceAreas).toHaveBeenCalledTimes(1);
    expect(deps.repository.listCases).toHaveBeenCalledWith({ tenantId: TENANT_ID,
      page: 1, pageSize: 6 });
    expect(deps.repository.listSites).toHaveBeenCalledWith({ tenantId: TENANT_ID,
      page: 1, pageSize: 6 });
    release();
    const result = await pending;
    expect(result).toMatchObject({
      installation: { status: "active", template_version: "1.0.0" },
      company: { name: "示例装饰", logo_url: runtime.brand.logo_url },
      theme: runtime.theme, features: runtime.features,
      content: { home_banners: runtime.home_banners, trust_metrics: runtime.trust_metrics,
        featured_cases: [{ id: PROJECT_ID, budget_band: "20-30万" }],
        active_sites: [{ id: PROJECT_ID }] },
    });
    expect(JSON.stringify(result)).not.toMatch(/260000|customer|signed_amount|latitude|longitude/i);
  });

  test("always scopes list and detail reads to the signed session tenant", async () => {
    const deps = dependencies();
    const service = new DouyinMiniappContentService(deps as never);

    const cases = await service.listCases(user, { page: 2, pageSize: 20,
      style: "现代", layout: "三室两厅" });
    await service.getCase(user, PROJECT_ID);

    expect(deps.repository.listCases).toHaveBeenCalledWith({ tenantId: TENANT_ID,
      page: 2, pageSize: 20, style: "现代", layout: "三室两厅" });
    expect(deps.repository.findCase).toHaveBeenCalledWith({ tenantId: TENANT_ID,
      id: PROJECT_ID });
    expect(cases).toMatchObject({ items: [{ cover_image_url: null, description: null }],
      pagination: { page: 2, pageSize: 20, total: 1, totalPages: 1 } });
  });

  test("fails closed for invalid stored runtime config and cross-tenant ids", async () => {
    const invalid = dependencies({ findActiveInstallation: mock(async () => ({
      ...installation, runtime_config: { theme: { primary_color: "javascript:bad" } },
    })) });
    await expect(new DouyinMiniappContentService(invalid as never).listSites(user,
      { page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: "DOUYIN_INSTALLATION_DISABLED", statusCode: 409,
    });
    expect(invalid.repository.listSites).not.toHaveBeenCalled();

    const missing = dependencies({ findSite: mock(async () => null) });
    await expect(new DouyinMiniappContentService(missing as never).getSite(user, PROJECT_ID))
      .rejects.toMatchObject({ code: "DOUYIN_CONTENT_NOT_FOUND", statusCode: 404 });
  });

  test("returns bounded HTTPS-only progress images without raw content", async () => {
    const deps = dependencies();
    const result = await new DouyinMiniappContentService(deps as never).listSiteLogs(
      user, PROJECT_ID, { page: 1, pageSize: 20 },
    );

    expect(deps.repository.findSite).toHaveBeenCalledWith({ tenantId: TENANT_ID,
      id: PROJECT_ID });
    expect(deps.repository.listSiteLogs).toHaveBeenCalledWith({ tenantId: TENANT_ID,
      projectId: PROJECT_ID, page: 1, pageSize: 20 });
    expect(result.items[0]!.images).toHaveLength(9);
    expect(result.items[0]!.images.every((url) => url.startsWith("https://"))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/content|employee|customer|address/i);
  });
});
