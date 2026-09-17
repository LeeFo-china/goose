import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import(
  "./platform-service-promotions"
).PlatformServicePromotionRepository;
let schemas: typeof import("../schema/platform-service-promotions");

beforeAll(async () => {
  ({ PlatformServicePromotionRepository: Repository } = await import(
    "./platform-service-promotions"
  ));
  schemas = await import("../schema/platform-service-promotions");
});

const PROMOTION_ID = "11111111-1111-4111-8111-111111111111";
const DRAFT_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const IDEMPOTENCY_KEY = "66666666-6666-4666-8666-666666666666";
const expectedProductVersions = (["platform_service_1y", "platform_service_2y", "platform_service_3y"] as const).map(
  (product_code) => ({ product_code, product_version_id: DRAFT_ID }),
);
const NOW = "2026-09-16T15:00:00.000Z";

const draft = {
  name: "国庆限时优惠",
  badge_text: "限时 2 折",
  title: "平台技术服务限时优惠",
  summary: "1 年、2 年、3 年套餐同步限时优惠",
  rules_text: "仅限活动期内创建的新订单",
  discount_rate_basis_points: 2000,
  starts_at: "2026-10-01T00:00:00.000Z",
  ends_at: "2026-10-08T00:00:00.000Z",
};
const promotion = {
  id: PROMOTION_ID,
  code: "platform_service_promotion_2026_national_day",
  draft_version_id: DRAFT_ID,
  published_version_id: null,
  version: 1,
  archived_at: null,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW,
  updated_at: NOW,
};
const draftVersion = {
  id: DRAFT_ID,
  promotion_id: PROMOTION_ID,
  version_no: 1,
  publication_status: "draft" as const,
  ...draft,
  published_at: null,
  published_by_employee_id: null,
  stopped_at: null,
  stopped_by_employee_id: null,
  stop_reason: null,
  created_at: NOW,
};
const pricePreview = [{
  product_id: PRODUCT_ID,
  product_version_id: DRAFT_ID,
  code: "platform_service_1y",
  title: "平台技术服务 1 年",
  term_years: 1,
  list_amount_fen: 1_200_000,
  base_amount_fen: 980_000,
  effective_amount_fen: 196_000,
  base_price_rate_basis_points: 10_000,
  price_rate_basis_points: 2_000,
}];
const commandResult = {
  idempotent: false,
  promotion,
  draft: draftVersion,
  published: null,
  price_preview: pricePreview,
  server_time: NOW,
};

type RpcResult = { readonly data: unknown; readonly error: unknown };

function createClient(result: RpcResult = { data: commandResult, error: null }) {
  const rpc = mock(async (_name: string, _params: Record<string, unknown>) => result);
  return { rpc, client: { rpc } };
}

const actor = { employeeId: EMPLOYEE_ID, authUserId: USER_ID };

describe("platform service promotion schemas", () => {
  test("defaults a strict create draft without scheduling it", () => {
    expect(schemas.PlatformServicePromotionCreateSchema.parse({})).toEqual({
      name: "平台技术服务限时优惠",
      badge_text: "限时 2 折",
      title: "平台技术服务限时优惠",
      summary: "1 年、2 年、3 年套餐同步限时优惠",
      rules_text: "",
      discount_rate_basis_points: 2000,
      starts_at: null,
      ends_at: null,
    });
    expect(schemas.PlatformServicePromotionCreateSchema.safeParse({
      unexpected: true,
    }).success).toBe(false);
  });

  test("requires paired increasing ISO timestamps", () => {
    for (const input of [
      { ...draft, starts_at: null },
      { ...draft, ends_at: null },
      { ...draft, ends_at: draft.starts_at },
      { ...draft, ends_at: "2026-09-30T23:59:59.000Z" },
      { ...draft, starts_at: "not-a-date", ends_at: "still-not-a-date" },
    ]) {
      expect(schemas.PlatformServicePromotionCreateSchema.safeParse(input).success)
        .toBe(false);
    }
    expect(schemas.PlatformServicePromotionCreateSchema.safeParse({
      ...draft,
      starts_at: null,
      ends_at: null,
    }).success).toBe(true);
    expect(schemas.PlatformServicePromotionCreateSchema.safeParse(draft).success)
      .toBe(true);
  });

  test("enforces rate, reason, optimistic version and UUID boundaries", () => {
    for (const discount_rate_basis_points of [0, 1.5, 10_000]) {
      expect(schemas.PlatformServicePromotionCreateSchema.safeParse({
        ...draft,
        discount_rate_basis_points,
      }).success).toBe(false);
    }
    expect(schemas.PlatformServicePromotionCreateSchema.safeParse({
      ...draft,
      discount_rate_basis_points: 1,
    }).success).toBe(true);
    expect(schemas.PlatformServicePromotionCreateSchema.safeParse({
      ...draft,
      discount_rate_basis_points: 9999,
    }).success).toBe(true);
    expect(schemas.PlatformServicePromotionUpdateSchema.safeParse({
      ...draft,
      expected_version: 1,
      unexpected: true,
    }).success).toBe(false);
    expect(schemas.PlatformServicePromotionPublishSchema.safeParse({
      expected_version: 3,
      idempotency_key: IDEMPOTENCY_KEY,
      expected_product_versions: expectedProductVersions,
    }).success).toBe(true);
    for (const reason of ["", " ", "x".repeat(501)]) {
      expect(schemas.PlatformServicePromotionStopSchema.safeParse({
        expected_version: 3,
        idempotency_key: IDEMPOTENCY_KEY,
        reason,
      }).success).toBe(false);
    }
    expect(schemas.PlatformServicePromotionParamSchema.safeParse({
      id: "not-a-uuid",
    }).success).toBe(false);
  });

  test("requires exactly the three unique formal product UUIDs and forbids client prices", () => {
    const body = { expected_version: 1, idempotency_key: IDEMPOTENCY_KEY };
    expect(schemas.PlatformServicePromotionPublishSchema.safeParse(body).success).toBe(false);
    for (const versions of [
      [], expectedProductVersions.slice(0, 2), [...expectedProductVersions, expectedProductVersions[0]],
      [expectedProductVersions[0], expectedProductVersions[0], expectedProductVersions[2]],
      expectedProductVersions.map((item) => ({ ...item, product_version_id: "invalid" })),
      expectedProductVersions.map((item) => ({ ...item, amount_fen: 1 })),
      expectedProductVersions.map((item) => ({ ...item, product_code: "platform_service_smoke_1fen" })),
    ]) expect(schemas.PlatformServicePromotionPublishSchema.safeParse({ ...body, expected_product_versions: versions }).success).toBe(false);
    expect(schemas.PlatformServicePromotionPublishSchema.safeParse({ ...body, expected_product_versions: expectedProductVersions }).success).toBe(true);
    expect(schemas.PlatformServicePromotionStopSchema.safeParse({ ...body, reason: "停止" }).success).toBe(true);
  });

  test("defaults bounded list pagination and rejects an unbounded request", () => {
    expect(schemas.PlatformServicePromotionListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(schemas.PlatformServicePromotionListQuerySchema.parse({
      page: "2",
      pageSize: "100",
    })).toEqual({ page: 2, pageSize: 100 });
    expect(schemas.PlatformServicePromotionListQuerySchema.safeParse({
      pageSize: 101,
    }).success).toBe(false);
  });
});

describe("PlatformServicePromotionRepository", () => {
  test("normalizes invalid and oversized pagination for the list RPC", async () => {
    const listResult = {
      list: [{
        ...promotion,
        draft: draftVersion,
        published: null,
        phase: "draft" as const,
        price_preview: pricePreview,
      }],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
      server_time: NOW,
    };
    const fixture = createClient({ data: listResult, error: null });
    const repository = new Repository(fixture.client);

    await expect(repository.list({ page: -3, pageSize: 999 }))
      .resolves.toEqual(listResult);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "platform_service_list_promotions",
      { p_page: 1, p_page_size: 100 },
    );
  });

  test("rejects missing, fractional and non-positive preview list prices", async () => {
    for (const list_amount_fen of [undefined, 0, -1, 1.5]) {
      const fixture = createClient({
        data: { ...commandResult, price_preview: [{ ...pricePreview[0], list_amount_fen }] },
        error: null,
      });
      await expect(new Repository(fixture.client).createDraft({ code: promotion.code, draft }, actor))
        .rejects.toMatchObject({ code: "DB_ERROR" });
    }
  });

  test("rejects missing or invalid product version identifiers in command and list previews", async () => {
    for (const product_version_id of [undefined, null, "invalid", 3]) {
      const preview = [{ ...pricePreview[0], product_version_id }];
      const command = createClient({ data: { ...commandResult, price_preview: preview }, error: null });
      await expect(new Repository(command.client).createDraft({ code: promotion.code, draft }, actor))
        .rejects.toMatchObject({ code: "DB_ERROR" });
      const list = createClient({ data: {
        list: [{ ...promotion, draft: draftVersion, published: null, phase: "draft", price_preview: preview }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }, server_time: NOW,
      }, error: null });
      await expect(new Repository(list.client).list({ page: 1, pageSize: 20 }))
        .rejects.toMatchObject({ code: "DB_ERROR" });
    }
  });

  test("creates a draft through only the create RPC", async () => {
    const fixture = createClient();
    const repository = new Repository(fixture.client);

    await expect(repository.createDraft({
      code: promotion.code,
      draft,
    }, actor)).resolves.toEqual(commandResult);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "platform_service_create_promotion_draft",
      {
        p_code: promotion.code,
        p_draft: draft,
        p_actor_employee_id: EMPLOYEE_ID,
        p_actor_user_id: USER_ID,
      },
    );
  });

  test("saves a draft through only the save RPC", async () => {
    const fixture = createClient();
    const repository = new Repository(fixture.client);

    await expect(repository.saveDraft(PROMOTION_ID, {
      ...draft,
      expected_version: 2,
    }, actor)).resolves.toEqual(commandResult);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "platform_service_save_promotion_draft",
      {
        p_promotion_id: PROMOTION_ID,
        p_expected_version: 2,
        p_draft: draft,
        p_actor_employee_id: EMPLOYEE_ID,
        p_actor_user_id: USER_ID,
      },
    );
  });

  test("publishes with optimistic version and idempotency through one RPC", async () => {
    const fixture = createClient();
    const repository = new Repository(fixture.client);

    await repository.publish({
      promotionId: PROMOTION_ID,
      expectedVersion: 3,
      expectedProductVersions,
      idempotencyKey: IDEMPOTENCY_KEY,
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: USER_ID,
    });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "platform_service_publish_promotion",
      {
        p_promotion_id: PROMOTION_ID,
        p_expected_version: 3,
        p_expected_product_versions: expectedProductVersions,
        p_idempotency_key: IDEMPOTENCY_KEY,
        p_actor_employee_id: EMPLOYEE_ID,
        p_actor_user_id: USER_ID,
      },
    );
  });

  test("stops with exact optimistic, idempotency, reason and actor params", async () => {
    const fixture = createClient();
    const repository = new Repository(fixture.client);

    await repository.stop({
      promotionId: PROMOTION_ID,
      expectedVersion: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "运营提前结束",
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: USER_ID,
    });
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "platform_service_stop_promotion",
      {
        p_promotion_id: PROMOTION_ID,
        p_expected_version: 4,
        p_idempotency_key: IDEMPOTENCY_KEY,
        p_reason: "运营提前结束",
        p_actor_employee_id: EMPLOYEE_ID,
        p_actor_user_id: USER_ID,
      },
    );
  });

  test("wraps Supabase errors with the operation context and original cause", async () => {
    const databaseError = {
      code: "P0001",
      message: "SERVICE_PROMOTION_VERSION_CONFLICT",
    };
    const fixture = createClient({ data: null, error: databaseError });
    const repository = new Repository(fixture.client);

    await expect(repository.publish({
      promotionId: PROMOTION_ID,
      expectedVersion: 3,
      expectedProductVersions,
      idempotencyKey: IDEMPOTENCY_KEY,
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: USER_ID,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "发布平台技术服务限时活动失败",
      details: databaseError,
    });
  });

  test("rejects malformed list timestamps, negative prices and unbounded pagination", async () => {
    const malformed = {
      list: [{
        ...promotion,
        created_at: "not-a-date",
        draft: draftVersion,
        published: null,
        phase: "draft",
        price_preview: [{ ...pricePreview[0], effective_amount_fen: -1 }],
      }],
      pagination: { page: 1, pageSize: 101, total: 0, totalPages: 0 },
      server_time: "not-a-date",
    };
    const fixture = createClient({ data: malformed, error: null });

    await expect(new Repository(fixture.client).list({ page: 1, pageSize: 20 }))
      .rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        message: "解析平台技术服务限时活动列表失败",
      });
  });

  test("rejects malformed command timestamps and negative prices as database errors", async () => {
    const malformed = {
      ...commandResult,
      promotion: { ...promotion, updated_at: "not-a-date" },
      price_preview: [{ ...pricePreview[0], base_amount_fen: -1 }],
      server_time: "not-a-date",
    };
    const fixture = createClient({ data: malformed, error: null });

    await expect(new Repository(fixture.client).createDraft({
      code: promotion.code,
      draft,
    }, actor)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "解析平台技术服务限时活动草稿创建结果失败",
    });
  });
});
