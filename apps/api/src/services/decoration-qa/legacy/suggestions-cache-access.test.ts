import { afterEach, beforeAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";
import type { DecorationQaAuthInput, DecorationQaSuggestionScene } from "./shared";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let shared: typeof import("./shared");
let suggestions: typeof import("./suggestions");
let identity: typeof import("./identity");
let resolveTenantServiceRouteDecision: typeof import("@/services/tenant-service-access")["resolveTenantServiceRouteDecision"];
let guard: ReturnType<typeof spyOn<typeof import("@/services/authorization")["authorizationService"], "getRequiredAuthContext">>;
const employee: AuthContext = {
  authUserId: "cache-user", employeeId: "cache-employee", tenantId: "cache-tenant",
  tenantName: null, tenantSlug: null, tenantStatus: "active",
  isPlatformAdmin: false, employeeName: null, employeeStatus: "active",
  departmentId: null, tenantDepartmentId: null, departmentCode: null,
  departmentName: null, postId: null, postName: null, avatar: null,
  roleCodes: [], roles: [], permissions: [],
};
const denial = Errors.business(403, "试用范围未包含 AI", "TENANT_SERVICE_CAPABILITY_DENIED");
const caches = ["memory", "inflight", "database"] as const;
type Cache = typeof caches[number];

beforeAll(async () => {
  shared = await import("./shared");
  suggestions = await import("./suggestions");
  identity = await import("./identity");
  ({ resolveTenantServiceRouteDecision } = await import("@/services/tenant-service-access"));
});
beforeEach(() => {
  shared.suggestionMemoryCache.clear();
  shared.suggestionInFlight.clear();
  guard = spyOn(shared.authorizationService, "getRequiredAuthContext").mockResolvedValue(employee);
  spyOn(shared.authorizationService, "getAuthContextByAuthUserId").mockResolvedValue(employee);
  spyOn(identity, "findCustomerContextByAuthUserId").mockResolvedValue(null);
  spyOn(shared.aiGateway, "chat").mockRejectedValue(Errors.badRequest("provider must not be called"));
});
afterEach(() => {
  shared.suggestionMemoryCache.clear();
  shared.suggestionInFlight.clear();
  mock.restore();
});

function warmCache(cache: Cache, scene: DecorationQaSuggestionScene) {
  const now = new Date();
  const key = suggestions.buildSuggestionCacheKey({ scene, projectId: null, now });
  const expiresAt = new Date(now.getTime() + 60_000).toISOString();
  const result = {
    list: ["装修预算怎么控制？"], source: "cache" as const,
    cache_key: key, expires_at: expiresAt,
  };
  const database = spyOn(shared.decorationQaSuggestionCacheRepository, "findValid").mockResolvedValue({
    id: "cache-row", cache_key: key, scene, project_id: null,
    questions: result.list, source: "ai", expires_at: expiresAt,
    created_at: now.toISOString(), updated_at: now.toISOString(),
  });
  if (cache === "memory") {
    shared.suggestionMemoryCache.set(key, { expiresAt: now.getTime() + 60_000, result });
  } else if (cache === "inflight") {
    shared.suggestionInFlight.set(key, Promise.resolve(result));
  }
  return database;
}

const employees = [
  { kind: "claimed ID", authUserId: employee.authUserId, employeeId: employee.employeeId },
  { kind: "claimed role", authUserId: employee.authUserId, roles: ["employee"] },
  { kind: "inferred", authUserId: employee.authUserId },
];
for (const scene of ["visitor", "customer"] as const) {
  for (const cache of caches) {
    test.each(employees)(`${scene} scene ${cache} cache rejects $kind employee without AI capability`, async ({ kind: _kind, ...auth }) => {
      const database = warmCache(cache, scene);
      guard.mockRejectedValue(denial);
      await expect(suggestions.getDecorationQaSuggestions({
        ...auth, tenantServiceAccess: "read", requiredCapability: "business.ai",
        query: { scene, refresh: false },
      })).rejects.toBe(denial);
      expect(guard).toHaveBeenCalledWith(employee.authUserId, {
        tenantServiceAccess: "read", requiredCapability: "business.ai",
      });
      expect(database).not.toHaveBeenCalled();
      expect(shared.aiGateway.chat).not.toHaveBeenCalled();
    });
  }
}

for (const cache of caches) {
  test.each(["anonymous visitor", "signed-in visitor", "claimed customer", "inferred customer"] as const)(`${cache} visitor cache preserves %s access`, async (kind) => {
    warmCache(cache, "visitor");
    guard.mockRejectedValue(denial);
    const auth: DecorationQaAuthInput = kind === "anonymous visitor" ? {} : { authUserId: "other-user" };
    if (kind === "signed-in visitor") {
      spyOn(shared.authorizationService, "getAuthContextByAuthUserId")
        .mockResolvedValue({ ...employee, employeeId: null, tenantId: null });
    } else if (kind === "claimed customer") {
      auth.customerId = "customer";
      auth.tenantId = "customer-tenant";
    } else if (kind === "inferred customer") {
      spyOn(identity, "findCustomerContextByAuthUserId").mockResolvedValue({
        id: "customer", name: null, user_id: "other-user", tenant_id: "customer-tenant",
      });
    }
    const result = await suggestions.getDecorationQaSuggestions({
      ...auth, authUserId: auth.authUserId ?? undefined,
      tenantServiceAccess: "read", requiredCapability: "business.ai",
      query: { scene: "visitor", refresh: false },
    });
    expect(result.source).toBe("cache");
    expect(guard).not.toHaveBeenCalled();
    expect(shared.aiGateway.chat).not.toHaveBeenCalled();
  });
}

function allowGraceReads() {
  guard.mockImplementation(async (_authUserId, options = {}) => {
    const decision = resolveTenantServiceRouteDecision({
      mode: "grace", routeAccess: options.tenantServiceAccess ?? "write",
      requiredCapability: options.requiredCapability ?? null,
      capabilities: ["business.ai"], startsAt: null, endsAt: null,
    });
    if (!decision.allowed) {
      throw Errors.business(403, decision.reason ?? "访问被拒绝", decision.errorCode ?? "FORBIDDEN");
    }
    return employee;
  });
}

for (const cache of caches) {
  test.each(employees)(`grace ${cache} cache remains readable for $kind employee`, async ({ kind: _kind, ...auth }) => {
    warmCache(cache, "visitor");
    allowGraceReads();
    const result = await suggestions.getDecorationQaSuggestions({
      ...auth, tenantServiceAccess: "read", requiredCapability: "business.ai",
      query: { scene: "visitor", refresh: false },
    });
    expect(result.source).toBe("cache");
    expect(guard).toHaveBeenCalledWith(employee.authUserId, {
      tenantServiceAccess: "read", requiredCapability: "business.ai",
    });
    expect(guard.mock.calls.every(([, options]) => options?.tenantServiceAccess === "read")).toBe(true);
    expect(shared.aiGateway.chat).not.toHaveBeenCalled();
  });
}

for (const refresh of [false, true]) {
  test.each(employees)(`grace refresh=${refresh} denies generation for $kind employee without static fallback`, async ({ kind: _kind, ...auth }) => {
    const database = warmCache("memory", "visitor");
    if (!refresh) {
      shared.suggestionMemoryCache.clear();
      database.mockResolvedValue(null);
    }
    allowGraceReads();
    const save = spyOn(shared.decorationQaSuggestionCacheRepository, "upsert")
      .mockRejectedValue(Errors.dbError("cache save must not be called"));
    await expect(suggestions.getDecorationQaSuggestions({
      ...auth, tenantServiceAccess: "read", requiredCapability: "business.ai",
      query: { scene: "visitor", refresh },
    })).rejects.toMatchObject({ code: "TENANT_SERVICE_READ_ONLY" });
    expect(guard).toHaveBeenCalledWith(employee.authUserId, {
      tenantServiceAccess: "write", requiredCapability: "business.ai",
    });
    expect(shared.aiGateway.chat).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(shared.suggestionInFlight.size).toBe(0);
  });
}

test.each(["visitor", "customer"] as const)("genuine %s generation does not acquire employee write access", async (scene) => {
  guard.mockRejectedValue(denial);
  spyOn(identity, "findCustomerContextByAuthUserId").mockResolvedValue({
    id: "customer", name: null, user_id: "customer-user", tenant_id: "customer-tenant",
  });
  const provider = spyOn(shared.aiGateway, "chat").mockResolvedValue({
    content: JSON.stringify(["装修预算怎么控制？"]),
    raw: {}, provider: "test", model: "test", modelName: "test",
    promptTokens: 10, completionTokens: 5, totalTokens: 15,
  });
  spyOn(shared.decorationQaSuggestionCacheRepository, "upsert")
    .mockRejectedValue(Errors.dbError("cache unavailable"));
  const auth = scene === "customer"
    ? { authUserId: "customer-user", tenantId: "customer-tenant", customerId: "customer" }
    : {};
  const result = await suggestions.getDecorationQaSuggestions({
    ...auth, tenantServiceAccess: "read", requiredCapability: "business.ai",
    query: { scene, refresh: true },
  });
  expect(result.source).toBe("ai");
  expect(guard).not.toHaveBeenCalled();
  expect(provider).toHaveBeenCalledWith(expect.objectContaining({
    source: scene === "customer" ? "customer_miniprogram" : "visitor",
    billable: scene === "customer",
  }));
});
