import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  createApplymentOcrRecognition,
  fetchApplymentOcrRecognition,
} from "./ocr-requests";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("applyment OCR requests", () => {
  test("fetches one recognition view with an encoded path id", async () => {
    const fetchMock = mock(async (
      _request: RequestInfo | URL,
      _init?: RequestInit,
    ) => new Response(JSON.stringify({
      success: true,
      data: {
        id: "recognition/with query?",
        status: "succeeded",
        scene: "wechat_pay_applyment",
        document_type: "business_license",
        file_object_id: "11111111-1111-4111-8111-111111111111",
        provider_request_id: null,
        expires_at: "2026-07-24T00:00:00.000Z",
        fields: [],
        warnings: [],
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const recognition = await fetchApplymentOcrRecognition(
      "recognition/with query?",
    );

    expect(recognition.id).toBe("recognition/with query?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/backend/ocr/recognitions/recognition%2Fwith%20query%3F",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: {} });
  });

  test("polls an in-progress reused recognition before returning fields", async () => {
    const responses = [
      {
        recognition: recognition("processing", []),
        idempotent: false,
        cached: true,
      },
      recognition("succeeded", [{
        key: "license_name",
        label: "营业执照主体名称",
        value: "固始晴天装饰工程有限公司",
        normalized: true,
        sensitive: false,
        confidence: null,
      }]),
    ];
    const fetchMock = mock(async (
      _request: RequestInfo | URL,
      _init?: RequestInit,
    ) => jsonResponse(responses.shift()));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await createApplymentOcrRecognition({
      documentType: "business_license",
      fileObjectId: "11111111-1111-4111-8111-111111111111",
      applymentId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result.recognition.status).toBe("succeeded");
    expect(result.recognition.fields).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/backend/ocr/recognitions/recognition-1",
    );
  });

  test("rejects a reused recognition that reaches a failed terminal state", async () => {
    const responses = [
      {
        recognition: recognition("processing", []),
        idempotent: true,
        cached: false,
      },
      recognition("failed", []),
    ];
    globalThis.fetch = mock(
      async () => jsonResponse(responses.shift()),
    ) as unknown as typeof fetch;

    await expect(createApplymentOcrRecognition({
      documentType: "business_license",
      fileObjectId: "11111111-1111-4111-8111-111111111111",
    })).rejects.toThrow("证照识别失败，请重试");
  });
});

function recognition(status: "processing" | "succeeded" | "failed", fields: unknown[]) {
  return {
    id: "recognition-1",
    status,
    scene: "wechat_pay_applyment",
    document_type: "business_license",
    file_object_id: "11111111-1111-4111-8111-111111111111",
    provider_request_id: null,
    expires_at: "2026-07-24T00:00:00.000Z",
    fields,
    warnings: [],
  };
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
