import type { FastifyReply, FastifyRequest } from "fastify";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { customerCoreService } from "@/services/customer-core";
import { customerSelfServiceService } from "@/services/customer-self-service";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import { homeDashboardService } from "@/services/home-dashboard";
import { projectSer } from "@/services/projects";
import { taskCenterService } from "@/services/task-center";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { z } from "zod";

function optionalEmployeeQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized === "" ||
        normalized === "undefined" ||
        normalized === "null"
      ) {
        return undefined;
      }

      return normalized;
    }

    return value;
  }, schema.optional());
}

const EmployeeBootstrapQuerySchema = z.object({
  home_mode: optionalEmployeeQueryValue(z.enum(["inline", "defer"])).default("defer"),
  tasks_mode: optionalEmployeeQueryValue(z.enum(["inline", "defer"])).default("defer"),
});

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

  private prewarmDeferredSummaryData(
    request: FastifyRequest,
    authContext: AuthContext & { tenantId: string },
    options: {
      includeHomeStats: boolean;
      includeTaskSummary: boolean;
    },
  ) {
    if (!options.includeHomeStats && !options.includeTaskSummary) {
      return;
    }

    const startedAt = Date.now();
    const tasks: Promise<unknown>[] = [];
    if (options.includeHomeStats) {
      tasks.push(homeDashboardService.getStats(authContext));
    }
    if (options.includeTaskSummary) {
      tasks.push(taskCenterService.getSummary(authContext));
    }

    void Promise.allSettled(tasks).then((results) => {
      request.log.info(
        {
          requestId: request.id,
          durationMs: Date.now() - startedAt,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          includeHomeStats: options.includeHomeStats,
          includeTaskSummary: options.includeTaskSummary,
          rejectedCount: results.filter((item) => item.status === "rejected").length,
        },
        "[employee-bootstrap] deferred summary data prewarmed",
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
        "[employee-bootstrap] deferred summary data prewarm failed",
      );
    });
  }

  private serializeAuthProfile(
    authContext: AuthContext,
    userProfile: Awaited<ReturnType<typeof customerSelfServiceService.getUserProfileByAuthUserId>>,
  ) {
    return {
      auth_user_id: authContext.authUserId,
      nickname: userProfile?.nickname ?? null,
      avatar: resolveStoredFileUrl(userProfile?.avatar_path),
      avatar_path: userProfile?.avatar_path ?? null,
      profile_completed: Boolean(userProfile?.profile_completed_at),
      profile_completed_at: userProfile?.profile_completed_at ?? null,
      roles: authContext.roleCodes,
    };
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
    const queryResult = EmployeeBootstrapQuerySchema.safeParse(request.query);
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const { home_mode: homeMode, tasks_mode: tasksMode } = queryResult.data;
    this.prewarmDeferredHomeData(request, authContext);
    this.prewarmDeferredSummaryData(request, authContext, {
      includeHomeStats: homeMode === "defer",
      includeTaskSummary: tasksMode === "defer",
    });

    const [homeStats, taskSummary, userProfile] = await Promise.all([
      homeMode === "inline" ? homeDashboardService.getStats(authContext) : Promise.resolve(null),
      tasksMode === "inline" ? taskCenterService.getSummary(authContext) : Promise.resolve(null),
      customerSelfServiceService.getUserProfileByAuthUserId(authContext.authUserId),
    ]);

    const response = {
      context: authContext,
      profile: this.serializeAuthProfile(authContext, userProfile),
      home_stats: homeStats,
      home_mode: homeMode,
      task_summary: taskSummary,
      tasks_mode: tasksMode,
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
