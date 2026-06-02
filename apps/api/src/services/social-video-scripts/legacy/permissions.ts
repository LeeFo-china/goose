import { accessPolicyService, Errors } from "./shared";
import type { AuthContext } from "./shared";

export function canManage(this: any, authContext: AuthContext) {
  return authContext.roleCodes.includes("system_admin")
    || accessPolicyService.hasPermission(authContext, "social_video_transcription.manage");
}

export function assertCanManage(this: any, authContext: AuthContext) {
  if (!this.canManage(authContext)) {
    throw Errors.forbidden();
  }
}

export function assertCanUseTranscription(this: any, 
  authContext: AuthContext,
  transcription: { created_by_auth_user_id: string | null; tenant_id?: string | null },
) {
  if (
    authContext.tenantId &&
    transcription.tenant_id &&
    transcription.tenant_id !== authContext.tenantId &&
    !authContext.isPlatformAdmin
  ) {
    throw Errors.business(
      403,
      "当前用户无权访问该转写任务",
      "SOCIAL_VIDEO_TRANSCRIPTION_FORBIDDEN",
    );
  }

  if (
    transcription.created_by_auth_user_id &&
    transcription.created_by_auth_user_id !== authContext.authUserId &&
    !this.canManage(authContext)
  ) {
    throw Errors.business(
      403,
      "当前用户无权访问该转写任务",
      "SOCIAL_VIDEO_TRANSCRIPTION_FORBIDDEN",
    );
  }
}

export function getTenantIdForAdmin(this: any, authContext: AuthContext) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  return tenantId || null;
}
