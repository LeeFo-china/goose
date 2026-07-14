import { Errors } from "@/errors/error-factory";
import { isPostgresUniqueViolation } from "@/repositories/repository-errors";
import type {
  TenantOnboardingNotificationDeliveryRecord,
  TenantOnboardingNotificationEventType,
} from "@/repositories/tenant-onboarding-types";
import { SupabaseDB } from "@/utils/supabase";

const DELIVERY_UNIQUE_CONSTRAINT =
  "tenant_onboarding_notifications_delivery_unique";
const DELIVERY_SELECT = [
  "id", "application_id", "application_version", "event_type", "channel",
  "status", "attempt_count", "last_error", "sent_at", "claim_token",
  "claim_expires_at", "created_at", "updated_at",
].join(",");
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TenantOnboardingApplicationRecipient = {
  application_id: string;
  application_no: string;
  company_name: string;
  admin_phone: string;
};

type DeliveryKey = {
  application_id: string;
  application_version: number;
  event_type: TenantOnboardingNotificationEventType;
  channel: "sms";
};

type TableName =
  | "tenant_onboarding_applications"
  | "tenant_onboarding_notification_deliveries";

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  in: (...args: unknown[]) => UntypedTable;
  lt: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
};

type UntypedClient = { from: (table: TableName) => UntypedTable };
type UntypedRpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

function from(table: TableName): UntypedTable {
  return (SupabaseDB.getAdminClient() as unknown as UntypedClient).from(table);
}

function hasDeliveryConstraint(error: unknown): boolean {
  if (!isPostgresUniqueViolation(error) || typeof error !== "object" || !error) {
    return false;
  }
  const record = error as Record<string, unknown>;
  return [record.constraint, record.message, record.details].some((value) =>
    typeof value === "string" && value.includes(DELIVERY_UNIQUE_CONSTRAINT)
  );
}

class TenantOnboardingNotificationsRepository {
  async findOrCreateDelivery(input: DeliveryKey) {
    const existing = await this.findExact(input);
    if (existing) return { delivery: existing, created: false as const };

    const { data, error } = await from("tenant_onboarding_notification_deliveries")
      .insert(input)
      .select(DELIVERY_SELECT)
      .single();
    if (!error) {
      return {
        delivery: data as TenantOnboardingNotificationDeliveryRecord,
        created: true as const,
      };
    }
    if (hasDeliveryConstraint(error)) {
      const concurrent = await this.findExact(input);
      if (concurrent) return { delivery: concurrent, created: false as const };
    }
    throw Errors.dbError("创建装企入驻通知记录失败", error);
  }

  async findByIdAndApplication(deliveryId: string, applicationId: string) {
    const { data, error } = await from("tenant_onboarding_notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("id", deliveryId)
      .eq("application_id", applicationId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻通知记录失败", error);
    return (data as TenantOnboardingNotificationDeliveryRecord | null) ?? null;
  }

  async claimDelivery(input: {
    deliveryId: string;
    applicationId: string;
    maxAttempts: number;
    leaseSeconds: number;
    now: string;
  }) {
    const { data, error } = await this.rpc("claim_tenant_onboarding_notification", {
      p_delivery_id: input.deliveryId,
      p_application_id: input.applicationId,
      p_max_attempts: input.maxAttempts,
      p_lease_seconds: input.leaseSeconds,
      p_now: input.now,
    });
    if (error) throw Errors.dbError("领取装企入驻通知任务失败", error);
    return this.parseRpcDelivery(data, true, "领取装企入驻通知任务失败");
  }

  async finalizeSent(input: {
    deliveryId: string;
    applicationId: string;
    claimToken: string;
    sentAt: string;
  }) {
    const { data, error } = await this.rpc(
      "finalize_tenant_onboarding_notification_sent",
      {
        p_delivery_id: input.deliveryId,
        p_application_id: input.applicationId,
        p_claim_token: input.claimToken,
        p_sent_at: input.sentAt,
      },
    );
    if (error) throw Errors.dbError("标记装企入驻通知成功失败", error);
    return this.parseRpcDelivery(data, false, "标记装企入驻通知成功失败");
  }

  async finalizeFailed(input: {
    deliveryId: string;
    applicationId: string;
    claimToken: string;
    lastError: string;
  }) {
    const { data, error } = await this.rpc(
      "finalize_tenant_onboarding_notification_failed",
      {
        p_delivery_id: input.deliveryId,
        p_application_id: input.applicationId,
        p_claim_token: input.claimToken,
        p_last_error: input.lastError,
      },
    );
    if (error) throw Errors.dbError("标记装企入驻通知失败状态失败", error);
    return this.parseRpcDelivery(data, false, "标记装企入驻通知失败状态失败");
  }

  async loadCurrentApplicationRecipient(applicationId: string) {
    const { data, error } = await from("tenant_onboarding_applications")
      .select("id,application_no,company_name,admin_phone")
      .eq("id", applicationId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻通知接收人失败", error);
    const row = data as {
      id: string;
      application_no: string;
      company_name: string;
      admin_phone: string;
    } | null;
    return row
      ? {
        application_id: row.id,
        application_no: row.application_no,
        company_name: row.company_name,
        admin_phone: row.admin_phone,
      }
      : null;
  }

  private async findExact(input: DeliveryKey) {
    const { data, error } = await from("tenant_onboarding_notification_deliveries")
      .select(DELIVERY_SELECT)
      .eq("application_id", input.application_id)
      .eq("application_version", input.application_version)
      .eq("event_type", input.event_type)
      .eq("channel", input.channel)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻通知去重记录失败", error);
    return (data as TenantOnboardingNotificationDeliveryRecord | null) ?? null;
  }

  private rpc(name: string, params: Record<string, unknown>) {
    return (SupabaseDB.getAdminClient() as unknown as UntypedRpcClient)
      .rpc(name, params);
  }

  private parseRpcDelivery(
    data: unknown,
    requireClaim: boolean,
    message: string,
  ) {
    if (Array.isArray(data) && data.length === 0) return null;
    const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
    if (!row || typeof row !== "object") throw this.invalidRpcResult(message);
    const record = row as Record<string, unknown>;
    const validStatus = ["pending", "processing", "sent", "failed"].includes(
      String(record.status),
    );
    const validEvent = ["submitted", "supplement_required", "approved", "rejected"]
      .includes(String(record.event_type));
    const nullableString = (value: unknown) =>
      value === null || typeof value === "string";
    if (
      typeof record.id !== "string" || !UUID_PATTERN.test(record.id) ||
      typeof record.application_id !== "string" ||
      !UUID_PATTERN.test(record.application_id) ||
      !Number.isInteger(record.application_version) || !validEvent ||
      record.channel !== "sms" || !Number.isInteger(record.attempt_count) ||
      !validStatus || !nullableString(record.last_error) ||
      !nullableString(record.sent_at) || !nullableString(record.claim_token) ||
      !nullableString(record.claim_expires_at) ||
      typeof record.created_at !== "string" ||
      typeof record.updated_at !== "string" ||
      (requireClaim && (
        record.status !== "processing" ||
        typeof record.claim_token !== "string" ||
        !UUID_PATTERN.test(record.claim_token)
      ))
    ) throw this.invalidRpcResult(message);
    return record as TenantOnboardingNotificationDeliveryRecord;
  }

  private invalidRpcResult(message: string) {
    return Errors.dbError(message, {
      message: "tenant onboarding notification RPC returned invalid data",
    });
  }
}

export const tenantOnboardingNotificationsRepository =
  new TenantOnboardingNotificationsRepository();
