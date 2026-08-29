import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import {
  platformPartnersRepository,
  type PlatformPartnerInviteCodeWithPartnerRecord,
  type TenantPartnerBindingCreateRecordInput,
  type TenantPartnerBindingRecord,
} from "@/repositories/platform-partners";
import { platformTenantRepository } from "@/repositories/platform-tenants/legacy-repository";
import type {
  PlatformTenantInitializationResult,
  PlatformTenantRecord,
} from "@/repositories/platform-tenants/legacy/shared";
import type {
  PartnerTenantOnboardingSubmitInput,
} from "@/schema/platform-partners";
import { normalizePartnerInviteCode } from "@/services/platform-partner-invite-code-utils";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import type { CreatePlatformTenantInput } from "@/schema/platform-tenants";
import type { SmsScene } from "@gooes/domain";

type PartnerRepositoryPort = Pick<
  typeof platformPartnersRepository,
  | "findInviteCodeByCode"
  | "findActiveTenantBinding"
  | "createTenantBinding"
  | "incrementInviteCodeCounts"
>;

type TenantRepositoryPort = Pick<
  typeof platformTenantRepository,
  "findBySlug" | "findEmployeesByPhone" | "createWithDefaultTemplate"
>;

type SmsServicePort = Pick<
  typeof smsVerificationCodeService,
  "sendCode" | "findValidPending" | "markVerified"
>;

type PlatformPartnerTenantOnboardingDependencies = {
  partnerRepository?: PartnerRepositoryPort;
  tenantRepository?: TenantRepositoryPort;
  smsService?: SmsServicePort;
  slugSuffixFactory?: () => string;
  legacyCutoffAt?: Date | string | null;
  clock?: () => Date;
};

const PARTNER_TENANT_ONBOARDING_SMS_SCENE =
  "partner_tenant_onboarding" satisfies SmsScene;
const INVITE_BINDING_CHANGE_REASON = "装企小程序扫码入驻自动绑定";
const ADMIN_DEPARTMENT_CODE = "EXEC_OFFICE";
const ADMIN_POST_CODE = "SYSTEM_ADMIN";
const MAX_SLUG_ATTEMPTS = 5;
const LEGACY_PARTNER_TENANT_ONBOARDING_CUTOFF_ENV =
  "LEGACY_PARTNER_TENANT_ONBOARDING_CUTOFF_AT";
const MAX_LEGACY_CUTOFF_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function parseLegacyPartnerTenantOnboardingCutoffAt(
  value: Date | string | null | undefined,
): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    assertValidLegacyCutoffDate(value);
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  assertValidLegacyCutoffDate(parsed);
  return parsed;
}

export function assertLegacyPartnerTenantOnboardingCutoffWindow(input: {
  fullReleaseAt: Date;
  cutoffAt: Date;
}) {
  assertValidLegacyCutoffDate(input.fullReleaseAt);
  assertValidLegacyCutoffDate(input.cutoffAt);
  const maxCutoffAt =
    input.fullReleaseAt.getTime() + MAX_LEGACY_CUTOFF_WINDOW_MS;
  if (input.cutoffAt.getTime() > maxCutoffAt) {
    throw Errors.business(
      500,
      "旧装企入驻入口截止时间不能晚于小程序全量发布后 14 日",
      ErrorCodes.VALIDATION_ERROR,
      { max_days: 14 },
    );
  }
}

function assertValidLegacyCutoffDate(value: Date) {
  if (Number.isNaN(value.getTime())) {
    throw Errors.business(
      500,
      `${LEGACY_PARTNER_TENANT_ONBOARDING_CUTOFF_ENV} 必须是有效 ISO-8601 时间`,
      ErrorCodes.VALIDATION_ERROR,
    );
  }
}

export class PlatformPartnerTenantOnboardingService {
  private readonly partnerRepository: PartnerRepositoryPort;
  private readonly tenantRepository: TenantRepositoryPort;
  private readonly smsService: SmsServicePort;
  private readonly slugSuffixFactory: () => string;
  private readonly legacyCutoffAt: Date | null;
  private readonly clock: () => Date;

  constructor(
    dependencies: PlatformPartnerTenantOnboardingDependencies = {},
  ) {
    this.partnerRepository =
      dependencies.partnerRepository ?? platformPartnersRepository;
    this.tenantRepository =
      dependencies.tenantRepository ?? platformTenantRepository;
    this.smsService = dependencies.smsService ?? smsVerificationCodeService;
    this.slugSuffixFactory =
      dependencies.slugSuffixFactory ?? (() => Math.random().toString(36).slice(2, 8));
    this.legacyCutoffAt = parseLegacyPartnerTenantOnboardingCutoffAt(
      dependencies.legacyCutoffAt === undefined
        ? process.env[LEGACY_PARTNER_TENANT_ONBOARDING_CUTOFF_ENV]
        : dependencies.legacyCutoffAt,
    );
    this.clock = dependencies.clock ?? (() => new Date());
  }

  async sendPublicTenantOnboardingCode(input: {
    phone: string;
    requestIp: string | null;
    requestDevice?: string | null;
  }) {
    this.assertLegacyTenantOnboardingOpen();
    const phone = this.normalizePhone(input.phone);
    return this.smsService.sendCode({
      phone,
      scene: PARTNER_TENANT_ONBOARDING_SMS_SCENE,
      requestIp: input.requestIp,
      requestDevice: input.requestDevice ?? null,
    });
  }

  async submitPublicTenantOnboarding(
    input: PartnerTenantOnboardingSubmitInput,
  ) {
    this.assertLegacyTenantOnboardingOpen();
    const phone = this.normalizePhone(input.admin_phone);
    const verificationCode = await this.verifySmsCode({ phone, code: input.sms_code });

    const inviteCode = await this.requireAvailableInviteCode(input.invite_code);
    await this.assertAdminPhoneAvailable(phone);

    const admin = {
      name: input.admin_name.trim(),
      phone,
      department_code: ADMIN_DEPARTMENT_CODE,
      post_code: ADMIN_POST_CODE,
    } satisfies NonNullable<CreatePlatformTenantInput["admin"]>;

    const tenantInput = await this.buildTenantInput(input, phone, admin);
    const { tenant, initialization } =
      await this.tenantRepository.createWithDefaultTemplate(tenantInput, {
        operatorEmployeeId: null,
      });

    const existingBinding =
      await this.partnerRepository.findActiveTenantBinding(tenant.id);
    if (existingBinding) {
      return this.buildExistingBindingResponse({
        inviteCode,
        tenant,
        initialization,
        binding: existingBinding,
      });
    }

    const binding = await this.partnerRepository.createTenantBinding({
      tenant_id: tenant.id,
      partner_id: inviteCode.partner_id,
      invite_code_id: inviteCode.id,
      source_type: "invite_code",
      source_id: input.source_id ?? null,
      changed_by_employee_id: initialization.admin_employee_id,
      change_reason: INVITE_BINDING_CHANGE_REASON,
    } satisfies TenantPartnerBindingCreateRecordInput);

    await this.partnerRepository.incrementInviteCodeCounts({
      inviteCodeId: inviteCode.id,
      submitted_count: 1,
      approved_count: 1,
    });
    await this.smsService.markVerified(verificationCode.id);

    return {
      ...this.buildInviteCodeOnboardingPayload(inviteCode),
      tenant,
      initialization,
      binding,
      created: true,
      auth: null,
    };
  }

  private assertLegacyTenantOnboardingOpen() {
    if (!this.legacyCutoffAt) return;
    if (this.clock().getTime() < this.legacyCutoffAt.getTime()) return;

    throw Errors.business(
      410,
      "请升级小程序后重新申请",
      ErrorCodes.TENANT_ONBOARDING_CLIENT_UPGRADE_REQUIRED,
    );
  }

  private async verifySmsCode(input: { phone: string; code: string }) {
    const code = input.code?.trim() || "";
    if (!code) {
      throw Errors.business(400, "请输入验证码", "SMS_CODE_REQUIRED");
    }

    const verificationCode = await this.smsService.findValidPending({
      phone: input.phone,
      scene: PARTNER_TENANT_ONBOARDING_SMS_SCENE,
      code,
    });
    if (!verificationCode) {
      throw Errors.business(400, "验证码错误或已过期", "SMS_CODE_INVALID");
    }

    return verificationCode;
  }

  private async assertAdminPhoneAvailable(phone: string) {
    const employees = await this.tenantRepository.findEmployeesByPhone(phone);
    if (employees.length > 0) {
      throw Errors.business(
        409,
        "该手机号已是装修公司员工，请使用已有账号登录或联系平台处理",
        "TENANT_ADMIN_PHONE_EXISTS",
        { phone },
      );
    }
  }

  private async buildTenantInput(
    input: PartnerTenantOnboardingSubmitInput,
    phone: string,
    admin: NonNullable<CreatePlatformTenantInput["admin"]>,
  ): Promise<CreatePlatformTenantInput> {
    const slug = await this.generateTenantSlug(phone);
    return {
      name: input.company_name.trim(),
      slug,
      status: "active",
      contact_name: admin.name,
      contact_phone: phone,
      address: input.address ?? null,
      address_title: input.location?.title ?? null,
      address_poi_id: input.location?.poi_id ?? null,
      address_province: input.location?.province ?? null,
      address_city: input.location?.city ?? null,
      address_district: input.location?.district ?? null,
      address_adcode: input.location?.adcode ?? input.region_code ?? null,
      address_latitude: input.location?.latitude ?? null,
      address_longitude: input.location?.longitude ?? null,
      address_source: input.location ? "map_picker" : "manual",
      address_confidence: input.location ? 1 : null,
      address_confirmed_at: new Date().toISOString(),
      admin,
    };
  }

  private async generateTenantSlug(phone: string) {
    const suffixBase = phone.slice(-4);
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const randomSuffix = this.slugSuffixFactory().toLowerCase();
      const slug = `tenant-${suffixBase}-${randomSuffix}`;
      const existing = await this.tenantRepository.findBySlug(slug);
      if (!existing) return slug;
    }

    throw Errors.business(409, "租户标识已存在，请稍后重试", "TENANT_SLUG_EXISTS");
  }

  private async requireAvailableInviteCode(code: string) {
    const normalizedCode = normalizePartnerInviteCode(code);
    const inviteCode =
      await this.partnerRepository.findInviteCodeByCode(normalizedCode);
    if (!inviteCode || inviteCode.status !== "active") {
      throw Errors.business(
        404,
        "合伙人邀请码不存在或已失效",
        "PARTNER_INVITE_CODE_UNAVAILABLE",
      );
    }

    if (
      inviteCode.expires_at &&
      new Date(inviteCode.expires_at).getTime() <= Date.now()
    ) {
      throw Errors.business(
        410,
        "合伙人邀请码已过期",
        "PARTNER_INVITE_CODE_EXPIRED",
      );
    }

    if (!inviteCode.partner || inviteCode.partner.status !== "active") {
      throw Errors.business(
        409,
        "城市合伙人当前不可绑定",
        "PARTNER_INVITE_PARTNER_UNAVAILABLE",
      );
    }

    return inviteCode;
  }

  private buildExistingBindingResponse(input: {
    inviteCode: PlatformPartnerInviteCodeWithPartnerRecord;
    tenant: PlatformTenantRecord;
    initialization: PlatformTenantInitializationResult;
    binding: TenantPartnerBindingRecord;
  }) {
    if (input.binding.partner_id !== input.inviteCode.partner_id) {
      throw Errors.business(
        409,
        "该租户已绑定其他城市合伙人",
        "TENANT_PARTNER_BINDING_EXISTS",
        {
          tenant_id: input.tenant.id,
          existing_partner_id: input.binding.partner_id,
          requested_partner_id: input.inviteCode.partner_id,
        },
      );
    }

    return {
      ...this.buildInviteCodeOnboardingPayload(input.inviteCode),
      tenant: input.tenant,
      initialization: input.initialization,
      binding: input.binding,
      created: false,
      auth: null,
    };
  }

  private buildInviteCodeOnboardingPayload(
    inviteCode: PlatformPartnerInviteCodeWithPartnerRecord,
  ) {
    const partner = inviteCode.partner;
    if (!partner) {
      throw Errors.business(
        409,
        "城市合伙人当前不可绑定",
        "PARTNER_INVITE_PARTNER_UNAVAILABLE",
      );
    }

    return {
      invite_code: {
        id: inviteCode.id,
        code: inviteCode.code,
        region_code: inviteCode.region_code,
        campaign_code: inviteCode.campaign_code,
        expires_at: inviteCode.expires_at,
      },
      partner: {
        id: partner.id,
        name: partner.name,
        status: partner.status,
        region_codes: partner.region_codes,
        level: partner.level
          ? {
            code: partner.level.code,
            name: partner.level.name,
          }
          : null,
      },
      onboarding: {
        can_bind: true,
        binding_source_type: "invite_code" as const,
      },
    };
  }

  private normalizePhone(phone: string) {
    const normalizedPhone = phone.trim();
    if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
      throw Errors.business(400, "手机号格式不正确", "INVALID_PHONE");
    }
    return normalizedPhone;
  }
}

export const platformPartnerTenantOnboardingService =
  new PlatformPartnerTenantOnboardingService();
