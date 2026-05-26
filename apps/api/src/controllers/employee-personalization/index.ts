import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  EmployeePersonalizationPreviewSchema,
  EmployeePersonalizationRuleListQuerySchema,
  EmployeePersonalizationRuleMutationSchema,
  EmployeePersonalizationRuleParamsSchema,
  EmployeePersonalizationRuleStatusUpdateSchema,
} from "@/schema/employee-personalization";
import { employeePersonalizationService } from "@/services/employee-personalization";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class EmployeePersonalizationController extends TenantBaseController {
  constructor() {
    super("employee_personalization_rules");
  }

  private async getManageContext(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    this.assertPermission(authContext, "employee.permission_manage");
    return authContext;
  }

  @Get("/admin/employee-personalization-rules")
  async listRules(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getManageContext(request);
    const queryResult = EmployeePersonalizationRuleListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    return ResponseHandler.success(
      await employeePersonalizationService.listRules({
        authContext,
        query: queryResult.data,
      }),
    );
  }

  @Get("/admin/employee-personalization-rules/:id")
  async getRule(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getManageContext(request);
    const paramsResult = EmployeePersonalizationRuleParamsSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    return ResponseHandler.success(
      await employeePersonalizationService.getRuleById({
        authContext,
        id: paramsResult.data.id,
      }),
    );
  }

  @Post("/admin/employee-personalization-rules")
  async createRule(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getManageContext(request);
    const bodyResult = EmployeePersonalizationRuleMutationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await employeePersonalizationService.createRule({
        authContext,
        body: bodyResult.data,
      }),
    );
  }

  @Patch("/admin/employee-personalization-rules/:id")
  async updateRule(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getManageContext(request);
    const paramsResult = EmployeePersonalizationRuleParamsSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = EmployeePersonalizationRuleMutationSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await employeePersonalizationService.updateRule({
        authContext,
        id: paramsResult.data.id,
        body: bodyResult.data,
      }),
    );
  }

  @Post("/admin/employee-personalization-rules/:id/status")
  async updateRuleStatus(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getManageContext(request);
    const paramsResult = EmployeePersonalizationRuleParamsSchema.safeParse(
      request.params,
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = EmployeePersonalizationRuleStatusUpdateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await employeePersonalizationService.updateRuleStatus({
        authContext,
        id: paramsResult.data.id,
        status: bodyResult.data.status,
      }),
    );
  }

  @Post("/admin/employee-personalization-rules/preview")
  async previewRule(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getManageContext(request);
    const bodyResult = EmployeePersonalizationPreviewSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    return ResponseHandler.success(
      await employeePersonalizationService.preview({
        authContext,
        body: bodyResult.data,
      }),
    );
  }
}

export default new EmployeePersonalizationController();
