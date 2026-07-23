import { uploadRepository } from "@/repositories/uploads";
import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import { Errors } from "@/errors/error-factory";
import { resolveSignedStoredFileUrl } from "@/services/files/file-url-resolver";

class UploadService {
  findDefaultActiveCustomerMembership(authUserId: string) {
    return uploadRepository.findDefaultActiveCustomerMembership(authUserId);
  }

  findLegacyCustomerBinding(authUserId: string) {
    return uploadRepository.findLegacyCustomerBinding(authUserId);
  }

  async resolveWechatPayApplymentPreviewUrl(input: {
    fileObjectId: string;
    tenantId: string | null;
  }) {
    const file = input.tenantId
      ? await platformFileObjectRepository.findActiveById({
        id: input.fileObjectId,
        tenantId: input.tenantId,
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
}

export const uploadService = new UploadService();
