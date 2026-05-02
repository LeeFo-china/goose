import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  OpsScriptKeyParamsSchema,
  OpsScriptRunListQuerySchema,
  RunOpsScriptSchema,
} from "@/schema/ops-scripts";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { opsScriptService } from "@/services/ops-scripts";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class AdminOpsController extends BaseController {
  constructor() {
    super("ops_script_runs");
  }

  @Get("/admin/ops/scripts")
  async listScripts(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "system.ops.read");

    return ResponseHandler.success(opsScriptService.listScripts());
  }

  @Get("/admin/ops/script-runs")
  async listScriptRuns(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "system.ops.read");

    const queryResult = OpsScriptRunListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await opsScriptService.listRuns(queryResult.data);
    return ResponseHandler.success(data);
  }

  @Post("/admin/ops/scripts/:scriptKey/run")
  async runScript(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    accessPolicyService.assertPermission(authContext, "system.ops.run");

    const paramsResult = OpsScriptKeyParamsSchema.safeParse(request.params);
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = RunOpsScriptSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await opsScriptService.runScript(
      authContext,
      paramsResult.data.scriptKey,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new AdminOpsController();

