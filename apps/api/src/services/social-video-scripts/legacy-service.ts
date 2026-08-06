import {
  canManage,
  assertCanManage,
  assertCanReadPlatformScripts,
  assertCanUseTranscription,
  getTenantIdForAdmin,
} from "./legacy/permissions";
import {
  assertDailyLimit,
  findCached,
  normalizeScriptInput,
  generateScript,
} from "./legacy/generation";
import { listScripts, listAdminScripts, listPlatformScripts } from "./legacy/lists";
import { incrementCounter, getUsageSummary } from "./legacy/usage";

class SocialVideoScriptService {
  private canManage = canManage;
  private assertCanManage = assertCanManage;
  assertCanReadPlatformScripts = assertCanReadPlatformScripts;
  private assertCanUseTranscription = assertCanUseTranscription;
  private getTenantIdForAdmin = getTenantIdForAdmin;
  private incrementCounter = incrementCounter;
  private assertDailyLimit = assertDailyLimit;
  private findCached = findCached;
  private normalizeScriptInput = normalizeScriptInput;
  generateScript = generateScript;
  listScripts = listScripts;
  listAdminScripts = listAdminScripts;
  listPlatformScripts = listPlatformScripts;
  getUsageSummary = getUsageSummary;
}

export const socialVideoScriptService = new SocialVideoScriptService();
