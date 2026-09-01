import { beforeEach, describe, expect, mock, test } from "bun:test";
import Fastify from "fastify";
import { createConnection } from "node:net";

import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_SUPPLIER_ID = "51000000-0000-4000-8000-000000000001";
const PRODUCT_ID = "51000000-0000-4000-8000-000000000002";
const SKU_ID = "51000000-0000-4000-8000-000000000003";
const UNIT_ID = "51000000-0000-4000-8000-000000000004";
const PRICE_LIST_ID = "51000000-0000-4000-8000-000000000005";
const auth = {
  tenantId: "51000000-0000-4000-8000-000000000006",
  authUserId: "51000000-0000-4000-8000-000000000007",
  employeeId: "51000000-0000-4000-8000-000000000008",
};
const context = {
  currency: "CNY", recommended_tax_rate: "0.13",
  recommended_tax_inclusive: false,
  next_scheduled_effective_from: null, current_price: null,
} as const;
const saved = { status: "saved", idempotent: false } as const;
const createBody = {
  sku: {
    name: "净味乳胶漆 18L", purchase_unit_id: UNIT_ID,
    specification: "18L", model: null, batch_managed: false,
    color_managed: false, serial_managed: false, spec_values: {},
  },
  price: { unit_price: "318.00", tax_rate: "0.13",
    tax_inclusive: false },
};
const updateBody = {
  sku: { expected_version: 4, name: "净味乳胶漆 18L 新包装" },
  price: { unit_price: "299.90", tax_rate: "0.13",
    tax_inclusive: false, expected_price_list_id: PRICE_LIST_ID,
    expected_price_list_version: 6 },
};
const getPriceDefaults = mock(async () => context);
const getCurrentPrice = mock(async () => context);
const create = mock(async () => saved);
const update = mock(async () => saved);

mock.module("@/services/supplier-purchasable-skus", () => ({
  supplierPurchasableSkusService: {
    getPriceDefaults, getCurrentPrice, create, update,
  },
}));

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    params: { productId: PRODUCT_ID, skuId: SKU_ID },
    query: { tenantSupplierId: TENANT_SUPPLIER_ID },
    headers: { "idempotency-key": "sku:write" },
    raw: { rawHeaders: ["Idempotency-Key", "sku:write"] },
    body: createBody,
    ...overrides,
  };
}

async function sendRawHttpRequest(
  port: number,
  idempotencyHeaders: readonly string[],
): Promise<string> {
  const payload = JSON.stringify(createBody);
  const rawRequest = [
    `POST /supplier-products/${PRODUCT_ID}/purchasable-skus/${SKU_ID}` +
      `?tenantSupplierId=${TENANT_SUPPLIER_ID} HTTP/1.1`,
    `Host: 127.0.0.1:${port}`,
    "Content-Type: application/json",
    `Content-Length: ${Buffer.byteLength(payload)}`,
    ...idempotencyHeaders,
    "Connection: close",
    "",
    payload,
  ].join("\r\n");
  const socket = createConnection({ host: "127.0.0.1", port });

  try {
    return await new Promise<string>((resolve, reject) => {
      let response = "";
      socket.setTimeout(2_000);
      socket.once("connect", () => socket.write(rawRequest));
      socket.on("data", (chunk) => {
        response += chunk.toString();
      });
      socket.once("end", () => resolve(response));
      socket.once("error", reject);
      socket.once("timeout", () => {
        socket.destroy(
          Errors.business(500, "本地 HTTP 测试超时", "TEST_TIMEOUT"),
        );
      });
    });
  } finally {
    socket.destroy();
  }
}

function rawHttpStatus(response: string): number {
  return Number(response.match(/^HTTP\/1\.1 (\d{3})/)?.[1]);
}

describe("SupplierPurchasableSkusController", () => {
  beforeEach(() => {
    for (const fn of [getPriceDefaults, getCurrentPrice, create, update]) {
      fn.mockClear();
    }
  });

  test("registers exactly the four composite SKU routes", async () => {
    const value = await controller();
    const routes: string[] = [];
    value.registerExtraRoutes({
      get: (path: string) => routes.push(`GET ${path}`),
      post: (path: string) => routes.push(`POST ${path}`),
      patch: (path: string) => routes.push(`PATCH ${path}`),
    } as never);
    expect(routes).toEqual([
      "GET /supplier-products/:productId/purchasable-skus/price-defaults",
      "GET /supplier-products/:productId/purchasable-skus/:skuId/price",
      "POST /supplier-products/:productId/purchasable-skus/:skuId",
      "PATCH /supplier-products/:productId/purchasable-skus/:skuId",
    ]);
  });

  test("reads without idempotency and calls each service exactly once", async () => {
    const value = await controller();
    const noKey = { headers: {}, raw: { rawHeaders: [] } };
    await expect(value.getPriceDefaults(request({
      ...noKey,
      params: { productId: PRODUCT_ID },
    }) as never)).resolves
      .toEqual({ data: context, message: "success" });
    await expect(value.getCurrentPrice(request(noKey) as never)).resolves
      .toEqual({ data: context, message: "success" });
    expect(getPriceDefaults).toHaveBeenCalledWith(
      auth, TENANT_SUPPLIER_ID, PRODUCT_ID,
    );
    expect(getCurrentPrice).toHaveBeenCalledWith(
      auth, TENANT_SUPPLIER_ID, PRODUCT_ID, SKU_ID,
    );
    expect(getPriceDefaults).toHaveBeenCalledTimes(1);
    expect(getCurrentPrice).toHaveBeenCalledTimes(1);
  });

  test("passes strict create and update commands once and wraps success", async () => {
    const value = await controller();
    await expect(value.createPurchasableSku(request() as never)).resolves
      .toMatchObject({
      data: saved, message: "success",
    });
    await expect(value.updatePurchasableSku(
      request({ body: updateBody }) as never,
    )).resolves
      .toMatchObject({ data: saved, message: "success" });
    expect(create).toHaveBeenCalledWith(auth, {
      tenantSupplierId: TENANT_SUPPLIER_ID, productId: PRODUCT_ID,
      skuId: SKU_ID, body: createBody, idempotencyKey: "sku:write",
    });
    expect(update).toHaveBeenCalledWith(auth, {
      tenantSupplierId: TENANT_SUPPLIER_ID, productId: PRODUCT_ID,
      skuId: SKU_ID, body: updateBody, idempotencyKey: "sku:write",
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("resolves auth before idempotency and all input parsing", async () => {
    const value = await controller();
    Object.defineProperty(value, "getRequiredTenantContext", {
      configurable: true,
      value: mock(async () => {
        throw Errors.unauthorized("需要租户认证上下文");
      }),
    });
    for (const method of [
      value.getPriceDefaults.bind(value), value.getCurrentPrice.bind(value),
      value.createPurchasableSku.bind(value),
      value.updatePurchasableSku.bind(value),
    ]) {
      await expect(method(request({ params: {}, query: {}, headers: {},
        body: {} }) as never)).rejects.toMatchObject({
        statusCode: 401, code: "UNAUTHORIZED",
      });
    }
    expect(getPriceDefaults).not.toHaveBeenCalled();
    expect(getCurrentPrice).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test.each([
    ["missing", { headers: {}, raw: { rawHeaders: [] } }],
    ["array", { headers: { "idempotency-key": ["one", "two"] } }],
    ["duplicate raw", { raw: { rawHeaders: [
      "Idempotency-Key", "one", "idempotency-key", "two",
    ] } }],
    ["overlong", { headers: { "idempotency-key": "x".repeat(121) } }],
  ])("rejects %s write idempotency before service", async (_label, override) => {
    const value = await controller();
    await expect(value.createPurchasableSku(request(override) as never)).rejects
      .toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(create).not.toHaveBeenCalled();
  });

  test("rejects duplicate raw idempotency headers through TCP", async () => {
    const value = await controller();
    const app = Fastify();
    value.registerExtraRoutes(app);

    try {
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const response = await sendRawHttpRequest(
        Number(new URL(address).port),
        ["Idempotency-Key: one", "iDeMpOtEnCy-KeY: two"],
      );
      expect({
        statusCode: rawHttpStatus(response),
        serviceCalls: create.mock.calls.length,
      }).toEqual({ statusCode: 400, serviceCalls: 0 });
    } finally {
      await app.close();
    }
  });

  test("accepts one idempotency header containing a comma through TCP", async () => {
    const value = await controller();
    const app = Fastify();
    value.registerExtraRoutes(app);

    try {
      const address = await app.listen({ host: "127.0.0.1", port: 0 });
      const response = await sendRawHttpRequest(
        Number(new URL(address).port),
        ["Idempotency-Key: batch,a"],
      );
      expect({
        statusCode: rawHttpStatus(response),
        serviceCalls: create.mock.calls.length,
      }).toEqual({ statusCode: 200, serviceCalls: 1 });
      expect(create).toHaveBeenCalledWith(auth, {
        tenantSupplierId: TENANT_SUPPLIER_ID,
        productId: PRODUCT_ID,
        skuId: SKU_ID,
        body: createBody,
        idempotencyKey: "batch,a",
      });
    } finally {
      await app.close();
    }
  });

  test.each([
    ["unknown query", "getPriceDefaults", { query: {
      tenantSupplierId: TENANT_SUPPLIER_ID, extra: "no",
    } }],
    ["invalid path", "getCurrentPrice", { params: {
      productId: PRODUCT_ID, skuId: "invalid",
    } }],
    ["unknown create body", "createPurchasableSku", { body: {
      ...createBody, identity: { supplier_id: SKU_ID },
    } }],
    ["update purchase unit", "updatePurchasableSku", { body: {
      ...updateBody, sku: { ...updateBody.sku, purchase_unit_id: UNIT_ID },
    } }],
  ])("rejects %s strict input before service", async (
    _label,
    method,
    override,
  ) => {
    const value = await controller();
    await expect((value[method as keyof typeof value] as Function).call(
      value,
      request(override) as never,
    )).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(getPriceDefaults).not.toHaveBeenCalled();
    expect(getCurrentPrice).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  test("registers once in routes without resource factory CRUD", async () => {
    const routesSource = await Bun.file(
      new URL("../../routes/index.ts", import.meta.url),
    ).text();
    expect(routesSource).toContain(
      'import SupplierPurchasableSkusController from "@/controllers/supplier-purchasable-skus";',
    );
    expect(routesSource.match(
      /SupplierPurchasableSkusController\.registerExtraRoutes\(app\);/g,
    )).toHaveLength(1);
    expect(routesSource).not.toContain(
      'createResourceRoutes("supplier-purchasable-skus"',
    );
  });
});
