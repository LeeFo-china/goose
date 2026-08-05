import { Errors } from "@/errors/error-factory";
import { userIdentityRepository } from "@/repositories/user-identities";
import type {
  UserAuthEventListQuery,
  UserAuthEventSummaryQuery,
} from "@/schema/user-auth-events";
import type { AuthContext } from "@/services/authorization";
import { platformAuthorizationService } from "@/services/platform-authorization";
import type { PermissionCode } from "@gooes/domain";

const PLATFORM_IDENTITY_DIAGNOSTIC_READ_PERMISSION =
  "platform.identity_diagnostic.read" satisfies PermissionCode;
const STAGE3_BLOCKING_EVENT_TYPES = [
  "identity_oauth_mismatch",
  "identity_membership_mismatch",
  "identity_observe_failed",
  "identity_oauth_dual_write_failed",
  "identity_membership_dual_write_failed",
  "identity_membership_unbind_failed",
];

class UserAuthEventService {
  async list(query: UserAuthEventListQuery, authContext: AuthContext) {
    this.assertIdentityDiagnosticReadPermission(authContext);
    return userIdentityRepository.listAuthEvents(query);
  }

  async summarize(query: UserAuthEventSummaryQuery, authContext: AuthContext) {
    this.assertIdentityDiagnosticReadPermission(authContext);
    const summary = await userIdentityRepository.summarizeAuthEvents(query);
    const blockingEventTypes = new Set(STAGE3_BLOCKING_EVENT_TYPES);
    const blockingCount = summary.by_event_type
      .filter((item) => blockingEventTypes.has(item.event_type))
      .reduce((total, item) => total + item.count, 0);

    return {
      ...summary,
      stage3_ready_for_phase4: blockingCount === 0,
      stage3_blocking_event_count: blockingCount,
      stage3_blocking_event_types: STAGE3_BLOCKING_EVENT_TYPES,
    };
  }

  private assertIdentityDiagnosticReadPermission(authContext: AuthContext) {
    const isPlatformIdentity =
      authContext.isPlatformStaff === true || authContext.isPlatformAdmin === true;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    platformAuthorizationService.assertPermission(
      authContext,
      PLATFORM_IDENTITY_DIAGNOSTIC_READ_PERMISSION,
    );
  }
}

export const userAuthEventService = new UserAuthEventService();
