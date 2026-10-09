import type { FastifyInstance, FastifyRequest } from "fastify";
import { tenantActivityCollectionService } from "@/services/tenant-activity-collection";
import { classifyTenantActivityResponse, type CapturedTenantActivity } from "@/services/tenant-activity-capture";

/** Capture only completed, explicitly allowlisted employee business operations. */
export default function tenantActivityPlugin(
  app: FastifyInstance,
  collector: Pick<typeof tenantActivityCollectionService, "recordResponse"> = tenantActivityCollectionService,
) {
  const captured = new WeakMap<FastifyRequest, CapturedTenantActivity>();
  app.addHook("preSerialization", async (request, reply, payload) => {
    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      const activity = classifyTenantActivityResponse(request.method, request.routeOptions.url ?? "", payload);
      if (activity) captured.set(request, activity);
    }
    return payload;
  });
  app.addHook("onResponse", async (request, reply) => {
    const activity = captured.get(request);
    captured.delete(request);
    if (!activity || reply.statusCode < 200 || reply.statusCode >= 300) return;
    try {
      await collector.recordResponse({ activity, user: request.user, authContext: request.authContext });
    } catch {
      // Response is already sent: analytics failure must not turn a successful business write into a retry.
      // No token, payload or DB error details in the warning.
      request.log.warn({ code: "TENANT_ACTIVITY_COLLECTION_FAILED", requestId: request.id,
        route: request.routeOptions.url, kind: activity.kind }, "租户使用统计采集失败");
    }
  });
}
