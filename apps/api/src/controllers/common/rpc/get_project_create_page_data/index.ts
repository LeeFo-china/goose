import type { FastifyReply, FastifyRequest } from "fastify";
import { ResponseHandler } from "@/utils/response";
import { BaseController } from "@/controllers/BaseController";
import { Post } from "@/utils/decorators/route";
import { authorizationService } from "@/services/authorization";
import { projectCreatePageDataService } from "@/services/project-create-page-data";

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

        return ResponseHandler.success(
            await projectCreatePageDataService.getCreatePageData(authContext),
        );
    }
}

export default new GetProjectCreatePageDataController();
