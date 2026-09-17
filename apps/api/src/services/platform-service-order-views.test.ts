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
        product_snapshot: { pricing_version: 3 },
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
      { canCancelPayment: true },
    );

    expect(pending.available_actions.continue_payment).toEqual({
      enabled: true,
      label: "继续支付",
      disabled_reason: null,
    });
    expect(pending.available_actions.cancel_payment).toEqual({
      enabled: true,
      label: "取消订单",
      disabled_reason: null,
    });

    const expired = serializeTenantServiceOrder(
      {
        ...pending,
        payment_status: "pending",
        service_status: "waiting_payment",
        prepay_id: "wx-prepay",
        payment_expires_at: "2026-08-03T11:59:00.000Z",
      },
      now,
      { canCancelPayment: true },
    );
    expect(expired.available_actions.continue_payment.enabled).toBe(false);
    expect(expired.available_actions.continue_payment.disabled_reason).toBe(
      "订单已超过支付有效期",
    );
    expect(expired.available_actions.cancel_payment.enabled).toBe(true);
  });

  test("disables cancellation for read-only tenant employees", async () => {
    const { serializeTenantServiceOrder } = await import(
      "./platform-service-order-views"
    );
    const view = serializeTenantServiceOrder({
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
    }, new Date("2026-08-03T12:00:00.000Z"));

    expect(view.available_actions.cancel_payment).toEqual({
      enabled: false,
      label: "取消订单",
      disabled_reason: "无取消订单权限",
    });
  });

  test("does not advertise payment actions while a cancellation lease is active", async () => {
    const { serializeTenantServiceOrder } = await import(
      "./platform-service-order-views"
    );
    const view = serializeTenantServiceOrder(
      {
        id: "order-2",
        order_no: "TSO202608100002",
        product_code: "platform_service_1y",
        term_years: 1,
        amount_fen: 980000,
        payment_status: "pending",
        service_status: "waiting_payment",
        prepay_id: "wx-prepay",
        payment_expires_at: "2026-08-10T12:30:00.000Z",
        paid_at: null,
        closed_at: null,
        terms_version: 1,
        version: 1,
        created_at: "2026-08-10T11:59:00.000Z",
        updated_at: "2026-08-10T11:59:00.000Z",
        cancel_idempotency_key: "00000000-0000-4000-8000-000000000001",
        cancel_claim_expires_at: "2026-08-10T12:15:00.000Z",
      },
      new Date("2026-08-10T12:00:00.000Z"),
      { canCancelPayment: true },
    );

    expect(view.available_actions.continue_payment).toMatchObject({
      enabled: false,
      disabled_reason: "订单正在取消，请稍后刷新",
    });
    expect(view.available_actions.cancel_payment).toMatchObject({
      enabled: false,
      disabled_reason: "订单正在取消，请稍后刷新",
    });

    const expiredLease = serializeTenantServiceOrder(
      {
        ...view,
        payment_status: "pending",
        service_status: "waiting_payment",
        prepay_id: "wx-prepay",
        cancel_idempotency_key: "00000000-0000-4000-8000-000000000001",
        cancel_claim_expires_at: "2026-08-10T11:59:00.000Z",
      },
      new Date("2026-08-10T12:00:00.000Z"),
      { canCancelPayment: true },
    );
    expect(expiredLease.available_actions.continue_payment.enabled).toBe(false);
    expect(expiredLease.available_actions.cancel_payment.enabled).toBe(true);
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
        product_snapshot: { pricing_version: 3, secret: true },
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
      },
      new Date("2026-08-03T12:02:00.000Z"),
    );

    const json = JSON.stringify(view);
    expect(json).not.toContain("openid-secret");
    expect(json).not.toContain("config-secret");
    expect(json).not.toContain("wx-prepay");
    expect(json).not.toContain("product_snapshot");
    expect(view.available_actions.request_refund.enabled).toBe(true);
    expect(view.available_actions.cancel_payment).toEqual({
      enabled: false,
      label: "取消订单",
      disabled_reason: "订单已支付，不能取消",
    });
    expect(view.pricing_version).toBe(3);
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
      terms_content: "服务条款",
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

const frozenProduct = {
  product_id: "00000000-0000-4000-8000-000000000101",
  product_version_id: "00000000-0000-4000-8000-000000000201",
  code: "platform_service_1y", title: "已下单服务", pricing_version: 3, term_years: 1,
  list_amount_fen: 980000, base_amount_fen: 980000, amount_fen: 196000,
  effective_amount_fen: 196000, base_price_rate_basis_points: 10000 as const,
  price_rate_basis_points: 2000, service_scope: ["部署"], terms_version: 1,
  terms_content: "已确认条款", promotion: {
    id: "00000000-0000-4000-8000-000000000301",
    version_id: "00000000-0000-4000-8000-000000000401",
    version: 2, name: "活动", badge_text: "限时2折", title: "标题", summary: "摘要",
    rules_text: "规则", discount_rate_basis_points: 2000,
    starts_at: "2026-08-01T00:00:00+00:00", ends_at: "2026-08-02T00:00:00+00:00",
    base_amount_fen: 980000, effective_amount_fen: 196000,
  },
};

test("preserves all RPC effective product fields and existing public aliases", async () => {
  const { serializeTenantServiceProduct } = await import("./platform-service-order-views");
  const record = { ...frozenProduct, id: frozenProduct.product_id };
  expect(serializeTenantServiceProduct(record)).toEqual({
    ...record, status: "enabled", published_version_id: record.product_version_id,
  });
  const ordinary = { ...record, promotion: null, amount_fen: 980000,
    effective_amount_fen: 980000, price_rate_basis_points: 10000 };
  expect(serializeTenantServiceProduct(ordinary)).toMatchObject(ordinary);
});

test("serializes committed promotion snapshot without current product or clock", async () => {
  const views = await import("./platform-service-order-views");
  expect(views.serializeTenantServiceProductSnapshot).toBeFunction();
  expect(views.serializeTenantServiceProductSnapshot(frozenProduct)).toEqual({
    ...frozenProduct, id: frozenProduct.product_id, status: "enabled",
    published_version_id: frozenProduct.product_version_id,
  });
});

test("serializes legacy pending order daily price from its own snapshot", async () => {
  const views = await import("./platform-service-order-views");
  expect(views.serializeTenantServiceProductSnapshot).toBeFunction();
  const { promotion, base_amount_fen, effective_amount_fen, base_price_rate_basis_points,
    price_rate_basis_points, ...legacy } = frozenProduct;
  expect(views.serializeTenantServiceProductSnapshot({ ...legacy, amount_fen: 880000 }))
    .toMatchObject({ amount_fen: 880000, base_amount_fen: 880000,
      effective_amount_fen: 880000, base_price_rate_basis_points: 10000,
      price_rate_basis_points: 10000, promotion: null, pricing_version: 3 });
  expect(views.serializeTenantServiceProductSnapshot(undefined)).toBeNull();
});
