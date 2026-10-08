import { afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let controller: typeof import("./index")["default"];
let usage: typeof import("@/services/decoration-qa/legacy/usage");
let shared: typeof import("@/services/decoration-qa/legacy/shared");
beforeAll(async () => {
  controller = (await import("./index")).default;
  usage = await import("@/services/decoration-qa/legacy/usage");
  shared = await import("@/services/decoration-qa/legacy/shared");
});
afterEach(() => mock.restore());

test.each(["decorationQa", "decorationQaStream"] as const)("%s enforces route write access and preserves the denial before response/provider", async (method) => {
  const denial = Errors.business(403, "AI 不在试用范围内", "TENANT_SERVICE_CAPABILITY_DENIED");
  const resolveUsage = spyOn(usage, "resolveDecorationQaUsageContext").mockRejectedValue(denial);
  spyOn(shared.systemSettingsService, "getString").mockResolvedValue("");
  const provider = spyOn(shared.aiGateway, "chat").mockRejectedValue(Errors.badRequest("provider reached"));
  const config = spyOn(shared.aiGateway, "resolveChatConfig").mockRejectedValue(Errors.badRequest("provider reached"));
  const hijack = mock(() => undefined);
  const request = {
    method: "POST",
    body: { question: "预算如何安排？", history: [] },
    routeOptions: {
      url: method === "decorationQa" ? "/ai/decoration-qa" : "/ai/decoration-qa/stream",
      config: { tenantServiceAccess: "write" },
    },
    user: { sub: "employee-user", employee_id: "employee", tenant_id: "tenant" },
    log: { error: mock(() => undefined) },
  } as unknown as FastifyRequest;
  await expect(controller[method](request, { hijack } as unknown as FastifyReply)).rejects.toBe(denial);
  expect(resolveUsage).toHaveBeenCalledWith(expect.objectContaining({
    authUserId: "employee-user", tenantServiceAccess: "write", requiredCapability: "business.ai",
  }));
  expect(hijack).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
  expect(config).not.toHaveBeenCalled();
});
