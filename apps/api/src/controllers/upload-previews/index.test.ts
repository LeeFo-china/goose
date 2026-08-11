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
    assertPermission: mock(() => "all"),
  },
}));

describe("UploadPreviewController", () => {
  test("resolves a wechat pay attachment preview by file id", async () => {
    const redirect = mock(() => undefined);
    const header = mock(() => undefined);
    const { default: controller } = await import("./index");

    await controller.getWechatPayApplymentPreview(
      {
        method: "GET",
        params: { id: FILE_ID },
        routeOptions: { config: { tenantServiceAccess: "read" } },
        user: { sub: "auth-1" },
      } as FastifyRequest,
      { redirect, header } as never,
    );

    expect(getRequiredAuthContext).toHaveBeenCalledWith("auth-1", {
      tenantServiceAccess: "read",
    });
    expect(resolveWechatPayApplymentPreviewUrl).toHaveBeenCalledWith({
      authContext: expect.objectContaining({
        authUserId: "auth-1",
        tenantId: "tenant-1",
      }),
      fileObjectId: FILE_ID,
    });
    expect(redirect).toHaveBeenCalledWith(
      "https://example.com/signed-preview.jpg",
    );
    expect(header).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store, max-age=0",
    );
    expect(header).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(header).toHaveBeenCalledWith("Referrer-Policy", "no-referrer");
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
        method: "GET",
        params: { id: FILE_ID },
        routeOptions: { config: { tenantServiceAccess: "read" } },
        user: { sub: "platform-auth" },
      } as FastifyRequest,
      {
        header: mock(() => undefined),
        redirect: mock(() => undefined),
      } as never,
    );

    expect(resolveWechatPayApplymentPreviewUrl).toHaveBeenLastCalledWith({
      authContext: expect.objectContaining({
        authUserId: "platform-auth",
        isPlatformAdmin: true,
      }),
      fileObjectId: FILE_ID,
    });
  });
});
