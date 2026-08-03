import { describe, expect, test } from "bun:test";

describe("platform service order views", () => {
  test("exposes continue_payment only for a non-expired pending order", async () => {
    const { serializeTenantServiceOrder } = await import(
      "./platform-service-order-views"
    );
    const now = new Date("2026-08-03T12:00:00.000Z");
    const pending = serializeTenantServiceOrder(
      {
        id: "order-1",
        order_no: "TSO202608030001",
        product_code: "platform_service_1y",
        term_years: 1,
        amount_fen: 980000,
        payment_status: "pending",
        service_status: "waiting_payment",
        prepay_id: "wx-prepay",
        payment_expires_at: "2026-08-03T12:05:00.000Z",
        paid_at: null,
        closed_at: null,
        terms_version: 1,
        version: 1,
        created_at: "2026-08-03T11:59:00.000Z",
        updated_at: "2026-08-03T11:59:00.000Z",
      },
      now,
    );

    expect(pending.available_actions.continue_payment).toEqual({
      enabled: true,
      label: "继续支付",
      disabled_reason: null,
    });

    const expired = serializeTenantServiceOrder(
      {
        ...pending,
        payment_status: "pending",
        service_status: "waiting_payment",
        payment_expires_at: "2026-08-03T11:59:00.000Z",
      },
      now,
    );
    expect(expired.available_actions.continue_payment.enabled).toBe(false);
    expect(expired.available_actions.continue_payment.disabled_reason).toBe(
      "订单已超过支付有效期",
    );
  });

  test("never serializes payer_openid, payment config or raw product snapshot", async () => {
    const { serializeTenantServiceOrder } = await import(
      "./platform-service-order-views"
    );
    const view = serializeTenantServiceOrder(
      {
        id: "order-1",
        order_no: "TSO202608030001",
        product_code: "platform_service_1y",
        term_years: 1,
        amount_fen: 980000,
        payment_status: "paid",
        service_status: "waiting_assignment",
        prepay_id: "wx-prepay",
        payment_expires_at: "2026-08-03T12:05:00.000Z",
        paid_at: "2026-08-03T12:01:00.000Z",
        closed_at: null,
        terms_version: 1,
        version: 2,
        created_at: "2026-08-03T11:59:00.000Z",
        updated_at: "2026-08-03T12:01:00.000Z",
        payer_openid: "openid-secret",
        payment_config_id: "config-secret",
        payment_config_guard_version: 1,
        product_snapshot: { secret: true },
      },
      new Date("2026-08-03T12:02:00.000Z"),
    );

    const json = JSON.stringify(view);
    expect(json).not.toContain("openid-secret");
    expect(json).not.toContain("config-secret");
    expect(json).not.toContain("product_snapshot");
    expect(view.available_actions.request_refund.enabled).toBe(true);
  });

  test("calculates tenant product price rate from published version", async () => {
    const { serializeTenantServiceProduct } = await import(
      "./platform-service-order-views"
    );

    const view = serializeTenantServiceProduct({
      id: "product-1",
      code: "platform_service_2y",
      status: "enabled",
      published_version_id: "version-1",
      published_version: {
        id: "version-1",
        version: 1,
        title: "平台部署及年度技术服务（2年）",
        term_years: 2,
        list_amount_fen: 1960000,
        amount_fen: 1568000,
        service_scope: ["部署", "培训"],
        terms_version: 1,
        terms_content: "服务条款",
      },
    });

    expect(view).toMatchObject({
      code: "platform_service_2y",
      title: "平台部署及年度技术服务（2年）",
      pricing_version: 1,
      price_rate_basis_points: 8000,
    });
  });

  test("marks platform products with unpublished draft changes", async () => {
    const { serializePlatformServiceProduct } = await import(
      "./platform-service-order-views"
    );

    const view = serializePlatformServiceProduct({
      id: "product-1",
      code: "platform_service_1y",
      title: "草稿标题",
      term_years: 1,
      list_amount_fen: 100,
      amount_fen: 90,
      service_scope: ["草稿"],
      terms_version: 2,
      terms_content: "草稿条款",
      status: "enabled",
      version: 2,
      published_version_id: "version-1",
      sort_order: 10,
      created_at: "2026-08-03T11:59:00.000Z",
      updated_at: "2026-08-03T12:01:00.000Z",
      published_version: {
        id: "version-1",
        version: 1,
        title: "已发布标题",
        term_years: 1,
        list_amount_fen: 100,
        amount_fen: 100,
        service_scope: ["已发布"],
        terms_version: 1,
        terms_content: "已发布条款",
      },
    });

    expect(view.has_unpublished_changes).toBe(true);
    expect(view.draft.price_rate_basis_points).toBe(9000);
    expect(view.published?.price_rate_basis_points).toBe(10000);
  });
});
