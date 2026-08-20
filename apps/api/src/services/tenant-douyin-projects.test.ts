import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service: typeof import("./tenant-douyin-projects").TenantDouyinProjectsService;

beforeAll(async () => {
  ({ TenantDouyinProjectsService: Service } = await import(
    "./tenant-douyin-projects"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const imageKey = (tenantId = TENANT_ID, projectId = PROJECT_ID, suffix = "1") =>
  `tenants/${tenantId}/project-log/projects/${projectId}/2026/08/21/33333333-3333-4333-8333-${suffix.padStart(12, "3")}.jpg`;
const HTTPS_IMAGE = "https://cdn.example.test/attached.jpg";
const body = {
  public_title: "现代简约实景",
  public_description: "这是一段用于公开展示的项目说明，介绍空间规划和施工亮点。",
  public_image_urls: [imageKey(), imageKey(TENANT_ID, PROJECT_ID, "2"), HTTPS_IMAGE],
  style_tags: ["现代", "简约"],
  budget_band: "20-30 万",
  publication_status: "published" as const,
};

function authContext(permissions = ["douyin_miniapp.manage"]): AuthContext {
  return {
    authUserId: "44444444-4444-4444-8444-444444444444",
    employeeId: "55555555-5555-4555-8555-555555555555",
    tenantId: TENANT_ID,
    permissions: permissions.map((code) => ({ code, scope: "all" })),
  } as AuthContext;
}

function fixture(
  overrides: Record<string, unknown> = {},
  dependencyOverrides: Record<string, unknown> = {},
) {
  const repository = {
    listProjects: mock(async () => ({ rows: [{
      id: PROJECT_ID,
      name: "内部项目名称",
      status: "constructing",
      updated_at: "2026-08-21T00:00:00.000Z",
      property: { community: "示例花园", layout: "三室两厅", area: 120 },
      public_profile: null,
    }], total: 1 })),
    findProject: mock(async () => ({ id: PROJECT_ID, tenant_id: TENANT_ID })),
    listAttachedImageRows: mock(async () => [{ images: [
      imageKey(),
      imageKey(TENANT_ID, PROJECT_ID, "2"),
      HTTPS_IMAGE,
      ...Array.from({ length: 40 }, (_, index) => `ignored-${index}`),
    ] }]),
    upsertProfile: mock(async (input: Record<string, unknown>) => ({
      id: "66666666-6666-4666-8666-666666666666",
      ...input.profile as Record<string, unknown>,
      tenant_id: input.tenantId,
      project_id: input.projectId,
      updated_at: "2026-08-21T01:00:00.000Z",
    })),
    ...overrides,
  };
  const accessPolicy = {
    assertTenantContext: mock((context: AuthContext) => {
      if (!context.tenantId) throw new TypeError("missing tenant");
      return context.tenantId;
    }),
    assertPermission: mock((context: AuthContext, permission: string) => {
      if (!context.permissions.some((item) => item.code === permission)) {
        throw new TypeError("missing permission");
      }
      return "all";
    }),
  };
  const prepareImageUrls = mock(async () => {});
  const resolveImageReference = mock((reference: string) =>
    reference.startsWith("https://")
      ? reference
      : `https://assets.example.test/${reference}`);
  const service = new Service({
    repository: repository as never,
    accessPolicy: accessPolicy as never,
    prepareImageUrls,
    resolveImageReference,
    ...dependencyOverrides,
  } as never);
  return {
    service,
    repository,
    accessPolicy,
    prepareImageUrls,
    resolveImageReference,
  };
}

describe("TenantDouyinProjectsService", () => {
  test("lists a tenant-bound page and requires douyin_miniapp.manage", async () => {
    const context = fixture();
    const result = await context.service.list(authContext(), {
      page: 1,
      pageSize: 20,
      publicationStatus: "published",
    });

    expect(context.accessPolicy.assertPermission).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
      "douyin_miniapp.manage",
    );
    expect(context.repository.listProjects).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
      publicationStatus: "published",
    });
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    const forbidden = fixture();
    await expect(forbidden.service.list(authContext([]), {
      page: 1,
      pageSize: 20,
    })).rejects.toThrow("missing permission");
    expect(forbidden.repository.listProjects).not.toHaveBeenCalled();
  });

  test("writes only server-owned tenant/project identifiers and stable refs", async () => {
    const context = fixture();

    const result = await context.service.updatePublication(
      authContext(),
      PROJECT_ID,
      body,
    );

    expect(context.repository.findProject).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
    });
    expect(context.repository.listAttachedImageRows).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      limit: 100,
    });
    expect(context.repository.listAttachedImageRows).toHaveBeenCalledTimes(1);
    expect(context.repository.upsertProfile).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      profile: body,
    });
    expect(result.public_image_urls).toEqual(body.public_image_urls);
    expect(result.public_image_urls[0]).not.toContain("q-signature");
  });

  test("rejects projects outside the authenticated tenant", async () => {
    const context = fixture({ findProject: mock(async () => null) });
    await expect(context.service.updatePublication(
      authContext(), PROJECT_ID, body,
    )).rejects.toMatchObject({
      statusCode: 404,
      code: "DOUYIN_PROJECT_NOT_FOUND",
    });
    expect(context.repository.listAttachedImageRows).not.toHaveBeenCalled();
    expect(context.repository.upsertProfile).not.toHaveBeenCalled();

    const mismatched = fixture({
      findProject: mock(async () => ({
        id: PROJECT_ID,
        tenant_id: OTHER_TENANT_ID,
      })),
    });
    await expect(mismatched.service.updatePublication(
      authContext(), PROJECT_ID, body,
    )).rejects.toMatchObject({ code: "DOUYIN_PROJECT_NOT_FOUND" });
    expect(mismatched.repository.upsertProfile).not.toHaveBeenCalled();
  });

  test("rejects cross-tenant and cross-project canonical references", async () => {
    for (const reference of [
      imageKey(OTHER_TENANT_ID, PROJECT_ID),
      imageKey(TENANT_ID, OTHER_PROJECT_ID),
    ]) {
      const context = fixture();
      await expect(context.service.updatePublication(authContext(), PROJECT_ID, {
        ...body,
        publication_status: "draft",
        public_image_urls: [reference],
      })).rejects.toMatchObject({
        statusCode: 400,
        code: "DOUYIN_PROJECT_IMAGE_REFERENCE_SCOPE_MISMATCH",
      });
      expect(context.repository.upsertProfile).not.toHaveBeenCalled();
    }
  });

  test("rejects selected refs not exactly attached to a bounded project log set", async () => {
    const signedPreview = `${HTTPS_IMAGE}?q-signature=expires-soon`;
    const context = fixture();
    await expect(context.service.updatePublication(authContext(), PROJECT_ID, {
      ...body,
      publication_status: "draft",
      public_image_urls: [signedPreview],
    })).rejects.toMatchObject({
      statusCode: 400,
      code: "DOUYIN_PROJECT_IMAGE_NOT_ATTACHED",
    });
    expect(context.repository.upsertProfile).not.toHaveBeenCalled();
  });

  test("returns a stable paginated image picker without exposing previews as refs", async () => {
    const keys = Array.from(
      { length: 25 },
      (_, index) => imageKey(TENANT_ID, PROJECT_ID, String(index + 1)),
    );
    const crossProject = imageKey(TENANT_ID, OTHER_PROJECT_ID);
    const context = fixture({
      listAttachedImageRows: mock(async () => [
        { images: [keys[0], HTTPS_IMAGE, "project-log/legacy.jpg", crossProject] },
        { images: [...keys.slice(1), keys[0], "http://unsafe.test/image.jpg"] },
      ]),
    });

    const result = await context.service.listAttachedImages(
      authContext(),
      PROJECT_ID,
      { page: 2, pageSize: 20 },
    );

    expect(context.repository.findProject).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
    });
    expect(context.repository.listAttachedImageRows).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      limit: 100,
    });
    expect(context.repository.listAttachedImageRows).toHaveBeenCalledTimes(1);
    expect(context.prepareImageUrls).toHaveBeenCalledTimes(1);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 26,
      totalPages: 2,
    });
    expect(result.items).toHaveLength(6);
    expect(result.items.at(-1)).toEqual({
      reference: keys[24]!,
      preview_url: `https://assets.example.test/${keys[24]!}`,
    });
    expect(result.items.some((item) => item.reference.includes("q-signature")))
      .toBe(false);
    expect(result.items.some((item) => item.reference === crossProject)).toBe(false);
  });

  test("requires tenant ownership before reading image candidates", async () => {
    const context = fixture({ findProject: mock(async () => null) });
    await expect(context.service.listAttachedImages(
      authContext(), PROJECT_ID, { page: 1, pageSize: 20 },
    )).rejects.toMatchObject({ code: "DOUYIN_PROJECT_NOT_FOUND" });
    expect(context.repository.listAttachedImageRows).not.toHaveBeenCalled();
    expect(context.prepareImageUrls).not.toHaveBeenCalled();
  });
});
