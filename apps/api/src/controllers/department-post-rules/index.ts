import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  DepartmentPostRuleDepartmentParamsSchema,
  UpdateDepartmentPostRuleSchema,
} from "@/schema/department-post-rules";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { departmentPostRuleService } from "@/services/department-post-rules";
import { Get, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class DepartmentPostRulesController extends BaseController {
  constructor() {
    super("department_post_rules");
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    return authorizationService.getRequiredAuthContext(request.user?.sub);
  }

  @Get("/department-post-rules")
  async getConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.read");

    return ResponseHandler.success(
      await departmentPostRuleService.getConfig(authContext.tenantId),
    );
  }

  @Put("/department-post-rules/:department_code")
  async updateDepartmentRules(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "employee.update");

    const paramsResult = DepartmentPostRuleDepartmentParamsSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateDepartmentPostRuleSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await departmentPostRuleService.updateDepartmentPostCodes(
        paramsResult.data.department_code,
        bodyResult.data.post_codes,
        authContext.tenantId,
      ),
    );
  }
}

export default new DepartmentPostRulesController();
