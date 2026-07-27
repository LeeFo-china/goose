import type { FastifyRequest } from "fastify";

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
    { brandProfilesService },
    { effectiveBrandingService },
    { tenantEntitlementsService },
  ] = await Promise.all([
    loadController(),
    import("@/services/authorization"),
    import("@/services/brand-profiles"),
    import("@/services/effective-branding"),
    import("@/services/tenant-entitlements"),
  ]);
  return {
    controller,
    authorizationService,
    brandProfilesService,
    effectiveBrandingService,
    tenantEntitlementsService,
  };
}

export function registeredHandlers(controller: BrandingControllerLike) {
  const routes = new Map<string, RouteHandler>();
  const register = (method: string) =>
    (path: string, handler: RouteHandler) =>
      routes.set(`${method} ${path}`, handler);
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
