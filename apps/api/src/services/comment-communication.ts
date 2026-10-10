import { Errors } from "@/errors/error-factory";

// Product-wide suspension: no tenant, role, client version or review-build override.
// Reopening requires category qualification, content moderation and a new release review.
export const COMMENT_COMMUNICATION_ENABLED = false;

export function assertCommentCommunicationAvailable(): void {
  if (!COMMENT_COMMUNICATION_ENABLED) {
    throw Errors.business(403, "交流功能暂未开放", "COMMENT_COMMUNICATION_DISABLED");
  }
}

export function assertCommentMediaAvailable(scene: string | null | undefined): void {
  if (scene === "project_log_comment" || scene === "customer_follow_up_comment" || scene === "picture_comment") {
    assertCommentCommunicationAvailable();
  }
}
