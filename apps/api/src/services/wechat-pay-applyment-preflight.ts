import { AppError } from "@/errors/app-error";
import { ocrRecognitionRepository } from "@/repositories/ocr-recognitions";
import { platformPaymentConfigRepository } from "@/repositories/platform-payment-configs";
import {
  wechatPayApplymentRepository,
  type WechatPayApplymentRecord,
  type WechatPayApplymentSensitiveRecord,
} from "@/repositories/wechat-pay-applyments";
import {
  runWechatPayApplymentTenantReviewReadiness,
  type TenantReviewReadinessDependencies,
} from "@/services/wechat-pay-applyment-review-readiness";
import { loadApplymentRuntimeProfile } from "@/services/wechat-pay-applyment-submission-support";
import { wechatPaySecretBundleService } from "@/services/wechat-pay-secret-bundles";
import type {
  WechatPayApplymentPreflightBlocker,
  WechatPayApplymentPreflightPort,
  WechatPayApplymentPreflightReport,
} from "@/services/wechat-pay-applyments-types";

export type {
  WechatPayApplymentPreflightBlocker,
  WechatPayApplymentPreflightReport,
} from "@/services/wechat-pay-applyments-types";

const SUBMISSION_LEASE_MS = 5 * 60 * 1000;
const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const SUBMITTABLE_STATUSES = new Set(["approved", "wechat_editing"]);

type PreflightRepository = {
  findById: (input: { id: string }) => Promise<WechatPayApplymentRecord | null>;
  findSensitivePayloadById: (input: {
    id: string;
    tenantId: string;
  }) => Promise<WechatPayApplymentSensitiveRecord | null>;
};

type PreflightDependencies = TenantReviewReadinessDependencies & {
  repository?: PreflightRepository;
  loadRuntimeProfile?: () => Promise<unknown>;
  nowFactory?: () => string;
};

export function createWechatPayApplymentPreflightService(
  dependencies: PreflightDependencies = {},
): WechatPayApplymentPreflightPort {
  return {
    run: (applymentId) =>
      runWechatPayApplymentPreflight(applymentId, dependencies),
    runForApplyment: (applyment) =>
      runWechatPayApplymentPreflightForApplyment(applyment, dependencies),
  };
}

export async function runWechatPayApplymentPreflight(
  applymentId: string,
  dependencies: PreflightDependencies = {},
): Promise<WechatPayApplymentPreflightReport> {
  const blockers = createBlockerCollector();
  const repository = dependencies.repository ?? wechatPayApplymentRepository;
  let applyment: WechatPayApplymentRecord | null;

  try {
    applyment = await repository.findById({ id: applymentId });
  } catch {
    blockers.add({ code: "PREFLIGHT_DATA_ACCESS_FAILED" });
    return blockers.report();
  }
  if (!applyment) {
    blockers.add({ code: "APPLYMENT_NOT_FOUND" });
    return blockers.report();
  }

  return runWechatPayApplymentPreflightForApplyment(applyment, dependencies);
}

export async function runWechatPayApplymentPreflightForApplyment(
  applyment: WechatPayApplymentRecord,
  dependencies: PreflightDependencies = {},
): Promise<WechatPayApplymentPreflightReport> {
  const blockers = createBlockerCollector();
  const repository = dependencies.repository ?? wechatPayApplymentRepository;
  const now = dependencies.nowFactory?.() ?? new Date().toISOString();
  collectSubmissionStatusBlockers(applyment, now, blockers.add);
  const tenantReadiness = await runWechatPayApplymentTenantReviewReadiness(
    applyment,
    {
      repository,
      encryptionRootSecretFactory: dependencies.encryptionRootSecretFactory,
      ocrRecognitionRepository: dependencies.ocrRecognitionRepository ??
        ocrRecognitionRepository,
    },
  );
  for (const blocker of tenantReadiness.blockers) blockers.add(blocker);
  await collectRuntimeProfileBlockers(
    dependencies.loadRuntimeProfile ?? (() => loadApplymentRuntimeProfile({
      repository: platformPaymentConfigRepository,
      secretBundleService: wechatPaySecretBundleService,
    })),
    blockers.add,
  );

  return blockers.report();
}

function collectSubmissionStatusBlockers(
  applyment: WechatPayApplymentRecord,
  now: string,
  add: (blocker: WechatPayApplymentPreflightBlocker) => void,
) {
  if (SUBMITTABLE_STATUSES.has(applyment.status)) return;
  if (applyment.status !== "applying") {
    add({ code: "APPLYMENT_STATUS_NOT_SUBMITTABLE" });
    return;
  }
  if (!applyment.submission_claimed_at) return;
  const claimedAt = Date.parse(applyment.submission_claimed_at);
  const nowTime = Date.parse(now);
  if (!Number.isFinite(claimedAt) || !Number.isFinite(nowTime)) {
    add({ code: "APPLYMENT_SUBMISSION_LEASE_INVALID" });
    return;
  }
  if (claimedAt > nowTime - SUBMISSION_LEASE_MS) {
    add({ code: "APPLYMENT_SUBMISSION_IN_PROGRESS" });
  }
}

async function collectRuntimeProfileBlockers(
  loadRuntimeProfile: () => Promise<unknown>,
  add: (blocker: WechatPayApplymentPreflightBlocker) => void,
) {
  try {
    await loadRuntimeProfile();
  } catch (error) {
    if (!(error instanceof AppError)) {
      add({ code: "PREFLIGHT_INTERNAL_ERROR" });
      return;
    }
    const details = safeRecord(error.details);
    const blockerCodes = Array.isArray(details.blocker_codes)
      ? details.blocker_codes
      : [];
    const safeCodes = blockerCodes.filter((code): code is string =>
      typeof code === "string" && SAFE_CODE_PATTERN.test(code) &&
      code.startsWith("PLATFORM_PAYMENT_")
    );
    if (safeCodes.length > 0) {
      for (const code of safeCodes) add({ code });
      return;
    }
    add({
      code: isSafeRuntimeErrorCode(error.code)
        ? error.code
        : "PREFLIGHT_INTERNAL_ERROR",
    });
  }
}

function createBlockerCollector() {
  const blockers: WechatPayApplymentPreflightBlocker[] = [];
  const seen = new Set<string>();
  const add = (blocker: WechatPayApplymentPreflightBlocker) => {
    const key = JSON.stringify(blocker);
    if (seen.has(key)) return;
    seen.add(key);
    blockers.push(blocker);
  };
  return {
    add,
    report: (): WechatPayApplymentPreflightReport => ({
      ready: blockers.length === 0,
      blockers,
    }),
  };
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isSafeRuntimeErrorCode(code: string): boolean {
  return SAFE_CODE_PATTERN.test(code) &&
    (code.startsWith("PLATFORM_PAYMENT_") || code.startsWith("WECHAT_PAY_"));
}
