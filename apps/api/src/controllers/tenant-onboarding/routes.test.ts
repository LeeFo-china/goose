import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const sendCode = mock(async () => ({ sent: true }));
const submit = mock(async () => ({ application: { id: "application-1" } }));
const listOwned = mock(async () => ({ list: [], pagination: {} }));
const getOwned = mock(async () => ({ id: "application-1" }));
const supplement = mock(async () => ({ id: "application-1", version: 2 }));
const withdraw = mock(async () => ({ id: "application-1", status: "withdrawn" }));

mock.module("@/services/tenant-onboarding-applications", () => ({
  tenantOnboardingApplicationsService: {
    sendCode,
    submit,
    listOwned,
    getOwned,
    supplement,
    withdraw,
  },
}));

beforeEach(() => {
  for (const method of [sendCode, submit, listOwned, getOwned, supplement, withdraw]) {
    method.mockClear();
  }
});

const visitorRequest = (overrides: Partial<FastifyRequest> = {}) => ({
  body: {},
  headers: {},
  params: {},
  query: {},
  ip: "203.0.113.10",
  user: {
    token_type: "visitor_session",
    visitor_id: "visitor-1",
  },
  ...overrides,
}) as FastifyRequest;

describe("TenantOnboardingController routes", () => {
  test("registers the six applicant routes", async () => {
    const modulePath = `./${"index"}`;
    const module = await import(modulePath).catch(() => null);
    const routes: Array<{ method: string; path: string }> = [];
    const fastify = {
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      patch: (path: string) => routes.push({ method: "PATCH", path }),
    };

    module?.default.registerExtraRoutes(fastify as never);

    expect(routes).toEqual([
      { method: "POST", path: "/tenant-onboarding/applications/send-code" },
      { method: "POST", path: "/tenant-onboarding/applications" },
      { method: "GET", path: "/tenant-onboarding/applications/mine" },
      { method: "GET", path: "/tenant-onboarding/applications/:id" },
      { method: "PATCH", path: "/tenant-onboarding/applications/:id/supplement" },
      { method: "POST", path: "/tenant-onboarding/applications/:id/withdraw" },
    ]);
  });

  test("requires a visitor session for applicant handlers", async () => {
    const modulePath = `./${"index"}`;
    const controller = (await import(modulePath)).default;

    await expect(controller.listOwned(visitorRequest({
      user: { token_type: "auth", visitor_id: "visitor-1" },
    }))).rejects.toMatchObject({ statusCode: 401 });
  });

  test("submits with visitor ownership and idempotency then responds 202", async () => {
    const modulePath = `./${"index"}`;
    const controller = (await import(modulePath)).default;
    const reply = {
      code: mock(function (this: unknown, statusCode: number) {
        expect(statusCode).toBe(202);
        return this;
      }),
    } as unknown as FastifyReply;
    const body = {
      company_name: "晴天装饰",
      unified_social_credit_code: "91411525MA9G000000",
      business_license_file_id: "00000000-0000-4000-8000-000000000001",
      admin_name: "负责人",
      admin_phone: "13900139000",
      sms_code: "123456",
      company_location: {
        city: "信阳市",
        district: "固始县",
        region_code: "411525",
        address: "详细地址",
      },
      service_region_codes: ["411525"],
      visitor_context_id: "00000000-0000-4000-8000-000000000002",
      invite_code: null,
      source_channel: "local_services",
      privacy_policy_version: "2026-07",
      onboarding_terms_version: "2026-07",
      agree_privacy: true,
    };

    const response = await controller.submit(visitorRequest({
      body,
      headers: { "idempotency-key": "intent-1" },
    }), reply);

    expect(submit).toHaveBeenCalledWith(body, {
      visitorId: "visitor-1",
      idempotencyKey: "intent-1",
    });
    expect(response.data).toEqual({ application: { id: "application-1" } });
  });

  test("rejects an invalid idempotency key before submitting", async () => {
    const modulePath = `./${"index"}`;
    const controller = (await import(modulePath)).default;

    await expect(controller.submit(visitorRequest({
      headers: {},
    }), {} as FastifyReply)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(submit).not.toHaveBeenCalled();
  });
});
