import { mock } from "bun:test";
import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

export type RouteResponse = { data: unknown; message: string };
export type RouteHandler = (
  request: FastifyRequest,
  reply: unknown,
) => Promise<RouteResponse>;

export type BrandingControllerLike = {
  registerExtraRoutes(fastify: unknown): void;
};

export async function loadController(): Promise<BrandingControllerLike> {
  return (await import(".")).default;
}

export async function loadHarness() {
  const [
    controller,
    { authorizationService },
    { platformAuthorizationService },
    { brandProfilesService },
    { effectiveBrandingService },
    { tenantEntitlementsService },
  ] = await Promise.all([
    loadController(),
    import("@/services/authorization"),
    import("@/services/platform-authorization"),
    import("@/services/brand-profiles"),
    import("@/services/effective-branding"),
    import("@/services/tenant-entitlements"),
  ]);
  return {
    controller,
    authorizationService,
    platformAuthorizationService,
    brandProfilesService,
    effectiveBrandingService,
    tenantEntitlementsService,
  };
}

export function registeredHandlers(controller: BrandingControllerLike) {
  const routes = new Map<string, RouteHandler>();
  const register = (method: string) =>
    (path: string, optionsOrHandler: unknown, handler?: RouteHandler) => {
      const routeHandler = handler ?? optionsOrHandler;
      if (typeof routeHandler !== "function") {
        throw new TypeError(`invalid route handler: ${method} ${path}`);
      }
      const routeOptions = handler ? optionsOrHandler : {};
      routes.set(`${method} ${path}`, (request, reply) =>
        (routeHandler as RouteHandler)(
          Object.assign(request, { method, routeOptions }),
          reply,
        ));
    };
  controller.registerExtraRoutes({
    get: register("GET"),
    patch: register("PATCH"),
    post: register("POST"),
  });
  return routes;
}

export function requiredHandler(
  controller: BrandingControllerLike,
  route: string,
): RouteHandler {
  const handler = registeredHandlers(controller).get(route);
  if (!handler) throw new TypeError(`missing route handler: ${route}`);
  return handler;
}

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
  const assertPlatformSession = mock(async () => authContext);
  const assertPermission = mock(() => "all");
  Reflect.set(
    platformAuthorizationService,
    "assertPlatformSession",
    assertPlatformSession,
  );
  Reflect.set(
    platformAuthorizationService,
    "assertPermission",
    assertPermission,
  );
  return {
    assertPlatformSession,
    assertPermission,
    restore: () => {
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
    },
  };
}
