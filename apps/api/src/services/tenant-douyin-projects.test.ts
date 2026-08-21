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
  `tenants/${tenantId}/project-log/projects/${projectId}/2026/08/21/33333333-3333-4333-8333-${suffix.padStart(12, "0")}.jpg`;
const HTTPS_IMAGE = "https://cdn.example.test/attached.jpg";
const body = {
  public_title: "现代简约实景",
  public_description: "这是一段用于公开展示的项目说明，介绍空间规划和施工亮点。",
  public_image_urls: [imageKey(), imageKey(TENANT_ID, PROJECT_ID, "2"), HTTPS_IMAGE],
  style_tags: ["现代", "简约"],
  budget_band: "20-30 万",
  publication_status: "published" as const,
};

function authContext(
  permissions = ["douyin_miniapp.manage"],
  tenantId: string | null = TENANT_ID,
): AuthContext {
  return {
    authUserId: "44444444-4444-4444-8444-444444444444",
    employeeId: "55555555-5555-4555-8555-555555555555",
    tenantId,
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
    publishProfileAtomic: mock(async (input: Record<string, unknown>) => ({
      ok: true as const,
      data: {
        id: "66666666-6666-4666-8666-666666666666",
        ...input.profile as Record<string, unknown>,
        tenant_id: input.tenantId,
        project_id: input.projectId,
        created_at: "2026-08-21T00:30:00.000Z",
        updated_at: "2026-08-21T01:00:00.000Z",
      },
    })),
    upsertProfile: mock(async () => { throw new TypeError("legacy write called"); }),
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

  });

  test("writes once through the atomic command and never calls legacy read/write paths", async () => {
    const context = fixture();

    const result = await context.service.updatePublication(
      authContext(),
      PROJECT_ID,
      body,
    );

    expect(context.repository.publishProfileAtomic).toHaveBeenCalledTimes(1);
    expect(context.repository.publishProfileAtomic).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      projectId: PROJECT_ID,
      profile: body,
    });
    expect(context.repository.findProject).not.toHaveBeenCalled();
    expect(context.repository.listAttachedImageRows).not.toHaveBeenCalled();
    expect(context.repository.upsertProfile).not.toHaveBeenCalled();
    expect(result.public_image_urls).toEqual(body.public_image_urls);
    expect(result.public_image_urls[0]).not.toContain("q-signature");
  });

  test("maps only known coherent RPC errors to stable business errors", async () => {
    const knownErrors = [
      [400, "DOUYIN_PROJECT_PUBLICATION_INVALID"],
      [404, "DOUYIN_PROJECT_NOT_FOUND"],
      [400, "DOUYIN_PROJECT_IMAGE_REFERENCE_SCOPE_MISMATCH"],
      [400, "DOUYIN_PROJECT_IMAGE_NOT_ATTACHED"],
      [400, "DOUYIN_PROJECT_PUBLICATION_IMAGES_REQUIRED"],
    ] as const;
    for (const [statusCode, code] of knownErrors) {
      const context = fixture({
        publishProfileAtomic: mock(async () => ({
          ok: false as const,
          error: { status_code: statusCode, code, message: "RPC 拒绝" },
        })),
      });
      await expect(context.service.updatePublication(authContext(), PROJECT_ID, body))
        .rejects.toMatchObject({ statusCode, code, message: "RPC 拒绝" });
    }

    const incoherent = fixture({
      publishProfileAtomic: mock(async () => ({
        ok: false as const,
        error: {
          status_code: 404,
          code: "DOUYIN_PROJECT_IMAGE_NOT_ATTACHED",
          message: "wrong pair",
        },
      })),
    });
    await expect(incoherent.service.updatePublication(authContext(), PROJECT_ID, body))
      .rejects.toMatchObject({
        statusCode: 500,
        code: "DOUYIN_TENANT_PROJECTS_RESPONSE_INVALID",
      });
  });

  test("rejects saved profiles outside the authenticated tenant/project scope", async () => {
    for (const scope of [
      { tenant_id: OTHER_TENANT_ID, project_id: PROJECT_ID },
      { tenant_id: TENANT_ID, project_id: OTHER_PROJECT_ID },
    ]) {
      const context = fixture({
        publishProfileAtomic: mock(async () => ({
          ok: true as const,
          data: {
            ...body,
            id: "66666666-6666-4666-8666-666666666666",
            ...scope,
            created_at: "2026-08-21T00:30:00.000Z",
            updated_at: "2026-08-21T01:00:00.000Z",
          },
        })),
      });
      await expect(context.service.updatePublication(authContext(), PROJECT_ID, body))
        .rejects.toMatchObject({
          statusCode: 500,
          code: "DOUYIN_TENANT_PROJECTS_RESPONSE_INVALID",
        });
    }
  });

  test("rejects signed HTTPS references before the atomic command", async () => {
    for (const reference of [
      `${HTTPS_IMAGE}?q-signature=expires-soon`,
      `${HTTPS_IMAGE}#preview`,
    ]) {
      const context = fixture();
      await expect(context.service.updatePublication(authContext(), PROJECT_ID, {
        ...body,
        publication_status: "draft",
        public_image_urls: [reference],
      })).rejects.toMatchObject({ statusCode: 400 });
      expect(context.repository.publishProfileAtomic).not.toHaveBeenCalled();
    }
  });

  test("returns a stable paginated image picker without exposing previews as refs", async () => {
    const keys = Array.from(
      { length: 25 },
      (_, index) => imageKey(TENANT_ID, PROJECT_ID, String(index + 1)),
    );
    const crossProject = imageKey(TENANT_ID, OTHER_PROJECT_ID);
    const context = fixture({
      listAttachedImageRows: mock(async () => [
        { images: [
          keys[0],
          HTTPS_IMAGE,
          `${HTTPS_IMAGE}?q-signature=expires-soon`,
          "project-log/legacy.jpg",
          crossProject,
        ] },
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

  test("bounds candidates to first 30 per log and 300 unique refs with stable pages", async () => {
    const rows = Array.from({ length: 11 }, (_, rowIndex) => ({
      images: Array.from({ length: 31 }, (_, imageIndex) =>
        imageKey(
          TENANT_ID,
          PROJECT_ID,
          String(rowIndex * 31 + imageIndex + 1),
        )),
    }));
    const context = fixture({ listAttachedImageRows: mock(async () => rows) });
    const result = await context.service.listAttachedImages(
      authContext(),
      PROJECT_ID,
      { page: 3, pageSize: 100 },
    );

    expect(result.pagination).toEqual({
      page: 3,
      pageSize: 100,
      total: 300,
      totalPages: 3,
    });
    expect(result.items).toHaveLength(100);
    expect(result.items[0]?.reference).toBe(imageKey(
      TENANT_ID,
      PROJECT_ID,
      String(6 * 31 + 21),
    ));
    expect(result.items.at(-1)?.reference).toBe(imageKey(
      TENANT_ID,
      PROJECT_ID,
      String(9 * 31 + 30),
    ));
    for (let rowIndex = 0; rowIndex < 10; rowIndex += 1) {
      expect(result.items.some((item) => item.reference === imageKey(
        TENANT_ID,
        PROJECT_ID,
        String(rowIndex * 31 + 31),
      ))).toBe(false);
    }
    expect(context.repository.listAttachedImageRows).toHaveBeenCalledTimes(1);
  });

  test("requires tenant and manage permission for every operation", async () => {
    const operations = [
      (service: InstanceType<typeof Service>, context: AuthContext) =>
        service.list(context, { page: 1, pageSize: 20 }),
      (service: InstanceType<typeof Service>, context: AuthContext) =>
        service.updatePublication(context, PROJECT_ID, body),
      (service: InstanceType<typeof Service>, context: AuthContext) =>
        service.listAttachedImages(context, PROJECT_ID, { page: 1, pageSize: 20 }),
    ];

    for (const operation of operations) {
      const missingTenant = fixture();
      await expect(operation(missingTenant.service, authContext(undefined, null)))
        .rejects.toThrow("missing tenant");
      expect(missingTenant.repository.listProjects).not.toHaveBeenCalled();
      expect(missingTenant.repository.publishProfileAtomic).not.toHaveBeenCalled();
      expect(missingTenant.repository.findProject).not.toHaveBeenCalled();

      const missingManage = fixture();
      await expect(operation(missingManage.service, authContext([])))
        .rejects.toThrow("missing permission");
      expect(missingManage.repository.listProjects).not.toHaveBeenCalled();
      expect(missingManage.repository.publishProfileAtomic).not.toHaveBeenCalled();
      expect(missingManage.repository.findProject).not.toHaveBeenCalled();
    }
  });
});
