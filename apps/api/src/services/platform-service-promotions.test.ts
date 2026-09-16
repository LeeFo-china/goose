import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { Errors } from "@/errors/error-factory";
import type {
  PlatformServicePromotionCommandResult,
  PlatformServicePromotionListPage,
} from "@/repositories/platform-service-promotion-records";
import type { PlatformServicePromotionRepository } from "@/repositories/platform-service-promotions";
import { PlatformServicePromotionCreateSchema } from "@/schema/platform-service-promotions";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service: typeof import("./platform-service-promotions").PlatformServicePromotionService;

beforeAll(async () => {
  ({ PlatformServicePromotionService: Service } = await import(
    "./platform-service-promotions"
  ));
});

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROMOTION_ID = "33333333-3333-4333-8333-333333333333";
const IDEMPOTENCY_KEY = "44444444-4444-4444-8444-444444444444";
const NOW = "2026-09-16T00:00:00.000Z";
const commandResult: PlatformServicePromotionCommandResult = {
  idempotent: false,
  promotion: {
    id: PROMOTION_ID,
    code: "platform_service_promotion_fixture",
    draft_version_id: null,
    published_version_id: null,
    version: 1,
    archived_at: null,
    created_by_employee_id: EMPLOYEE_ID,
    updated_by_employee_id: EMPLOYEE_ID,
    created_at: NOW,
    updated_at: NOW,
  },
  draft: null,
  published: null,
  price_preview: [],
  server_time: NOW,
};
const listResult: PlatformServicePromotionListPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  server_time: NOW,
};

const allowedContext: AuthContext = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: false,
  isPlatformStaff: true,
  isPlatformSuperAdmin: true,
  employeeName: "平台运营",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_staff"],
  roles: [],
  permissions: [{ code: "platform.service_product.manage", scope: "all" }],
};

function repositoryFixture() {
  const list = mock(async (_input: { page: number; pageSize: number }) => listResult);
  const createDraft = mock(async (
    _input: Parameters<PlatformServicePromotionRepository["createDraft"]>[0],
    _actor: Parameters<PlatformServicePromotionRepository["createDraft"]>[1],
  ) => commandResult);
  const saveDraft = mock(async (
    _id: string,
    _input: Parameters<PlatformServicePromotionRepository["saveDraft"]>[1],
    _actor: Parameters<PlatformServicePromotionRepository["saveDraft"]>[2],
  ) => commandResult);
  const publish = mock(async (
    _input: Parameters<PlatformServicePromotionRepository["publish"]>[0],
  ) => commandResult);
  const stop = mock(async (
    _input: Parameters<PlatformServicePromotionRepository["stop"]>[0],
  ) => commandResult);
  return {
    repository: { list, createDraft, saveDraft, publish, stop },
    list,
    createDraft,
    saveDraft,
    publish,
    stop,
  };
}

function context(overrides: Partial<AuthContext>): AuthContext {
  return { ...allowedContext, ...overrides };
}

const draft = PlatformServicePromotionCreateSchema.parse({});
const update = { ...draft, expected_version: 7 };
const publishInput = {
  expected_version: 8,
  idempotency_key: IDEMPOTENCY_KEY,
  expected_product_versions: (["platform_service_1y", "platform_service_2y", "platform_service_3y"] as const).map(
    (product_code) => ({ product_code, product_version_id: PROMOTION_ID }),
  ),
};
const stopInput = {
  ...publishInput,
  reason: "运营提前结束",
};

describe("PlatformServicePromotionService", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("rejects tenant, missing actor, and missing permission contexts before repository access", async () => {
    const fixture = repositoryFixture();
    const service = new Service({ repository: fixture.repository });
    const invalidContexts = [
      context({ tenantId: "tenant-1" }),
      context({ employeeId: null }),
      context({ authUserId: "" }),
      context({ permissions: [] }),
    ];
    const operations = [
      (auth: AuthContext) => service.listPromotions(auth, {}),
      (auth: AuthContext) => service.createDraft(auth, draft),
      (auth: AuthContext) => service.saveDraft(auth, PROMOTION_ID, update),
      (auth: AuthContext) => service.publish(auth, PROMOTION_ID, publishInput),
      (auth: AuthContext) => service.stop(auth, PROMOTION_ID, stopInput),
    ];

    for (const [index, operation] of operations.entries()) {
      await expect(operation(invalidContexts[index % invalidContexts.length]!))
        .rejects.toMatchObject({ statusCode: 403 });
    }
    expect(fixture.list).not.toHaveBeenCalled();
    expect(fixture.createDraft).not.toHaveBeenCalled();
    expect(fixture.saveDraft).not.toHaveBeenCalled();
    expect(fixture.publish).not.toHaveBeenCalled();
    expect(fixture.stop).not.toHaveBeenCalled();
  });

  test("rejects a context without any platform identity flag", async () => {
    const fixture = repositoryFixture();
    const service = new Service({ repository: fixture.repository });
    const nonPlatformContext = context({
      isPlatformStaff: false,
      isPlatformAdmin: false,
      isPlatformSuperAdmin: false,
    });

    await expect(service.listPromotions(nonPlatformContext, {}))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(fixture.list).not.toHaveBeenCalled();
  });

  test("rejects staff and admin without an explicit superadmin flag for every operation", async () => {
    const fixture = repositoryFixture();
    const service = new Service({ repository: fixture.repository });
    for (const auth of [
      context({ isPlatformSuperAdmin: false, isPlatformStaff: true }),
      context({ isPlatformSuperAdmin: false, isPlatformAdmin: true }),
      context({ isPlatformSuperAdmin: undefined, isPlatformAdmin: true }),
    ]) {
      for (const operation of [
        () => service.listPromotions(auth),
        () => service.createDraft(auth, draft),
        () => service.saveDraft(auth, PROMOTION_ID, update),
        () => service.publish(auth, PROMOTION_ID, publishInput),
        () => service.stop(auth, PROMOTION_ID, stopInput),
      ]) await expect(operation()).rejects.toMatchObject({ statusCode: 403 });
    }
    for (const method of Object.values(fixture.repository)) expect(method).not.toHaveBeenCalled();
  });

  test("maps the actual database actor rejection to a safe 403", async () => {
    const fixture = repositoryFixture();
    fixture.publish.mockImplementation(async () => {
      throw Errors.dbError("发布失败", { code: "P0001", message: "PLATFORM_SUPER_ADMIN_REQUIRED" });
    });
    await expect(new Service({ repository: fixture.repository }).publish(allowedContext, PROMOTION_ID, publishInput))
      .rejects.toMatchObject({ statusCode: 403, code: "PLATFORM_SUPER_ADMIN_REQUIRED", message: "当前操作仅平台超管可执行" });
  });

  test("normalizes pagination defensively and delegates for an authorized operator", async () => {
    const fixture = repositoryFixture();
    const service = new Service({ repository: fixture.repository });

    await service.listPromotions(allowedContext, { page: Number.NaN, pageSize: 999 });
    await service.listPromotions(allowedContext, { page: -2, pageSize: 0 });

    expect(fixture.list).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 });
    expect(fixture.list).toHaveBeenNthCalledWith(2, { page: 1, pageSize: 20 });
  });

  test("creates an internal UUID code and passes schema defaults with the exact actor", async () => {
    const fixture = repositoryFixture();
    const service = new Service({ repository: fixture.repository });

    await expect(service.createDraft(allowedContext, draft)).resolves.toBe(commandResult);

    expect(fixture.createDraft).toHaveBeenCalledTimes(1);
    const [input, actor] = fixture.createDraft.mock.calls[0]!;
    expect(input.draft).toEqual({
      name: "平台技术服务限时优惠",
      badge_text: "限时 2 折",
      title: "平台技术服务限时优惠",
      summary: "1 年、2 年、3 年套餐同步限时优惠",
      rules_text: "",
      discount_rate_basis_points: 2000,
      starts_at: null,
      ends_at: null,
    });
    expect(input.code).toMatch(
      /^platform_service_promotion_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(actor).toEqual({ employeeId: EMPLOYEE_ID, authUserId: USER_ID });
    expect(PlatformServicePromotionCreateSchema.safeParse({ code: "client-code" }).success)
      .toBe(false);
  });

  test("passes save, publish, and stop optimistic command fields exactly", async () => {
    const fixture = repositoryFixture();
    const service = new Service({ repository: fixture.repository });

    await service.saveDraft(allowedContext, PROMOTION_ID, update);
    await service.publish(allowedContext, PROMOTION_ID, publishInput);
    await service.stop(allowedContext, PROMOTION_ID, stopInput);

    expect(fixture.saveDraft).toHaveBeenCalledWith(PROMOTION_ID, update, {
      employeeId: EMPLOYEE_ID,
      authUserId: USER_ID,
    });
    expect(fixture.publish).toHaveBeenCalledWith({
      promotionId: PROMOTION_ID,
      expectedVersion: 8,
      idempotencyKey: IDEMPOTENCY_KEY,
      expectedProductVersions: publishInput.expected_product_versions,
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: USER_ID,
    });
    expect(fixture.stop).toHaveBeenCalledWith({
      promotionId: PROMOTION_ID,
      expectedVersion: 8,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "运营提前结束",
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: USER_ID,
    });
  });

  test("maps every stable promotion database code to the public business error", async () => {
    const mappings = [
      ["SERVICE_PROMOTION_NOT_FOUND", 404, "限时活动不存在"],
      ["SERVICE_PROMOTION_VERSION_CONFLICT", 409, "限时活动已被更新，请刷新后重试"],
      ["SERVICE_PROMOTION_PRODUCT_VERSION_CONFLICT", 409, "套餐价格已更新，请重新确认活动价格"],
      ["SERVICE_PROMOTION_TIME_INVALID", 422, "活动时间无效"],
      ["SERVICE_PROMOTION_OVERLAP", 409, "活动时间与已发布活动重叠"],
      ["SERVICE_PROMOTION_PRICE_NOT_LOWER", 422, "活动价必须低于三档套餐的日常价"],
      ["SERVICE_PROMOTION_PRODUCT_UNAVAILABLE", 409, "三档正式套餐尚未全部发布"],
      ["SERVICE_PROMOTION_INVALID_STATE", 409, "当前活动状态不允许执行此操作"],
    ] as const;

    for (const [code, statusCode, message] of mappings) {
      const fixture = repositoryFixture();
      fixture.publish.mockImplementation(async () => {
        throw Errors.dbError("发布平台技术服务限时活动失败", {
          code: "P0001",
          message: code,
        });
      });
      const service = new Service({ repository: fixture.repository });

      await expect(service.publish(allowedContext, PROMOTION_ID, publishInput))
        .rejects.toMatchObject({ statusCode, code, message });
    }
  });

  test("rethrows an unknown repository error without replacing its safe wrapper", async () => {
    const fixture = repositoryFixture();
    const repositoryError = Errors.dbError(
      "发布平台技术服务限时活动失败",
      { code: "XX999", message: "private sql detail" },
    );
    fixture.publish.mockImplementation(async () => {
      throw repositoryError;
    });
    const service = new Service({ repository: fixture.repository });

    try {
      await service.publish(allowedContext, PROMOTION_ID, publishInput);
      throw new TypeError("expected rejection");
    } catch (error) {
      expect(error).toBe(repositoryError);
    }
  });
});
