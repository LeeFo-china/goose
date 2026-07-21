import type {
  WechatPayApplymentPreflightPort,
  WechatPayApplymentSubmissionReadiness,
} from "@/services/wechat-pay-applyments-types";

const NON_REVIEW_BLOCKER_CODES = new Set([
  "APPLYMENT_STATUS_NOT_SUBMITTABLE",
  "APPLYMENT_SUBMISSION_LEASE_INVALID",
  "APPLYMENT_SUBMISSION_IN_PROGRESS",
]);
const PREFLIGHT_DETAIL_STATUSES = new Set([
  "submitted",
  "approved",
  "wechat_editing",
]);

export function shouldLoadWechatPayApplymentSubmissionReadiness(
  status: string,
): boolean {
  return PREFLIGHT_DETAIL_STATUSES.has(status);
}

export async function loadWechatPayApplymentSubmissionReadiness(
  preflightService: WechatPayApplymentPreflightPort,
  applymentId: string,
): Promise<WechatPayApplymentSubmissionReadiness> {
  try {
    const report = await preflightService.run(applymentId);
    return {
      ...report,
      review_ready: !report.blockers.some(isApplicationReviewBlocker),
    };
  } catch {
    return {
      ready: false,
      review_ready: false,
      blockers: [{ code: "PREFLIGHT_INTERNAL_ERROR" }],
    };
  }
}

function isApplicationReviewBlocker(input: { code: string }): boolean {
  if (NON_REVIEW_BLOCKER_CODES.has(input.code)) return false;
  return !input.code.startsWith("PLATFORM_PAYMENT_") &&
    !input.code.startsWith("WECHAT_PAY_");
}
