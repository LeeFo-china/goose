import type { FastifyReply, FastifyRequest } from "fastify";
import { ResponseHandler } from "@/utils/response";
import type { HomeStatsResponse } from "@/types/api";
import { BaseController } from "@/controllers/BaseController";
import { Get } from "@/utils/decorators/route";
import { authorizationService } from "@/services/authorization";
import { homeDashboardService } from "@/services/home-dashboard";

export class RpcController extends BaseController {
    constructor() {
        super("rpc");
    }

    @Get("/home_stats")
    async get_home_dashboard_stats(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        const authContextStartedAt = Date.now();
        const authContext = await authorizationService.getRequiredAuthContext(
            request.user?.sub,
        );
        const authContextMs = Date.now() - authContextStartedAt;
        request.authContext = authContext;

        const serviceStartedAt = Date.now();
        const data = await homeDashboardService.getStats(authContext) as HomeStatsResponse;
        const serviceMs = Date.now() - serviceStartedAt;

        request.log.info(
            {
                employeeId: authContext.employeeId,
                tenantId: authContext.tenantId,
                authContextMs,
                serviceMs,
            },
            "[home-stats] timings",
        );

        return ResponseHandler.success<HomeStatsResponse>(
            data,
        );
    }
}

export default new RpcController();
