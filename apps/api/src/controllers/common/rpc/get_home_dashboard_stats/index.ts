import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ResponseHandler } from "@/utils/response";
import type { HomeStatsResponse } from "@/types/api";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { Get } from "@/utils/decorators/route";
import { authorizationService } from "@/services/authorization";
import { homeDashboardService } from "@/services/home-dashboard";

const HomeStatsQuerySchema = z.object({
    debug_timing: z.preprocess((value) => {
        if (value == null || value === "") return false;
        if (typeof value === "string") {
            return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
        }
        return value;
    }, z.boolean().default(false)),
});

export class RpcController extends BaseController {
    constructor() {
        super("rpc");
    }

    @Get("/home_stats")
    async get_home_dashboard_stats(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        const queryResult = HomeStatsQuerySchema.safeParse(request.query);
        if (!queryResult.success) {
            throw Errors.fromZod(queryResult.error);
        }
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

        return ResponseHandler.success<HomeStatsResponse & {
            debug_timing?: Record<string, number | string | null>;
        }>({
            ...data,
            ...(queryResult.data.debug_timing
                ? {
                    debug_timing: {
                        auth_context_ms: authContextMs,
                        service_ms: serviceMs,
                        total_ms: authContextMs + serviceMs,
                    },
                }
                : {}),
        });
    }
}

export default new RpcController();
