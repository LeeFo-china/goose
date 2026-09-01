import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  DouyinMiniappContentRepository,
  douyinMiniappContentRepository,
} from "@/repositories/douyin-miniapp-content";
import {
  DouyinMiniappMarketingRepository,
  douyinMiniappMarketingRepository,
} from "@/repositories/douyin-miniapp-marketing";
import { notificationService } from "@/services/notifications";
import type {
  DouyinAnalyticsRequest,
  DouyinLeadRequest,
  DouyinLeadSmsRequest,
} from "@/schema/douyin-miniapp";
import {
  DouyinRuntimeConfigSchema,
  type DouyinRuntimeConfig,
} from "@/schema/platform-douyin-miniapps";
import {
  SmsVerificationCodeService,
  smsVerificationCodeService,
} from "@/services/sms-verification-codes";
import type { JwtPayload } from "@/utils/jwt";

type ContextRepository = Pick<DouyinMiniappContentRepository, "findActiveInstallation">;
type MarketingRepository = Pick<DouyinMiniappMarketingRepository,
  "submitMeasurementAppointment" | "insertEvents">;
type SmsService = Pick<SmsVerificationCodeService, "sendCode">;
type NotificationService = Pick<typeof notificationService, "createTenantAdminNotifications">;
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
  now?: () => Date;
};
type Context = {
  tenantId: string;
  installationId: string;
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

export class DouyinMiniappMarketingService {
  private readonly contextRepository: ContextRepository;
  private readonly marketingRepository: MarketingRepository;
  private readonly notificationService: NotificationService;
  private readonly smsService: SmsService;
  private readonly now: () => Date;

  constructor(dependencies: Dependencies = {}) {
    this.contextRepository = dependencies.contextRepository ?? douyinMiniappContentRepository;
    this.marketingRepository = dependencies.marketingRepository
      ?? douyinMiniappMarketingRepository;
    this.notificationService = dependencies.notificationService ?? notificationService;
    this.smsService = dependencies.smsService ?? smsVerificationCodeService;
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
    const appointment = await this.marketingRepository.submitMeasurementAppointment({
      tenantId: context.tenantId,
      installationId: context.installationId,
      subjectHash: context.subjectHash,
      phone: input.phone,
      name: input.name,
      community: input.community,
      preferredVisitDate: input.preferred_visit_date,
      preferredVisitPeriod: input.preferred_visit_period,
      budgetEstimateId: input.budget_estimate_id ?? null,
      demand: input.demand ?? null,
      smsCode: input.sms_code,
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

let defaultService: DouyinMiniappMarketingService | undefined;
export function getDouyinMiniappMarketingService() {
  defaultService ??= new DouyinMiniappMarketingService();
  return defaultService;
}
