import { uploadRepository } from "@/repositories/uploads";

class UploadService {
  findDefaultActiveCustomerMembership(authUserId: string) {
    return uploadRepository.findDefaultActiveCustomerMembership(authUserId);
  }

  findLegacyCustomerBinding(authUserId: string) {
    return uploadRepository.findLegacyCustomerBinding(authUserId);
  }
}

export const uploadService = new UploadService();
