import type {
  DouyinMeasurementAppointmentResult,
  DouyinVisitPeriod,
  LaunchContext,
} from "../models";
import { ApiClient, ApiRequestError } from "./request";

export type SendLeadSmsInput = {
  phone: string;
  attribution: LaunchContext;
};

export type SendLeadSmsResult = {
  success: true;
  cooldown_seconds: number;
};

type SubmitLeadBaseInput = {
  name: string;
  community: string;
  preferred_visit_date: string;
  preferred_visit_period: DouyinVisitPeriod;
  budget_estimate_id?: string;
  demand?: string;
  privacy_policy_version: string;
  consented_at: string;
  idempotency_key: string;
  attribution: LaunchContext;
};

export type SubmitLeadInput = SubmitLeadBaseInput & ({
  verification_method?: "sms";
  phone: string;
  sms_code: string;
} | {
  verification_method: "douyin_phone";
  douyin_phone_code: string;
});

export type SubmitLeadResult = DouyinMeasurementAppointmentResult;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APPOINTMENT_NO_PATTERN = /^DYLF-[0-9]{8}-[0-9]{6}$/;
const APPOINTMENT_RESULT_KEYS = [
  "lead_id",
  "appointment_no",
  "already_submitted",
  "existing_customer_linked",
  "status",
  "message",
] as const;

export async function sendLeadSms(
  client: ApiClient,
  input: SendLeadSmsInput,
): Promise<SendLeadSmsResult> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/sms/send",
    method: "POST",
    data: input,
  });
  const record = toRecord(value);
  if (record?.success !== true
    || !Number.isInteger(record.cooldown_seconds)
    || Number(record.cooldown_seconds) < 1
    || Number(record.cooldown_seconds) > 300) {
    throw invalidResponse();
  }
  return {
    success: true,
    cooldown_seconds: Number(record.cooldown_seconds),
  };
}

export async function submitLead(
  client: ApiClient,
  input: SubmitLeadInput,
): Promise<SubmitLeadResult> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/leads",
    method: "POST",
    data: input,
  });
  const record = toRecord(value);
  if (!record || !hasOnlyKeys(record, APPOINTMENT_RESULT_KEYS)
    || typeof record.lead_id !== "string"
    || !UUID_PATTERN.test(record.lead_id)
    || typeof record.appointment_no !== "string"
    || !APPOINTMENT_NO_PATTERN.test(record.appointment_no)
    || typeof record.already_submitted !== "boolean"
    || typeof record.existing_customer_linked !== "boolean"
    || record.status !== "pending_confirmation"
    || record.message !== "量房申请已提交，工作人员将与你确认具体时间") {
    throw invalidResponse();
  }
  return {
    lead_id: record.lead_id,
    appointment_no: record.appointment_no,
    already_submitted: record.already_submitted,
    existing_customer_linked: record.existing_customer_linked,
    status: "pending_confirmation",
    message: record.message,
  };
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length
    && actualKeys.every((key) => keys.includes(key));
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function invalidResponse() {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "服务返回数据无效");
}
