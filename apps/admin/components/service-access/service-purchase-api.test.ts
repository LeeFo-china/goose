import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  copyServicePurchaseLink,
  createServicePurchaseHandoffCoordinator,
  formatServiceAmountFen,
  formatServicePurchaseError,
  getServicePurchaseCapabilities,
  getServicePurchaseLink,
  handoffServicePurchase,
  listServiceOrdersIfPermitted,
  listServiceProductsIfPermitted,
  shouldAutomaticallyReturnFromServiceAccess,
  shouldRenderServicePurchaseSection,
  type ServicePurchaseRequester,
} from "./service-purchase-api";
import { ServiceOrderList } from "./service-order-list";
import { ServiceProductList } from "./service-product-list";
import { ServicePurchaseSection } from "./service-purchase-section";

const PRODUCT_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_VERSION_ID = "20000000-0000-4000-8000-000000000001";
const ORDER_ID = "30000000-0000-4000-8000-000000000001";
const PURCHASE_URL = "https://wxaurl.cn/examplePurchaseLink";
const EXPIRES_AT = "2026-08-20T10:10:00.000Z";

const product = {
  id: PRODUCT_ID,
  code: "platform_service_1y",
  status: "enabled" as const,
  published_version_id: PRODUCT_VERSION_ID,
  title: "标准技术服务",
  term_years: 1,
  list_amount_fen: 1_280_000,
  amount_fen: 980_000,
  price_rate_basis_points: 7_656,
  pricing_version: 3,
  service_scope: ["环境部署", "年度运维"],
  terms_version: 2,
  terms_content: "平台技术服务条款",
};

const order = {
  id: ORDER_ID,
  order_no: "TSO202608200001",
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980_000,
  payment_status: "pending",
  service_status: "waiting_payment",
  display_stage: "waiting_payment",
  payment_expires_at: "2026-08-20T10:30:00.000Z",
  paid_at: null,
  closed_at: null,
  pricing_version: 3,
  terms_version: 2,
  version: 1,
  available_actions: {
    continue_payment: {
      enabled: true,
      label: "继续支付",
      disabled_reason: null,
    },
    cancel_payment: {
      enabled: true,
      label: "取消订单",
      disabled_reason: null,
    },
    request_refund: {
      enabled: false,
      label: "申请售后",
      disabled_reason: "仅已支付订单可申请售后",
    },
  },
  created_at: "2026-08-20T10:00:00.000Z",
  updated_at: "2026-08-20T10:00:00.000Z",
};

type RequestCall = {
  path: string;
  init: Parameters<ServicePurchaseRequester>[1];
};

function createRequester(responses: unknown[]): {
  requester: ServicePurchaseRequester;
  calls: RequestCall[];
} {
  const calls: RequestCall[] = [];
  const requester: ServicePurchaseRequester = async <Response>(
    path: string,
    init: Parameters<ServicePurchaseRequester>[1],
  ) => {
    calls.push({ path, init });
    return responses.shift() as Response;
  };
  return { requester, calls };
}

function createDeferred<Value>() {
  let resolvePromise: ((value: Value) => void) | null = null;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: Value) {
      if (!resolvePromise) throw new Error("deferred promise 未初始化");
      resolvePromise(value);
    },
  };
}

function productPage() {
  return {
    list: [product],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  };
}

function orderPage() {
  return {
    list: [order],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    server_time: "2026-08-20T10:00:00.000Z",
  };
}

describe("service purchase API adapter", () => {
  test("uses exact first-page product and order GET requests", async () => {
    const { requester, calls } = createRequester([productPage(), orderPage()]);

    expect(await listServiceProductsIfPermitted(true, requester))
      .toEqual(productPage());
    expect(await listServiceOrdersIfPermitted(true, requester))
      .toEqual(orderPage());
    expect(calls.map(({ path }) => path)).toEqual([
      "/billing/service-products?page=1&pageSize=20",
      "/billing/service-orders?page=1&pageSize=20",
    ]);
    expect(calls.every(({ init }) => init?.method === undefined)).toBe(true);
  });

  test("makes zero product and order requests when capabilities are absent", async () => {
    const { requester, calls } = createRequester([]);

    expect(await listServiceProductsIfPermitted(false, requester)).toBeNull();
    expect(await listServiceOrdersIfPermitted(false, requester)).toBeNull();
    expect(calls).toEqual([]);
  });

  test("posts purchase-link without a business body or order creation call", async () => {
    const { requester, calls } = createRequester([{
      url: PURCHASE_URL,
      expires_at: EXPIRES_AT,
    }]);

    expect(await getServicePurchaseLink(requester)).toEqual({
      url: PURCHASE_URL,
      expires_at: EXPIRES_AT,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe("/employee/service-access/purchase-link");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBeUndefined();
    expect(calls.some(({ path }) => (
      path === "/billing/service-orders"
    ))).toBe(false);

    const submitted = JSON.stringify(calls);
    for (const forbidden of [
      "payer_openid",
      "tenant_id",
      "tenantId",
      "trial_id",
      "source_trial_id",
      "product_code",
      "terms_version",
      "amount_fen",
    ]) {
      expect(submitted).not.toContain(forbidden);
    }
  });

  test("rejects response shapes that do not match the API serializers", async () => {
    const malformedProduct = {
      ...productPage(),
      list: [{ ...product, amount_fen: 9.8 }],
    };
    const malformedOrder = {
      ...orderPage(),
      list: [{ ...order, available_actions: null }],
    };
    const malformedLink = { url: "not-a-url", expires_at: EXPIRES_AT };
    const { requester } = createRequester([
      malformedProduct,
      malformedOrder,
      malformedLink,
    ]);

    expect(listServiceProductsIfPermitted(true, requester)).rejects.toThrow(
      "服务套餐数据格式异常，请稍后重试",
    );
    expect(listServiceOrdersIfPermitted(true, requester)).rejects.toThrow(
      "服务订单数据格式异常，请稍后重试",
    );
    expect(getServicePurchaseLink(requester)).rejects.toThrow(
      "购买链接数据格式异常，请稍后重试",
    );
  });
});

describe("service purchase capabilities and presentation", () => {
  test("requires the authoritative action and create permission, including grace", () => {
    expect(getServicePurchaseCapabilities(
      ["enter_readonly_workspace", "purchase_service"],
      ["billing.service_order.create", "billing.service_order.read"],
    )).toEqual({ canPurchase: true, canReadOrders: true });
    expect(getServicePurchaseCapabilities(
      ["purchase_service"],
      ["billing.service_order.read"],
    )).toEqual({ canPurchase: false, canReadOrders: true });
    expect(getServicePurchaseCapabilities(
      [],
      ["billing.service_order.create"],
    )).toEqual({ canPurchase: false, canReadOrders: false });
  });

  test("renders for blocked or grace states only when a purchase capability exists", () => {
    expect(shouldRenderServicePurchaseSection({
      accessStatus: "service_blocked",
      canPurchase: true,
      canReadOrders: false,
    })).toBe(true);
    expect(shouldRenderServicePurchaseSection({
      accessStatus: "grace_period",
      canPurchase: true,
      canReadOrders: false,
    })).toBe(true);
    expect(shouldRenderServicePurchaseSection({
      accessStatus: "expired",
      canPurchase: false,
      canReadOrders: true,
    })).toBe(true);
    expect(shouldRenderServicePurchaseSection({
      accessStatus: "workspace_available",
      canPurchase: true,
      canReadOrders: true,
    })).toBe(false);
    expect(shouldRenderServicePurchaseSection({
      accessStatus: "hard_blocked",
      canPurchase: false,
      canReadOrders: true,
    })).toBe(false);
    expect(shouldRenderServicePurchaseSection({
      accessStatus: "service_blocked",
      canPurchase: false,
      canReadOrders: false,
    })).toBe(false);
  });

  test("keeps grace on service-access while redirecting fully available workspaces", () => {
    expect(shouldAutomaticallyReturnFromServiceAccess("bypass")).toBe(true);
    expect(shouldAutomaticallyReturnFromServiceAccess("workspace_available"))
      .toBe(true);
    expect(shouldAutomaticallyReturnFromServiceAccess("grace_period"))
      .toBe(false);
    expect(shouldAutomaticallyReturnFromServiceAccess("service_blocked"))
      .toBe(false);
    expect(shouldAutomaticallyReturnFromServiceAccess(null)).toBe(false);
  });

  test("formats integer fen as yuan for display without changing the amount", () => {
    expect(formatServiceAmountFen(980_000)).toBe("¥9,800.00");
    expect(formatServiceAmountFen(123_456_789)).toBe("¥1,234,567.89");
    expect(product.amount_fen).toBe(980_000);
  });

  test("formats only a stable message and safe requestId from failures", () => {
    const error = Object.assign(new Error("生成小程序购买链接失败，请稍后重试"), {
      requestId: "request-trace_20260820",
      payload: {
        payer_openid: "openid-secret",
        contact_phone: "13800138000",
      },
    });

    const message = formatServicePurchaseError(error, "购买链接生成失败");
    expect(message).toBe(
      "生成小程序购买链接失败，请稍后重试（Request-ID：request-trace_20260820）",
    );
    expect(message).not.toContain("openid-secret");
    expect(message).not.toContain("13800138000");
    expect(formatServicePurchaseError(
      Object.assign(new Error("失败"), { requestId: "<script>" }),
      "购买链接生成失败",
    )).toBe("失败");
  });
});

describe("service purchase browser handoff", () => {
  test("retains the validated link before assigning browser location", async () => {
    const { requester } = createRequester([{
      url: PURCHASE_URL,
      expires_at: EXPIRES_AT,
    }]);
    const events: string[] = [];

    const result = await handoffServicePurchase({
      requester,
      retainResult: (link) => events.push(`retain:${link.expires_at}`),
      navigate: (url) => events.push(`assign:${url}`),
    });

    expect(result).toEqual({ url: PURCHASE_URL, expires_at: EXPIRES_AT });
    expect(events).toEqual([
      `retain:${EXPIRES_AT}`,
      `assign:${PURCHASE_URL}`,
    ]);
  });

  test("copies only the in-memory URL through an injected clipboard writer", async () => {
    const copied: string[] = [];
    await copyServicePurchaseLink(
      { url: PURCHASE_URL, expires_at: EXPIRES_AT },
      async (value) => {
        copied.push(value);
      },
    );
    expect(copied).toEqual([PURCHASE_URL]);
  });

  test("coalesces duplicate clicks while a purchase link is being generated", async () => {
    let executions = 0;
    const pendingLink = createDeferred<string>();
    const coordinator = createServicePurchaseHandoffCoordinator(async () => {
      executions += 1;
      return pendingLink.promise;
    });

    const first = coordinator.run();
    const second = coordinator.run();
    expect(executions).toBe(1);
    expect(second).toBe(first);

    pendingLink.resolve(PURCHASE_URL);
    expect(await first).toBe(PURCHASE_URL);
  });
});

describe("service purchase UI states", () => {
  test("shows product loading, error, retry, empty, and serializer fields", () => {
    const loading = renderToStaticMarkup(createElement(ServiceProductList, {
      products: [],
      loading: true,
      error: null,
      onRetry: () => undefined,
    }));
    const failed = renderToStaticMarkup(createElement(ServiceProductList, {
      products: [],
      loading: false,
      error: "服务套餐加载失败",
      onRetry: () => undefined,
    }));
    const empty = renderToStaticMarkup(createElement(ServiceProductList, {
      products: [],
      loading: false,
      error: null,
      onRetry: () => undefined,
    }));
    const populated = renderToStaticMarkup(createElement(ServiceProductList, {
      products: [product],
      loading: false,
      error: null,
      onRetry: () => undefined,
    }));

    expect(loading).toContain("正在加载服务套餐");
    expect(failed).toContain("服务套餐加载失败");
    expect(failed).toContain("重试");
    expect(empty).toContain("暂无可购买套餐");
    for (const content of [
      "标准技术服务",
      "1 年",
      "¥9,800.00",
      "环境部署",
      "年度运维",
      "条款版本 2",
    ]) {
      expect(populated).toContain(content);
    }
  });

  test("shows compact order states and useful recent-order fields", () => {
    const loading = renderToStaticMarkup(createElement(ServiceOrderList, {
      orders: [],
      loading: true,
      error: null,
      onRetry: () => undefined,
    }));
    const failed = renderToStaticMarkup(createElement(ServiceOrderList, {
      orders: [],
      loading: false,
      error: "服务订单加载失败",
      onRetry: () => undefined,
    }));
    const empty = renderToStaticMarkup(createElement(ServiceOrderList, {
      orders: [],
      loading: false,
      error: null,
      onRetry: () => undefined,
    }));
    const populated = renderToStaticMarkup(createElement(ServiceOrderList, {
      orders: [order],
      loading: false,
      error: null,
      onRetry: () => undefined,
    }));

    expect(loading).toContain("正在加载最近订单");
    expect(failed).toContain("服务订单加载失败");
    expect(failed).toContain("重试");
    expect(empty).toContain("暂无服务订单");
    for (const content of [
      "TSO202608200001",
      "待支付",
      "1 年",
      "¥9,800.00",
      "2026年08月20日 18:00",
    ]) {
      expect(populated).toContain(content);
    }
  });

  test("shows purchase handoff copy only for purchase capability", () => {
    const purchase = renderToStaticMarkup(createElement(
      ServicePurchaseSection,
      { canPurchase: true, canReadOrders: false },
    ));
    const ordersOnly = renderToStaticMarkup(createElement(
      ServicePurchaseSection,
      { canPurchase: false, canReadOrders: true },
    ));

    expect(purchase).toContain("打开微信小程序购买");
    expect(purchase).toContain(
      "套餐选择、条款确认和微信支付将在小程序内完成",
    );
    expect(ordersOnly).not.toContain("打开微信小程序购买");
    expect(ordersOnly).not.toContain("套餐选择、条款确认");
  });
});
