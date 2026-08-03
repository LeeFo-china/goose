import type { LaunchContext } from "../models";
import { ApiClient, ApiRequestError } from "./request";

export type SendLeadSmsInput = {
  phone: string;
  attribution: LaunchContext;
};

export type SendLeadSmsResult = {
  success: true;
  cooldown_seconds: number;
};

export type SubmitLeadInput = {
  name: string;
  phone: string;
  sms_code: string;
  community?: string;
  area?: number;
  budget?: string;
  start_time?: string;
  demand?: string;
  privacy_policy_version: string;
  consented_at: string;
  idempotency_key: string;
  attribution: LaunchContext;
};

export type SubmitLeadResult = {
  lead_id: string;
  already_submitted: boolean;
  updated_existing: boolean;
  message: "你已提交预约，我们将尽快联系你";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (!record
    || typeof record.lead_id !== "string"
    || !UUID_PATTERN.test(record.lead_id)
    || typeof record.already_submitted !== "boolean"
    || typeof record.updated_existing !== "boolean"
    || (record.updated_existing && !record.already_submitted)
    || record.message !== "你已提交预约，我们将尽快联系你") {
    throw invalidResponse();
  }
  return {
    lead_id: record.lead_id,
    already_submitted: record.already_submitted,
    updated_existing: record.updated_existing,
    message: record.message,
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function invalidResponse() {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "服务返回数据无效");
}
