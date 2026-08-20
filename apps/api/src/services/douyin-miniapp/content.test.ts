import { describe, expect, mock, test } from "bun:test";
import type { JwtPayload } from "@/utils/jwt";
import { parseBootstrap } from "../../../../douyin-mini/src/api/content-validation";
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
const storedCover = `tenants/${TENANT_ID}/project_log/cover.jpg`;
const resolvedCover = `https://assets.example.com/${storedCover}`;
const project = {
  id: PROJECT_ID, name: "张先生 1号楼101室装修", status: "constructing", budget: 260000,
  start_date: "2026-07-01", created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z", style_tags: ["现代"],
  property: { community: "示例花园", layout: "三室两厅", area: 120,
    city: "郑州市", district: "金水区", address: "1号楼101室" },
  public_profile: {
    public_title: "现代简约实景",
    public_description: "明亮通透的现代简约空间",
    public_image_urls: [storedCover],
    style_tags: ["现代", "简约"],
    budget_band: "20-30万",
    publication_status: "published" as const,
    updated_at: "2026-07-20T00:00:00.000Z",
  },
};

function resolveImageUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.startsWith("https://")
      ? item
      : `https://assets.example.com/${item}`);
}

function dependencies(overrides: Record<string, unknown> = {}) {
  let imageUrlsReady = false;
  const prepareImageUrls = mock(async () => {
    imageUrlsReady = true;
  });
  const readyAwareResolveImageUrls = (value: unknown) => imageUrlsReady
    ? resolveImageUrls(value)
    : [];
  const repository = {
    findActiveInstallation: mock(async () => installation),
    findPublishedCompany: mock(async () => company),
    listServiceAreas: mock(async () => [{ province: "河南省", city: "郑州市",
      district: "金水区", priority: 10 }]),
    listCases: mock(async () => ({ rows: [project], total: 1 })),
    findCase: mock(async () => project),
    listSites: mock(async () => ({ rows: [project], total: 1 })),
    findSite: mock(async () => project),
    listProjects: mock(async () => ({ rows: [project], count: 1 })),
    findProject: mock(async () => project),
    listProjectImageLogs: mock(async () => [{
      project_id: PROJECT_ID,
      images: [storedCover],
      created_at: "2026-07-19T00:00:00.000Z",
    }]),
    listSiteLogs: mock(async () => ({ rows: [{
      id: "44444444-4444-4444-8444-444444444444", stage_code: "water-electric",
      node_name: "水电施工", images: [storedCover,
        "project-log/e2e/broken-legacy-image.jpg", "http://unsafe.test/a.jpg",
        ...Array.from({ length: 12 }, (_, index) => `https://cdn.example.com/${index}.jpg`)],
      created_at: "2026-07-20T00:00:00.000Z",
    }], total: 1 })),
    ...overrides,
  };
  return { repository, prepareImageUrls,
    resolveImageUrls: readyAwareResolveImageUrls };
}

describe("DouyinMiniappContentService", () => {
  test("loads bounded unified and in-progress feeds with legacy parser compatibility", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const completedProjects = Array.from({ length: 6 }, (_, index) => ({
      ...project,
      id: `11111111-1111-4111-8111-${String(index + 2).padStart(12, "0")}`,
      status: "acceptance",
    }));
    const profileImages = Array.from(
      { length: 12 },
      (_, index) => `https://cdn.example.com/public-${index}.jpg`,
    );
    const activeProject = {
      ...project,
      public_profile: { ...project.public_profile, public_image_urls: profileImages },
    };
    const listProjects = mock(async (input: {
      tenantId: string;
      phase?: string;
      page: number;
      pageSize: number;
    }) => {
      await gate;
      return input.phase === "in_progress"
        ? { rows: [activeProject], count: 1 }
        : { rows: completedProjects, count: 6 };
    });
    const deps = dependencies({ listProjects });
    for (const method of ["findPublishedCompany", "listServiceAreas"] as const) {
      const value = await deps.repository[method]();
      deps.repository[method] = mock(async () => { await gate; return value; }) as never;
    }
    const service = new DouyinMiniappContentService(deps as never);
    const pending = service.bootstrap(user);
    await Bun.sleep(0);

    expect(deps.repository.findPublishedCompany).toHaveBeenCalledTimes(1);
    expect(deps.repository.listServiceAreas).toHaveBeenCalledTimes(1);
    expect(listProjects.mock.calls).toEqual([
      [{ tenantId: TENANT_ID, page: 1, pageSize: 6 }],
      [{ tenantId: TENANT_ID, phase: "in_progress", page: 1, pageSize: 6 }],
    ]);
    release();
    const result = await pending;
    expect(result).toMatchObject({
      installation: { status: "active", template_version: "1.0.0" },
      company: { name: "示例装饰", logo_url: runtime.brand.logo_url },
      theme: runtime.theme, features: runtime.features,
      content: { home_banners: runtime.home_banners, trust_metrics: runtime.trust_metrics },
    });
    expect(result.content.featured_projects[0]).toMatchObject({
      id: completedProjects[0]!.id, phase: "completed", title: "现代简约实景",
      description: "明亮通透的现代简约空间", budget_band: "20-30万",
      cover_image_url: resolvedCover,
    });
    expect(result.content.featured_cases[0]).toMatchObject({
      id: completedProjects[0]!.id, status: "acceptance", budget_band: "20-30万",
      cover_image_url: resolvedCover,
    });
    expect(result.content.active_sites[0]).toMatchObject({
      id: PROJECT_ID, status: "constructing",
      cover_image_url: "https://cdn.example.com/public-0.jpg",
    });
    expect(result.content.featured_projects).toHaveLength(6);
    expect(result.content.active_sites).toHaveLength(1);
    expect(result.content.active_sites[0]!.public_images).toHaveLength(9);
    expect(parseBootstrap(result)).not.toBeNull();
    expect(deps.repository.listCases).not.toHaveBeenCalled();
    expect(deps.repository.listSites).not.toHaveBeenCalled();
    expect(deps.repository.listProjectImageLogs).not.toHaveBeenCalled();
    expect(deps.prepareImageUrls).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(
      /260000|张先生|1号楼101室|customer|signed_amount|latitude|longitude/i,
    );
  });

  test("keeps the new project images while bounding legacy bootstrap media", async () => {
    const profileImages = Array.from(
      { length: 12 },
      (_, index) => `https://cdn.example.com/compat-${index}.jpg`,
    );
    const publicProject = {
      ...project,
      public_profile: { ...project.public_profile, public_image_urls: profileImages },
    };
    const deps = dependencies({
      listProjects: mock(async () => ({ rows: [publicProject, publicProject], count: 2 })),
    });

    const result = await new DouyinMiniappContentService(deps as never).bootstrap(user);

    expect(result.content.featured_projects[0]!.public_images).toHaveLength(12);
    expect(result.content.featured_projects).toHaveLength(1);
    expect(parseBootstrap(result)).not.toBeNull();
    expect(result.content.featured_cases[0]).toMatchObject({ status: "constructing" });
    expect(result.content.featured_cases).toHaveLength(1);
    expect(result.content.featured_cases[0]!.public_images).toHaveLength(9);
    expect(result.content.active_sites[0]).toMatchObject({ status: "constructing" });
    expect(result.content.active_sites).toHaveLength(1);
    expect(result.content.active_sites[0]!.public_images).toHaveLength(9);
  });

  test("maps unified list and detail DTOs only from public profile fields", async () => {
    const deps = dependencies();
    const service = new DouyinMiniappContentService(deps as never);

    const list = await service.listProjects(user, {
      page: 2, pageSize: 20, phase: "in_progress", style: "现代", layout: "三室两厅",
    });
    const detail = await service.getProject(user, PROJECT_ID);
    const expected = {
      id: PROJECT_ID,
      title: "现代简约实景",
      phase: "in_progress" as const,
      cover_image_url: resolvedCover,
      public_images: [resolvedCover],
      style_tags: ["现代", "简约"],
      layout: "三室两厅",
      area: 120,
      budget_band: "20-30万",
      community: "示例花园",
      city: "郑州市",
      district: "金水区",
      start_date: "2026-07-01",
      updated_at: "2026-07-20T00:00:00.000Z",
      description: "明亮通透的现代简约空间",
    };

    expect(list).toEqual({ items: [expected], pagination: {
      page: 2, pageSize: 20, total: 1, totalPages: 1,
    } });
    expect(detail).toEqual(expected);
    expect(deps.repository.listProjects).toHaveBeenCalledWith({
      tenantId: TENANT_ID, page: 2, pageSize: 20,
      phase: "in_progress", style: "现代", layout: "三室两厅",
    });
    expect(deps.repository.findProject).toHaveBeenCalledWith({
      tenantId: TENANT_ID, id: PROJECT_ID,
    });
    expect(deps.repository.listProjectImageLogs).not.toHaveBeenCalled();
    expect(JSON.stringify({ list, detail })).not.toMatch(/张先生|1号楼101室|260000/);
  });

  test("hides detail and logs when a project has no public phase", async () => {
    const hidden = dependencies({
      findProject: mock(async () => ({ ...project, status: "pending_start" })),
    });
    const service = new DouyinMiniappContentService(hidden as never);

    await expect(service.getProject(user, PROJECT_ID)).rejects.toMatchObject({
      code: "DOUYIN_PROJECT_NOT_FOUND", statusCode: 404,
    });
    await expect(service.listProjectLogs(user, PROJECT_ID, {
      page: 1, pageSize: 20,
    })).rejects.toMatchObject({ code: "DOUYIN_PROJECT_NOT_FOUND", statusCode: 404 });
    expect(hidden.repository.listSiteLogs).not.toHaveBeenCalled();
  });

  test("only lists paginated logs for a public in-progress project", async () => {
    const deps = dependencies();
    const result = await new DouyinMiniappContentService(deps as never).listProjectLogs(
      user, PROJECT_ID, { page: 2, pageSize: 20 },
    );

    expect(deps.repository.findProject).toHaveBeenCalledWith({
      tenantId: TENANT_ID, id: PROJECT_ID,
    });
    expect(deps.repository.listSiteLogs).toHaveBeenCalledWith({
      tenantId: TENANT_ID, projectId: PROJECT_ID, page: 2, pageSize: 20,
    });
    expect(result.pagination).toEqual({ page: 2, pageSize: 20, total: 1, totalPages: 1 });

    const completed = dependencies({
      findProject: mock(async () => ({ ...project, status: "acceptance" })),
    });
    await expect(new DouyinMiniappContentService(completed as never).listProjectLogs(
      user, PROJECT_ID, { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({ code: "DOUYIN_PROJECT_NOT_FOUND", statusCode: 404 });
    expect(completed.repository.listSiteLogs).not.toHaveBeenCalled();
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
    expect(cases).toMatchObject({ items: [{ cover_image_url: resolvedCover,
      public_images: [resolvedCover], description: null }],
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

  test("returns the stable tenant unavailable error after a signed-in tenant is suspended", async () => {
    const suspended = dependencies({ findActiveInstallation: mock(async () => ({
      ...installation, tenant: { id: TENANT_ID, status: "suspended" },
    })) });

    await expect(new DouyinMiniappContentService(suspended as never).bootstrap(user))
      .rejects.toMatchObject({ code: "TENANT_NOT_AVAILABLE", statusCode: 403 });
    expect(suspended.repository.findPublishedCompany).not.toHaveBeenCalled();
    expect(suspended.repository.listCases).not.toHaveBeenCalled();
    expect(suspended.repository.listSites).not.toHaveBeenCalled();
  });

  test("does not query or expose case and site content when runtime features are disabled", async () => {
    const disabled = dependencies({
      findActiveInstallation: mock(async () => ({
        ...installation,
        runtime_config: {
          ...runtime,
          features: { ...runtime.features, cases: false, sites: false },
        },
      })),
    });
    const service = new DouyinMiniappContentService(disabled as never);

    const bootstrap = await service.bootstrap(user);
    expect(bootstrap.content).toMatchObject({ featured_cases: [], active_sites: [] });
    expect(disabled.repository.listCases).not.toHaveBeenCalled();
    expect(disabled.repository.listSites).not.toHaveBeenCalled();

    await expect(service.listCases(user, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ statusCode: 404, code: "DOUYIN_CONTENT_FEATURE_DISABLED" });
    await expect(service.getCase(user, PROJECT_ID))
      .rejects.toMatchObject({ statusCode: 404, code: "DOUYIN_CONTENT_FEATURE_DISABLED" });
    await expect(service.listSites(user, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ statusCode: 404, code: "DOUYIN_CONTENT_FEATURE_DISABLED" });
    await expect(service.getSite(user, PROJECT_ID))
      .rejects.toMatchObject({ statusCode: 404, code: "DOUYIN_CONTENT_FEATURE_DISABLED" });
    await expect(service.listSiteLogs(user, PROJECT_ID, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ statusCode: 404, code: "DOUYIN_CONTENT_FEATURE_DISABLED" });
    expect(disabled.repository.listCases).not.toHaveBeenCalled();
    expect(disabled.repository.findCase).not.toHaveBeenCalled();
    expect(disabled.repository.listSites).not.toHaveBeenCalled();
    expect(disabled.repository.findSite).not.toHaveBeenCalled();
    expect(disabled.repository.listSiteLogs).not.toHaveBeenCalled();
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
    expect(result.items[0]!.images[0]).toBe(resolvedCover);
    expect(result.items[0]!.images.every((url) => url.startsWith("https://"))).toBe(true);
    expect(result.items[0]!.images.join(",")).not.toContain("broken-legacy-image");
    expect(JSON.stringify(result)).not.toMatch(/content|employee|customer|address/i);
  });

  test("never exposes an internal project name as a public site title", async () => {
    const privateName = "张先生 1号楼101室装修";
    const privateSite = { ...project, name: privateName };
    const deps = dependencies({
      listSites: mock(async () => ({ rows: [privateSite], total: 1 })),
      findSite: mock(async () => privateSite),
    });
    const service = new DouyinMiniappContentService(deps as never);

    const bootstrap = await service.bootstrap(user);
    const list = await service.listSites(user, { page: 1, pageSize: 20 });
    const detail = await service.getSite(user, PROJECT_ID);

    expect(bootstrap.content.active_sites[0]!.title).toBe("示例花园");
    expect(list.items[0]!.title).toBe("示例花园");
    expect(detail.title).toBe("示例花园");
    expect(JSON.stringify({ bootstrap, list, detail })).not.toContain(privateName);
  });
});
