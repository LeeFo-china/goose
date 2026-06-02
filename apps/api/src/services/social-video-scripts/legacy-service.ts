import {
  canManage,
  assertCanManage,
  assertCanUseTranscription,
  getTenantIdForAdmin,
} from "./legacy/permissions";
import {
  assertDailyLimit,
  findCached,
  normalizeScriptInput,
  generateScript,
} from "./legacy/generation";
import { listScripts, listAdminScripts } from "./legacy/lists";
import { incrementCounter, getUsageSummary } from "./legacy/usage";

class SocialVideoScriptService {
  private canManage = canManage;
  private assertCanManage = assertCanManage;
  private assertCanUseTranscription = assertCanUseTranscription;
  private getTenantIdForAdmin = getTenantIdForAdmin;
  private incrementCounter = incrementCounter;
  private assertDailyLimit = assertDailyLimit;
  private findCached = findCached;
  private normalizeScriptInput = normalizeScriptInput;
  generateScript = generateScript;
  listScripts = listScripts;
  listAdminScripts = listAdminScripts;
  getUsageSummary = getUsageSummary;
}

export const socialVideoScriptService = new SocialVideoScriptService();
