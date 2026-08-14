export type DouyinAuditRejectionReasonInput = {
  status: string;
  audit_result: {
    status?: string;
    reason?: string;
  } | null;
} | null;

/**
 * 返回抖音审核驳回原因。
 *
 * 展示条件采用 OR 语义（有意为之）：`release.status === "audit_rejected"`
 * 或 `audit_result.status === "rejected"` 任一满足即返回原因，避免主档状态
 * 与审核结果短暂不同步时漏掉驳回原因。
 */
export function getDouyinAuditRejectionReason(
  input: DouyinAuditRejectionReasonInput,
): string | null {
  const reason = input?.audit_result?.reason?.trim();
  if (!reason) return null;
  if (
    input?.status === "audit_rejected"
    || input?.audit_result?.status === "rejected"
  ) {
    return reason;
  }
  return null;
}
