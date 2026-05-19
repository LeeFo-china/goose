import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { SupabaseDB } from "@/utils/supabase";
import { Errors } from "@/errors/error-factory";
import { fail, ResponseHandler, success } from "@/utils/response";
import type { ApiResponse } from "@/types/api";
import { BaseController } from "@/controllers/BaseController";

import { Get, Post, registerRoutes } from "@/utils/decorators/route";
import { any } from "zod";

export class GetProjectCreatePageDataController extends BaseController {
    constructor() {
        super("rpc");
    }

    @Post("/create_project_page")
    async get_project_create_page_data(
        request: FastifyRequest,
        reply: FastifyReply,
    ) {
        // Legacy public/RLS RPC: this route has no app auth context, so do not
        // switch it to the admin client without defining its caller boundary.
        const { data, error } = await SupabaseDB.getClient().rpc(
            "get_project_create_page_data",
        );

        if (error) throw Errors.dbError("call rpc error");

        return ResponseHandler.success<any>(data);
    }
}

export default new GetProjectCreatePageDataController();
