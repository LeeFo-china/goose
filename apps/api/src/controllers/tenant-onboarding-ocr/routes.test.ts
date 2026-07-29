import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";

import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const FILE_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = "22222222-2222-4222-8222-222222222222";
const RECOGNITION_ID = "33333333-3333-4333-8333-333333333333";

const listCapabilities = mock(async () => [{ document_type: "business_license" }]);
const recognize = mock(async () => ({
  recognition: { id: RECOGNITION_ID, status: "succeeded" },
  idempotent: false,
}));
const getRecognitionResult = mock(async () => ({
  id: RECOGNITION_ID,
  status: "succeeded",
}));

mock.module("@/services/ocr", () => ({
  tenantOnboardingOcrService: {
    listCapabilities,
    recognize,
    getRecognitionResult,
  },
}));

function visitorRequest(overrides: Partial<FastifyRequest> = {}) {
  return {
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
  } as FastifyRequest;
}

function replyHarness() {
  const header = mock(function (
    this: unknown,
    _name: string,
    _value: string,
  ) {
    return this;
  });
  return { header } as unknown as FastifyReply;
}

async function loadController() {
  return (await import(".")).default;
}

beforeEach(() => {
  listCapabilities.mockClear();
  recognize.mockClear();
  getRecognitionResult.mockClear();
});

describe("TenantOnboardingOcrController routes", () => {
  test("registers exactly the three visitor OCR routes", async () => {
    const routes: Array<{ method: string; path: string }> = [];
    const register = (method: string) => (path: string) =>
      routes.push({ method, path });
    (await loadController()).registerExtraRoutes({
      get: register("GET"),
      post: register("POST"),
    } as never);

    expect(routes).toEqual([
      { method: "GET", path: "/tenant-onboarding/ocr/capabilities" },
      { method: "POST", path: "/tenant-onboarding/ocr/recognitions" },
      { method: "GET", path: "/tenant-onboarding/ocr/recognitions/:id" },
    ]);
  });

  test("requires visitor_session on every handler", async () => {
    const controller = await loadController();
    const request = visitorRequest({
      user: { token_type: "auth", visitor_id: "visitor-1" },
    });

    await expect(controller.listCapabilities(request)).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      controller.createRecognition(request, replyHarness()),
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      controller.getRecognition(request),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  test("strictly validates create body and forwards visitor plus trusted IP", async () => {
    const controller = await loadController();
    const validBody = {
      file_object_id: FILE_ID,
      idempotency_key: IDEMPOTENCY_KEY,
    };

    await expect(controller.createRecognition(visitorRequest({
      body: { ...validBody, scene: "supplier_onboarding" },
    }), replyHarness())).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(recognize).not.toHaveBeenCalled();

    const response = await controller.createRecognition(visitorRequest({
      body: validBody,
    }), replyHarness());
    expect(recognize).toHaveBeenCalledWith(
      { visitorId: "visitor-1", requestIp: "203.0.113.10" },
      validBody,
    );
    expect(response.data).toMatchObject({
      recognition: { id: RECOGNITION_ID },
    });
  });

  test("validates the result id and keeps reads visitor-scoped", async () => {
    const controller = await loadController();

    await expect(controller.getRecognition(visitorRequest({
      params: { id: "not-a-uuid" },
    }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const response = await controller.getRecognition(visitorRequest({
      params: { id: RECOGNITION_ID },
    }));
    expect(getRecognitionResult).toHaveBeenCalledWith(
      "visitor-1",
      RECOGNITION_ID,
    );
    expect(response.data).toMatchObject({ id: RECOGNITION_ID });
  });

  test("sets integer Retry-After for visitor OCR rate limits", async () => {
    recognize.mockImplementationOnce(async () => {
      throw Errors.business(
        429,
        "OCR服务繁忙，请稍后重试",
        "OCR_PROVIDER_RATE_LIMITED",
        { retry_after_seconds: 17.8 },
      );
    });
    const controller = await loadController();
    const reply = replyHarness();

    await expect(controller.createRecognition(visitorRequest({
      body: {
        file_object_id: FILE_ID,
        idempotency_key: IDEMPOTENCY_KEY,
      },
    }), reply)).rejects.toMatchObject({
      statusCode: 429,
      code: "OCR_PROVIDER_RATE_LIMITED",
    });
    expect(reply.header).toHaveBeenCalledWith("Retry-After", "17");
  });
});
