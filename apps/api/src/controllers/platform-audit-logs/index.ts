import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import { PlatformAuditLogListQuerySchema } from "@/schema/platform-audit-logs";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class PlatformAuditLogsController extends PlatformBaseController {
  constructor() {
    super("platform_audit_logs");
  }

  @Get("/platform/audit-logs")
  async listAuditLogs(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredPlatformAdminContext(request);

    const queryResult = PlatformAuditLogListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformAuditLogService.list(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }
}

export default new PlatformAuditLogsController();
