import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  DepartmentPostRuleAliasParamsSchema,
  DepartmentPostRuleDepartmentParamsSchema,
  UpdateDepartmentPostRuleAliasSchema,
  UpdateDepartmentPostRuleSchema,
} from "@/schema/department-post-rules";
import { departmentPostRuleService } from "@/services/department-post-rules";
import { Get, Patch, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class DepartmentPostRulesController extends TenantBaseController {
  constructor() {
    super("department_post_rules");
  }

  @Get("/department-post-rules")
  async getConfig(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertPermission(authContext, "employee.read");
    const { tenantId } = authContext;

    return ResponseHandler.success(
      await departmentPostRuleService.getConfig(tenantId),
    );
  }

  @Put("/department-post-rules/:department_code")
  async updateDepartmentRules(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertPermission(authContext, "employee.update");
    const { tenantId } = authContext;

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
        tenantId,
      ),
    );
  }

  @Patch("/department-post-rules/:department_code/posts/:post_code/alias")
  async updateDepartmentPostAlias(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertPermission(authContext, "employee.update");
    const { tenantId } = authContext;

    const paramsResult = DepartmentPostRuleAliasParamsSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = UpdateDepartmentPostRuleAliasSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await departmentPostRuleService.updateDepartmentPostAlias({
        departmentCode: paramsResult.data.department_code,
        postCode: paramsResult.data.post_code,
        aliasName: bodyResult.data.alias_name,
        tenantId,
      }),
    );
  }
}

export default new DepartmentPostRulesController();
