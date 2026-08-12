import type { EmployeeServiceAccessSummary } from "@gooes/domain";
import type { FastifyRequest } from "fastify";

import { employeePersonalizationService } from "@/services/employee-personalization";
import {
  getUserProfileForBootstrap,
  serializeAuthProfile,
} from "./bootstrap-profile";
import type {
  EmployeeBootstrapResponse,
  TenantAuthContext,
} from "./bootstrap-types";

export async function buildServiceBlockedBootstrapResponse(
  request: FastifyRequest,
  authContext: TenantAuthContext,
  serviceAccess: EmployeeServiceAccessSummary,
): Promise<EmployeeBootstrapResponse> {
  const profile = await getUserProfileForBootstrap(request, authContext);
  return {
    context: authContext,
    profile: serializeAuthProfile(authContext, profile.userProfile),
    service_access: serviceAccess,
    home_stats: null,
    home_mode: "defer",
    task_summary: null,
    tasks_mode: "defer",
    personalization: employeePersonalizationService.getEmptyPayload(
      "employee_home",
    ),
    projects_mode: "defer",
    projects: null,
    customers_mode: "defer",
    customers: null,
  };
}
