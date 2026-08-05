import { describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import type {
  SerializedBrandProfile,
  SerializedEntitlement,
} from "@/services/branding-contracts";
import {
  AUTH_USER_ID,
  LOGO_FILE_ID,
  TENANT_ID,
  platformAuth,
  platformEffective,
  platformProfile,
  serializedEntitlement,
  tenantAuth,
  tenantEffective,
} from "./routes.fixtures.test";
import {
  loadController,
  loadHarness,
  mockPlatformPermission,
  registeredHandlers,
  requiredHandler,
} from "./routes.test-helpers";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

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
      platformAuthorizationService,
    } = await loadHarness();
    const originalAuth = authorizationService.getRequiredAuthContext;
    const originalGet = brandProfilesService.getPlatform;
    const originalResolve = effectiveBrandingService.resolvePlatform;
    const platformPermission = mockPlatformPermission(
      platformAuthorizationService,
      platformAuth,
    );
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
      expect(platformPermission.assertPermission).toHaveBeenCalledWith(
        platformAuth,
        "platform.branding.manage",
      );
      expect(getPlatform).toHaveBeenCalledWith(platformAuth);
      expect(resolvePlatform).toHaveBeenCalledTimes(1);
    } finally {
      platformPermission.restore();
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
      platformAuthorizationService,
    } = await loadHarness();
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      save: brandProfilesService.savePlatformDraft,
      publish: brandProfilesService.publishPlatform,
      resolve: effectiveBrandingService.resolvePlatform,
    };
    const platformPermission = mockPlatformPermission(
      platformAuthorizationService,
      platformAuth,
    );
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
      platformPermission.restore();
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
      publish: brandProfilesService.publishTenant,
      resolve: effectiveBrandingService.resolveForTenant,
    };
    const getTenant = mock(async () => ({
      profile: null,
      entitlement: null,
      can_customize: false,
    }));
    const mutationResult = {
      profile: {
        ...platformProfile,
        version: 1,
        published_version: null,
        has_unpublished_changes: true,
      } satisfies SerializedBrandProfile,
      entitlement: {
        code: "custom_support_branding",
        status: "active" as const,
        expires_at: serializedEntitlement.expires_at,
        version: serializedEntitlement.version,
      },
      can_customize: true as const,
    };
    const saveTenantDraft = mock(async () => mutationResult);
    const publishTenant = mock(async () => mutationResult);
    const resolveForTenant = mock(async () => tenantEffective);
    authorizationService.getRequiredAuthContext = mock(async () => tenantAuth);
    brandProfilesService.getTenant = getTenant;
    brandProfilesService.saveTenantDraft = saveTenantDraft;
    brandProfilesService.publishTenant = publishTenant;
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

      const draft = {
        display_name: "租户品牌",
        logo_file_id: LOGO_FILE_ID,
        version: 0,
      };
      const mutationRoutes = [
        ["PATCH /tenant/branding", draft, saveTenantDraft],
        ["POST /tenant/branding/publish", { version: 1 }, publishTenant],
      ] as const;
      for (const [route, body, service] of mutationRoutes) {
        const response = await requiredHandler(controller, route)({
          body,
          user: { sub: AUTH_USER_ID },
        } as FastifyRequest, {});
        expect(response.data).toEqual({
          ...mutationResult,
          effective: tenantEffective,
        });
        expect(service).toHaveBeenCalledWith(tenantAuth, body);
      }
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      brandProfilesService.getTenant = originals.get;
      brandProfilesService.saveTenantDraft = originals.save;
      brandProfilesService.publishTenant = originals.publish;
      effectiveBrandingService.resolveForTenant = originals.resolve;
    }
  });

  test("parses paginated entitlement reads and all four action bodies", async () => {
    const {
      authorizationService,
      controller,
      platformAuthorizationService,
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
    const platformPermission = mockPlatformPermission(
      platformAuthorizationService,
      platformAuth,
    );
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
      platformPermission.restore();
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
    const {
      authorizationService,
      controller,
      platformAuthorizationService,
      tenantEntitlementsService,
    } =
      await loadHarness();
    const originalAuth = authorizationService.getRequiredAuthContext;
    const originalList = tenantEntitlementsService.listPlatform;
    const originalRevoke = tenantEntitlementsService.revoke;
    const platformPermission = mockPlatformPermission(
      platformAuthorizationService,
      platformAuth,
    );
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
      platformPermission.restore();
      authorizationService.getRequiredAuthContext = originalAuth;
      tenantEntitlementsService.listPlatform = originalList;
      tenantEntitlementsService.revoke = originalRevoke;
    }
  });

});
