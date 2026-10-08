import { afterEach, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const employee: AuthContext = {
  authUserId: "qa-user", employeeId: "qa-employee", tenantId: "qa-tenant",
  tenantName: null, tenantSlug: null, tenantStatus: "active",
  isPlatformAdmin: false, employeeName: null, employeeStatus: "active",
  departmentId: null, tenantDepartmentId: null, departmentCode: null,
  departmentName: null, postId: null, postName: null, avatar: null,
  roleCodes: [], roles: [], permissions: [],
};
const authInput = {
  authUserId: employee.authUserId, employeeId: employee.employeeId,
  tenantId: employee.tenantId,
};
const denial = Errors.business(403, "试用范围未包含 AI", "TENANT_SERVICE_CAPABILITY_DENIED");
let shared: typeof import("./shared");
let suggestions: typeof import("./suggestions");
let usage: typeof import("./usage");
let chat: typeof import("./chat");
let identity: typeof import("./identity");
let guard: ReturnType<typeof spyOn<typeof import("@/services/authorization")["authorizationService"], "getRequiredAuthContext">>;

beforeAll(async () => {
  shared = await import("./shared");
  suggestions = await import("./suggestions");
  usage = await import("./usage");
  chat = await import("./chat");
  identity = await import("./identity");
});
beforeEach(() => {
  shared.suggestionMemoryCache.clear();
  shared.suggestionInFlight.clear();
  guard = spyOn(shared.authorizationService, "getRequiredAuthContext").mockResolvedValue(employee);
  spyOn(shared.authorizationService, "getAuthContextByAuthUserId").mockResolvedValue(employee);
  spyOn(identity, "findCustomerContextByAuthUserId").mockResolvedValue(null);
  spyOn(shared.systemSettingsService, "getString").mockResolvedValue("");
});
afterEach(() => mock.restore());

function cacheSuggestions() {
  const now = new Date();
  const key = suggestions.buildSuggestionCacheKey({ scene: "employee", projectId: null, now });
  shared.suggestionMemoryCache.set(key, {
    expiresAt: now.getTime() + 60_000,
    result: { list: ["装修预算怎么控制？"], source: "cache", cache_key: key, expires_at: null },
  });
}

describe("decoration QA capability access", () => {
  test("propagates the route capability before returning cached employee suggestions", async () => {
    cacheSuggestions();
    const input = {
      ...authInput,
      query: { scene: "employee" as const, refresh: false },
      tenantServiceAccess: "read" as const,
      requiredCapability: "business.ai" as const,
    };
    await suggestions.getDecorationQaSuggestions(input);
    expect(guard).toHaveBeenCalledWith(employee.authUserId, {
      tenantServiceAccess: "read", requiredCapability: "business.ai",
    });
  });

  test("does not return cached suggestions after a capability denial", async () => {
    cacheSuggestions();
    guard.mockRejectedValue(denial);
    await expect(suggestions.getDecorationQaSuggestions({
      ...authInput, query: { scene: "employee", refresh: false }, tenantServiceAccess: "read",
    })).rejects.toBe(denial);
  });

  test.each(["read", "write"] as const)("guards employee usage with business.ai and %s access", async (access) => {
    const input = { ...authInput, tenantServiceAccess: access, requiredCapability: "business.ai" as const };
    expect(await usage.resolveDecorationQaUsageContext(input)).toMatchObject({
      tenantId: employee.tenantId, employeeId: employee.employeeId, billable: true,
    });
    expect(guard).toHaveBeenCalledWith(employee.authUserId, {
      tenantServiceAccess: access, requiredCapability: "business.ai",
    });
  });

  test.each([undefined, "visitor", "customer", "employee"] as const)("employee claims cannot bypass capability via context role %s", async (role) => {
    guard.mockRejectedValue(denial);
    await expect(usage.resolveDecorationQaUsageContext({ ...authInput, role })).rejects.toBe(denial);
  });

  test.each([undefined, "visitor", "customer", "employee"] as const)("inferred employees cannot bypass capability via context role %s", async (role) => {
    guard.mockRejectedValue(denial);
    await expect(usage.resolveDecorationQaUsageContext({ authUserId: employee.authUserId, role })).rejects.toBe(denial);
  });

  test("uses the guarded live employee context for billing", async () => {
    expect(await usage.resolveDecorationQaUsageContext({
      ...authInput, tenantId: "stale-tenant", employeeId: "stale-employee",
    })).toMatchObject({ tenantId: employee.tenantId, employeeId: employee.employeeId, billable: true });
  });

  test("preserves customer billing without the employee business guard", async () => {
    expect(await usage.resolveDecorationQaUsageContext({
      authUserId: "customer-user", customerId: "customer", tenantId: "customer-tenant",
    })).toMatchObject({ source: "customer_miniprogram", tenantId: "customer-tenant", billable: true });
    expect(guard).not.toHaveBeenCalled();
  });

  test("preserves anonymous visitor access", async () => {
    expect(await usage.resolveDecorationQaUsageContext({})).toMatchObject({ source: "visitor", billable: false });
    expect(guard).not.toHaveBeenCalled();
  });

  test("ask rejects before invoking the provider", async () => {
    guard.mockRejectedValue(denial);
    const provider = spyOn(shared.aiGateway, "chat").mockRejectedValue(Errors.badRequest("provider reached"));
    await expect(chat.askDecorationQa({ question: "预算如何安排？", history: [] }, authInput)).rejects.toBe(denial);
    expect(provider).not.toHaveBeenCalled();
  });

  test("allowed employee ask remains billable with live identity metadata", async () => {
    const provider = spyOn(shared.aiGateway, "chat").mockResolvedValue({
      content: JSON.stringify({ answer: "建议先明确预算", suggestions: [] }),
      raw: {}, provider: "test", model: "test", modelName: "test",
      promptTokens: 10, completionTokens: 5, totalTokens: 15,
    });
    expect(await chat.askDecorationQa({ question: "预算如何安排？", history: [] }, authInput))
      .toEqual({ answer: "建议先明确预算", suggestions: [] });
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: employee.tenantId, source: "employee_miniprogram", billable: true,
      metadata: expect.objectContaining({ employee_id: employee.employeeId }),
    }));
    expect(guard).toHaveBeenCalledWith(employee.authUserId, {
      tenantServiceAccess: "write", requiredCapability: "business.ai",
    });
  });

  test("capability approval does not swallow a billing or quota denial", async () => {
    const quotaDenial = Errors.business(403, "额度不足", "AI_QUOTA_EXCEEDED");
    const provider = spyOn(shared.aiGateway, "chat").mockRejectedValue(quotaDenial);
    await expect(chat.askDecorationQa({ question: "预算如何安排？", history: [] }, authInput))
      .rejects.toBe(quotaDenial);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  test("uncached employee suggestions require write access after read eligibility", async () => {
    const provider = spyOn(shared.aiGateway, "chat").mockResolvedValue({
      content: JSON.stringify(["装修预算怎么控制？"]),
      raw: {}, provider: "test", model: "test", modelName: "test",
      promptTokens: 10, completionTokens: 5, totalTokens: 15,
    });
    spyOn(shared.decorationQaSuggestionCacheRepository, "upsert")
      .mockRejectedValue(Errors.dbError("cache unavailable"));
    const result = await suggestions.getDecorationQaSuggestions({
      ...authInput, query: { scene: "employee", refresh: true },
      tenantServiceAccess: "read", requiredCapability: "business.ai",
    });
    expect(result.source).toBe("ai");
    expect(guard.mock.calls.map(([, options]) => options)).toEqual([
      { tenantServiceAccess: "read", requiredCapability: "business.ai" },
      { tenantServiceAccess: "read", requiredCapability: "business.ai" },
      { tenantServiceAccess: "write", requiredCapability: "business.ai" },
    ]);
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ billable: true, tenantId: employee.tenantId }));
  });

  test("preserves inferred customer access without an employee guard", async () => {
    spyOn(identity, "findCustomerContextByAuthUserId").mockResolvedValue({
      id: "customer", tenant_id: "customer-tenant", user_id: "customer-user", name: null,
    });
    expect(await usage.resolveDecorationQaUsageContext({ authUserId: "customer-user" }))
      .toMatchObject({ source: "customer_miniprogram", tenantId: "customer-tenant", billable: true });
    expect(guard).not.toHaveBeenCalled();
  });

  test("signed-in visitors without customer or employee bindings remain unbilled", async () => {
    spyOn(shared.authorizationService, "getAuthContextByAuthUserId").mockResolvedValue({
      ...employee, employeeId: null, tenantId: null,
    });
    expect(await usage.resolveDecorationQaUsageContext({ authUserId: "visitor-user" }))
      .toMatchObject({ source: "visitor", billable: false });
    expect(guard).not.toHaveBeenCalled();
  });

  test("inactive inferred employees cannot fall back to unbilled visitor access", async () => {
    guard.mockResolvedValue({ ...employee, employeeStatus: "inactive" });
    await expect(usage.resolveDecorationQaUsageContext({ authUserId: employee.authUserId }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("stream rejects before resolving or invoking the provider", async () => {
    guard.mockRejectedValue(denial);
    const provider = spyOn(shared.aiGateway, "resolveChatConfig").mockRejectedValue(Errors.badRequest("provider reached"));
    const onEvent = mock(() => undefined);
    await expect(chat.streamDecorationQa({ question: "预算如何安排？" }, onEvent, authInput)).rejects.toBe(denial);
    expect(provider).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });
});
