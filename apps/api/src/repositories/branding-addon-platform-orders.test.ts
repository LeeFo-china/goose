import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let rpcResult: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};

const rpc = mock(async (
  _name: string,
  _params: Record<string, unknown>,
) => rpcResult);
const client = {
  from() {
    throw new TypeError("table access is not expected");
  },
  rpc,
};

describe("BrandingAddonOrderRepository platform audit detail", () => {
  beforeEach(() => {
    rpc.mockClear();
    rpcResult = { data: null, error: null };
  });

  test("loads the complete graph through one private RPC", async () => {
    rpcResult = {
      data: {
        order: { id: "order-1", order_no: "BA-1" },
        entitlement: { status: "active", source: "purchase" },
        entitlement_event: { id: "event-1", event_type: "granted" },
        audit: { id: "audit-1", status: "success" },
      },
      error: null,
    };
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);

    const actual = await repository.findPlatformOrderAuditById("order-1");

    expect(actual?.order.id).toBe("order-1");
    expect(actual?.entitlement?.status).toBe("active");
    expect(actual?.entitlement_event?.id).toBe("event-1");
    expect(actual?.audit?.id).toBe("audit-1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "branding_get_platform_addon_order_audit",
      { p_order_id: "order-1" },
    );
  });

  test("does not expose private RPC diagnostics", async () => {
    rpcResult = {
      data: null,
      error: {
        code: "PGRST202",
        message: "function argument mismatch",
        details: "private schema cache details",
      },
    };
    const { BrandingAddonOrderRepository } = await import(
      "./branding-addon-orders"
    );
    const repository = new BrandingAddonOrderRepository(() => client);

    await expect(repository.findPlatformOrderAuditById("order-1")).rejects
      .toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        details: undefined,
      });
  });
});
