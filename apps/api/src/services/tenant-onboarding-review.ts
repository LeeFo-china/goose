import {
  tenantOnboardingNotificationsRepository,
} from "@/repositories/tenant-onboarding-notifications";
import {
  tenantOnboardingReviewRepository,
} from "@/repositories/tenant-onboarding-review";
import type {
  TenantOnboardingPlatformApplicationRecord,
  TenantOnboardingPlatformReviewMutationResult,
} from "@/repositories/tenant-onboarding-types";
import {
  tenantOnboardingRegionMatchRepository,
  tenantOnboardingRepository,
} from "@/repositories/tenant-onboarding";
import type {
  ApproveTenantOnboardingApplicationInput,
  RejectTenantOnboardingApplicationInput,
  RequestSupplementTenantOnboardingApplicationInput,
  RequestTenantOnboardingPartnerAssistInput,
  StartReviewTenantOnboardingApplicationInput,
  TenantOnboardingApplicationListQuery,
  TenantOnboardingNotificationListQuery,
  TenantOnboardingReviewListQuery,
} from "@/schema/tenant-onboarding";
import type { AuthContext } from "@/services/authorization";
import { resolveSignedStoredFileUrl } from "@/services/files/file-url-resolver";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import {
  isTenantOnboardingPartnerEligibleForDecision,
  TenantOnboardingRegionMatchService,
} from "@/services/tenant-onboarding-region-match";
import { tenantOnboardingNotificationsService } from "@/services/tenant-onboarding-notifications";
import type {
  ApprovalRepositoryPort,
  AuditLogServicePort,
  InviteCodeRepositoryPort,
  NotificationRepositoryPort,
  NotificationServicePort,
  RegionResolverPort,
  ReviewRepositoryPort,
  SignedUrlResolver,
  TenantOnboardingReviewServiceDependencies,
  TenantSlugGenerator,
} from "@/services/tenant-onboarding-review-ports";
import {
  approvedAttribution,
  applicationNotFoundError,
  auditSummary,
  defaultTenantSlug,
  documentForbiddenError,
  LICENSE_TTL_SECONDS,
  MAX_SLUG_ATTEMPTS,
  normalizePage,
  normalizePageSize,
  partnerAmbiguousError,
  partnerUnavailableError,
  REVIEW_PERMISSION,
  REVIEW_RESOURCE_TYPE,
  reviewForbiddenError,
  stateConflictError,
  tenantSlugConflictError,
  throwApprovalStatus,
} from "@/services/tenant-onboarding-review-support";

export class TenantOnboardingReviewService {
  private readonly repository: ReviewRepositoryPort;
  private readonly approvalRepository: ApprovalRepositoryPort;
  private readonly notificationRepository: NotificationRepositoryPort;
  private readonly notificationService: NotificationServicePort;
  private readonly inviteCodeRepository: InviteCodeRepositoryPort;
  private readonly regionResolver: RegionResolverPort;
  private readonly auditLogService: AuditLogServicePort;
  private readonly signedUrlResolver: SignedUrlResolver;
  private readonly clock: () => Date;
  private readonly tenantSlugGenerator: TenantSlugGenerator;

  constructor(dependencies: TenantOnboardingReviewServiceDependencies = {}) {
    this.repository = dependencies.repository ?? tenantOnboardingReviewRepository;
    this.approvalRepository = dependencies.approvalRepository ??
      tenantOnboardingRepository;
    this.notificationRepository = dependencies.notificationRepository ??
      tenantOnboardingNotificationsRepository;
    this.notificationService = dependencies.notificationService ??
      tenantOnboardingNotificationsService;
    this.inviteCodeRepository = dependencies.inviteCodeRepository ??
      tenantOnboardingRegionMatchRepository;
    this.regionResolver = dependencies.regionResolver ??
      new TenantOnboardingRegionMatchService({
        administrativeAreaRepository: tenantOnboardingRegionMatchRepository,
        partnerRepository: tenantOnboardingRegionMatchRepository,
      });
    this.auditLogService = dependencies.auditLogService ?? platformAuditLogService;
    this.signedUrlResolver = dependencies.resolveSignedStoredFileUrl ??
      resolveSignedStoredFileUrl;
    this.clock = dependencies.clock ?? (() => new Date());
    this.tenantSlugGenerator = dependencies.tenantSlugGenerator ??
      defaultTenantSlug;
  }

  async list(authContext: AuthContext, query: TenantOnboardingApplicationListQuery) {
    this.assertReviewPermission(authContext);
    return this.repository.listApplications({
      ...query,
      page: normalizePage(query.page),
      pageSize: normalizePageSize(query.pageSize),
      keyword: query.keyword?.trim() || undefined,
    });
  }

  async get(authContext: AuthContext, applicationId: string) {
    this.assertReviewPermission(authContext);
    return this.requireApplication(applicationId);
  }

  async listReviews(
    authContext: AuthContext,
    applicationId: string,
    query: TenantOnboardingReviewListQuery,
  ) {
    this.assertReviewPermission(authContext);
    await this.requireApplication(applicationId);
    return this.repository.listReviews({
      applicationId,
      page: normalizePage(query.page),
      pageSize: normalizePageSize(query.pageSize),
    });
  }

  async listNotifications(
    authContext: AuthContext,
    applicationId: string,
    query: TenantOnboardingNotificationListQuery,
  ) {
    this.assertReviewPermission(authContext);
    await this.requireApplication(applicationId);
    return this.notificationRepository.listByApplication({
      applicationId,
      page: normalizePage(query.page),
      pageSize: normalizePageSize(query.pageSize),
    });
  }

  async startReview(
    authContext: AuthContext,
    applicationId: string,
    input: StartReviewTenantOnboardingApplicationInput,
  ) {
    const employeeId = this.requireReviewer(authContext);
    const result = await this.repository.startReviewAtomic({
      applicationId,
      expectedVersion: input.version,
      reviewerEmployeeId: employeeId,
      now: this.clock().toISOString(),
    });
    const mutation = this.requireMutation(result);
    if (!mutation.idempotent) {
      await this.audit(authContext, mutation.application, "tenant_onboarding_start_review", {
        version: mutation.application.version,
      });
    }
    return mutation;
  }

  async requestSupplement(
    authContext: AuthContext,
    applicationId: string,
    input: RequestSupplementTenantOnboardingApplicationInput,
  ) {
    const employeeId = this.requireReviewer(authContext);
    const mutation = this.requireMutation(
      await this.repository.requestSupplementAtomic({
        applicationId,
        expectedVersion: input.version,
        reviewerEmployeeId: employeeId,
        requiredFields: [...input.required_fields],
        remark: input.remark.trim(),
        now: this.clock().toISOString(),
      }),
    );
    await this.audit(
      authContext,
      mutation.application,
      "tenant_onboarding_request_supplement",
      { version: mutation.application.version, required_fields: input.required_fields },
    );
    const delivery = await this.safeDeliver({
      applicationId,
      applicationVersion: mutation.application.version,
      eventType: "supplement_required",
    });
    return { application: mutation.application, notification_delivery: delivery };
  }

  async requestPartnerAssist(
    authContext: AuthContext,
    applicationId: string,
    input: RequestTenantOnboardingPartnerAssistInput,
  ) {
    const employeeId = this.requireReviewer(authContext);
    const application = await this.requireApplication(applicationId);
    if (["approved", "rejected", "withdrawn"].includes(application.status)) {
      throw stateConflictError();
    }
    const resolution = await this.resolveFreshPartner(application);
    if (!isTenantOnboardingPartnerEligibleForDecision(resolution, input.partner_id)) {
      throw partnerUnavailableError();
    }
    const mutation = this.requireMutation(
      await this.repository.requestPartnerAssistAtomic({
        applicationId,
        expectedVersion: input.version,
        reviewerEmployeeId: employeeId,
        partnerId: input.partner_id,
        candidateSnapshot: {
          partner_id: input.partner_id,
          eligible_partner_ids: [...resolution.partnerIds],
          match_reason: "platform_manual_assist",
        },
        remark: input.remark?.trim() || null,
        now: this.clock().toISOString(),
      }),
    );
    await this.audit(
      authContext,
      mutation.application,
      "tenant_onboarding_request_partner_assist",
      {
        version: mutation.application.version,
        candidate_partner_id: input.partner_id,
        assist_due_at: mutation.application.partner_assist_due_at,
      },
    );
    return mutation;
  }

  async reject(
    authContext: AuthContext,
    applicationId: string,
    input: RejectTenantOnboardingApplicationInput,
  ) {
    const employeeId = this.requireReviewer(authContext);
    const mutation = this.requireMutation(await this.repository.rejectAtomic({
      applicationId,
      expectedVersion: input.version,
      reviewerEmployeeId: employeeId,
      remark: input.review_remark.trim(),
      now: this.clock().toISOString(),
    }));
    await this.audit(authContext, mutation.application, "tenant_onboarding_reject", {
      version: mutation.application.version,
    });
    const delivery = await this.safeDeliver({
      applicationId,
      applicationVersion: mutation.application.version,
      eventType: "rejected",
    });
    return { application: mutation.application, notification_delivery: delivery };
  }

  async approve(
    authContext: AuthContext,
    applicationId: string,
    input: ApproveTenantOnboardingApplicationInput,
  ) {
    const employeeId = this.requireReviewer(authContext);
    const application = await this.requireApplication(applicationId);
    if (
      !["submitted", "reviewing", "approved"].includes(application.status)
    ) throw stateConflictError();
    const attribution = application.status === "approved"
      ? approvedAttribution(application)
      : await this.resolveApprovalAttribution(application, input);
    const tenantSlug = application.status === "approved"
      ? this.tenantSlugGenerator(application, 1)
      : await this.findAvailableTenantSlug(application);
    const approval = await this.approvalRepository.approveApplication({
      applicationId,
      expectedVersion: input.version,
      reviewerEmployeeId: employeeId,
      tenantSlug,
      finalPartnerId: attribution.finalPartnerId,
      attributionSourceType: attribution.sourceType,
      reviewRemark: input.review_remark.trim(),
    });
    if (approval.status !== "approved") throwApprovalStatus(approval.status);

    const current = await this.requireApplication(applicationId);
    if (!approval.idempotent) {
      await this.audit(authContext, current, "tenant_onboarding_approve", {
        version: current.version,
        tenant_id: approval.tenant_id,
        binding_id: approval.binding_id,
        profile_id: approval.profile_id,
        final_partner_id: attribution.finalPartnerId,
        attribution_source_type: attribution.sourceType,
      });
    }
    const delivery = approval.idempotent ? null : await this.safeDeliver({
      applicationId,
      applicationVersion: current.version,
      eventType: "approved",
    });
    return { approval, application: current, notification_delivery: delivery };
  }

  async retryNotification(
    authContext: AuthContext,
    applicationId: string,
    deliveryId: string,
  ) {
    this.requireReviewer(authContext);
    const application = await this.requireApplication(applicationId);
    const existing = await this.notificationRepository.findByIdAndApplication(
      deliveryId,
      applicationId,
    );
    if (!existing) throw applicationNotFoundError();
    const delivery = await this.notificationService.retry({
      applicationId,
      deliveryId,
    });
    if (
      delivery && (
        delivery.attempt_count > existing.attempt_count ||
        delivery.status !== existing.status
      )
    ) {
      await this.audit(
        authContext,
        application,
        "tenant_onboarding_notification_retry",
        { delivery_id: delivery.id, delivery_status: delivery.status },
      );
    }
    return delivery;
  }

  async accessLicense(authContext: AuthContext, applicationId: string) {
    this.assertReviewPermission(authContext);
    const record = await this.repository.findLicenseAccessRecord(applicationId);
    if (!record) throw applicationNotFoundError();
    const file = record.file;
    if (
      !file || file.id !== record.business_license_file_id ||
      file.owner_type !== "visitor" ||
      file.owner_visitor_id !== record.visitor_id ||
      file.scene !== "tenant_onboarding_license" ||
      file.provider !== "tencent_cos" || file.visibility !== "private" ||
      file.public_url !== null || file.status !== "active" ||
      file.deleted_at !== null ||
      !file.object_key.startsWith("private/tenant-onboarding-license/visitors/")
    ) throw documentForbiddenError();

    const url = await this.signedUrlResolver(file.object_key, {
      ttlSeconds: LICENSE_TTL_SECONDS,
    });
    return {
      url,
      expires_at: new Date(
        this.clock().getTime() + LICENSE_TTL_SECONDS * 1_000,
      ).toISOString(),
    };
  }

  private async resolveFreshPartner(
    application: TenantOnboardingPlatformApplicationRecord,
  ) {
    const invite = application.invite_code_id
      ? await this.inviteCodeRepository.findActiveInviteCodeById(
        application.invite_code_id,
      )
      : null;
    return this.regionResolver.resolve({
      serviceRegionCodes: application.service_region_codes,
      inviteCode: invite?.code ?? null,
    });
  }

  private async resolveApprovalAttribution(
    application: TenantOnboardingPlatformApplicationRecord,
    input: ApproveTenantOnboardingApplicationInput,
  ) {
    const resolution = await this.resolveFreshPartner(application);
    if (input.attribution_mode === "unassigned") {
      return { finalPartnerId: null, sourceType: null } as const;
    }
    if (input.attribution_mode === "auto") {
      if (resolution.kind === "ambiguous") throw partnerAmbiguousError();
      if (resolution.kind !== "unique" || !resolution.selectedPartner) {
        throw partnerUnavailableError();
      }
      return {
        finalPartnerId: resolution.selectedPartner.id,
        sourceType: resolution.reason === "invite_code"
          ? "invite_code" as const
          : "region_auto_assignment" as const,
      };
    }
    if (
      !input.final_partner_id ||
      !isTenantOnboardingPartnerEligibleForDecision(
        resolution,
        input.final_partner_id,
      )
    ) {
      throw partnerUnavailableError();
    }
    return {
      finalPartnerId: input.final_partner_id,
      sourceType: "platform_manual" as const,
    };
  }

  private async findAvailableTenantSlug(
    application: TenantOnboardingPlatformApplicationRecord,
  ) {
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      const slug = this.tenantSlugGenerator(application, attempt);
      if (!await this.repository.findTenantBySlug(slug)) return slug;
    }
    throw tenantSlugConflictError();
  }

  private requireMutation(result: TenantOnboardingPlatformReviewMutationResult) {
    if (result.status === "updated") return result;
    if (result.status === "application_not_found") throw applicationNotFoundError();
    if (result.status === "partner_unavailable") throw partnerUnavailableError();
    throw stateConflictError();
  }

  private async requireApplication(applicationId: string) {
    const application = await this.repository.findApplicationById(applicationId);
    if (!application) throw applicationNotFoundError();
    return application;
  }

  private assertReviewPermission(authContext: AuthContext) {
    if (
      !authContext.isPlatformAdmin ||
      !authContext.permissions.some((permission) =>
        permission.code === REVIEW_PERMISSION
      )
    ) {
      throw reviewForbiddenError();
    }
  }

  private requireReviewer(authContext: AuthContext) {
    this.assertReviewPermission(authContext);
    if (!authContext.employeeId) throw reviewForbiddenError();
    return authContext.employeeId;
  }

  private async safeDeliver(input: {
    applicationId: string;
    applicationVersion: number;
    eventType: "supplement_required" | "approved" | "rejected";
  }) {
    try {
      return await this.notificationService.deliver(input);
    } catch {
      return null;
    }
  }

  private audit(
    authContext: AuthContext,
    application: TenantOnboardingPlatformApplicationRecord,
    action:
      | "tenant_onboarding_start_review"
      | "tenant_onboarding_request_supplement"
      | "tenant_onboarding_request_partner_assist"
      | "tenant_onboarding_approve"
      | "tenant_onboarding_reject"
      | "tenant_onboarding_notification_retry",
    metadata: Record<string, unknown>,
  ) {
    return this.auditLogService.recordBestEffort({
      action,
      actorEmployeeId: authContext.employeeId,
      actorUserId: authContext.authUserId,
      targetTenantId: application.converted_tenant_id,
      resourceType: REVIEW_RESOURCE_TYPE,
      resourceId: application.id,
      resourceLabel: application.company_name,
      summary: auditSummary(action),
      metadata,
    });
  }

}

export const tenantOnboardingReviewService =
  new TenantOnboardingReviewService();
