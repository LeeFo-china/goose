import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import {
  applymentUploadBody,
  assertDirectUploadAccess,
  buildRequest,
  buildVisitorRequest,
  canAccessProject,
  completeDirectUpload,
  createDirectUpload,
  denyApplymentUpload,
  employeeId,
  getRequiredAuthContext,
  otherVisitorId,
  projectId,
  resetUploadControllerMocks,
  resolveStoredFileUrl,
  tenantId,
  visitorId,
} from "./index.test-harness";

beforeEach(resetUploadControllerMocks);
describe("UploadController project payment direct upload", () => {
  test("checks tenant service write access before the employee JWT fast path", async () => {
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildRequest({
        scene: "project_payment",
        project_id: projectId,
        filename: "payment.jpg",
        mimetype: "image/jpeg",
        size_bytes: 120000,
      }),
      {} as never,
    );

    expect(getRequiredAuthContext).toHaveBeenCalledTimes(1);
    expect(getRequiredAuthContext).toHaveBeenCalledWith("auth-1", {
      tenantServiceAccess: "write",
    });
  });

  test("rejects read-only applyment upload init before creating an upload", async () => {
    denyApplymentUpload();
    const { default: controller } = await import("./index");
    await expect(controller.initDirectCosUpload(
      buildRequest(applymentUploadBody),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });
  test("rejects read-only applyment upload completion before creating a file object", async () => {
    denyApplymentUpload();
    const { default: controller } = await import("./index");
    await expect(controller.completeDirectCosUpload(
      buildRequest({
        ...applymentUploadBody,
        object_key: `tenants/${tenantId}/wechat-pay-applyment/license.jpg`,
        upload_intent: "intent",
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });
  test("allows tenant wechat pay applyment material upload without project id", async () => {
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildRequest(applymentUploadBody),
      {} as never,
    );

    expect(canAccessProject).not.toHaveBeenCalled();
    expect(assertDirectUploadAccess).toHaveBeenCalledWith(expect.objectContaining({
      scene: "wechat_pay_applyment",
    }));
    expect(createDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "wechat_pay_applyment",
        projectId: undefined,
        tenantId,
        employeeId,
        visibility: "private",
      }),
    );
  });
  test("rejects applyment init when JWT tenant differs from live auth context", async () => {
    getRequiredAuthContext.mockImplementationOnce(async () => ({
      ...(await getRequiredAuthContext()),
      tenantId: "tenant-current",
    }));
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildRequest(applymentUploadBody),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });
  test("rejects applyment complete when JWT tenant differs from live auth context", async () => {
    getRequiredAuthContext.mockImplementationOnce(async () => ({
      ...(await getRequiredAuthContext()),
      tenantId: "tenant-current",
    }));
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildRequest({
        ...applymentUploadBody,
        object_key: `tenants/${tenantId}/wechat-pay-applyment/license.jpg`,
        upload_intent: "intent",
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });
  test.each([
    ["oversize", "image/jpeg", 2 * 1024 * 1024 + 1],
    ["unsupported MIME", "image/webp", 100],
  ])("rejects applyment init outside scene policy: %s", async (
    _name,
    mimetype,
    sizeBytes,
  ) => {
    const { default: controller } = await import("./index");
    await expect(controller.initDirectCosUpload(
      buildRequest({
        ...applymentUploadBody,
        mimetype,
        size_bytes: sizeBytes,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 400 });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });
  test("allows finance project payment direct upload init", async () => {
    const { default: controller } = await import("./index");

    const response = await controller.initDirectCosUpload(
      buildRequest({
        scene: "project_payment",
        project_id: projectId,
        filename: "payment.jpg",
        mimetype: "image/jpeg",
        size_bytes: 120000,
      }),
      {} as never,
    );

    expect(canAccessProject).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId,
        permissions: [{ code: "finance.payment.confirm", scope: "all" }],
      }),
      projectId,
      "finance.payment.confirm",
    );
    expect(createDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "project_payment",
        projectId,
        tenantId,
        employeeId,
      }),
    );
    expect(response.data).toMatchObject({
      object_key: expect.stringContaining(`/project-payment/projects/${projectId}/`),
      upload_url: "https://example.com/upload",
    });
  });

  test("allows finance project payment direct upload complete", async () => {
    const objectKey =
      `tenants/${tenantId}/project-payment/projects/${projectId}/2026/06/16/file.jpg`;
    const { default: controller } = await import("./index");

    const response = await controller.completeDirectCosUpload(
      buildRequest({
        scene: "project_payment",
        project_id: projectId,
        filename: "payment.jpg",
        mimetype: "image/jpeg",
        size_bytes: 120000,
        object_key: objectKey,
        etag: "etag-1",
      }),
      {} as never,
    );

    expect(completeDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "project_payment",
        projectId,
        objectKey,
        tenantId,
        employeeId,
      }),
    );
    expect(response.data).toMatchObject({
      object_key: objectKey,
    });
  });

  test("requires project id for project payment direct upload", async () => {
    const { default: controller } = await import("./index");

    await expect(
      controller.initDirectCosUpload(
        buildRequest({
          scene: "project_payment",
          filename: "payment.jpg",
          mimetype: "image/jpeg",
          size_bytes: 120000,
        }),
        {} as never,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "缺少项目ID",
    });
  });

  test("rejects project payment upload without finance confirm access", async () => {
    canAccessProject.mockImplementationOnce(async () => false);
    const { default: controller } = await import("./index");

    await expect(
      controller.initDirectCosUpload(
        buildRequest({
          scene: "project_payment",
          project_id: projectId,
          filename: "payment.jpg",
          mimetype: "image/jpeg",
          size_bytes: 120000,
        }),
        {} as never,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });
});

describe("UploadController tenant onboarding license direct upload", () => {
  test("allows visitor license init as a private upload", async () => {
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 5 * 1024 * 1024,
      }),
      {} as never,
    );

    expect(createDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "tenant_onboarding_license",
      tenantId: null,
      visitorId,
      visibility: "private",
    }));
  });

  test("normalizes visitor ownership before creating a private upload", async () => {
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
      }, `  ${visitorId}  `),
      {} as never,
    );

    expect(createDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      visitorId,
    }));
  });

  test("rejects another upload scene for a visitor", async () => {
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildVisitorRequest({
        scene: "project_payment",
        project_id: projectId,
        filename: "payment.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  test("rejects the private license scene for tenant identities", async () => {
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  test("rejects a license larger than 5 MB", async () => {
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 5 * 1024 * 1024 + 1,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 400 });
  });

  test("completes only the current visitor private object", async () => {
    const ownerHash = createHash("sha256").update(visitorId).digest("hex");
    const objectKey = `private/tenant-onboarding-license/visitors/${ownerHash}/2026/07/14/file.jpg`;
    completeDirectUpload.mockImplementationOnce(async () => ({
      file_id: "00000000-0000-4000-8000-000000000003",
      status: "active",
    }));
    const { default: controller } = await import("./index");

    const response = await controller.completeDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
        object_key: objectKey,
        upload_intent: "v1.private-upload-intent.signature",
      }),
      {} as never,
    );

    expect(completeDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "tenant_onboarding_license",
      objectKey,
      visitorId,
      visibility: "private",
      uploadIntent: "v1.private-upload-intent.signature",
    }));
    expect(response.data).toEqual({
      file_id: "00000000-0000-4000-8000-000000000003",
      status: "active",
    });
    expect(response.data).not.toHaveProperty("public_url");
    expect(response.data).not.toHaveProperty("url");
  });

  test("requires an upload intent to complete a private license", async () => {
    const ownerHash = createHash("sha256").update(visitorId).digest("hex");
    const objectKey = `private/tenant-onboarding-license/visitors/${ownerHash}/file.jpg`;
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
        object_key: objectKey,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });

  test("prevents another visitor from completing the owner's object key", async () => {
    const ownerHash = createHash("sha256").update(visitorId).digest("hex");
    const objectKey = `private/tenant-onboarding-license/visitors/${ownerHash}/2026/07/14/file.jpg`;
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
        object_key: objectKey,
        upload_intent: "v1.private-upload-intent.signature",
      }, otherVisitorId),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });

  test("rejects private license objects before resolving a public URL", async () => {
    const ownerHash = createHash("sha256").update(visitorId).digest("hex");
    const path = `private/tenant-onboarding-license/visitors/${ownerHash}/file.jpg`;
    const { default: controller } = await import("./index");

    await expect(controller.getPublicUrl({
      ...buildVisitorRequest({}, visitorId),
      method: "GET",
      routeOptions: { config: { tenantServiceAccess: "read" } },
      query: { path },
    } as FastifyRequest, {} as never)).rejects.toMatchObject({ statusCode: 403 });
    expect(resolveStoredFileUrl).not.toHaveBeenCalled();
  });

  test("checks tenant service read access before resolving an employee public URL", async () => {
    const { default: controller } = await import("./index");

    await controller.getPublicUrl({
      ...buildRequest({}),
      method: "GET",
      routeOptions: { config: { tenantServiceAccess: "read" } },
      query: { path: `tenants/${tenantId}/project-log/file.jpg` },
    } as FastifyRequest, {
      redirect: () => undefined,
    } as never);

    expect(getRequiredAuthContext).toHaveBeenCalledTimes(1);
    expect(getRequiredAuthContext).toHaveBeenCalledWith("auth-1", {
      tenantServiceAccess: "read",
    });
  });
});
