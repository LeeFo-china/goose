import { Errors } from "@/errors/error-factory";
import {
  platformPartnerApplicationsRepository,
  type PlatformPartnerApplicationApprovedRecordInput,
  type PlatformPartnerApplicationCreateRecordInput,
  type PlatformPartnerApplicationRecord,
  type PlatformPartnerApplicationStatusRecordInput,
} from "@/repositories/platform-partner-applications";
import {
  platformPartnersRepository,
  type PlatformPartnerCreateRecordInput,
  type PlatformPartnerMemberCreateRecordInput,
} from "@/repositories/platform-partners";
import type {
  ApprovePlatformPartnerApplicationInput,
  PlatformPartnerApplicationListQuery,
  SubmitPlatformPartnerApplicationInput,
  UpdatePlatformPartnerApplicationStatusInput,
} from "@/schema/platform-partner-applications";
import type { AuthContext } from "@/services/authorization";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";

type PlatformPartnerApplicationsRepositoryPort = Pick<
  typeof platformPartnerApplicationsRepository,
  | "createApplication"
  | "findActiveApplicationByPhone"
  | "listApplications"
  | "findApplicationById"
  | "updateApplicationStatus"
  | "markApplicationApproved"
>;

type PlatformPartnersRepositoryPort = Pick<
  typeof platformPartnersRepository,
  "createPartner" | "createPartnerMember"
>;

type PlatformPartnerApplicationsServiceDependencies = {
  applicationRepository?: PlatformPartnerApplicationsRepositoryPort;
  partnerRepository?: PlatformPartnersRepositoryPort;
  smsService?: Pick<
    typeof smsVerificationCodeService,
    "sendCode" | "findValidPending" | "markVerified"
  >;
};

const PARTNER_MANAGE_PERMISSION = "platform.partner.manage";
const DEFAULT_SOURCE_CHANNEL = "official_website";
const MINI_PROGRAM_SOURCE_CHANNEL = "mini_program";
const PARTNER_APPLICATION_SMS_SCENE = "partner_application";

export class PlatformPartnerApplicationsService {
  private readonly applicationRepository: PlatformPartnerApplicationsRepositoryPort;
  private readonly partnerRepository: PlatformPartnersRepositoryPort;
  private readonly smsService: Pick<
    typeof smsVerificationCodeService,
    "sendCode" | "findValidPending" | "markVerified"
  >;

  constructor(
    dependencies: PlatformPartnerApplicationsServiceDependencies = {},
  ) {
    this.applicationRepository =
      dependencies.applicationRepository ?? platformPartnerApplicationsRepository;
    this.partnerRepository =
      dependencies.partnerRepository ?? platformPartnersRepository;
    this.smsService = dependencies.smsService ?? smsVerificationCodeService;
  }

  async sendPublicApplicationCode(input: {
    phone: string;
    requestIp: string | null;
    requestDevice?: string | null;
  }) {
    const phone = input.phone.trim();
    const requestDevice = input.requestDevice?.trim() || null;
    await this.assertNoActiveApplicationByPhone(phone);

    return this.smsService.sendCode({
      phone,
      scene: PARTNER_APPLICATION_SMS_SCENE,
      // A stable first-party device keeps phone+device cooldowns independent
      // without grouping every website visitor under the BFF's shared IP.
      requestIp: requestDevice ? null : input.requestIp,
      requestDevice,
    });
  }

  async submitPublicApplication(input: SubmitPlatformPartnerApplicationInput) {
    const phone = input.phone.trim();
    await this.assertNoActiveApplicationByPhone(phone);
    if (this.requiresSmsVerification(input)) {
      await this.verifyApplicationSmsCode({
        phone,
        code: input.sms_code,
      });
    }

    return this.applicationRepository.createApplication({
      application_no: this.buildApplicationNo(),
      applicant_name: input.applicant_name.trim(),
      subject_type: input.subject_type,
      contact_name: input.contact_name.trim(),
      phone,
      region_codes: input.region_codes,
      region_name: input.region_name ?? null,
      business_description: input.business_description ?? null,
      resource_description: input.resource_description ?? null,
      message: input.message ?? null,
      source_channel: input.source_channel || DEFAULT_SOURCE_CHANNEL,
      source_url: input.source_url ?? null,
      utm_source: input.utm_source ?? null,
      utm_medium: input.utm_medium ?? null,
      utm_campaign: input.utm_campaign ?? null,
      status: "submitted",
      metadata: {},
    } satisfies PlatformPartnerApplicationCreateRecordInput);
  }

  async listApplications(
    authContext: AuthContext,
    query: PlatformPartnerApplicationListQuery,
  ) {
    this.assertPlatformAdmin(authContext);
    return this.applicationRepository.listApplications({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      keyword: query.keyword,
      region_code: query.region_code,
    });
  }

  async getApplication(authContext: AuthContext, applicationId: string) {
    this.assertPlatformAdmin(authContext);
    return this.requireApplication(applicationId);
  }

  async updateApplicationStatus(
    authContext: AuthContext,
    applicationId: string,
    input: UpdatePlatformPartnerApplicationStatusInput,
  ) {
    this.assertCanManagePartners(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const application = await this.requireApplication(applicationId);
    if (application.status === "approved") {
      throw Errors.business(
        409,
        "已通过申请不能再修改审核状态",
        "PARTNER_APPLICATION_ALREADY_APPROVED",
      );
    }

    return this.applicationRepository.updateApplicationStatus(
      applicationId,
      {
        status: input.status,
        reviewed_by_employee_id: employeeId,
        review_remark: input.review_remark ?? null,
      } satisfies PlatformPartnerApplicationStatusRecordInput,
    );
  }

  async approveApplication(
    authContext: AuthContext,
    applicationId: string,
    input: ApprovePlatformPartnerApplicationInput,
  ) {
    this.assertCanManagePartners(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const application = await this.requireApplication(applicationId);

    if (application.converted_partner_id && application.converted_partner) {
      return {
        application,
        partner: application.converted_partner,
        created: false,
        idempotent: true,
      };
    }

    if (application.status === "rejected") {
      throw Errors.business(
        409,
        "已驳回申请不能直接通过",
        "PARTNER_APPLICATION_REJECTED",
      );
    }

    const reviewRemark = input.review_remark ?? "官网申请审核通过";
    const partner = await this.partnerRepository.createPartner({
      name: input.partner_name ?? application.applicant_name,
      subject_type: application.subject_type,
      contact_name: application.contact_name,
      phone: application.phone,
      status: "active",
      level_id: input.level_id,
      region_codes: input.region_codes?.length
        ? input.region_codes
        : application.region_codes,
      contract_status: "pending",
      settlement_account_status: "pending",
      settlement_account: {},
      remark: reviewRemark,
      created_by_employee_id: employeeId,
      updated_by_employee_id: employeeId,
    } satisfies PlatformPartnerCreateRecordInput);

    await this.partnerRepository.createPartnerMember({
      partner_id: partner.id,
      name: application.contact_name,
      phone: application.phone,
      role: "owner",
      status: "pending_bind",
      created_by_employee_id: employeeId,
      updated_by_employee_id: employeeId,
    } satisfies PlatformPartnerMemberCreateRecordInput);

    const approvedApplication =
      await this.applicationRepository.markApplicationApproved(
        applicationId,
        {
          converted_partner_id: partner.id,
          reviewed_by_employee_id: employeeId,
          review_remark: reviewRemark,
        } satisfies PlatformPartnerApplicationApprovedRecordInput,
      );

    return {
      application: approvedApplication,
      partner,
      created: true,
      idempotent: false,
    };
  }

  private async requireApplication(applicationId: string) {
    const application = await this.applicationRepository.findApplicationById(
      applicationId,
    );
    if (!application) {
      throw Errors.business(
        404,
        "城市合伙人申请不存在",
        "PARTNER_APPLICATION_NOT_FOUND",
      );
    }
    return application;
  }

  private requiresSmsVerification(input: SubmitPlatformPartnerApplicationInput) {
    return input.source_channel === MINI_PROGRAM_SOURCE_CHANNEL;
  }

  private async verifyApplicationSmsCode(input: {
    phone: string;
    code?: string;
  }) {
    if (!input.code) {
      throw Errors.business(400, "请输入验证码", "SMS_CODE_REQUIRED");
    }

    const verificationCode = await this.smsService.findValidPending({
      phone: input.phone,
      scene: PARTNER_APPLICATION_SMS_SCENE,
      code: input.code,
    });
    if (!verificationCode) {
      throw Errors.business(
        400,
        "验证码错误或已过期",
        "SMS_CODE_INVALID",
      );
    }

    await this.smsService.markVerified(verificationCode.id);
  }

  private async assertNoActiveApplicationByPhone(phone: string) {
    const existingApplication =
      await this.applicationRepository.findActiveApplicationByPhone(phone);
    if (existingApplication) {
      throw Errors.business(
        409,
        "该手机号已提交申请，请等待审核",
        "PARTNER_APPLICATION_DUPLICATED",
      );
    }
  }

  private assertCanManagePartners(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!this.hasPermission(authContext, PARTNER_MANAGE_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private hasPermission(authContext: AuthContext, permissionCode: string) {
    return authContext.permissions.some((permission) =>
      permission.code === permissionCode
    );
  }

  private requireEmployeeId(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private buildApplicationNo() {
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const suffix = `${Date.now().toString(36)}${
      Math.random().toString(36).slice(2, 6)
    }`.toUpperCase();
    return `CPA-${date}-${suffix}`;
  }
}

export const platformPartnerApplicationsService =
  new PlatformPartnerApplicationsService();

export type { PlatformPartnerApplicationRecord };
