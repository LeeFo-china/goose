import { uploadRepository } from "@/repositories/uploads";
import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { resolveSignedStoredFileUrl } from "@/services/files/file-url-resolver";
import {
  PLATFORM_READ_PERMISSION,
  TENANT_READ_PERMISSION,
  TENANT_SUBMIT_PERMISSION,
} from "@/services/wechat-pay-applyments-types";

class UploadService {
  assertDirectUploadAccess(input: {
    authContext: AuthContext;
    scene: string;
  }) {
    if (input.scene !== "wechat_pay_applyment") return;
    accessPolicyService.assertTenantContext(input.authContext);
    if (!accessPolicyService.hasPermission(
      input.authContext,
      TENANT_SUBMIT_PERMISSION,
    )) {
      throw Errors.forbidden();
    }
  }

  findDefaultActiveCustomerMembership(authUserId: string) {
    return uploadRepository.findDefaultActiveCustomerMembership(authUserId);
  }

  findLegacyCustomerBinding(authUserId: string) {
    return uploadRepository.findLegacyCustomerBinding(authUserId);
  }

  async resolveWechatPayApplymentPreviewUrl(input: {
    authContext: AuthContext;
    fileObjectId: string;
  }) {
    const tenantId = this.resolveApplymentPreviewTenant(input.authContext);
    const file = tenantId
      ? await platformFileObjectRepository.findActiveById({
        id: input.fileObjectId,
        tenantId,
      })
      : await platformFileObjectRepository.findActiveByIdForPlatform(
        input.fileObjectId,
      );
    if (
      !file ||
      file.scene !== "wechat_pay_applyment" ||
      file.provider !== "tencent_cos"
    ) {
      throw Errors.forbidden();
    }
    return resolveSignedStoredFileUrl(file.object_key, { ttlSeconds: 600 });
  }

  private resolveApplymentPreviewTenant(authContext: AuthContext) {
    if (authContext.isPlatformAdmin) {
      if (!accessPolicyService.hasPermission(
        authContext,
        PLATFORM_READ_PERMISSION,
      )) {
        throw Errors.forbidden();
      }
      return null;
    }
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    const canRead = accessPolicyService.hasPermission(
      authContext,
      TENANT_READ_PERMISSION,
    );
    const canSubmit = accessPolicyService.hasPermission(
      authContext,
      TENANT_SUBMIT_PERMISSION,
    );
    if (!canRead && !canSubmit) throw Errors.forbidden();
    return tenantId;
  }
}

export const uploadService = new UploadService();
