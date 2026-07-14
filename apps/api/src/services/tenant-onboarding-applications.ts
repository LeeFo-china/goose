import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import {
  tenantOnboardingApplicantContextRepository,
  tenantOnboardingApplicantFileRepository,
  tenantOnboardingRegionMatchRepository,
  tenantOnboardingRepository,
  type TenantOnboardingActiveInviteCode,
  type TenantOnboardingBusinessLicenseRecord,
  type TenantOnboardingLocationContextRecord,
  type TenantOnboardingSupplementPatch,
} from "@/repositories/tenant-onboarding";
import type { TenantOnboardingApplicationRecord } from "@/repositories/tenant-onboarding-types";
import type { SubmitTenantOnboardingApplicationInput } from "@/schema/tenant-onboarding";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import {
  buildTenantOnboardingCandidateMutation,
  buildTenantOnboardingCreateRecord,
  buildTenantOnboardingSupplementPatch,
  haveSameTenantOnboardingRegionSet,
  type TenantOnboardingApplicantPatch,
} from "@/services/tenant-onboarding-applicant-payloads";
import {
  TenantOnboardingRegionMatchService,
  type TenantOnboardingPartnerResolution,
} from "@/services/tenant-onboarding-region-match";
import { tenantOnboardingNotificationsService } from "@/services/tenant-onboarding-notifications";
import { resolveTenantOnboardingSubmissionPartner } from "@/services/tenant-onboarding-submission-resolution";

const SMS_SCENE = "tenant_onboarding_application" as const;
const REVIEW_HOURS = 48;
const MAX_APPLICATION_NUMBER_ATTEMPTS = 3;
const MAX_IDEMPOTENCY_KEY_LENGTH = 120;
const OPEN_SUBJECT_CONSTRAINT = "tenant_onboarding_applications_open_subject_unique_idx";
const IDEMPOTENCY_CONSTRAINT = "tenant_onboarding_applications_visitor_idempotency_unique";
const APPLICATION_NUMBER_CONSTRAINT = "tenant_onboarding_applications_application_no_key";
const WITHDRAWABLE_STATUSES = new Set(["submitted", "reviewing", "supplement_required"]);

type RepositoryPort = Pick<
  typeof tenantOnboardingRepository,
  | "createApplicationAtomic"
  | "findByVisitorAndIdempotencyKey"
  | "findOpenByCreditCode"
  | "findOwnedById"
  | "listOwned"
  | "supplementAtomic"
  | "withdrawAtomic"
>;

type SmsPort = {
  sendCode(input: {
    phone: string;
    scene: typeof SMS_SCENE;
    requestIp: string | null;
    requestDevice?: string | null;
  }): Promise<unknown>;
  findValidPending(input: {
    phone: string;
    scene: typeof SMS_SCENE;
    code: string;
  }): Promise<{ id: string } | null>;
};

type LocationContextPort = { findById(id: string): Promise<TenantOnboardingLocationContextRecord | null> };
type FilePort = { findById(id: string): Promise<TenantOnboardingBusinessLicenseRecord | null> };

type RegionResolverPort = {
  resolve(input: {
    serviceRegionCodes: readonly string[];
    inviteCode: string | null;
  }): Promise<TenantOnboardingPartnerResolution>;
};
type InviteCodePort = {
  findActiveInviteCodeByCode(code: string): Promise<TenantOnboardingActiveInviteCode | null>;
  findActiveInviteCodeById(id: string): Promise<TenantOnboardingActiveInviteCode | null>;
};

type NotificationPort = {
  deliver(input: {
    applicationId: string;
    applicationVersion: number;
    eventType: "submitted";
  }): Promise<unknown>;
};

type Dependencies = {
  repository?: RepositoryPort;
  smsService?: SmsPort;
  locationContextRepository?: LocationContextPort;
  fileRepository?: FilePort;
  regionResolver?: RegionResolverPort;
  inviteCodeRepository?: InviteCodePort;
  notificationService?: NotificationPort;
  clock?: () => Date;
  applicationNumberGenerator?: () => string;
};

export type { TenantOnboardingApplicantPatch } from "@/services/tenant-onboarding-applicant-payloads";

type SubmitContext = { visitorId: string; idempotencyKey: string };
export class TenantOnboardingApplicationsService {
  private readonly repository: RepositoryPort;
  private readonly smsService: SmsPort;
  private readonly locationContextRepository: LocationContextPort;
  private readonly fileRepository: FilePort;
  private readonly regionResolver: RegionResolverPort;
  private readonly inviteCodeRepository: InviteCodePort;
  private readonly notificationService: NotificationPort;
  private readonly clock: () => Date;
  private readonly applicationNumberGenerator: () => string;
  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? tenantOnboardingRepository;
    this.smsService = dependencies.smsService ?? smsVerificationCodeService;
    this.locationContextRepository = dependencies.locationContextRepository ??
      tenantOnboardingApplicantContextRepository;
    this.fileRepository = dependencies.fileRepository ??
      tenantOnboardingApplicantFileRepository;
    this.regionResolver = dependencies.regionResolver ??
      new TenantOnboardingRegionMatchService({
        administrativeAreaRepository: tenantOnboardingRegionMatchRepository,
        partnerRepository: tenantOnboardingRegionMatchRepository,
      });
    this.inviteCodeRepository = dependencies.inviteCodeRepository ??
      tenantOnboardingRegionMatchRepository;
    this.notificationService = dependencies.notificationService ??
      tenantOnboardingNotificationsService;
    this.clock = dependencies.clock ?? (() => new Date());
    this.applicationNumberGenerator = dependencies.applicationNumberGenerator ??
      (() => this.buildApplicationNumber());
  }
  sendCode(input: {
    phone: string;
    requestIp: string | null;
    requestDevice: string | null;
  }) {
    return this.smsService.sendCode({
      phone: input.phone.trim(),
      scene: SMS_SCENE,
      requestIp: input.requestIp,
      requestDevice: input.requestDevice?.trim() || null,
    });
  }
  async submit(
    input: SubmitTenantOnboardingApplicationInput,
    context: SubmitContext,
  ) {
    const visitorId = this.requireVisitorId(context.visitorId);
    const idempotencyKey = this.requireIdempotencyKey(context.idempotencyKey);
    const existing = await this.repository.findByVisitorAndIdempotencyKey(
      visitorId,
      idempotencyKey,
    );
    if (existing) return this.response(existing, false, true);

    const phone = input.admin_phone.trim();
    const normalizedCreditCode = input.unified_social_credit_code.trim().toUpperCase();
    const verificationCode = await this.verifySmsCode(phone, input.sms_code);
    await this.assertOwnedLocationContext(input.visitor_context_id, visitorId);
    await this.assertPrivateBusinessLicense(
      input.business_license_file_id,
      visitorId,
    );
    await this.assertNoOpenSubject(normalizedCreditCode);
    const { resolution, inviteCodeId } = await resolveTenantOnboardingSubmissionPartner({
      serviceRegionCodes: input.service_region_codes,
      submittedInviteCode: input.invite_code,
      sourceChannel: input.source_channel,
      inviteCodeRepository: this.inviteCodeRepository,
      regionResolver: this.regionResolver,
    });
    const result = await this.createApplicationWithRetry({
      input,
      visitorId,
      idempotencyKey,
      normalizedCreditCode,
      phone,
      resolution,
      inviteCodeId,
      smsCodeId: verificationCode.id,
    });
    const application = result.application;
    if (!result.created) return this.response(application, false, true);
    try {
      await this.notificationService.deliver({
        applicationId: application.id,
        applicationVersion: application.version,
        eventType: "submitted",
      });
    } catch {
      // Application persistence and SMS consumption are already committed.
    }
    return this.response(application, true, false);
  }
  async listOwned(input: { visitorId: string; page?: number; pageSize?: number }) {
    const visitorId = this.requireVisitorId(input.visitorId);
    return await this.repository.listOwned({
      visitorId,
      page: input.page ?? 1,
      pageSize: Math.min(input.pageSize ?? 20, 100),
    });
  }
  async getOwned(input: { applicationId: string; visitorId: string }) {
    return this.requireOwnedApplication(
      input.applicationId,
      this.requireVisitorId(input.visitorId),
    );
  }
  async supplement(input: {
    applicationId: string;
    visitorId: string;
    expectedVersion: number;
    patch: TenantOnboardingApplicantPatch;
  }) {
    const visitorId = this.requireVisitorId(input.visitorId);
    const current = await this.requireOwnedApplication(input.applicationId, visitorId);
    if (current.status !== "supplement_required") {
      throw Errors.business(
        409,
        "当前申请状态不允许补充资料",
        ErrorCodes.TENANT_ONBOARDING_SUPPLEMENT_NOT_ALLOWED,
      );
    }
    if (current.version !== input.expectedVersion) throw this.stateConflict();
    if (input.patch.business_license_file_id) {
      await this.assertPrivateBusinessLicense(
        input.patch.business_license_file_id,
        visitorId,
      );
    }

    const patch = buildTenantOnboardingSupplementPatch(input.patch);
    if (patch.unified_social_credit_code && await this.repository.findOpenByCreditCode(
      patch.unified_social_credit_code,
      input.applicationId,
    )) throw this.duplicatedApplication();

    const candidate = await this.resolveSupplementCandidate(current, patch);
    let updated: TenantOnboardingApplicationRecord | null;
    try {
      updated = await this.repository.supplementAtomic({
        applicationId: input.applicationId,
        visitorId,
        expectedVersion: input.expectedVersion,
        patch,
        candidate,
        now: this.clock().toISOString(),
      });
    } catch (error) {
      if (this.matchesConstraint(error, OPEN_SUBJECT_CONSTRAINT)) {
        throw this.duplicatedApplication();
      }
      throw error;
    }
    if (!updated) throw this.stateConflict();
    return updated;
  }
  async withdraw(input: {
    applicationId: string;
    visitorId: string;
    expectedVersion: number;
    reason?: string;
  }) {
    const visitorId = this.requireVisitorId(input.visitorId);
    const current = await this.requireOwnedApplication(input.applicationId, visitorId);
    if (
      !WITHDRAWABLE_STATUSES.has(current.status) ||
      current.version !== input.expectedVersion
    ) {
      throw this.stateConflict();
    }
    const updated = await this.repository.withdrawAtomic({
      applicationId: input.applicationId,
      visitorId,
      expectedVersion: input.expectedVersion,
      reason: input.reason?.trim() || null,
      now: this.clock().toISOString(),
    });
    if (!updated) throw this.stateConflict();
    return updated;
  }
  private async verifySmsCode(phone: string, code: string) {
    const verificationCode = await this.smsService.findValidPending({
      phone,
      scene: SMS_SCENE,
      code: code.trim(),
    });
    if (!verificationCode) {
      throw Errors.business(400, "验证码错误或已过期", "SMS_CODE_INVALID");
    }
    return verificationCode;
  }
  private async assertOwnedLocationContext(contextId: string, visitorId: string) {
    const context = await this.locationContextRepository.findById(contextId);
    if (!context || context.visitor_id !== visitorId) {
      throw this.applicationNotFound();
    }
  }
  private async assertPrivateBusinessLicense(fileId: string, visitorId: string) {
    const file = await this.fileRepository.findById(fileId);
    if (
      !file || file.owner_type !== "visitor" ||
      file.owner_visitor_id !== visitorId || file.status !== "active" ||
      file.visibility !== "private" || file.scene !== "tenant_onboarding_license" ||
      file.deleted_at !== null || file.public_url !== null
    ) {
      throw Errors.business(
        403,
        "营业执照文件不可用于当前申请",
        ErrorCodes.TENANT_ONBOARDING_DOCUMENT_FORBIDDEN,
      );
    }
  }
  private async assertNoOpenSubject(normalizedCreditCode: string) {
    if (await this.repository.findOpenByCreditCode(normalizedCreditCode)) {
      throw this.duplicatedApplication();
    }
  }
  private async recoverConcurrentCreate(
    error: unknown,
    visitorId: string,
    idempotencyKey: string,
  ) {
    const isIdempotency = this.matchesConstraint(error, IDEMPOTENCY_CONSTRAINT);
    const isOpenSubject = this.matchesConstraint(error, OPEN_SUBJECT_CONSTRAINT);
    if (!isIdempotency && !isOpenSubject) return null;
    const existing = await this.repository.findByVisitorAndIdempotencyKey(
      visitorId,
      idempotencyKey,
    );
    if (existing) return existing;
    if (isOpenSubject) throw this.duplicatedApplication();
    return null;
  }
  private async createApplicationWithRetry(input: {
    input: SubmitTenantOnboardingApplicationInput;
    visitorId: string;
    idempotencyKey: string;
    normalizedCreditCode: string;
    phone: string;
    resolution: TenantOnboardingPartnerResolution;
    inviteCodeId: string | null;
    smsCodeId: string;
  }) {
    for (let attempt = 1; attempt <= MAX_APPLICATION_NUMBER_ATTEMPTS; attempt += 1) {
      try {
        return await this.repository.createApplicationAtomic({
          application: buildTenantOnboardingCreateRecord({
            ...input,
            applicationNumber: this.applicationNumberGenerator(),
            now: this.clock(),
          }),
          smsCodeId: input.smsCodeId,
          smsPhone: input.phone,
          now: this.clock().toISOString(),
        });
      } catch (error) {
        if (
          this.matchesConstraint(error, APPLICATION_NUMBER_CONSTRAINT) &&
          attempt < MAX_APPLICATION_NUMBER_ATTEMPTS
        ) continue;
        const recovered = await this.recoverConcurrentCreate(
          error,
          input.visitorId,
          input.idempotencyKey,
        );
        if (recovered) return { application: recovered, created: false };
        throw error;
      }
    }
    throw Errors.dbError("生成装企入驻申请编号失败");
  }

  private async resolveSupplementCandidate(
    current: TenantOnboardingApplicationRecord,
    patch: TenantOnboardingSupplementPatch,
  ) {
    if (
      !patch.service_region_codes ||
      haveSameTenantOnboardingRegionSet(
        current.service_region_codes,
        patch.service_region_codes,
      )
    ) {
      return buildTenantOnboardingCandidateMutation(false, null, this.clock());
    }
    const invite = current.invite_code_id
      ? await this.inviteCodeRepository.findActiveInviteCodeById(current.invite_code_id)
      : null;
    const resolution = await this.regionResolver.resolve({
      serviceRegionCodes: patch.service_region_codes,
      inviteCode: invite?.code ?? null,
    });
    return buildTenantOnboardingCandidateMutation(true, resolution, this.clock());
  }
  private matchesConstraint(error: unknown, constraint: string) {
    const details = this.databaseErrorDetails(error);
    if (!details || details.code !== "23505") return false;
    return details.constraint === constraint ||
      [details.message, details.details].some((value) =>
        typeof value === "string" && value.includes(constraint)
      );
  }
  private databaseErrorDetails(error: unknown): Record<string, unknown> | null {
    if (typeof error !== "object" || error === null) return null;
    const record = error as Record<string, unknown>;
    const details = record.details;
    return typeof details === "object" && details !== null
      ? details as Record<string, unknown>
      : record;
  }
  private async requireOwnedApplication(applicationId: string, visitorId: string) {
    const application = await this.repository.findOwnedById(applicationId, visitorId);
    if (!application) throw this.applicationNotFound();
    return application;
  }
  private response(
    application: TenantOnboardingApplicationRecord,
    created: boolean,
    idempotent: boolean,
  ) {
    return {
      application,
      next_action: "wait_for_review" as const,
      estimated_review_hours: REVIEW_HOURS,
      created,
      idempotent,
    };
  }

  private requireVisitorId(value: string) {
    const visitorId = value?.trim();
    if (!visitorId) throw Errors.unauthorized("需要 visitor 登录态");
    return visitorId;
  }

  private requireIdempotencyKey(value: string) {
    const key = value?.trim();
    if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw Errors.business(
        400,
        "缺少有效的 Idempotency-Key",
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    return key;
  }

  private applicationNotFound() {
    return Errors.business(404, "装企入驻申请不存在", ErrorCodes.TENANT_ONBOARDING_APPLICATION_NOT_FOUND);
  }

  private duplicatedApplication() {
    return Errors.business(409, "该企业已有待处理的入驻申请", ErrorCodes.TENANT_ONBOARDING_APPLICATION_DUPLICATED);
  }

  private stateConflict() {
    return Errors.business(409, "申请状态或版本已变化，请刷新后重试", ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT);
  }

  private buildApplicationNumber() {
    const date = this.clock().toISOString().slice(0, 10).replaceAll("-", "");
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ZQ-${date}-${suffix}`;
  }
}

export const tenantOnboardingApplicationsService =
  new TenantOnboardingApplicationsService();
