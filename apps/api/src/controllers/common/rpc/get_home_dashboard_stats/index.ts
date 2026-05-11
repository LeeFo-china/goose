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
        const authContext = await authorizationService.getRequiredAuthContext(
            request.user?.sub,
        );
        request.authContext = authContext;

        return ResponseHandler.success<HomeStatsResponse>(
            await homeDashboardService.getStats(authContext) as HomeStatsResponse,
        );
    }
}

export default new RpcController();
