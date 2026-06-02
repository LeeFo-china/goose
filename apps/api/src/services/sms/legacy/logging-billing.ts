import { createHash } from "node:crypto";
import {
  billingService,
  smsSendLogRepository,
  type SmsChannel,
  type SmsProviderResult,
  type SmsTemplatePurpose,
} from "./shared";

function maskPhone(phone: string) {
  const normalized = phone.trim();
  if (normalized.length < 7) return "***";
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function hashPhone(phone: string) {
  const salt = process.env.SMS_LOG_HASH_SALT || process.env.JWT_SECRET || "gooes_sms_log";
  return createHash("sha256")
    .update(`${phone.trim()}:${salt}`, "utf8")
    .digest("hex");
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code || "SMS_SEND_FAILED");
  }

  return "SMS_SEND_FAILED";
}

export function isSmsChargeEnabled() {
  return String(process.env.SMS_CHARGE_ENABLED || "").toLowerCase() === "true";
}

export async function assertSmsChargeAvailable(input: {
  channel: SmsChannel;
  purpose: SmsTemplatePurpose;
  templateCode?: string | null;
}) {
  if (!isSmsChargeEnabled() || !input.channel.tenantId) {
    return;
  }

  await billingService.assertSmsChargeAvailable({
    tenantId: input.channel.tenantId,
    smsCount: 1,
    purpose: input.purpose,
    provider: input.channel.provider,
    templateCode: input.templateCode,
  });
}

export async function recordSmsBilling(input: {
  log: Awaited<ReturnType<typeof smsSendLogRepository.create>>;
  chargeEnabled: boolean;
}) {
  if (!input.log) return;

  const result = await billingService.recordSmsBilling({
    log: input.log,
    chargeEnabled: input.chargeEnabled,
  });

  if (result?.event) {
    await smsSendLogRepository.markBillingResult({
      id: input.log.id,
      billingEventId: result.event.id,
      billed: result.settled,
    });
  }
}

export async function logSmsSend(input: {
  channel: SmsChannel;
  phone: string;
  purpose: SmsTemplatePurpose;
  templateCode?: string | null;
  status: "success" | "failure" | "mock" | "disabled";
  providerResult?: SmsProviderResult | null;
  error?: unknown;
  durationMs?: number | null;
  smsCount?: number;
}) {
  try {
    return await smsSendLogRepository.create({
      tenantId: input.channel.tenantId || null,
      provider: input.channel.provider,
      channelMode: input.channel.channelMode,
      purpose: input.purpose,
      templateCode: input.templateCode || null,
      phoneMasked: maskPhone(input.phone),
      phoneHash: hashPhone(input.phone),
      status: input.status,
      requestId: input.providerResult?.requestId || null,
      providerCode: input.providerResult?.providerCode || null,
      providerMessage: input.providerResult?.providerMessage || null,
      errorCode: input.error ? getErrorCode(input.error) : null,
      errorMessage: input.error instanceof Error ? input.error.message : null,
      smsCount: input.smsCount ?? (input.status === "mock" || input.status === "disabled" ? 0 : 1),
      deliveryStatus: input.status === "success"
        ? "submitted_success"
        : input.status === "failure"
          ? "submit_failed"
          : null,
      durationMs: input.durationMs ?? null,
      metadata: {
        strict_tenant_config: input.channel.strictTenantConfig,
      },
    });
  } catch {
    // 短信日志不能影响主业务链路。
    return null;
  }
}
