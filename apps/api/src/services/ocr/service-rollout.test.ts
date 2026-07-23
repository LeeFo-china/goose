import { describe, expect, test } from "bun:test";

import {
  authContext,
  createHarness,
  request,
} from "./service.test-fixtures";

describe("OcrService tenant rollout", () => {
  test("hides capabilities for a tenant outside the rollout", async () => {
    const { service } = await createHarness({
      tenantPolicy: {
        enabled: false,
        allowedDocumentTypes: [],
        dailyLimit: 100,
      },
    });

    expect(await service.listCapabilities(authContext, "wechat_pay_applyment"))
      .toEqual([]);
  });

  test("rejects an unrolled tenant before reading its file", async () => {
    const { service, dependencies } = await createHarness({
      tenantPolicy: {
        enabled: false,
        allowedDocumentTypes: [],
        dailyLimit: 100,
      },
    });

    await expect(service.recognize(authContext, request)).rejects.toMatchObject({
      statusCode: 503,
      code: "OCR_TENANT_NOT_ENABLED",
    });
    expect(dependencies.fileRepository.findActiveById).not.toHaveBeenCalled();
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("returns only document types allowed by the tenant policy", async () => {
    const { service } = await createHarness({
      tenantPolicy: {
        enabled: true,
        allowedDocumentTypes: ["business_license"],
        dailyLimit: 100,
      },
    });

    expect((await service.listCapabilities(
      authContext,
      "wechat_pay_applyment",
    )).map((item) => item.document_type)).toEqual(["business_license"]);
  });

  test("rejects a document type excluded by the tenant policy", async () => {
    const { service, dependencies } = await createHarness({
      tenantPolicy: {
        enabled: true,
        allowedDocumentTypes: ["bank_card"],
        dailyLimit: 100,
      },
    });

    await expect(service.recognize(authContext, request)).rejects.toMatchObject({
      code: "OCR_CAPABILITY_UNAVAILABLE",
    });
    expect(dependencies.fileRepository.findActiveById).not.toHaveBeenCalled();
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("enforces the tenant quota override", async () => {
    const { service, dependencies } = await createHarness({
      dailyCount: 10,
      tenantPolicy: {
        enabled: true,
        allowedDocumentTypes: ["business_license"],
        dailyLimit: 10,
      },
    });

    await expect(service.recognize(authContext, request)).rejects.toMatchObject({
      statusCode: 429,
      code: "OCR_DAILY_LIMIT_EXCEEDED",
    });
    expect(dependencies.repository.createProcessing).not.toHaveBeenCalled();
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });
});
