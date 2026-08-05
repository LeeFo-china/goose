import { Errors } from "@/errors/error-factory";
import {
  platformAuditLogRepository,
  type PlatformAuditLogCreateInput,
} from "@/repositories/platform-audit-logs";
import type { PlatformAuditLogListQuery } from "@/schema/platform-audit-logs";
import type { AuthContext } from "@/services/authorization";
import { platformAuthorizationService } from "@/services/platform-authorization";

class PlatformAuditLogService {
  async list(query: PlatformAuditLogListQuery, authContext: AuthContext) {
    platformAuthorizationService.assertPermission(
      authContext,
      "platform.audit.read",
    );
    return platformAuditLogRepository.list(query);
  }

  async record(input: PlatformAuditLogCreateInput) {
    return platformAuditLogRepository.create(input);
  }

  async recordBestEffort(input: PlatformAuditLogCreateInput) {
    try {
      return await this.record(input);
    } catch {
      return null;
    }
  }
}

export const platformAuditLogService = new PlatformAuditLogService();
