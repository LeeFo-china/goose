import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PlatformProductRecord } from "@/repositories/platform-service-order-records";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const employeeId = "00000000-0000-4000-8000-000000000001";
const productId = "00000000-0000-4000-8000-000000000101";
const versionId = "00000000-0000-4000-8000-000000000201";

const platformAuth = {
  authUserId: "auth-platform",
  employeeId,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.service_product.manage", scope: "all" }],
} satisfies AuthContext;

function makeProduct(
  overrides: Partial<PlatformProductRecord> = {},
): PlatformProductRecord {
  return {
    id: productId,
    code: "platform_service_1y",
    title: "平台部署及年度技术服务（1年）",
    term_years: 1,
    list_amount_fen: 980000,
    amount_fen: 980000,
    service_scope: ["客户专属系统环境部署"],
    terms_version: 1,
    terms_content: "服务条款",
    status: "enabled",
    version: 1,
    published_version_id: versionId,
    sort_order: 10,
    created_at: "2026-08-03T10:00:00.000Z",
    updated_at: "2026-08-03T10:00:00.000Z",
    published_version: {
      id: versionId,
      version: 1,
      title: "平台部署及年度技术服务（1年）",
      term_years: 1,
      list_amount_fen: 980000,
      amount_fen: 980000,
      service_scope: ["客户专属系统环境部署"],
      terms_version: 1,
      terms_content: "服务条款",
    },
    ...overrides,
  };
}

function createRepository() {
  return {
    listPlatformProducts: mock(async (_input: unknown) => ({
      list: [makeProduct()],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    })),
    createProductDraft: mock(async (_input: unknown) =>
      makeProduct({
        published_version_id: null,
        published_version: null,
        status: "draft",
      })
    ),
    updateProductDraft: mock(async (_input: unknown) =>
      makeProduct({
        amount_fen: 880000,
        published_version: {
          id: versionId,
          version: 1,
          title: "平台部署及年度技术服务（1年）",
          term_years: 1,
          list_amount_fen: 980000,
          amount_fen: 980000,
          service_scope: ["客户专属系统环境部署"],
          terms_version: 1,
          terms_content: "服务条款",
        },
      })
    ),
    findPlatformProductById: mock(async (_productId: string) => makeProduct()),
    publishProductVersion: mock(async (_input: unknown) => ({
      id: "00000000-0000-4000-8000-000000000202",
      version: 2,
      title: "平台部署及年度技术服务（1年）",
      term_years: 1,
      list_amount_fen: 980000,
      amount_fen: 980000,
      service_scope: ["客户专属系统环境部署"],
      terms_version: 1,
      terms_content: "服务条款",
    })),
    archiveProduct: mock(async (_input: unknown) =>
      makeProduct({ status: "archived" })
    ),
  };
}

describe("PlatformServiceProductService", () => {
  let repository: ReturnType<typeof createRepository>;

  beforeEach(() => {
    repository = createRepository();
  });

  test("lists platform products with pagination", async () => {
    const { PlatformServiceProductService } = await import(
      "./platform-service-products"
    );
    const service = new PlatformServiceProductService({ repository });

    const result = await service.listProducts(platformAuth, {
      page: 1,
      pageSize: 20,
    });

    expect(repository.listPlatformProducts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
    expect(result.list.at(0)!.draft.price_rate_basis_points).toBe(10000);
  });

  test("creates and edits a product draft without changing the published price", async () => {
    const { PlatformServiceProductService } = await import(
      "./platform-service-products"
    );
    const service = new PlatformServiceProductService({ repository });

    await service.createProduct(platformAuth, {
      code: "platform_service_custom",
      title: "平台部署及年度技术服务",
      term_years: 1,
      list_amount_fen: 980000,
      amount_fen: 880000,
      service_scope: ["部署"],
      terms_content: "服务条款",
    });
    const updated = await service.updateProduct(platformAuth, productId, {
      amount_fen: 880000,
      expected_version: 1,
    });

    expect(repository.createProductDraft.mock.calls[0]?.[0]).toMatchObject({
      code: "platform_service_custom",
      amountFen: 880000,
      employeeId,
    });
    expect(repository.updateProductDraft.mock.calls[0]?.[0]).toMatchObject({
      productId,
      amountFen: 880000,
      expectedVersion: 1,
      employeeId,
    });
    expect(updated.draft.amount_fen).toBe(880000);
    expect(updated.published?.amount_fen).toBe(980000);
  });

  test("publishes an immutable product version with optimistic locking", async () => {
    const { PlatformServiceProductService } = await import(
      "./platform-service-products"
    );
    const service = new PlatformServiceProductService({ repository });

    const result = await service.publishProduct(platformAuth, productId, {
      expected_version: 1,
      idempotency_key: "00000000-0000-4000-8000-000000000901",
    });

    expect(repository.findPlatformProductById).toHaveBeenCalledWith(productId);
    expect(repository.publishProductVersion.mock.calls[0]?.[0]).toMatchObject({
      productId,
      expectedVersion: 1,
      amountFen: 980000,
      employeeId,
    });
    expect(result.published_version.version).toBe(2);
  });

  test("rejects stale product version updates", async () => {
    repository.findPlatformProductById.mockImplementationOnce(async () =>
      makeProduct({ version: 2 })
    );
    const { PlatformServiceProductService } = await import(
      "./platform-service-products"
    );
    const service = new PlatformServiceProductService({ repository });

    await expect(service.publishProduct(platformAuth, productId, {
      expected_version: 1,
      idempotency_key: "00000000-0000-4000-8000-000000000902",
    })).rejects.toMatchObject({
      code: "SERVICE_PRODUCT_VERSION_CONFLICT",
    });
    expect(repository.publishProductVersion).not.toHaveBeenCalled();
  });
});
