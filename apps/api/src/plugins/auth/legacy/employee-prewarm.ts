import type { FastifyRequest } from "fastify";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { customerCoreService } from "@/services/customer-core";
import { projectSer } from "@/services/projects";
import type { VerifiedJwtPayload } from "./types";

function resolveProjectHomeOwnership(authContext: Awaited<
  ReturnType<typeof authorizationService.prewarmEmployeeAuthContext>
>) {
  return accessPolicyService.getScope(authContext, "project.read") === "self"
    ? "self"
    : "all";
}

export function shouldPrewarmEmployeeAuthContext(url: string, payload: VerifiedJwtPayload) {
  return (
    url === "/employee/bootstrap" &&
    Boolean(payload.sub) &&
    Boolean(payload.employee_id)
  );
}

export function prewarmEmployeeAuthContextForRequest(
  request: FastifyRequest,
  payload: VerifiedJwtPayload,
) {
  if (!payload.sub || !payload.employee_id) {
    return;
  }

  const startedAt = Date.now();
  void authorizationService.prewarmEmployeeAuthContext({
    authUserId: payload.sub,
    employeeId: payload.employee_id,
  }).then((authContext) => {
    request.log.info(
      {
        requestId: request.id,
        stage: "prewarm_employee_auth_context",
        durationMs: Date.now() - startedAt,
        employeeId: authContext.employeeId,
        tenantId: authContext.tenantId,
      },
      "[auth-plugin] background stage completed",
    );

    const homeStartedAt = Date.now();
    void Promise.allSettled([
      projectSer.listProjects({
        authContext,
        query: {
          page: 1,
          pageSize: 20,
          ownership: resolveProjectHomeOwnership(authContext),
          mode: "home",
          debug_timing: false,
        },
      }),
      customerCoreService.listCustomers({
        authContext,
        query: {
          page: 1,
          pageSize: 20,
          mode: "home",
        },
      }),
    ]).then((results) => {
      request.log.info(
        {
          requestId: request.id,
          stage: "prewarm_employee_home_lists",
          durationMs: Date.now() - homeStartedAt,
          employeeId: authContext.employeeId,
          tenantId: authContext.tenantId,
          rejectedCount: results.filter((item) => item.status === "rejected").length,
        },
        "[auth-plugin] background stage completed",
      );
    }).catch((error) => {
      request.log.warn(
        {
          requestId: request.id,
          stage: "prewarm_employee_home_lists",
          durationMs: Date.now() - homeStartedAt,
          employeeId: authContext.employeeId,
          tenantId: authContext.tenantId,
          error: error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
        },
        "[auth-plugin] background stage failed",
      );
    });
  }).catch((error) => {
    request.log.warn(
      {
        requestId: request.id,
        stage: "prewarm_employee_auth_context",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
      },
      "[auth-plugin] background stage failed",
    );
  });
}
