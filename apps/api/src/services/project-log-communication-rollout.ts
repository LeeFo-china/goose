import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";
export const PROJECT_LOG_COMMUNICATION_ENABLED_KEY = "PROJECT_LOG_COMMUNICATION_ENABLED";
export const PROJECT_LOG_INTERNAL_COMMENTS_RETIRED_KEY = "PROJECT_LOG_INTERNAL_COMMENTS_RETIRED";
export const PROJECT_LOG_COMMENT_V2_ENABLED_KEY = "PROJECT_LOG_COMMENT_V2_ENABLED";
export class ProjectLogCommunicationRollout {
  constructor(private readonly getBoolean: (key: string, fallback: boolean) => Promise<boolean> = (key, fallback) => systemSettingsService.getBoolean(key, fallback)) { }
  async assertProjectAvailable(): Promise<void> {
    if (!await this.getBoolean(PROJECT_LOG_COMMUNICATION_ENABLED_KEY, false)) {
      throw Errors.business(403, "项目沟通暂未开放", "COMMENT_COMMUNICATION_DISABLED");
    }
  }
  async assertContract(version: 1 | 2): Promise<void> {
    const enabled = await this.getBoolean(PROJECT_LOG_COMMENT_V2_ENABLED_KEY, false);
    if (enabled && version === 1) {
      throw Errors.business(410, "评论功能已更新，请更新小程序", "PROJECT_COMMENT_CLIENT_UPDATE_REQUIRED");
    }
    if (!enabled && version === 2) {
      throw Errors.business(403, "新版项目评论暂未开放", "PROJECT_COMMENT_V2_DISABLED");
    }
  }
  async assertInternalAvailable(): Promise<void> {
    if (await this.getBoolean(PROJECT_LOG_INTERNAL_COMMENTS_RETIRED_KEY, false)) {
      throw Errors.business(410, "功能已调整，请更新小程序后使用项目沟通", "PROJECT_LOG_INTERNAL_COMMENTS_RETIRED");
    }
  }
}
export const projectLogCommunicationRollout = new ProjectLogCommunicationRollout();
