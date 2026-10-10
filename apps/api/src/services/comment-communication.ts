import { Errors } from "@/errors/error-factory";

// Legacy mixed/public communication remains suspended for every tenant and client.
// The separate employee-only internal text channel has its own project access and moderation;
// this switch must not be enabled to restore it or any legacy media scene.
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
