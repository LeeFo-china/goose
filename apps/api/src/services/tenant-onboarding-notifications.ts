import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import {
  tenantOnboardingNotificationsRepository,
  type TenantOnboardingApplicationRecipient,
} from "@/repositories/tenant-onboarding-notifications";
import type {
  TenantOnboardingNotificationDeliveryRecord,
  TenantOnboardingNotificationEventType,
} from "@/repositories/tenant-onboarding-types";
import { sendSmsTemplate } from "@/services/sms";
import type { SmsTemplatePurpose } from "@/services/sms/legacy/shared";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_LEASE_SECONDS = 120;
const SMS_PURPOSES = {
  submitted: "tenant_onboarding_submitted",
  supplement_required: "tenant_onboarding_supplement_required",
  approved: "tenant_onboarding_approved",
  rejected: "tenant_onboarding_rejected",
} as const satisfies Record<
  TenantOnboardingNotificationEventType,
  SmsTemplatePurpose
>;

type RepositoryPort = Pick<
  typeof tenantOnboardingNotificationsRepository,
  | "findOrCreateDelivery"
  | "findByIdAndApplication"
  | "claimDelivery"
  | "finalizeSent"
  | "finalizeFailed"
  | "loadCurrentApplicationRecipient"
>;

type Dependencies = {
  repository?: RepositoryPort;
  sendSmsTemplate?: typeof sendSmsTemplate;
  maxAttempts?: number;
  leaseSeconds?: number;
  clock?: () => Date;
};

type DeliveryInput = {
  applicationId: string;
  applicationVersion: number;
  eventType: TenantOnboardingNotificationEventType;
};

export class TenantOnboardingNotificationsService {
  private readonly repository: RepositoryPort;
  private readonly sendTemplate: typeof sendSmsTemplate;
  private readonly maxAttempts: number;
  private readonly leaseSeconds: number;
  private readonly clock: () => Date;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ??
      tenantOnboardingNotificationsRepository;
    this.sendTemplate = dependencies.sendSmsTemplate ?? sendSmsTemplate;
    this.maxAttempts = dependencies.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.leaseSeconds = dependencies.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
    this.clock = dependencies.clock ?? (() => new Date());
  }

  async deliver(input: DeliveryInput) {
    try {
      const result = await this.repository.findOrCreateDelivery({
        application_id: input.applicationId,
        application_version: input.applicationVersion,
        event_type: input.eventType,
        channel: "sms",
      });
      if (result.delivery.status === "sent") return result.delivery;
      return await this.attempt(result.delivery);
    } catch {
      return null;
    }
  }

  async retry(input: { applicationId: string; deliveryId: string }) {
    const delivery = await this.repository.findByIdAndApplication(
      input.deliveryId,
      input.applicationId,
    );
    if (!delivery) {
      throw Errors.business(
        404,
        "装企入驻通知记录不存在",
        ErrorCodes.TENANT_ONBOARDING_APPLICATION_NOT_FOUND,
      );
    }
    if (delivery.status === "sent") return delivery;
    return this.attempt(delivery);
  }

  private async attempt(delivery: TenantOnboardingNotificationDeliveryRecord) {
    const claimed = await this.repository.claimDelivery({
      deliveryId: delivery.id,
      applicationId: delivery.application_id,
      maxAttempts: this.maxAttempts,
      leaseSeconds: this.leaseSeconds,
      now: this.clock().toISOString(),
    });
    if (!claimed) return delivery;
    const claimToken = this.requireClaimToken(claimed);
    try {
      const recipient = await this.requireRecipient(delivery.application_id);
      await this.sendTemplate({
        phone: recipient.admin_phone,
        templatePurpose: SMS_PURPOSES[delivery.event_type],
        templateParam: this.templateParams(recipient),
      });
    } catch (error) {
      try {
        return await this.repository.finalizeFailed({
          deliveryId: delivery.id,
          applicationId: delivery.application_id,
          claimToken,
          lastError: this.sanitizeError(error),
        }) ?? await this.currentDelivery(delivery, claimed);
      } catch {
        return claimed;
      }
    }
    try {
      return await this.repository.finalizeSent({
        deliveryId: delivery.id,
        applicationId: delivery.application_id,
        claimToken,
        sentAt: this.clock().toISOString(),
      }) ?? await this.currentDelivery(delivery, claimed);
    } catch {
      return await this.currentDelivery(delivery, claimed);
    }
  }

  private async currentDelivery(
    delivery: TenantOnboardingNotificationDeliveryRecord,
    fallback: TenantOnboardingNotificationDeliveryRecord,
  ) {
    try {
      return await this.repository.findByIdAndApplication(
        delivery.id,
        delivery.application_id,
      ) ?? fallback;
    } catch {
      return fallback;
    }
  }

  private requireClaimToken(delivery: TenantOnboardingNotificationDeliveryRecord) {
    if (delivery.status !== "processing" || !delivery.claim_token) {
      throw Errors.dbError("装企入驻通知租约无效");
    }
    return delivery.claim_token;
  }

  private async requireRecipient(applicationId: string) {
    const recipient = await this.repository.loadCurrentApplicationRecipient(
      applicationId,
    );
    if (!recipient) {
      throw Errors.business(
        404,
        "装企入驻申请不存在",
        ErrorCodes.TENANT_ONBOARDING_APPLICATION_NOT_FOUND,
      );
    }
    return recipient;
  }

  private templateParams(recipient: TenantOnboardingApplicationRecipient) {
    return {
      application_no: recipient.application_no,
      company_name: recipient.company_name,
    };
  }

  private sanitizeError(error: unknown) {
    const code = this.publicErrorCode(error);
    return `${code}: 短信发送失败`.slice(0, 96);
  }

  private publicErrorCode(error: unknown) {
    if (typeof error !== "object" || error === null) return "SMS_DELIVERY_FAILED";
    const code = (error as Record<string, unknown>).code;
    return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)
      ? code
      : "SMS_DELIVERY_FAILED";
  }
}

export const tenantOnboardingNotificationsService =
  new TenantOnboardingNotificationsService();
