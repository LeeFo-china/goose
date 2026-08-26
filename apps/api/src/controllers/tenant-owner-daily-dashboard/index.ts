import type { FastifyReply, FastifyRequest } from "fastify";

import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  TenantOwnerDailyDashboardQuerySchema,
  TenantOwnerProjectGanttQuerySchema,
} from "@/schema/tenant-owner-daily-dashboard";
import { tenantOwnerDailyDashboardService } from "@/services/tenant-owner-daily-dashboard";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class TenantOwnerDailyDashboardController extends TenantBaseController {
  constructor() {
    super("tenant-owner-daily-dashboard");
  }

  @Get("/tenant-owner/daily-dashboard")
  async getDailyDashboard(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = TenantOwnerDailyDashboardQuerySchema.safeParse(
      request.query ?? {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await tenantOwnerDailyDashboardService.getDailyDashboard(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get("/tenant-owner/daily-dashboard/projects/gantt")
  async listProjectGantt(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = TenantOwnerProjectGanttQuerySchema.safeParse(
      request.query ?? {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await tenantOwnerDailyDashboardService.listProjectGantt(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new TenantOwnerDailyDashboardController();
