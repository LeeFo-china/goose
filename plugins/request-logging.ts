import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { getRequestLogContext } from "@/utils/logging";

const requestStartTimes = new WeakMap<FastifyRequest, number>();

function getSlowRequestThresholdMs() {
  const raw = Number(process.env.SLOW_REQUEST_MS || 1000);
  return Number.isFinite(raw) && raw > 0 ? raw : 1000;
}

const requestLoggingPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request) => {
    requestStartTimes.set(request, Date.now());
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAt = requestStartTimes.get(request) ?? Date.now();
    const durationMs = Date.now() - startedAt;
    const statusCode = reply.statusCode;
    const payload = {
      ...getRequestLogContext(request),
      statusCode,
      durationMs,
    };

    if (statusCode >= 500) {
      request.log.error(payload, "request completed with server error");
      return;
    }

    if (durationMs >= getSlowRequestThresholdMs()) {
      request.log.warn(payload, "slow request completed");
      return;
    }

    request.log.info(payload, "request completed");
  });
};

export default requestLoggingPlugin;
