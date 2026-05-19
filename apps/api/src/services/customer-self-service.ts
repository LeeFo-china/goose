import {
  customerSelfServiceRepository,
  type CustomerSelfServiceCustomerContextRow,
  type CustomerSelfServiceUserProfileRow,
} from "@/repositories/customer-self-service";
import type { AuthMeProfileUpdateInput } from "@/schema/user-profile";

class CustomerSelfServiceService {
  listLegacyCustomerProfilesByAuthUserId(
    authUserId: string,
    options?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    return customerSelfServiceRepository.listLegacyCustomerProfilesByAuthUserId(
      authUserId,
      options,
    );
  }

  listCustomerProfilesByIds(customerIds: string[]) {
    return customerSelfServiceRepository.listCustomerProfilesByIds(customerIds);
  }

  getUserProfileByAuthUserId(authUserId: string) {
    return customerSelfServiceRepository.getUserProfileByAuthUserId(authUserId);
  }

  async saveAuthUserProfile(
    authUserId: string,
    input: AuthMeProfileUpdateInput,
  ) {
    const current = await this.getUserProfileByAuthUserId(authUserId);
    const nickname = input.nickname !== undefined
      ? input.nickname
      : current?.nickname ?? null;
    const avatarPath = input.avatar_path !== undefined
      ? input.avatar_path
      : current?.avatar_path ?? null;
    const shouldMarkCompleted = Boolean(nickname || avatarPath);
    const profileCompletedAt = shouldMarkCompleted
      ? current?.profile_completed_at ?? new Date().toISOString()
      : null;

    if (!current && !shouldMarkCompleted) {
      return null;
    }

    return customerSelfServiceRepository.upsertUserProfile({
      authUserId,
      nickname,
      avatarPath,
      profileCompletedAt,
    });
  }
}

export type CustomerContextRow = CustomerSelfServiceCustomerContextRow;
export type UserProfileRow = CustomerSelfServiceUserProfileRow;

export const customerSelfServiceService = new CustomerSelfServiceService();
