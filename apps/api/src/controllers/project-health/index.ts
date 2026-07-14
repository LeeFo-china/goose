import type { FastifyReply, FastifyRequest } from "fastify";

import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { ProjectOperationalRiskListQuerySchema } from "@/schema/project-health";
import { projectOperationalRiskService } from "@/services/project-operational-risks";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class ProjectHealthController extends TenantBaseController {
  constructor() {
    super("project-health");
  }

  @Get("/project-health/risks")
  async listRisks(request: FastifyRequest, reply: FastifyReply) {
    const startedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);
    const query = ProjectOperationalRiskListQuerySchema.safeParse(
      request.query ?? {},
    );
    if (!query.success) throw Errors.fromZod(query.error);

    const result = await projectOperationalRiskService.listRisks(
      authContext,
      query.data,
    );
    const serializeStartedAt = Date.now();
    const response = ResponseHandler.success(result.data);
    const serializeMs = Date.now() - serializeStartedAt;
    const totalMs = Date.now() - startedAt;
    const logPayload = {
      requestId: request.id,
      tenantId: authContext.tenantId,
      employeeId: authContext.employeeId,
      page: query.data.page,
      pageSize: query.data.pageSize,
      riskType: query.data.risk_type ?? null,
      severity: query.data.severity ?? null,
      hasKeyword: Boolean(query.data.keyword),
      rpcMs: result.timing.rpcMs,
      serviceMs: result.timing.serviceMs,
      serializeMs,
      totalMs,
      itemCount: result.data.items.length,
      riskTotal: result.data.summary.total,
    };

    if (totalMs >= 1000) {
      request.log.warn(logPayload, "[project-health] slow list");
    } else {
      request.log.info(logPayload, "[project-health] list timings");
    }

    return response;
  }
}

export default new ProjectHealthController();
