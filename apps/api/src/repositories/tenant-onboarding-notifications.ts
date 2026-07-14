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
  "status", "attempt_count", "last_error", "sent_at", "created_at", "updated_at",
].join(",");

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

  async markAttempting(input: {
    deliveryId: string;
    expectedAttemptCount: number;
    maxAttempts: number;
  }) {
    const { data, error } = await from("tenant_onboarding_notification_deliveries")
      .update({ attempt_count: input.expectedAttemptCount + 1, last_error: null })
      .eq("id", input.deliveryId)
      .eq("attempt_count", input.expectedAttemptCount)
      .in("status", ["pending", "failed"])
      .lt("attempt_count", input.maxAttempts)
      .select(DELIVERY_SELECT)
      .maybeSingle();
    if (error) throw Errors.dbError("更新装企入驻通知尝试次数失败", error);
    return (data as TenantOnboardingNotificationDeliveryRecord | null) ?? null;
  }

  async markSent(input: { deliveryId: string; sentAt: string }) {
    const { data, error } = await from("tenant_onboarding_notification_deliveries")
      .update({ status: "sent", sent_at: input.sentAt, last_error: null })
      .eq("id", input.deliveryId)
      .select(DELIVERY_SELECT)
      .single();
    if (error) throw Errors.dbError("标记装企入驻通知成功失败", error);
    return data as TenantOnboardingNotificationDeliveryRecord;
  }

  async markFailed(input: { deliveryId: string; lastError: string }) {
    const { data, error } = await from("tenant_onboarding_notification_deliveries")
      .update({ status: "failed", last_error: input.lastError, sent_at: null })
      .eq("id", input.deliveryId)
      .select(DELIVERY_SELECT)
      .single();
    if (error) throw Errors.dbError("标记装企入驻通知失败状态失败", error);
    return data as TenantOnboardingNotificationDeliveryRecord;
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
}

export const tenantOnboardingNotificationsRepository =
  new TenantOnboardingNotificationsRepository();
