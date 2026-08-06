import { socialVideoScriptRepository, socialVideoTranscriptionRepository, Errors } from "./shared";
import type { AuthContext, ListSocialVideoScriptsQuery } from "./shared";
import { serializeScript } from "./normalization";

type PlatformScriptsAccess = {
  assertCanReadPlatformScripts: (authContext: AuthContext) => void;
};

export async function listScripts(this: any, 
  transcriptionId: string,
  query: ListSocialVideoScriptsQuery,
  authContext: AuthContext,
) {
  const transcription = await socialVideoTranscriptionRepository.findById(transcriptionId);
  if (!transcription) {
    throw Errors.business(
      404,
      "转写任务不存在",
      "SOCIAL_VIDEO_TRANSCRIPTION_NOT_FOUND",
    );
  }

  this.assertCanUseTranscription(authContext, transcription);

  const result = await socialVideoScriptRepository.listByTranscription({
    tenantId: transcription.tenant_id,
    transcriptionId,
    page: query.page,
    pageSize: query.pageSize,
    targetPlatform: query.target_platform,
    style: query.style,
    status: query.status,
  });

  return {
    items: result.items.map((item) => serializeScript(item)),
    total: result.total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function listAdminScripts(this: any, 
  query: ListSocialVideoScriptsQuery,
  authContext: AuthContext,
) {
  this.assertCanManage(authContext);
  const tenantId = this.getTenantIdForAdmin(authContext);

  const result = await socialVideoScriptRepository.listAll({
    tenantId,
    page: query.page,
    pageSize: query.pageSize,
    targetPlatform: query.target_platform,
    style: query.style,
    status: query.status,
  });

  return {
    items: result.items.map((item) => serializeScript(item)),
    total: result.total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function listPlatformScripts(this: PlatformScriptsAccess,
  query: ListSocialVideoScriptsQuery,
  authContext: AuthContext,
) {
  this.assertCanReadPlatformScripts(authContext);

  const result = await socialVideoScriptRepository.listAll({
    tenantId: null,
    page: query.page,
    pageSize: query.pageSize,
    targetPlatform: query.target_platform,
    style: query.style,
    status: query.status,
  });

  return {
    items: result.items.map((item) => serializeScript(item)),
    total: result.total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
