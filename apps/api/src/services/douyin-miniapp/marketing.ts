import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  DouyinOpenPlatformClient,
  type DouyinOpenPlatformGateway,
} from "@/gateways/douyin-open-platform/client";
import {
  DouyinMiniappContentRepository,
  douyinMiniappContentRepository,
} from "@/repositories/douyin-miniapp-content";
import { DouyinMiniappInstallationsRepository } from "@/repositories/douyin-miniapp-installations";
import {
  DouyinMiniappMarketingRepository,
  douyinMiniappMarketingRepository,
} from "@/repositories/douyin-miniapp-marketing";
import { DouyinThirdPartyComponentsRepository } from "@/repositories/douyin-third-party-components";
import { notificationService } from "@/services/notifications";
import type {
  DouyinAnalyticsRequest,
  DouyinLeadRequest,
  DouyinLeadSmsRequest,
} from "@/schema/douyin-miniapp";
import {
  DOUYIN_CLIENT_MATERIAL_OWNED_EVENT_VALUES,
  DOUYIN_CLIENT_MATERIAL_PREVIEW_EVENT_VALUES,
} from "@/schema/douyin-miniapp";
import {
  DouyinRuntimeConfigSchema,
  type DouyinRuntimeConfig,
} from "@/schema/platform-douyin-miniapps";
import {
  SmsVerificationCodeService,
  smsVerificationCodeService,
} from "@/services/sms-verification-codes";
import { DouyinMiniappAccessTokenService } from "./access-tokens";
import { loadDouyinMiniappConfig } from "./config";
import type { JwtPayload } from "@/utils/jwt";

type ContextRepository = Pick<DouyinMiniappContentRepository, "findActiveInstallation">;
type MarketingRepository = Pick<DouyinMiniappMarketingRepository,
  "submitMeasurementAppointment" | "insertEvents" |
  "listPublishedMaterialNoteIds" | "listActiveClaimedMaterialNoteIds">;
type SmsService = Pick<SmsVerificationCodeService, "sendCode">;
type NotificationService = Pick<typeof notificationService, "createTenantAdminNotifications">;
type AccessTokenService = Pick<DouyinMiniappAccessTokenService, "getAuthorizerAccessToken">;
type PhoneGateway = Pick<DouyinOpenPlatformGateway, "getPhoneNumberInfo">;
type MarketingLogger = {
  warn(payload: Record<string, unknown>, message: string): void;
};
type RequestMetadata = {
  requestIp: string | null;
  userAgent: string | null;
  log?: MarketingLogger;
};
type Dependencies = {
  contextRepository?: ContextRepository;
  marketingRepository?: MarketingRepository;
  notificationService?: NotificationService;
  smsService?: SmsService;
  accessTokens?: AccessTokenService;
  phoneGateway?: PhoneGateway;
  now?: () => Date;
};
type Context = {
  tenantId: string;
  installationId: string;
  authorizerAppId: string;
  deploymentKey: string | null;
  subjectHash: string;
  runtime: DouyinRuntimeConfig;
};

const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const APPOINTMENT_SUBMITTED_MESSAGE = "量房申请已提交，工作人员将与你确认具体时间";
const CLIENT_EVENTS = new Set([
  "app_launch", "page_view", "case_view", "site_view",
  "lead_cta_click", "phone_call_click",
  "material_preview", "material_copy", "material_budget_click", "material_lead_click",
]);
const MATERIAL_PREVIEW_EVENTS = new Set<string>(
  DOUYIN_CLIENT_MATERIAL_PREVIEW_EVENT_VALUES,
);
const MATERIAL_OWNED_EVENTS = new Set<string>(
  DOUYIN_CLIENT_MATERIAL_OWNED_EVENT_VALUES,
);

export class DouyinMiniappMarketingService {
  private readonly contextRepository: ContextRepository;
  private readonly marketingRepository: MarketingRepository;
  private readonly notificationService: NotificationService;
  private readonly smsService: SmsService;
  private accessTokens?: AccessTokenService;
  private phoneGateway?: PhoneGateway;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies = {}) {
    this.contextRepository = dependencies.contextRepository ?? douyinMiniappContentRepository;
    this.marketingRepository = dependencies.marketingRepository
      ?? douyinMiniappMarketingRepository;
    this.notificationService = dependencies.notificationService ?? notificationService;
    this.smsService = dependencies.smsService ?? smsVerificationCodeService;
    this.accessTokens = dependencies.accessTokens;
    this.phoneGateway = dependencies.phoneGateway;
    this.now = dependencies.now ?? (() => new Date());
  }

  async sendCode(
    user: JwtPayload | undefined,
    input: DouyinLeadSmsRequest,
    metadata: RequestMetadata,
  ) {
    const context = await this.loadContext(user, true);
    let result: Awaited<ReturnType<SmsService["sendCode"]>>;
    try {
      result = await this.smsService.sendCode({
        phone: input.phone,
        scene: "douyin_lead",
        requestIp: metadata.requestIp,
        requestDevice: context.subjectHash,
        requestIpLimit: 5,
      });
    } catch (error) {
      if (error instanceof AppError && error.code === "SMS_CODE_RATE_LIMITED") throw error;
      throw Errors.business(503, "验证码服务暂不可用", "SMS_UNAVAILABLE");
    }
    await this.marketingRepository.insertEvents({
      tenantId: context.tenantId,
      installationId: context.installationId,
      subjectHash: context.subjectHash,
      requestIp: metadata.requestIp,
      userAgent: boundedUserAgent(metadata.userAgent),
      events: [{
        eventName: "sms_send",
        occurredAt: this.now().toISOString(),
        attribution: input.attribution,
        entityId: undefined,
      }],
    }).catch(() => undefined); // Analytics failure must not invalidate a sent SMS.
    return result;
  }

  async submitLead(
    user: JwtPayload | undefined,
    input: DouyinLeadRequest,
    metadata: RequestMetadata,
  ) {
    const context = await this.loadContext(user, true);
    const now = this.now();
    validateConsent(input, context.runtime.privacy_policy_version, now);
    const consentedAt = new Date(input.consented_at).toISOString();
    const phone = await this.resolveVerifiedPhone(context, input);
    const appointment = await this.marketingRepository.submitMeasurementAppointment({
      tenantId: context.tenantId,
      installationId: context.installationId,
      subjectHash: context.subjectHash,
      phone,
      name: input.name,
      community: input.community,
      preferredVisitDate: input.preferred_visit_date,
      preferredVisitPeriod: input.preferred_visit_period,
      budgetEstimateId: input.budget_estimate_id ?? null,
      demand: input.demand ?? null,
      verification: input.verification_method === "douyin_phone"
        ? { type: "douyin_phone" }
        : { type: "sms", code: input.sms_code },
      idempotencyKey: input.idempotency_key,
      requestIp: metadata.requestIp,
      userAgent: boundedUserAgent(metadata.userAgent),
      privacyPolicyVersion: input.privacy_policy_version,
      consentedAt,
      attribution: input.attribution,
    });
    if (!appointment.already_submitted) {
      await this.notifyTenant(context, appointment, metadata.log);
    }
    return {
      lead_id: appointment.lead_id,
      appointment_no: appointment.appointment_no,
      already_submitted: appointment.already_submitted,
      existing_customer_linked: appointment.existing_customer_linked,
      status: appointment.status,
      message: APPOINTMENT_SUBMITTED_MESSAGE,
    };
  }

  private async resolveVerifiedPhone(
    context: Context,
    input: DouyinLeadRequest,
  ): Promise<string> {
    if (input.verification_method !== "douyin_phone") return input.phone;
    if (!context.runtime.features.douyin_phone) {
      throw Errors.business(404, "抖音手机号授权暂未开放", "DOUYIN_PHONE_FEATURE_DISABLED");
    }
    if (!context.deploymentKey) {
      throw Errors.business(409, "抖音小程序服务配置无效", "DOUYIN_INSTALLATION_DISABLED");
    }
    const { accessTokens, phoneGateway } = this.phoneDependencies();
    const accessToken = await accessTokens.getAuthorizerAccessToken({
      authorizerAppId: context.authorizerAppId,
      deploymentKey: context.deploymentKey,
    });
    try {
      const result = await phoneGateway.getPhoneNumberInfo({
        appId: context.authorizerAppId,
        authorizerAccessToken: accessToken,
        code: input.douyin_phone_code,
      });
      return result.phone;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw Errors.business(502, "抖音手机号授权失败", "DOUYIN_PHONE_AUTH_FAILED");
    }
  }

  private phoneDependencies(): {
    readonly accessTokens: AccessTokenService;
    readonly phoneGateway: PhoneGateway;
  } {
    if (!this.accessTokens || !this.phoneGateway) {
      const defaults = createDefaultPhoneDependencies();
      this.accessTokens ??= defaults.accessTokens;
      this.phoneGateway ??= defaults.phoneGateway;
    }
    return { accessTokens: this.accessTokens, phoneGateway: this.phoneGateway };
  }

  async recordEvents(
    user: JwtPayload | undefined,
    input: DouyinAnalyticsRequest,
    metadata: RequestMetadata,
  ) {
    const context = await this.loadContext(user, false);
    const now = this.now().getTime();
    const events = input.events.map((event) => {
      if (!CLIENT_EVENTS.has(event.event_name)) {
        throw Errors.business(400, "该事件只能由服务端记录", "DOUYIN_EVENT_NOT_CLIENT_WRITABLE");
      }
      const occurredAt = new Date(event.occurred_at).getTime();
      if (!Number.isFinite(occurredAt)
        || occurredAt > now + MAX_FUTURE_SKEW_MS
        || occurredAt < now - MAX_EVENT_AGE_MS) {
        throw Errors.business(400, "事件时间无效", "DOUYIN_EVENT_TIME_INVALID");
      }
      return {
        eventName: event.event_name,
        occurredAt: new Date(occurredAt).toISOString(),
        attribution: event.attribution,
        entityId: event.entity_id,
      };
    });
    await this.validateMaterialEventEntities(context, events);
    await this.marketingRepository.insertEvents({
      tenantId: context.tenantId,
      installationId: context.installationId,
      subjectHash: context.subjectHash,
      requestIp: metadata.requestIp,
      userAgent: boundedUserAgent(metadata.userAgent),
      events,
    });
    return { accepted: events.length };
  }

  private async validateMaterialEventEntities(
    context: Context,
    events: ReadonlyArray<{
      readonly eventName: string;
      readonly entityId?: string;
    }>,
  ): Promise<void> {
    const previewIds = new Set<string>();
    const ownedIds = new Set<string>();
    for (const event of events) {
      if (!MATERIAL_PREVIEW_EVENTS.has(event.eventName)
        && !MATERIAL_OWNED_EVENTS.has(event.eventName)) continue;
      if (!event.entityId) throwMaterialEventEntityInvalid();
      if (MATERIAL_PREVIEW_EVENTS.has(event.eventName)) previewIds.add(event.entityId);
      else ownedIds.add(event.entityId);
    }
    const previewNoteIds = [...previewIds];
    const ownedNoteIds = [...ownedIds];
    const [publishedIds, claimedIds] = await Promise.all([
      previewNoteIds.length === 0
        ? Promise.resolve([])
        : this.marketingRepository.listPublishedMaterialNoteIds({
          tenantId: context.tenantId,
          noteIds: previewNoteIds,
        }),
      ownedNoteIds.length === 0
        ? Promise.resolve([])
        : this.marketingRepository.listActiveClaimedMaterialNoteIds({
          tenantId: context.tenantId,
          installationId: context.installationId,
          subjectHash: context.subjectHash,
          noteIds: ownedNoteIds,
        }),
    ]);
    const published = new Set(publishedIds);
    const claimed = new Set(claimedIds);
    if (previewNoteIds.some((id) => !published.has(id))
      || ownedNoteIds.some((id) => !claimed.has(id))) {
      throwMaterialEventEntityInvalid();
    }
  }

  private async loadContext(user: JwtPayload | undefined, requireLeadFeature: boolean) {
    if (
      user?.token_type !== "douyin_miniapp"
      || !user.tenant_id
      || !user.douyin_installation_id
      || !user.douyin_app_id
      || !user.subject_hash
      || !/^[0-9a-f]{64}$/.test(user.subject_hash)
      || user.sub !== user.subject_hash
    ) {
      throw Errors.unauthorized("请使用抖音小程序会话");
    }
    const installation = await this.contextRepository.findActiveInstallation({
      installationId: user.douyin_installation_id,
      tenantId: user.tenant_id,
      appId: user.douyin_app_id,
    });
    if (!installation || installation.tenant_id !== user.tenant_id
      || installation.tenant.id !== user.tenant_id) {
      throw Errors.business(409, "抖音小程序服务已暂停", "DOUYIN_INSTALLATION_DISABLED");
    }
    if (installation.tenant.status !== "active") {
      throw Errors.business(403, "装修公司服务已暂停", "TENANT_NOT_AVAILABLE");
    }
    const runtime = DouyinRuntimeConfigSchema.safeParse(installation.runtime_config);
    if (!runtime.success) {
      throw Errors.business(409, "抖音小程序服务已暂停", "DOUYIN_INSTALLATION_DISABLED");
    }
    if (requireLeadFeature && !runtime.data.features.sms_lead) {
      throw Errors.business(404, "在线咨询暂未开放", "DOUYIN_LEAD_FEATURE_DISABLED");
    }
    return {
      tenantId: user.tenant_id,
      installationId: user.douyin_installation_id,
      authorizerAppId: installation.authorizer_appid,
      deploymentKey: installation.deployment_key,
      subjectHash: user.subject_hash,
      runtime: runtime.data,
    } satisfies Context;
  }

  private async notifyTenant(
    context: Context,
    appointment: Awaited<ReturnType<MarketingRepository["submitMeasurementAppointment"]>>,
    log?: MarketingLogger,
  ): Promise<void> {
    try {
      await this.notificationService.createTenantAdminNotifications({
        tenantId: context.tenantId,
        scene: "douyin_measurement_appointment_submitted",
        title: "新的免费量房预约",
        content: `量房预约 ${appointment.appointment_no} 已提交，请及时联系并确认具体时间。`,
        targetType: "marketing_lead",
        targetId: appointment.lead_id,
        targetUrl: "/douyin-miniapp/leads",
        payload: {
          marketing_lead_id: appointment.lead_id,
          appointment_id: appointment.appointment_id,
          appointment_no: appointment.appointment_no,
        },
      });
    } catch {
      log?.warn({
        code: "DOUYIN_MEASUREMENT_NOTIFICATION_FAILED",
        marketingLeadId: appointment.lead_id,
        appointmentId: appointment.appointment_id,
        appointmentNo: appointment.appointment_no,
      }, "抖音量房预约通知创建失败");
    }
  }
}

function validateConsent(input: DouyinLeadRequest, expectedVersion: string, now: Date) {
  if (input.privacy_policy_version !== expectedVersion) {
    throw Errors.business(409, "隐私政策已更新，请重新确认", "DOUYIN_PRIVACY_POLICY_VERSION_MISMATCH");
  }
  const consentedAt = new Date(input.consented_at).getTime();
  if (!Number.isFinite(consentedAt)
    || consentedAt > now.getTime() + MAX_FUTURE_SKEW_MS) {
    throw Errors.business(400, "授权时间无效", "DOUYIN_CONSENT_TIME_INVALID");
  }
}

function boundedUserAgent(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 512) : null;
}

function throwMaterialEventEntityInvalid(): never {
  throw Errors.business(
    400,
    "资料事件实体无效",
    "DOUYIN_MATERIAL_EVENT_ENTITY_INVALID",
  );
}

function createDefaultPhoneDependencies(): {
  readonly accessTokens: AccessTokenService;
  readonly phoneGateway: PhoneGateway;
} {
  const config = loadDouyinMiniappConfig();
  const installationRepository = new DouyinMiniappInstallationsRepository();
  const openPlatform = new DouyinOpenPlatformClient();
  return {
    accessTokens: new DouyinMiniappAccessTokenService({
      componentAppId: config.componentAppId,
      componentAppSecret: config.componentAppSecret,
      credentialKeyring: config.credentialKeyring,
      componentRepository: new DouyinThirdPartyComponentsRepository(),
      installationRepository,
      openPlatform,
    }),
    phoneGateway: openPlatform,
  };
}

let defaultService: DouyinMiniappMarketingService | undefined;
export function getDouyinMiniappMarketingService() {
  defaultService ??= new DouyinMiniappMarketingService();
  return defaultService;
}
