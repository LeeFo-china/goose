import { customerSelfServiceService } from "@/services/customer-self-service";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import type { FastifyRequest } from "fastify";
import type {
  EmployeeBootstrapProfile,
  EmployeeBootstrapUserProfile,
  TenantAuthContext,
} from "./bootstrap-types";

const EMPLOYEE_BOOTSTRAP_PROFILE_WAIT_MS = 250;

export function serializeAuthProfile(
  authContext: TenantAuthContext,
  userProfile: EmployeeBootstrapUserProfile,
): EmployeeBootstrapProfile {
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

export async function getUserProfileForBootstrap(
  request: FastifyRequest,
  authContext: TenantAuthContext,
): Promise<{
  userProfile: EmployeeBootstrapUserProfile;
  source: "cache" | "remote" | "timeout" | "error";
}> {
  const cached = customerSelfServiceService.getCachedUserProfileEntryByAuthUserId(
    authContext.authUserId,
  );
  if (cached) {
    return {
      userProfile: cached.value,
      source: "cache",
    };
  }

  const profileRequest = customerSelfServiceService.getUserProfileByAuthUserId(
    authContext.authUserId,
  );
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<{ source: "timeout"; userProfile: null }>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({ source: "timeout", userProfile: null });
    }, EMPLOYEE_BOOTSTRAP_PROFILE_WAIT_MS);
  });

  const result = await Promise.race([
    profileRequest.then((userProfile) => ({
      source: "remote" as const,
      userProfile,
    })).catch((error) => {
      request.log.warn(
        {
          requestId: request.id,
          employeeId: authContext.employeeId,
          tenantId: authContext.tenantId,
          error,
        },
        "[employee-bootstrap] user profile load failed",
      );
      return {
        source: "error" as const,
        userProfile: null,
      };
    }),
    timeout,
  ]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (result.source === "timeout") {
    void profileRequest.catch((error) => {
      request.log.warn(
        {
          requestId: request.id,
          employeeId: authContext.employeeId,
          tenantId: authContext.tenantId,
          error,
        },
        "[employee-bootstrap] deferred user profile load failed",
      );
    });
  }

  return result;
}
