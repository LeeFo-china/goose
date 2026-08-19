import type {
  AdminServiceAccessAction,
  PlatformServiceTrialStatus,
} from "@gooes/domain";

import { requestBackendJson } from "@/lib/backend-client";

const CURRENT_TRIAL_PATH = "/billing/service-trials/current";
const RECENT_TRIALS_PATH = "/billing/service-trials?page=1&pageSize=20";
const TRIAL_APPLICATION_PATH = "/billing/service-trials/applications";

export type ServiceTrial = {
  status: PlatformServiceTrialStatus;
  application_reason: string | null;
  expected_user_count: number | null;
  expected_project_count: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  requested_at: string | null;
  reviewed_at: string | null;
  starts_at: string | null;
  trial_ends_at: string | null;
  grace_ends_at: string | null;
};

export type ServiceTrialCurrentResponse = {
  trial: ServiceTrial | null;
};

export type ServiceTrialListResponse = {
  list: ServiceTrial[];
};

export type ServiceTrialCommandResponse = {
  trial: ServiceTrial;
  idempotent: boolean;
};

export type ServiceTrialRequest = {
  applicationReason: string;
  expectedUserCount: number;
  expectedProjectCount: number;
  contactName: string;
  contactPhone: string;
};

export type ServiceTrialFormValues = {
  applicationReason: string;
  expectedUserCount: string;
  expectedProjectCount: string;
  contactName: string;
  contactPhone: string;
};

export type ServiceTrialRequestParseResult =
  | { success: true; data: ServiceTrialRequest }
  | { success: false; message: string };

export type ServiceTrialRequester = <Response = unknown>(
  path: string,
  init?: Parameters<typeof requestBackendJson>[1],
) => Promise<Response>;

type IdempotencyKeyFactory = () => string;

export function getCurrentServiceTrial(
  requester: ServiceTrialRequester = requestBackendJson,
): Promise<ServiceTrialCurrentResponse> {
  return requester<ServiceTrialCurrentResponse>(CURRENT_TRIAL_PATH, {
    cache: "no-store",
    fallbackMessage: "当前试用状态加载失败",
  });
}

export function listRecentServiceTrials(
  requester: ServiceTrialRequester = requestBackendJson,
): Promise<ServiceTrialListResponse> {
  return requester<ServiceTrialListResponse>(RECENT_TRIALS_PATH, {
    cache: "no-store",
    fallbackMessage: "最近试用申请加载失败",
  });
}

export async function loadCurrentOrRecentServiceTrial(
  requester: ServiceTrialRequester = requestBackendJson,
): Promise<ServiceTrial | null> {
  const current = await getCurrentServiceTrial(requester);
  if (current.trial) return current.trial;

  const recent = await listRecentServiceTrials(requester);
  return recent.list[0] ?? null;
}

export function applyForServiceTrial(
  request: ServiceTrialRequest,
  idempotencyKey: string,
  requester: ServiceTrialRequester = requestBackendJson,
): Promise<ServiceTrialCommandResponse> {
  return requester<ServiceTrialCommandResponse>(TRIAL_APPLICATION_PATH, {
    method: "POST",
    body: JSON.stringify({
      application_reason: request.applicationReason,
      expected_user_count: request.expectedUserCount,
      expected_project_count: request.expectedProjectCount,
      contact_name: request.contactName,
      contact_phone: request.contactPhone,
      idempotency_key: idempotencyKey,
    }),
    fallbackMessage: "试用申请提交失败",
  });
}

export function createServiceTrialSubmissionIntent(
  keyFactory: IdempotencyKeyFactory = () => crypto.randomUUID(),
) {
  let fingerprint: string | null = null;
  let idempotencyKey: string | null = null;

  return {
    keyFor(request: ServiceTrialRequest): string {
      const nextFingerprint = requestFingerprint(request);
      if (nextFingerprint !== fingerprint || !idempotencyKey) {
        fingerprint = nextFingerprint;
        idempotencyKey = keyFactory();
      }
      return idempotencyKey;
    },
    clearAfterSuccess(): void {
      fingerprint = null;
      idempotencyKey = null;
    },
    clearAfterChange(): void {
      fingerprint = null;
      idempotencyKey = null;
    },
  };
}

export function getServiceTrialRecoveryCapabilities(
  actionKeys: readonly AdminServiceAccessAction["key"][],
  permissionCodes: readonly string[],
): { canApply: boolean; canView: boolean } {
  const actions = new Set(actionKeys);
  const permissions = new Set(permissionCodes);
  return {
    canApply: actions.has("apply_trial")
      && permissions.has("billing.service_trial.apply"),
    canView: actions.has("view_trial")
      && permissions.has("billing.service_trial.read"),
  };
}

export function canShowServiceTrialApplication(
  canApply: boolean,
  status: PlatformServiceTrialStatus | null,
): boolean {
  return canApply && status !== "pending_review" && status !== "scheduled";
}

export function parseServiceTrialRequest(
  values: ServiceTrialFormValues,
): ServiceTrialRequestParseResult {
  const applicationReason = values.applicationReason.trim();
  if (!applicationReason) {
    return { success: false, message: "请输入试用目的" };
  }
  if (applicationReason.length > 1_000) {
    return { success: false, message: "试用目的不能超过 1000 个字符" };
  }

  const expectedUserCount = Number(values.expectedUserCount);
  if (!Number.isInteger(expectedUserCount)
    || expectedUserCount < 1 || expectedUserCount > 10_000) {
    return { success: false, message: "预计使用人数须为 1 到 10000 的整数" };
  }

  const expectedProjectCount = Number(values.expectedProjectCount);
  if (!Number.isInteger(expectedProjectCount)
    || expectedProjectCount < 1 || expectedProjectCount > 100_000) {
    return { success: false, message: "预计项目数量须为 1 到 100000 的整数" };
  }

  const contactName = values.contactName.trim();
  if (!contactName) return { success: false, message: "请输入联系人" };
  if (contactName.length > 60) {
    return { success: false, message: "联系人不能超过 60 个字符" };
  }

  const contactPhone = values.contactPhone.trim();
  if (!/^1[3-9]\d{9}$/.test(contactPhone)) {
    return { success: false, message: "请输入正确的中国大陆手机号" };
  }

  return {
    success: true,
    data: {
      applicationReason,
      expectedUserCount,
      expectedProjectCount,
      contactName,
      contactPhone,
    },
  };
}

export function formatServiceTrialError(
  error: unknown,
  fallbackMessage: string,
): string {
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : fallbackMessage;
  if (!error || typeof error !== "object" || !("requestId" in error)) {
    return message;
  }

  const requestId = error.requestId;
  return typeof requestId === "string" && requestId.trim()
    ? `${message}（Request-ID：${requestId.trim()}）`
    : message;
}

function requestFingerprint(request: ServiceTrialRequest): string {
  return JSON.stringify([
    request.applicationReason,
    request.expectedUserCount,
    request.expectedProjectCount,
    request.contactName,
    request.contactPhone,
  ]);
}
