import type { FastifyReply, FastifyRequest } from "fastify";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { employeePersonalizationService } from "@/services/employee-personalization";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { z } from "zod";
import { EmployeeBootstrapHandler } from "./bootstrap-handler";
import { optionalEmployeeQueryValue } from "./bootstrap-schema";

const EmployeePersonalizationQuerySchema = z.object({
  scene: optionalEmployeeQueryValue(z.string().trim().min(1).max(64)).default("employee_home"),
});

class EmployeeSelfServiceController extends TenantBaseController {
  private readonly bootstrapHandler = new EmployeeBootstrapHandler({
    getRequiredTenantContext: (request) =>
      this.getRequiredTenantContext(request),
  });

  constructor() {
    super("employee_self_service");
  }

  @Get("/employee/bootstrap", { tenantServiceAccess: "session" })
  async getEmployeeBootstrap(request: FastifyRequest, reply: FastifyReply) {
    return ResponseHandler.success(
      await this.bootstrapHandler.getEmployeeBootstrap(request),
    );
  }

  @Get("/employee/personalization", { tenantServiceAccess: "read" })
  async getEmployeePersonalization(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = EmployeePersonalizationQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const authContext = await this.getRequiredTenantContext(request);
    if (!authContext.employeeId) {
      throw Errors.business(403, "员工身份缺失，无法加载个性化配置", "EMPLOYEE_MISSING");
    }

    this.assertPermission(authContext, "dashboard.read");

    const payload = await employeePersonalizationService.resolveForEmployee(
      authContext,
      queryResult.data.scene,
    );
    return ResponseHandler.success(payload);
  }
}

export default new EmployeeSelfServiceController();
