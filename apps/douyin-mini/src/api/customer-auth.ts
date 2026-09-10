import type {
  CustomerAuthResult,
  CustomerIdentitySelectionResult,
  CustomerIdentityCandidate,
  CustomerSmsSendResult,
} from "../models";
import { ApiClient, ApiRequestError } from "./request";

type CustomerIdentitySelectionRequired = Extract<
  CustomerIdentitySelectionResult,
  { status: "selection_required" }
>;

export async function sendDouyinCustomerSmsCode(
  client: ApiClient,
  phone: string,
): Promise<CustomerSmsSendResult> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/customer-auth/sms/send-code",
    method: "POST",
    data: { phone },
  });
  const result = parseSmsSend(value);
  if (!result) throw invalidResponse();
  return result;
}

export async function verifyDouyinCustomerSms(
  client: ApiClient,
  input: { phone: string; code: string },
): Promise<CustomerIdentitySelectionResult> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/customer-auth/sms/verify",
    method: "POST",
    data: { phone: input.phone, code: input.code },
  });
  return parseAuthResult(value);
}

export async function authorizeDouyinCustomerPhone(
  client: ApiClient,
  douyinPhoneCode: string,
): Promise<CustomerIdentitySelectionResult> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/customer-auth/authorize-phone",
    method: "POST",
    data: { douyin_phone_code: douyinPhoneCode },
  });
  return parseAuthResult(value);
}

export async function selectDouyinCustomerIdentity(
  client: ApiClient,
  input: { selectionToken: string; candidateId: string },
): Promise<CustomerIdentitySelectionResult> {
  const value = await client.request<unknown>({
    path: "/douyin-mini/customer-auth/select",
    method: "POST",
    data: {
      selection_token: input.selectionToken,
      candidate_id: input.candidateId,
    },
  });
  return parseAuthResult(value);
}

function parseAuthResult(value: unknown): CustomerIdentitySelectionResult {
  if (!isRecord(value) || typeof value.status !== "string") throw invalidResponse();
  if (value.status === "authenticated") {
    const auth = parseCustomerAuth(value.auth);
    if (!auth) throw invalidResponse();
    return { status: "authenticated", auth };
  }
  if (
    value.status === "selection_required" &&
    typeof value.selection_token === "string" &&
    typeof value.expires_in === "number" &&
    typeof value.phone_masked === "string" &&
    Array.isArray(value.candidates)
  ) {
    const candidates = value.candidates.map(parseCandidate);
    if (candidates.every(Boolean)) {
      return {
        status: "selection_required",
        selection_token: value.selection_token,
        expires_in: value.expires_in,
        phone_masked: value.phone_masked,
        candidates: candidates as CustomerIdentitySelectionRequired["candidates"],
      };
    }
  }
  throw invalidResponse();
}

function parseSmsSend(value: unknown): CustomerSmsSendResult | null {
  if (!isRecord(value)) return null;
  return value.success === true && typeof value.cooldown_seconds === "number"
    ? { success: true, cooldown_seconds: value.cooldown_seconds }
    : null;
}

function parseCustomerAuth(value: unknown): CustomerAuthResult | null {
  if (!isRecord(value) || value.mode !== "customer" || !Array.isArray(value.roles)) return null;
  const tenant = isRecord(value.tenant) ? value.tenant : null;
  const customer = isRecord(value.customer) ? value.customer : null;
  if (!tenant || !customer || typeof value.token !== "string") return null;
  if (typeof customer.id !== "string" || typeof tenant.id !== "string") return null;
  return value as CustomerAuthResult;
}

function parseCandidate(value: unknown) {
  if (!isRecord(value) || value.target_mode !== "customer") return null;
  if (typeof value.candidate_id !== "string" || typeof value.title !== "string") return null;
  return value as CustomerIdentityCandidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidResponse(): ApiRequestError {
  return new ApiRequestError(502, "INVALID_API_RESPONSE", "客户登录数据无效");
}
