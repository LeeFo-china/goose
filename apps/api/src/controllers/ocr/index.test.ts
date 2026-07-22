import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listCapabilities = mock(async () => [{ document_type: "business_license" }]);
const recognize = mock(async () => ({ recognition: { id: "recognition-1" } }));
const getTenantRecognition = mock(async () => ({ id: "recognition-1" }));
const listPlatformRecognitions = mock(async () => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
}));
const testPlatformConfig = mock(async () => ({
  ok: true,
  warning_codes: [],
  provider_request_id: "request-1",
  duration_ms: 15,
}));

mock.module("@/services/ocr", () => ({
  ocrService: {
    listCapabilities,
    recognize,
    getTenantRecognition,
    listPlatformRecognitions,
    testPlatformConfig,
  },
}));

const tenantAuth = {
  authUserId: "auth-user-1",
  tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  tenantName: "测试租户",
  tenantSlug: "test-tenant",
  tenantStatus: "active",
  employeeId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  employeeName: "测试员工",
  employeeStatus: "active",
  isPlatformAdmin: false,
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
} satisfies AuthContext;

const platformAuth = {
  ...tenantAuth,
  tenantId: null,
  isPlatformAdmin: true,
} as AuthContext;

async function getController(authContext: AuthContext = tenantAuth) {
  const { default: controller } = await import(".");
  (controller as unknown as {
    getRequiredTenantContext: () => Promise<AuthContext>;
    getRequiredAuthContext: () => Promise<AuthContext>;
  }).getRequiredTenantContext = mock(async () => authContext);
  (controller as unknown as {
    getRequiredAuthContext: () => Promise<AuthContext>;
  }).getRequiredAuthContext = mock(async () => authContext);
  return controller;
}

describe("OcrController", () => {
  beforeEach(() => {
    for (const method of [
      listCapabilities,
      recognize,
      getTenantRecognition,
      listPlatformRecognitions,
      testPlatformConfig,
    ]) method.mockClear();
  });

  test("registers the complete OCR route contract", async () => {
    const controller = await getController();
    const routes: Array<{ method: string; path: string }> = [];
    controller.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);

    expect(routes).toEqual([
      { method: "GET", path: "/ocr/capabilities" },
      { method: "POST", path: "/ocr/recognitions" },
      { method: "GET", path: "/ocr/recognitions/:id" },
      { method: "GET", path: "/platform/ocr/recognitions" },
      { method: "POST", path: "/platform/ocr/config-test" },
    ]);
  });

  test("validates create input and passes tenant context", async () => {
    const controller = await getController();
    const body = {
      scene: "wechat_pay_applyment",
      document_type: "business_license",
      file_object_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      subject_type: "wechat_pay_applyment",
      subject_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      idempotency_key: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    };

    await controller.createRecognition({ body } as never, {} as never);

    expect(recognize).toHaveBeenCalledWith(tenantAuth, body);
  });

  test("rejects invalid UUIDs and oversized platform pagination", async () => {
    const tenantController = await getController();
    await expect(tenantController.createRecognition({
      body: {
        scene: "wechat_pay_applyment",
        document_type: "business_license",
        file_object_id: "bad-id",
        subject_type: "wechat_pay_applyment",
        subject_id: "bad-id",
        idempotency_key: "bad-id",
      },
    } as never, {} as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const platformController = await getController(platformAuth);
    await expect(platformController.listPlatformRecognitions({
      query: { page: "1", pageSize: "101" },
    } as never, {} as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(recognize).not.toHaveBeenCalled();
    expect(listPlatformRecognitions).not.toHaveBeenCalled();
  });

  test("blocks platform test before reading a file for non-platform users", async () => {
    const controller = await getController(tenantAuth);
    const file = mock(async () => ({
      mimetype: "image/jpeg",
      filename: "sample.jpg",
      toBuffer: mock(async () => Buffer.from("sample")),
    }));

    await expect(controller.testPlatformConfig({
      isMultipart: () => true,
      file,
    } as never, {} as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(file).not.toHaveBeenCalled();
    expect(testPlatformConfig).not.toHaveBeenCalled();
  });

  test("blocks the platform audit list for tenant employees", async () => {
    const controller = await getController(tenantAuth);

    await expect(controller.listPlatformRecognitions({
      query: { page: "1", pageSize: "20" },
    } as never, {} as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(listPlatformRecognitions).not.toHaveBeenCalled();
  });

  test("accepts only a bounded JPEG or PNG platform sample", async () => {
    const controller = await getController(platformAuth);
    const bytes = Buffer.from("synthetic-sample");

    await controller.testPlatformConfig({
      isMultipart: () => true,
      file: mock(async () => ({
        mimetype: "image/png",
        filename: "sample.png",
        toBuffer: mock(async () => bytes),
      })),
    } as never, {} as never);

    expect(testPlatformConfig).toHaveBeenCalledWith(
      platformAuth,
      { imageBase64: bytes.toString("base64") },
    );
  });
});
