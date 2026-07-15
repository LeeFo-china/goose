import type {
  tenantOnboardingNotificationsRepository,
} from "@/repositories/tenant-onboarding-notifications";
import type {
  tenantOnboardingReviewRepository,
} from "@/repositories/tenant-onboarding-review";
import type { TenantOnboardingPlatformApplicationRecord } from "@/repositories/tenant-onboarding-types";
import type {
  tenantOnboardingPartnerAssistRepository,
} from "@/repositories/tenant-onboarding-partner-assist";
import type {
  tenantOnboardingRegionMatchRepository,
  tenantOnboardingRepository,
} from "@/repositories/tenant-onboarding";
import type { resolveSignedStoredFileUrl } from "@/services/files/file-url-resolver";
import type { platformAuditLogService } from "@/services/platform-audit-logs";
import type { TenantOnboardingPartnerResolution } from "@/services/tenant-onboarding-region-match";
import type { tenantOnboardingNotificationsService } from "@/services/tenant-onboarding-notifications";

export type ReviewRepositoryPort = Pick<
  typeof tenantOnboardingReviewRepository,
  | "listApplications"
  | "findApplicationById"
  | "listReviews"
  | "startReviewAtomic"
  | "requestSupplementAtomic"
  | "requestPartnerAssistAtomic"
  | "rejectAtomic"
  | "findTenantBySlug"
  | "findLicenseAccessRecord"
>;
export type ApprovalRepositoryPort = Pick<
  typeof tenantOnboardingRepository,
  "approveApplication"
>;
export type NotificationRepositoryPort = Pick<
  typeof tenantOnboardingNotificationsRepository,
  "listByApplication" | "findByIdAndApplication"
>;
export type NotificationServicePort = Pick<
  typeof tenantOnboardingNotificationsService,
  "deliver" | "retry"
>;
export type InviteCodeRepositoryPort = Pick<
  typeof tenantOnboardingRegionMatchRepository,
  "findActiveInviteCodeById"
>;
export type RegionResolverPort = {
  resolve(input: {
    serviceRegionCodes: readonly string[];
    inviteCode: string | null;
  }): Promise<TenantOnboardingPartnerResolution>;
};
export type AuditLogServicePort = Pick<
  typeof platformAuditLogService,
  "recordBestEffort"
>;
export type SignedUrlResolver = typeof resolveSignedStoredFileUrl;
export type PartnerAssistExpiryRepositoryPort = Pick<
  typeof tenantOnboardingPartnerAssistRepository,
  "expireDuePartnerAssistTasks"
>;
export type TenantSlugGenerator = (
  application: TenantOnboardingPlatformApplicationRecord,
  attempt: number,
) => string;

export type TenantOnboardingReviewServiceDependencies = {
  repository?: ReviewRepositoryPort;
  approvalRepository?: ApprovalRepositoryPort;
  notificationRepository?: NotificationRepositoryPort;
  notificationService?: NotificationServicePort;
  inviteCodeRepository?: InviteCodeRepositoryPort;
  regionResolver?: RegionResolverPort;
  auditLogService?: AuditLogServicePort;
  resolveSignedStoredFileUrl?: SignedUrlResolver;
  clock?: () => Date;
  tenantSlugGenerator?: TenantSlugGenerator;
  expiryRepository?: PartnerAssistExpiryRepositoryPort;
};
