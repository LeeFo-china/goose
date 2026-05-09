import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  ProjectMemberRolePostRuleParamsSchema,
  UpdateProjectMemberRolePostRuleSchema,
} from "@/schema/project-member-role-post-rules";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { projectMemberRolePostRuleService } from "@/services/project-member-role-post-rules";
import { Get, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class ProjectMemberRolePostRulesController extends BaseController {
  constructor() {
    super("project_member_role_post_rules");
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    return authorizationService.getRequiredAuthContext(request.user?.sub);
  }

  @Get("/project-member-role-post-rules")
  async getConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "project.read");

    return ResponseHandler.success(
      await projectMemberRolePostRuleService.getConfig(authContext.tenantId),
    );
  }

  @Put("/project-member-role-post-rules/:role_code")
  async updateRoleRules(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredAuthContext(request);
    accessPolicyService.assertPermission(authContext, "project.update");

    const paramsResult = ProjectMemberRolePostRuleParamsSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateProjectMemberRolePostRuleSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await projectMemberRolePostRuleService.updateRolePostCodes(
        paramsResult.data.role_code,
        bodyResult.data.post_codes,
        authContext.tenantId,
      ),
    );
  }
}

export default new ProjectMemberRolePostRulesController();
