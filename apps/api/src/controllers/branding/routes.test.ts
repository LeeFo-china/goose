import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";
import type {
  SerializedBrandProfile,
  SerializedEntitlement,
} from "@/services/branding-contracts";
import {
  loadController,
  loadHarness,
  registeredHandlers,
  requiredHandler,
} from "./routes.test-helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPLOYEE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AUTH_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LOGO_FILE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const platformAuth = {
  authUserId: AUTH_USER_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  employeeId: EMPLOYEE_ID,
  employeeName: "平台管理员",
  employeeStatus: "active",
  isPlatformAdmin: true,
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.branding.manage", scope: "all" }],
} satisfies AuthContext;

const tenantAuth = {
  ...platformAuth,
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "test-tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  roleCodes: ["system_admin"],
  permissions: [
    { code: "brand.settings.read", scope: "all" },
    { code: "brand.settings.update", scope: "all" },
  ],
} satisfies AuthContext;

const platformProfile = {
  display_name: "平台品牌",
  logo_file_id: LOGO_FILE_ID,
  logo_url: "https://cdn.example.com/platform.png",
  status: "published",
  version: 2,
  published_version: 2,
  has_unpublished_changes: false,
  published_at: "2026-07-27T10:00:00.000Z",
  updated_at: "2026-07-27T10:00:00.000Z",
} satisfies SerializedBrandProfile;

const serializedEntitlement = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  tenant_id: TENANT_ID,
  code: "custom_support_branding",
  status: "active",
  starts_at: "2026-07-27T10:00:00.000Z",
  expires_at: "2027-07-27T10:00:00.000Z",
  source_type: "manual_grant",
  source_id: null,
  suspended_at: null,
  suspend_reason: null,
  version: 1,
  updated_at: "2026-07-27T10:00:00.000Z",
} satisfies SerializedEntitlement;

const platformEffective = {
  source: "platform" as const,
  tenant_id: null,
  display_name: "平台品牌",
  logo_url: "https://cdn.example.com/platform.png",
  support_text: "平台品牌提供技术支持",
  version: 2,
  updated_at: "2026-07-27T10:00:00.000Z",
};

const tenantEffective = {
  ...platformEffective,
  source: "tenant" as const,
  tenant_id: TENANT_ID,
  display_name: "租户品牌",
  support_text: "租户品牌提供技术支持",
};

describe("BrandingController routes", () => {
  test("registers exactly the twelve Batch A routes", async () => {
    const controller = await loadController();
    expect([...registeredHandlers(controller).keys()]).toEqual([
      "GET /branding/effective",
      "GET /platform/branding",
      "PATCH /platform/branding",
      "POST /platform/branding/publish",
      "GET /platform/tenants/:id/entitlements",
      "POST /platform/tenants/:id/entitlements/custom_support_branding/grant",
      "POST /platform/tenants/:id/entitlements/custom_support_branding/suspend",
      "POST /platform/tenants/:id/entitlements/custom_support_branding/resume",
      "POST /platform/tenants/:id/entitlements/custom_support_branding/revoke",
      "GET /tenant/branding",
      "PATCH /tenant/branding",
      "POST /tenant/branding/publish",
    ]);
  });

  test("validates an empty effective query and sets a private no-store response", async () => {
    const { controller, effectiveBrandingService } = await loadHarness();
    const resolveForRequest = mock(async () => platformEffective);
    const original = effectiveBrandingService.resolveForRequest;
    effectiveBrandingService.resolveForRequest = resolveForRequest;
    const headers = new Map<string, string>();
    const reply = {
      header: (name: string, value: string) => {
        headers.set(name, value);
      },
    };

    try {
      const handler = requiredHandler(controller, "GET /branding/effective");
      const response = await handler({ query: {} } as FastifyRequest, reply);
      expect(response).toEqual({ data: platformEffective, message: "success" });
      expect(resolveForRequest).toHaveBeenCalledWith(undefined);
      expect(headers.get("Cache-Control")).toBe("private, no-store");

      const visitor = {
        sub: AUTH_USER_ID,
        token_type: "visitor_session" as const,
        visitor_id: "visitor-id",
      };
      await handler({ query: {}, user: visitor } as FastifyRequest, reply);
      expect(resolveForRequest).toHaveBeenLastCalledWith(visitor);

      await expect(handler({
        query: { tenant_id: TENANT_ID },
      } as unknown as FastifyRequest, reply)).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
      expect(resolveForRequest).toHaveBeenCalledTimes(2);
    } finally {
      effectiveBrandingService.resolveForRequest = original;
    }
  });

  test("combines platform profile and effective branding after platform auth", async () => {
    const {
      authorizationService,
      brandProfilesService,
      controller,
      effectiveBrandingService,
    } = await loadHarness();
    const originalAuth = authorizationService.getRequiredAuthContext;
    const originalGet = brandProfilesService.getPlatform;
    const originalResolve = effectiveBrandingService.resolvePlatform;
    const getRequiredAuthContext = mock(async () => platformAuth);
    const getPlatform = mock(async () => ({ profile: platformProfile }));
    const resolvePlatform = mock(async () => platformEffective);
    authorizationService.getRequiredAuthContext = getRequiredAuthContext;
    brandProfilesService.getPlatform = getPlatform;
    effectiveBrandingService.resolvePlatform = resolvePlatform;

    try {
      const response = await requiredHandler(
        controller,
        "GET /platform/branding",
      )({ user: { sub: AUTH_USER_ID } } as FastifyRequest, {});
      expect(response.data).toEqual({
        profile: platformProfile,
        effective: platformEffective,
      });
      expect(getRequiredAuthContext).toHaveBeenCalledWith(AUTH_USER_ID);
      expect(getPlatform).toHaveBeenCalledWith(platformAuth);
      expect(resolvePlatform).toHaveBeenCalledTimes(1);
    } finally {
      authorizationService.getRequiredAuthContext = originalAuth;
      brandProfilesService.getPlatform = originalGet;
      effectiveBrandingService.resolvePlatform = originalResolve;
    }
  });

  test("parses platform branding mutations and propagates service errors", async () => {
    const {
      authorizationService,
      brandProfilesService,
      controller,
      effectiveBrandingService,
    } = await loadHarness();
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      save: brandProfilesService.savePlatformDraft,
      publish: brandProfilesService.publishPlatform,
      resolve: effectiveBrandingService.resolvePlatform,
    };
    const savedProfile = {
      ...platformProfile,
      version: 1,
      published_version: null,
      has_unpublished_changes: true,
    } satisfies SerializedBrandProfile;
    const savePlatformDraft = mock(async () => ({ profile: savedProfile }));
    const publishFailure = { code: "BRANDING_PROFILE_VERSION_CONFLICT" };
    const publishPlatform = mock(async () => Promise.reject(publishFailure));
    authorizationService.getRequiredAuthContext = mock(async () => platformAuth);
    brandProfilesService.savePlatformDraft = savePlatformDraft;
    brandProfilesService.publishPlatform = publishPlatform;
    effectiveBrandingService.resolvePlatform = mock(async () => platformEffective);

    try {
      const draft = {
        display_name: "平台品牌",
        logo_file_id: LOGO_FILE_ID,
        version: 0,
      };
      const response = await requiredHandler(
        controller,
        "PATCH /platform/branding",
      )({ body: draft, user: { sub: AUTH_USER_ID } } as FastifyRequest, {});
      expect(response.data).toEqual({
        profile: savedProfile,
        effective: platformEffective,
      });
      expect(savePlatformDraft).toHaveBeenCalledWith(platformAuth, draft);

      await expect(requiredHandler(
        controller,
        "POST /platform/branding/publish",
      )({
        body: { version: 1 },
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {})).rejects.toBe(publishFailure);
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      brandProfilesService.savePlatformDraft = originals.save;
      brandProfilesService.publishPlatform = originals.publish;
      effectiveBrandingService.resolvePlatform = originals.resolve;
    }
  });

  test("uses the authenticated tenant for tenant branding and rejects client tenant IDs", async () => {
    const {
      authorizationService,
      brandProfilesService,
      controller,
      effectiveBrandingService,
    } = await loadHarness();
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      get: brandProfilesService.getTenant,
      save: brandProfilesService.saveTenantDraft,
      resolve: effectiveBrandingService.resolveForTenant,
    };
    const getTenant = mock(async () => ({
      profile: null,
      entitlement: null,
      can_customize: false,
    }));
    const saveTenantDraft = mock(async () => ({
      profile: {
        ...platformProfile,
        version: 1,
        published_version: null,
        has_unpublished_changes: true,
      } satisfies SerializedBrandProfile,
    }));
    const resolveForTenant = mock(async () => tenantEffective);
    authorizationService.getRequiredAuthContext = mock(async () => tenantAuth);
    brandProfilesService.getTenant = getTenant;
    brandProfilesService.saveTenantDraft = saveTenantDraft;
    effectiveBrandingService.resolveForTenant = resolveForTenant;

    try {
      const getResponse = await requiredHandler(
        controller,
        "GET /tenant/branding",
      )({ user: { sub: AUTH_USER_ID } } as FastifyRequest, {});
      expect(getResponse.data).toEqual({
        profile: null,
        entitlement: null,
        can_customize: false,
        effective: tenantEffective,
      });
      expect(getTenant).toHaveBeenCalledWith(tenantAuth);
      expect(resolveForTenant).toHaveBeenCalledWith(TENANT_ID);

      await expect(requiredHandler(
        controller,
        "PATCH /tenant/branding",
      )({
        body: {
          display_name: "租户品牌",
          logo_file_id: LOGO_FILE_ID,
          version: 0,
          tenant_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        },
        user: { sub: AUTH_USER_ID },
      } as unknown as FastifyRequest, {})).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
      expect(saveTenantDraft).not.toHaveBeenCalled();
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      brandProfilesService.getTenant = originals.get;
      brandProfilesService.saveTenantDraft = originals.save;
      effectiveBrandingService.resolveForTenant = originals.resolve;
    }
  });

  test("parses paginated entitlement reads and all four action bodies", async () => {
    const {
      authorizationService,
      controller,
      tenantEntitlementsService,
    } = await loadHarness();
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      list: tenantEntitlementsService.listPlatform,
      grant: tenantEntitlementsService.grant,
      suspend: tenantEntitlementsService.suspend,
      resume: tenantEntitlementsService.resume,
      revoke: tenantEntitlementsService.revoke,
    };
    const result = { entitlement: serializedEntitlement };
    const listPlatform = mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    }));
    const grant = mock(async () => result);
    const suspend = mock(async () => result);
    const resume = mock(async () => result);
    const revoke = mock(async () => result);
    authorizationService.getRequiredAuthContext = mock(async () => platformAuth);
    Object.assign(tenantEntitlementsService, {
      listPlatform,
      grant,
      suspend,
      resume,
      revoke,
    });

    try {
      const listResponse = await requiredHandler(
        controller,
        "GET /platform/tenants/:id/entitlements",
      )({
        params: { id: TENANT_ID },
        query: {},
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(listResponse.data).toEqual({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      });
      expect(listPlatform).toHaveBeenCalledWith(platformAuth, TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      const actionInputs = [
        ["grant", { reason: "平台赠送一年权益", term_years: 1 }],
        ["suspend", { reason: "品牌内容待核验", version: 1 }],
        ["resume", { reason: "品牌内容已核验", version: 2 }],
        ["revoke", { reason: "租户主动终止服务", version: 3, confirm: true }],
      ] as const;
      const actionMocks = { grant, suspend, resume, revoke };
      for (const [action, body] of actionInputs) {
        const response = await requiredHandler(
          controller,
          `POST /platform/tenants/:id/entitlements/custom_support_branding/${action}`,
        )({
          body,
          params: { id: TENANT_ID },
          user: { sub: AUTH_USER_ID },
        } as FastifyRequest, {});
        expect(response.data).toEqual(result);
        expect(actionMocks[action]).toHaveBeenCalledWith(
          platformAuth,
          TENANT_ID,
          body,
        );
      }
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      Object.assign(tenantEntitlementsService, {
        listPlatform: originals.list,
        grant: originals.grant,
        suspend: originals.suspend,
        resume: originals.resume,
        revoke: originals.revoke,
      });
    }
  });

  test("rejects invalid entitlement params, pagination, and action payloads", async () => {
    const { authorizationService, controller, tenantEntitlementsService } =
      await loadHarness();
    const originalAuth = authorizationService.getRequiredAuthContext;
    const originalList = tenantEntitlementsService.listPlatform;
    const originalRevoke = tenantEntitlementsService.revoke;
    const listPlatform = mock(async () => ({
      list: [] as SerializedEntitlement[],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    }));
    const revoke = mock(async () => ({ entitlement: serializedEntitlement }));
    authorizationService.getRequiredAuthContext = mock(async () => platformAuth);
    tenantEntitlementsService.listPlatform = listPlatform;
    tenantEntitlementsService.revoke = revoke;

    try {
      await expect(requiredHandler(
        controller,
        "GET /platform/tenants/:id/entitlements",
      )({
        params: { id: "not-a-uuid" },
        query: { page: 1, pageSize: 101 },
        user: { sub: AUTH_USER_ID },
      } as unknown as FastifyRequest, {})).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
      await expect(requiredHandler(
        controller,
        "POST /platform/tenants/:id/entitlements/custom_support_branding/revoke",
      )({
        body: { reason: "终止权益", version: 1, confirm: false },
        params: { id: TENANT_ID },
        user: { sub: AUTH_USER_ID },
      } as unknown as FastifyRequest, {})).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      });
      expect(listPlatform).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
    } finally {
      authorizationService.getRequiredAuthContext = originalAuth;
      tenantEntitlementsService.listPlatform = originalList;
      tenantEntitlementsService.revoke = originalRevoke;
    }
  });

  test("stays controller-only and is registered by the API route index", () => {
    const controllerSource = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );
    const routesSource = readFileSync(
      new URL("../../routes/index.ts", import.meta.url),
      "utf8",
    );
    expect(controllerSource).not.toContain("@/repositories/");
    expect(controllerSource).not.toContain("@/utils/supabase");
    expect(controllerSource).not.toContain(".from(");
    expect(routesSource).toContain(
      'import BrandingController from "@/controllers/branding";',
    );
    expect(routesSource).toContain(
      "BrandingController.registerExtraRoutes(app);",
    );
  });
});
