import { AppError } from "@/errors/app-error";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  platformAdminReviewWorkbenchRepository,
  type PlatformAdminReviewWorkbenchRepository,
  type PlatformAdminTenantApplicationRow,
} from "@/repositories/platform-admin-review-workbench";
import type { PlatformPartnerApplicationRecord } from "@/repositories/platform-partner-applications";
import type {
  PlatformAdminPartnerApproveInput,
  PlatformAdminPartnerRejectInput,
  PlatformAdminPartnerRequestSupplementInput,
  PlatformAdminReviewListQuery,
  PlatformAdminReviewLogListQuery,
  PlatformAdminTenantApproveInput,
  PlatformAdminTenantRejectInput,
  PlatformAdminTenantRequestSupplementInput,
} from "@/schema/platform-admin-review-workbench";
import { platformAuthorizationService, type PlatformStaffAuthContext } from "@/services/platform-authorization";
import { platformPartnerApplicationsService } from "@/services/platform-partner-applications";
import { tenantOnboardingReviewService } from "@/services/tenant-onboarding-review";

type Dependencies = {
  repository?: Pick<
    PlatformAdminReviewWorkbenchRepository,
    "getSummary" | "listTenantApplications" | "findTenantApplicationById" | "listReviewLogs"
  >;
  tenantReviewService?: Pick<
    typeof tenantOnboardingReviewService,
    "accessLicense" | "approve" | "reject" | "requestSupplement"
  >;
  partnerService?: Pick<
    typeof platformPartnerApplicationsService,
    | "listApplications"
    | "getApplication"
    | "approveMobileApplication"
    | "rejectMobileApplication"
    | "requestMobileSupplement"
  >;
};

export class PlatformAdminReviewWorkbenchService {
  private readonly repository: NonNullable<Dependencies["repository"]>;
  private readonly tenantReviewService: NonNullable<Dependencies["tenantReviewService"]>;
  private readonly partnerService: NonNullable<Dependencies["partnerService"]>;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ?? platformAdminReviewWorkbenchRepository;
    this.tenantReviewService = dependencies.tenantReviewService ?? tenantOnboardingReviewService;
    this.partnerService = dependencies.partnerService ?? platformPartnerApplicationsService;
  }

  summary(auth: PlatformStaffAuthContext) {
    this.assertSuperAdmin(auth);
    return this.repository.getSummary();
  }

  async listTenantApplications(
    auth: PlatformStaffAuthContext,
    query: PlatformAdminReviewListQuery,
  ) {
    this.assertSuperAdmin(auth);
    const page = await this.repository.listTenantApplications(query);
    return { ...page, list: page.list.map(toTenantListItem) };
  }

  async getTenantApplication(auth: PlatformStaffAuthContext, applicationId: string) {
    this.assertSuperAdmin(auth);
    const application = await this.repository.findTenantApplicationById(applicationId);
    if (!application) {
      throw Errors.business(404, "装企入驻申请不存在", "TENANT_ONBOARDING_APPLICATION_NOT_FOUND");
    }
    return toTenantDetail(application);
  }

  getTenantLicensePreview(auth: PlatformStaffAuthContext, applicationId: string) {
    this.assertSuperAdmin(auth);
    return this.tenantReviewService.accessLicense(
      withTenantReviewPermission(auth), applicationId,
    );
  }

  async approveTenantApplication(
    auth: PlatformStaffAuthContext,
    applicationId: string,
    input: PlatformAdminTenantApproveInput,
  ) {
    this.assertSuperAdmin(auth);
    const result = await mapTenantReviewError(this.tenantReviewService.approve(withTenantReviewPermission(auth), applicationId, {
      version: input.expected_version,
      attribution_mode: input.assign_partner_id ? "partner" : "auto",
      ...(input.assign_partner_id ? { final_partner_id: input.assign_partner_id } : {}),
      review_remark: input.remark,
    }));
    return {
      application: {
        id: result.application.id,
        status: result.application.status,
        version: result.application.version,
        converted_tenant_id: result.application.converted_tenant_id,
      },
      tenant: {
        id: result.approval.tenant_id,
        name: result.application.company_name,
        admin_employee_id: result.approval.initialization.admin_employee_id,
      },
      idempotent: result.approval.idempotent,
    };
  }

  async rejectTenantApplication(
    auth: PlatformStaffAuthContext,
    applicationId: string,
    input: PlatformAdminTenantRejectInput,
  ) {
    this.assertSuperAdmin(auth);
    const result = await mapTenantReviewError(this.tenantReviewService.reject(withTenantReviewPermission(auth), applicationId, {
      version: input.expected_version,
      review_remark: input.remark,
    }));
    return { application: compactTenantMutation(result.application) };
  }

  async requestTenantSupplement(
    auth: PlatformStaffAuthContext,
    applicationId: string,
    input: PlatformAdminTenantRequestSupplementInput,
  ) {
    this.assertSuperAdmin(auth);
    const requiredFields = Array.from(new Set(input.required_fields.map((field) =>
      field === "address" ? "company_location" : field
    ))) as Array<
      "company_name" | "unified_social_credit_code" | "business_license_file_id" |
      "admin_name" | "company_location" | "service_region_codes"
    >;
    const result = await mapTenantReviewError(this.tenantReviewService.requestSupplement(withTenantReviewPermission(auth), applicationId, {
      version: input.expected_version,
      remark: input.remark,
      required_fields: requiredFields,
    }));
    return { application: compactTenantMutation(result.application) };
  }

  async listPartnerApplications(
    auth: PlatformStaffAuthContext,
    query: PlatformAdminReviewListQuery,
  ) {
    this.assertSuperAdmin(auth);
    const page = await this.partnerService.listApplications(auth, {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      keyword: query.keyword,
      region_code: query.region_code,
    });
    return { ...page, list: page.list.map(toPartnerListItem) };
  }

  async getPartnerApplication(auth: PlatformStaffAuthContext, applicationId: string) {
    this.assertSuperAdmin(auth);
    return toPartnerDetail(await this.partnerService.getApplication(auth, applicationId));
  }

  async approvePartnerApplication(
    auth: PlatformStaffAuthContext,
    applicationId: string,
    input: PlatformAdminPartnerApproveInput,
    idempotencyKey: string,
  ) {
    this.assertSuperAdmin(auth);
    const result = await this.partnerService.approveMobileApplication(
      auth, applicationId, input, idempotencyKey,
    );
    return compactPartnerMutation(result);
  }

  async rejectPartnerApplication(
    auth: PlatformStaffAuthContext,
    applicationId: string,
    input: PlatformAdminPartnerRejectInput,
    idempotencyKey: string,
  ) {
    this.assertSuperAdmin(auth);
    const result = await this.partnerService.rejectMobileApplication(
      auth, applicationId, input, idempotencyKey,
    );
    return compactPartnerMutation(result);
  }

  async requestPartnerSupplement(
    auth: PlatformStaffAuthContext,
    applicationId: string,
    input: PlatformAdminPartnerRequestSupplementInput,
    idempotencyKey: string,
  ) {
    this.assertSuperAdmin(auth);
    const result = await this.partnerService.requestMobileSupplement(
      auth, applicationId, input, idempotencyKey,
    );
    return compactPartnerMutation(result);
  }

  listReviewLogs(auth: PlatformStaffAuthContext, query: PlatformAdminReviewLogListQuery) {
    this.assertSuperAdmin(auth);
    return this.repository.listReviewLogs(query);
  }

  private assertSuperAdmin(auth: PlatformStaffAuthContext) {
    platformAuthorizationService.assertSuperAdmin(auth);
  }
}

function maskPhone(phone: string) {
  const value = phone.trim();
  if (value.length < 7) return "****";
  return `${value.slice(0, 3)}****${value.slice(-4)}`;
}

function toTenantListItem(application: PlatformAdminTenantApplicationRow) {
  return {
    id: application.id,
    application_no: application.application_no,
    company_name: application.company_name,
    admin_name: application.admin_name,
    admin_phone_masked: maskPhone(application.admin_phone),
    status: application.status,
    partner_assist_status: application.partner_assist_status,
    source_channel: application.source_channel,
    address_city: application.address_city,
    address_district: application.address_district,
    version: application.version,
    created_at: application.created_at,
    updated_at: application.updated_at,
  };
}

function toTenantDetail(application: PlatformAdminTenantApplicationRow) {
  return {
    id: application.id,
    application_no: application.application_no,
    company_name: application.company_name,
    unified_social_credit_code: application.unified_social_credit_code ?? null,
    business_license_file: application.business_license_file
      ? {
          id: application.business_license_file.id,
          filename: application.business_license_file.original_name,
          mime_type: application.business_license_file.mime_type,
        }
      : null,
    admin_name: application.admin_name,
    admin_phone_masked: maskPhone(application.admin_phone),
    address_province: application.address_province ?? null,
    address_city: application.address_city,
    address_district: application.address_district,
    address_region_code: application.address_region_code ?? null,
    address: application.address ?? null,
    address_latitude: application.address_latitude ?? null,
    address_longitude: application.address_longitude ?? null,
    service_region_codes: application.service_region_codes ?? [],
    source_channel: application.source_channel,
    share_attribution: {
      share_link_id: application.share_link_id ?? null,
      sharer_display_name: application.share_link?.sharer_display_name ?? null,
      submitted_from_share: Boolean(application.share_link_id),
    },
    candidate_partner: application.candidate_partner ?? null,
    final_partner: application.final_partner ?? null,
    status: application.status,
    partner_assist_status: application.partner_assist_status,
    version: application.version,
    created_at: application.created_at,
    updated_at: application.updated_at,
    reviewed_at: application.reviewed_at ?? null,
    reviewer: application.reviewer ?? null,
    review_remark: application.review_remark ?? null,
    converted_tenant_id: application.converted_tenant_id ?? null,
  };
}

function toPartnerListItem(application: PlatformPartnerApplicationRecord) {
  return {
    id: application.id,
    application_no: application.application_no,
    applicant_name: application.applicant_name,
    subject_type: application.subject_type,
    contact_name: application.contact_name,
    phone_masked: maskPhone(application.phone),
    region_name: application.region_name,
    status: application.status,
    version: application.version,
    created_at: application.created_at,
    updated_at: application.updated_at,
  };
}

function toPartnerDetail(application: PlatformPartnerApplicationRecord) {
  return {
    ...toPartnerListItem(application),
    region_codes: application.region_codes,
    business_description: application.business_description,
    resource_description: application.resource_description,
    message: application.message,
    reviewed_at: application.reviewed_at,
    reviewer: application.reviewer ?? null,
    review_remark: application.review_remark,
    converted_partner_id: application.converted_partner_id,
  };
}

function compactTenantMutation(application: {
  id: string;
  status: string;
  version: number;
  converted_tenant_id?: string | null;
}) {
  return {
    id: application.id,
    status: application.status,
    version: application.version,
    converted_tenant_id: application.converted_tenant_id ?? null,
  };
}

function compactPartnerMutation(result: {
  application: {
    id: string;
    status: string;
    version: number;
    converted_partner_id: string | null;
  };
  partner: {
    id: string;
    name: string;
    status: "active";
    default_invite_code: string | null;
  } | null;
  idempotent: boolean;
}) {
  return {
    application: result.application,
    partner: result.partner,
    idempotent: result.idempotent,
  };
}

function withTenantReviewPermission(auth: PlatformStaffAuthContext) {
  if (auth.permissions.some((permission) =>
    permission.code === "platform.tenant_onboarding.review"
  )) return auth;
  return {
    ...auth,
    permissions: [
      ...auth.permissions,
      { code: "platform.tenant_onboarding.review" as const, scope: "all" as const },
    ],
  };
}

async function mapTenantReviewError<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    if (
      error.code === ErrorCodes.TENANT_ONBOARDING_SUBJECT_EXISTS ||
      error.code === ErrorCodes.TENANT_ONBOARDING_PHONE_MEMBER_EXISTS
    ) {
      throw Errors.business(
        409,
        error.message,
        ErrorCodes.DUPLICATED_SUBJECT,
        error.details,
      );
    }
    if (error.code === ErrorCodes.TENANT_ONBOARDING_STATE_CONFLICT) {
      throw Errors.business(
        409,
        error.message,
        ErrorCodes.VERSION_CONFLICT,
        error.details,
      );
    }
    throw error;
  }
}

export const platformAdminReviewWorkbenchService =
  new PlatformAdminReviewWorkbenchService();
