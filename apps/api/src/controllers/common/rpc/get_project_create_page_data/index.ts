import type { FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase";
import { Errors } from "@/errors/error-factory";
import { ResponseHandler } from "@/utils/response";
import { BaseController } from "@/controllers/BaseController";
import { Post } from "@/utils/decorators/route";
import { any } from "zod";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";

export class GetProjectCreatePageDataController extends BaseController {
    constructor() {
        super("rpc");
    }

    private async getRequiredAuthContext(request: FastifyRequest) {
        const authContext = await authorizationService.getRequiredAuthContext(
            request.user?.sub,
        );
        request.authContext = authContext;
        return authContext;
    }

    @Post("/create_project_page")
    async get_project_create_page_data(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        const authContext = await this.getRequiredAuthContext(request);
        accessPolicyService.assertPermission(authContext, "project.create");

        const { data, error } = await SupabaseDB.getAdminClient().rpc(
            "get_project_create_page_data",
        );

        if (error) throw Errors.dbError("call rpc error");

        return ResponseHandler.success<any>(data);
    }
}

export default new GetProjectCreatePageDataController();
