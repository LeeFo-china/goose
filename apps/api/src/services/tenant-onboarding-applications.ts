import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import {
  tenantOnboardingApplicantContextRepository,
  tenantOnboardingApplicantFileRepository,
  tenantOnboardingRegionMatchRepository,
  tenantOnboardingRepository,
  type TenantOnboardingBusinessLicenseRecord,
  type TenantOnboardingCreateApplicationInput,
  type TenantOnboardingLocationContextRecord,
  type TenantOnboardingReviewEventInput,
  type TenantOnboardingSupplementPatch,
} from "@/repositories/tenant-onboarding";
import type { TenantOnboardingApplicationRecord } from "@/repositories/tenant-onboarding-types";
import type { SubmitTenantOnboardingApplicationInput } from "@/schema/tenant-onboarding";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import {
  TenantOnboardingRegionMatchService,
  type TenantOnboardingPartnerResolution,
} from "@/services/tenant-onboarding-region-match";
import { tenantOnboardingNotificationsService } from "@/services/tenant-onboarding-notifications";

const SMS_SCENE = "partner_tenant_onboarding" as const;
const REVIEW_HOURS = 48;
const MAX_IDEMPOTENCY_KEY_LENGTH = 120;
const OPEN_SUBJECT_CONSTRAINT = "tenant_onboarding_applications_open_subject_unique_idx";
const IDEMPOTENCY_CONSTRAINT = "tenant_onboarding_applications_visitor_idempotency_unique";
const WITHDRAWABLE_STATUSES = new Set(["submitted", "reviewing", "supplement_required"]);

type RepositoryPort = typeof tenantOnboardingRepository;

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
  markVerified(id: string): Promise<unknown>;
};

type LocationContextPort = { findById(id: string): Promise<TenantOnboardingLocationContextRecord | null> };
type FilePort = { findById(id: string): Promise<TenantOnboardingBusinessLicenseRecord | null> };

type RegionResolverPort = {
  resolve(input: {
    serviceRegionCodes: readonly string[];
    inviteCode: string | null;
  }): Promise<TenantOnboardingPartnerResolution>;
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
  notificationService?: NotificationPort;
  clock?: () => Date;
  applicationNumberGenerator?: () => string;
};

export type TenantOnboardingApplicantPatch = TenantOnboardingSupplementPatch & {
  company_location?: SubmitTenantOnboardingApplicationInput["company_location"];
};

type SubmitContext = { visitorId: string; idempotencyKey: string };
export class TenantOnboardingApplicationsService {
  private readonly repository: RepositoryPort;
  private readonly smsService: SmsPort;
  private readonly locationContextRepository: LocationContextPort;
  private readonly fileRepository: FilePort;
  private readonly regionResolver: RegionResolverPort;
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
    const resolution = await this.regionResolver.resolve({
      serviceRegionCodes: input.service_region_codes,
      inviteCode: input.invite_code?.trim().toUpperCase() || null,
    });
    let application: TenantOnboardingApplicationRecord;
    try {
      application = await this.repository.createApplication(
        this.buildCreateRecord({
          input,
          visitorId,
          idempotencyKey,
          normalizedCreditCode,
          phone,
          resolution,
        }),
      );
    } catch (error) {
      const recovered = await this.recoverConcurrentCreate(
        error,
        visitorId,
        idempotencyKey,
      );
      if (recovered) return this.response(recovered, false, true);
      throw error;
    }

    await this.smsService.markVerified(verificationCode.id);
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

    const updated = await this.repository.updateSupplement({
      applicationId: input.applicationId,
      visitorId,
      expectedVersion: input.expectedVersion,
      patch: this.buildSupplementPatch(input.patch),
    });
    if (!updated) throw this.stateConflict();
    await this.repository.appendReviewEvent(this.applicantReview({
      applicationId: input.applicationId,
      visitorId,
      decision: "supplemented",
      before: current,
      after: updated,
      remark: null,
    }));
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
    const updated = await this.repository.withdraw({
      applicationId: input.applicationId,
      visitorId,
      expectedVersion: input.expectedVersion,
    });
    if (!updated) throw this.stateConflict();
    await this.repository.appendReviewEvent(this.applicantReview({
      applicationId: input.applicationId,
      visitorId,
      decision: "withdrawn",
      before: current,
      after: updated,
      remark: input.reason?.trim() || null,
    }));
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
      !file || file.owner_visitor_id !== visitorId || file.status !== "active" ||
      file.visibility !== "private" || file.scene !== "tenant_onboarding_license" ||
      file.deleted_at !== null
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
  private buildCreateRecord(input: {
    input: SubmitTenantOnboardingApplicationInput;
    visitorId: string;
    idempotencyKey: string;
    normalizedCreditCode: string;
    phone: string;
    resolution: TenantOnboardingPartnerResolution;
  }): TenantOnboardingCreateApplicationInput {
    const now = this.clock();
    const isUnique = input.resolution.kind === "unique";
    const selectedPartner = input.resolution.selectedPartner;
    return {
      application_no: this.applicationNumberGenerator(),
      visitor_id: input.visitorId,
      visitor_context_id: input.input.visitor_context_id,
      company_name: input.input.company_name.trim(),
      unified_social_credit_code: input.normalizedCreditCode,
      business_license_file_id: input.input.business_license_file_id,
      admin_name: input.input.admin_name.trim(),
      admin_phone: input.phone,
      address_province: input.input.company_location.province ?? null,
      address_city: input.input.company_location.city,
      address_district: input.input.company_location.district ?? null,
      address_region_code: input.input.company_location.region_code,
      address: input.input.company_location.address,
      address_latitude: input.input.company_location.latitude ?? null,
      address_longitude: input.input.company_location.longitude ?? null,
      service_region_codes: [...input.input.service_region_codes],
      source_channel: input.input.source_channel,
      invite_code_id: null,
      candidate_partner_id: selectedPartner?.id ?? null,
      candidate_match_reason: input.resolution.reason,
      candidate_snapshot: selectedPartner
        ? {
          partner_id: selectedPartner.id,
          partner_name: selectedPartner.name,
          region_codes: [...selectedPartner.region_codes],
          match_reason: input.resolution.reason,
        }
        : {
          partner_ids: [...input.resolution.partnerIds],
          match_reason: input.resolution.reason,
        },
      final_partner_id: null,
      attribution_source_type: null,
      status: "submitted",
      partner_assist_status: isUnique ? "pending" : "not_applicable",
      partner_assist_requested_at: isUnique ? now.toISOString() : null,
      partner_assist_due_at: isUnique
        ? new Date(now.getTime() + REVIEW_HOURS * 60 * 60 * 1000).toISOString()
        : null,
      privacy_policy_version: input.input.privacy_policy_version,
      onboarding_terms_version: input.input.onboarding_terms_version,
      consented_at: now.toISOString(),
      idempotency_key: input.idempotencyKey,
    };
  }
  private buildSupplementPatch(
    patch: TenantOnboardingApplicantPatch,
  ): TenantOnboardingSupplementPatch {
    const result: TenantOnboardingSupplementPatch = {};
    if (patch.company_name !== undefined) result.company_name = patch.company_name.trim();
    if (patch.unified_social_credit_code !== undefined) {
      result.unified_social_credit_code =
        patch.unified_social_credit_code.trim().toUpperCase();
    }
    if (patch.business_license_file_id !== undefined) {
      result.business_license_file_id = patch.business_license_file_id;
    }
    if (patch.admin_name !== undefined) result.admin_name = patch.admin_name.trim();
    if (patch.service_region_codes !== undefined) {
      result.service_region_codes = [...patch.service_region_codes];
    }
    const location = patch.company_location;
    if (location) {
      result.address_province = location.province ?? null;
      result.address_city = location.city;
      result.address_district = location.district ?? null;
      result.address_region_code = location.region_code;
      result.address = location.address;
      result.address_latitude = location.latitude ?? null;
      result.address_longitude = location.longitude ?? null;
    }
    return result;
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
  private applicantReview(input: {
    applicationId: string;
    visitorId: string;
    decision: string;
    before: TenantOnboardingApplicationRecord;
    after: TenantOnboardingApplicationRecord;
    remark: string | null;
  }): TenantOnboardingReviewEventInput {
    return {
      application_id: input.applicationId,
      review_stage: "applicant",
      decision: input.decision,
      actor_type: "visitor",
      actor_visitor_id: input.visitorId,
      actor_employee_id: null,
      actor_partner_member_id: null,
      before_status: input.before.status,
      after_status: input.after.status,
      before_partner_assist_status: input.before.partner_assist_status,
      after_partner_assist_status: input.after.partner_assist_status,
      required_fields: [],
      remark: input.remark,
      metadata: { version: input.after.version },
    };
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
