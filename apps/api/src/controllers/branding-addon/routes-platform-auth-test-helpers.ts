import { mock } from "bun:test";
import type { AuthContext } from "@/services/authorization";

export function mockPlatformPermission(
  platformAuthorizationService: object,
  authContext: AuthContext,
) {
  const originalSession = Reflect.get(
    platformAuthorizationService,
    "assertPlatformSession",
  );
  const originalPermission = Reflect.get(
    platformAuthorizationService,
    "assertPermission",
  );
  Reflect.set(
    platformAuthorizationService,
    "assertPlatformSession",
    mock(async () => authContext),
  );
  Reflect.set(
    platformAuthorizationService,
    "assertPermission",
    mock(() => "all"),
  );
  return () => {
    Reflect.set(
      platformAuthorizationService,
      "assertPlatformSession",
      originalSession,
    );
    Reflect.set(
      platformAuthorizationService,
      "assertPermission",
      originalPermission,
    );
  };
}
