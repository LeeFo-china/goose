import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { customerCoreService } from "@/services/customer-core";
import { homeDashboardService } from "@/services/home-dashboard";
import { projectSer } from "@/services/projects";
import { taskCenterService } from "@/services/task-center";
import type { FastifyRequest } from "fastify";

type TenantAuthContext = AuthContext & { tenantId: string };

function resolveProjectHomeOwnership(authContext: TenantAuthContext) {
  const scope = accessPolicyService.getScope(authContext, "project.read");
  return scope === "self" ? "self" : "all";
}

export function prewarmDeferredHomeData(
  request: FastifyRequest,
  authContext: TenantAuthContext,
) {
  const startedAt = Date.now();
  const tasks: Promise<unknown>[] = [];
  if (accessPolicyService.hasPermission(authContext, "project.read")) {
    tasks.push(projectSer.listProjects({
      authContext,
      query: {
        page: 1,
        pageSize: 20,
        ownership: resolveProjectHomeOwnership(authContext),
        mode: "home",
        debug_timing: false,
      },
    }));
  }
  if (accessPolicyService.hasPermission(authContext, "customer.read")) {
    tasks.push(customerCoreService.listCustomers({
      authContext,
      query: {
        page: 1,
        pageSize: 20,
        mode: "home",
      },
    }));
  }

  if (tasks.length === 0) {
    return;
  }

  void Promise.allSettled(tasks).then((results) => {
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

export function prewarmDeferredSummaryData(
  request: FastifyRequest,
  authContext: TenantAuthContext,
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
