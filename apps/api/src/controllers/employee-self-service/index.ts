import type { FastifyReply, FastifyRequest } from "fastify";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { customerCoreService } from "@/services/customer-core";
import { homeDashboardService } from "@/services/home-dashboard";
import { projectSer } from "@/services/projects";
import { taskCenterService } from "@/services/task-center";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

class EmployeeSelfServiceController extends TenantBaseController {
  constructor() {
    super("employee_self_service");
  }

  private assertTaskSummaryReadable(authContext: AuthContext) {
    if (accessPolicyService.hasPermission(authContext, "task_center.read")) {
      return;
    }

    if (accessPolicyService.hasPermission(authContext, "dashboard.read")) {
      return;
    }

    throw Errors.forbidden();
  }

  private prewarmDeferredHomeData(
    request: FastifyRequest,
    authContext: AuthContext & { tenantId: string },
  ) {
    const startedAt = Date.now();
    void Promise.allSettled([
      projectSer.listProjects({
        authContext,
        query: {
          page: 1,
          pageSize: 20,
          ownership: "self",
        },
      }),
      customerCoreService.listCustomers({
        authContext,
        query: {
          page: 1,
          pageSize: 20,
        },
      }),
    ]).then((results) => {
      request.log.info(
        {
          requestId: request.id,
          durationMs: Date.now() - startedAt,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          rejectedCount: results.filter((item) => item.status === "rejected").length,
        },
        "[employee-bootstrap] deferred home data prewarmed",
      );
    }).catch((error) => {
      request.log.error(
        {
          requestId: request.id,
          durationMs: Date.now() - startedAt,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          error,
        },
        "[employee-bootstrap] deferred home data prewarm failed",
      );
    });
  }

  @Get("/employee/bootstrap")
  async getEmployeeBootstrap(request: FastifyRequest, reply: FastifyReply) {
    const startedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);

    if (!authContext.employeeId) {
      throw Errors.business(403, "员工身份缺失，无法加载员工首页", "EMPLOYEE_MISSING");
    }

    this.assertPermission(authContext, "dashboard.read");
    this.assertTaskSummaryReadable(authContext);

    const [homeStats, taskSummary] = await Promise.all([
      homeDashboardService.getStats(authContext),
      taskCenterService.getSummary(authContext),
    ]);

    this.prewarmDeferredHomeData(request, authContext);

    const response = {
      context: authContext,
      home_stats: homeStats,
      task_summary: taskSummary,
      projects_mode: "defer",
      projects: null,
      customers_mode: "defer",
      customers: null,
    };

    request.log.info(
      {
        requestId: request.id,
        durationMs: Date.now() - startedAt,
        employeeId: authContext.employeeId,
        tenantId: authContext.tenantId,
      },
      "[employee-bootstrap] bootstrap resolved",
    );

    return ResponseHandler.success(response);
  }
}

export default new EmployeeSelfServiceController();
