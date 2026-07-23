import { describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";

const FILE_ID = "11111111-1111-4111-8111-111111111111";
const resolveWechatPayApplymentPreviewUrl = mock(
  async () => "https://example.com/signed-preview.jpg",
);
type PreviewAuthContext = {
  authUserId: string;
  employeeId: string | null;
  tenantId: string | null;
  isPlatformAdmin: boolean;
  permissions: Array<{ code: string; scope: string }>;
};
const getRequiredAuthContext = mock(async (): Promise<PreviewAuthContext> => ({
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  isPlatformAdmin: false,
  permissions: [{
    code: "wechat_pay.applyment.submit",
    scope: "all",
  }],
}));
const assertPermission = mock(() => "all");

mock.module("@/services/uploads", () => ({
  uploadService: { resolveWechatPayApplymentPreviewUrl },
}));
mock.module("@/services/authorization", () => ({
  authorizationService: {
    getRequiredAuthContext,
  },
}));
mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock(() => undefined),
    assertPermission,
  },
}));

describe("UploadPreviewController", () => {
  test("resolves a wechat pay attachment preview by file id", async () => {
    const redirect = mock(() => undefined);
    const { default: controller } = await import("./index");

    await controller.getWechatPayApplymentPreview(
      {
        params: { id: FILE_ID },
        user: { sub: "auth-1" },
      } as FastifyRequest,
      { redirect } as never,
    );

    expect(resolveWechatPayApplymentPreviewUrl).toHaveBeenCalledWith({
      fileObjectId: FILE_ID,
      tenantId: "tenant-1",
    });
    expect(redirect).toHaveBeenCalledWith(
      "https://example.com/signed-preview.jpg",
    );
    expect(assertPermission).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1" }),
      "wechat_pay.applyment.submit",
    );
  });

  test("lets a platform admin preview without a tenant filter", async () => {
    getRequiredAuthContext.mockImplementationOnce(async () => ({
      authUserId: "platform-auth",
      employeeId: null,
      tenantId: null,
      isPlatformAdmin: true,
      permissions: [],
    }));
    const { default: controller } = await import("./index");

    await controller.getWechatPayApplymentPreview(
      {
        params: { id: FILE_ID },
        user: { sub: "platform-auth" },
      } as FastifyRequest,
      { redirect: mock(() => undefined) } as never,
    );

    expect(resolveWechatPayApplymentPreviewUrl).toHaveBeenLastCalledWith({
      fileObjectId: FILE_ID,
      tenantId: null,
    });
  });
});
