import { beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type RepositoryConstructor = typeof import(
  "./branding-virtual-products"
)["BrandingVirtualProductRepository"];
let BrandingVirtualProductRepository: RepositoryConstructor;

beforeAll(async () => {
  ({ BrandingVirtualProductRepository } = await import(
    "./branding-virtual-products"
  ));
});

const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";

function createClient(options: {
  rpcData?: unknown;
  rpcError?: unknown;
} = {}) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select(columns: string) {
      calls.push(["select", columns]);
      return query;
    },
    eq(column: string, value: unknown) {
      calls.push(["eq", column, value]);
      return query;
    },
    maybeSingle: mock(async () => ({ data: null, error: null })),
  };
  const rpc = mock(async (name: string, params: Record<string, unknown>) => {
    calls.push(["rpc", name, params]);
    return { data: options.rpcData ?? null, error: options.rpcError ?? null };
  });
  return {
    calls,
    rpc,
    client: {
      from() {
        return query;
      },
      rpc,
    },
  };
}

describe("BrandingVirtualProductRepository management commands", () => {
  test("does not expose direct mapping table write methods", () => {
    const source = readFileSync(new URL(
      "./branding-virtual-products.ts",
      import.meta.url,
    ), "utf8");

    expect(source).not.toMatch(/\bcreateMapping\b|\bupdateMapping\b/);
    expect(source).not.toMatch(/\.insert\s*\(|\.update\s*\(/);
    expect(source).not.toContain("insert(input: Record<string, unknown>)");
    expect(source).not.toContain("update(input: Record<string, unknown>)");
  });

  test("sends product and mapping patches through one atomic RPC", async () => {
    const result = { product: { id: PRODUCT_ID }, virtual_product: null };
    const fixture = createClient({ rpcData: result });
    const repository = new BrandingVirtualProductRepository(() => fixture.client);

    await expect(repository.manageConfiguration({
      expectedProductVersion: 4,
      productPatch: { amount_fen: 9_900 },
      virtualProductPatch: { environment: "production", version: 3 },
      actorEmployeeId: EMPLOYEE_ID,
    })).resolves.toMatchObject(result);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "branding_manage_virtual_product_configuration",
      {
        p_expected_product_version: 4,
        p_product_patch: { amount_fen: 9_900 },
        p_virtual_product_patch: { environment: "production", version: 3 },
        p_actor_employee_id: EMPLOYEE_ID,
      },
    );
  });

  test("loads the complete management snapshot through one read RPC", async () => {
    const snapshot = { product: { id: PRODUCT_ID }, mappings: [] };
    const fixture = createClient({ rpcData: snapshot });
    const repository = new BrandingVirtualProductRepository(() => fixture.client);

    await expect(repository.getManagementSnapshot()).resolves
      .toMatchObject(snapshot);
    expect(fixture.rpc).toHaveBeenCalledTimes(1);
    expect(fixture.rpc).toHaveBeenCalledWith(
      "branding_get_virtual_product_management_snapshot",
      {},
    );
  });

  test("maps known conflicts to 409 and unknown database errors to 500", async () => {
    for (const [rpcError, statusCode, code] of [
      [
        { code: "P0001", message: "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT" },
        409,
        "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT",
      ],
      [
        { code: "42P01", message: "private sql" },
        500,
        "DB_ERROR",
      ],
      [
        { code: "P0001", message: "BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID" },
        409,
        "BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID",
      ],
    ] as const) {
      const fixture = createClient({ rpcError });
      const repository = new BrandingVirtualProductRepository(() => fixture.client);
      await expect(repository.manageConfiguration({
        expectedProductVersion: 4,
        productPatch: {},
        virtualProductPatch: {},
        actorEmployeeId: EMPLOYEE_ID,
      })).rejects.toMatchObject({ statusCode, code });
    }
  });
});
