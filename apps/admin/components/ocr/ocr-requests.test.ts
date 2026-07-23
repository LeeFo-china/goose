import { afterEach, describe, expect, mock, test } from "bun:test";

import { fetchApplymentOcrRecognition } from "./ocr-requests";

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
});
