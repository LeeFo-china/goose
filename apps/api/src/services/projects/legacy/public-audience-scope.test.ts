import { describe, expect, test } from "bun:test";
import type { JwtPayload } from "@/utils/jwt";
import {
  assertPublicProjectInAudience,
  createPublicProjectAudienceScopeResolver,
} from "./public-audience-scope";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";

describe("public project audience scope", () => {
  test("uses all distinct visitor matched tenants and prefers selection", async () => {
    const resolve = createPublicProjectAudienceScopeResolver({
      findLatestActiveForVisitor: async () => ({
        matched_tenants: [
          { tenant_id: tenantB },
          { tenant_id: tenantA },
          { tenant_id: tenantB },
        ],
        selected_tenant_id: tenantB,
      }),
    });
    const payload: JwtPayload = {
      token_type: "visitor_session",
      visitor_id: "visitor-1",
    };

    await expect(resolve(payload)).resolves.toEqual({
      kind: "visitor_location",
      tenantIds: [tenantA, tenantB],
      preferredTenantId: tenantB,
    });
  });

  test("returns empty scope without active visitor context", async () => {
    const resolve = createPublicProjectAudienceScopeResolver({
      findLatestActiveForVisitor: async () => null,
    });

    await expect(
      resolve({ token_type: "visitor_session", visitor_id: "visitor-1" }),
    ).resolves.toEqual({
      kind: "empty",
      tenantIds: [],
      preferredTenantId: null,
    });
  });

  test("does not prefer a selection outside matched tenants", async () => {
    const resolve = createPublicProjectAudienceScopeResolver({
      findLatestActiveForVisitor: async () => ({
        matched_tenants: [{ tenant_id: tenantA }],
        selected_tenant_id: tenantB,
      }),
    });

    await expect(
      resolve({ token_type: "visitor_session", visitor_id: "visitor-1" }),
    ).resolves.toEqual({
      kind: "visitor_location",
      tenantIds: [tenantA],
      preferredTenantId: null,
    });
  });

  test("returns empty scope without visitor id or matched tenants", async () => {
    let calls = 0;
    const resolve = createPublicProjectAudienceScopeResolver({
      findLatestActiveForVisitor: async () => {
        calls += 1;
        return { matched_tenants: [], selected_tenant_id: null };
      },
    });

    await expect(resolve({ token_type: "visitor_session" })).resolves.toEqual({
      kind: "empty",
      tenantIds: [],
      preferredTenantId: null,
    });
    expect(calls).toBe(0);

    await expect(
      resolve({ token_type: "visitor_session", visitor_id: "visitor-1" }),
    ).resolves.toEqual({
      kind: "empty",
      tenantIds: [],
      preferredTenantId: null,
    });
    expect(calls).toBe(1);
  });

  test("uses identity tenant without reading visitor context", async () => {
    let calls = 0;
    const resolve = createPublicProjectAudienceScopeResolver({
      findLatestActiveForVisitor: async () => {
        calls += 1;
        return null;
      },
    });

    await expect(resolve({ token_type: "auth", tenant_id: tenantA })).resolves
      .toEqual({
        kind: "identity_tenant",
        tenantIds: [tenantA],
        preferredTenantId: tenantA,
      });
    expect(calls).toBe(0);
  });

  test("returns empty scope for unsupported or missing payload", async () => {
    let calls = 0;
    const resolve = createPublicProjectAudienceScopeResolver({
      findLatestActiveForVisitor: async () => {
        calls += 1;
        return null;
      },
    });

    await expect(resolve(undefined)).resolves.toEqual({
      kind: "empty",
      tenantIds: [],
      preferredTenantId: null,
    });
    await expect(resolve({ token_type: "h5_marketing" })).resolves.toEqual({
      kind: "empty",
      tenantIds: [],
      preferredTenantId: null,
    });
    expect(calls).toBe(0);
  });

  test("does not permit an out-of-scope project", () => {
    expect(() =>
      assertPublicProjectInAudience(
        {
          kind: "visitor_location",
          tenantIds: [tenantA],
          preferredTenantId: null,
        },
        tenantB,
      )
    ).toThrow("项目不存在");
  });

  test("permits included project tenants and rejects missing tenants", () => {
    const scope = {
      kind: "visitor_location" as const,
      tenantIds: [tenantA],
      preferredTenantId: null,
    };

    expect(() => assertPublicProjectInAudience(scope, tenantA)).not.toThrow();
    expect(() => assertPublicProjectInAudience(scope, null)).toThrow(
      "项目不存在",
    );
  });
});
