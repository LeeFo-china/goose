import type { AuthContext } from "@/services/authorization";
import type { customerSelfServiceService } from "@/services/customer-self-service";
import type { EmployeePersonalizationPayload } from "@/services/employee-personalization";
import type { homeDashboardService } from "@/services/home-dashboard";
import type { taskCenterService } from "@/services/task-center";
import type { EmployeeBootstrapQuery } from "./bootstrap-schema";

export type TenantAuthContext = AuthContext & { tenantId: string };
export type EmployeeBootstrapUserProfile = Awaited<ReturnType<typeof customerSelfServiceService.getUserProfileByAuthUserId>>;

export type EmployeeBootstrapProfile = {
  auth_user_id: string;
  nickname: string | null;
  avatar: string | null;
  avatar_path: string | null;
  profile_completed: boolean;
  profile_completed_at: string | null;
  roles: string[];
};

export type EmployeeBootstrapResponse = {
  context: TenantAuthContext;
  profile: EmployeeBootstrapProfile;
  home_stats: Awaited<ReturnType<typeof homeDashboardService.getStats>> | null;
  home_mode: EmployeeBootstrapQuery["home_mode"];
  task_summary: Awaited<ReturnType<typeof taskCenterService.getSummary>> | null;
  tasks_mode: EmployeeBootstrapQuery["tasks_mode"];
  personalization: EmployeePersonalizationPayload;
  projects_mode: "defer";
  projects: null;
  customers_mode: "defer";
  customers: null;
};
