import type { FastifyRequest } from "fastify";

const AUTH_TIMING_LOG_MIN_DURATION_MS = 100;

export async function logAuthStage<T>(
  request: FastifyRequest,
  stage: string,
  handler: () => Promise<T>,
) {
  const startedAt = Date.now();
  try {
    const result = await handler();
    const durationMs = Date.now() - startedAt;
    if (durationMs >= AUTH_TIMING_LOG_MIN_DURATION_MS) {
      request.log.info(
        { requestId: request.id, stage, durationMs },
        "[auth-plugin] stage completed",
      );
    }
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    request.log.warn(
      {
        requestId: request.id,
        stage,
        durationMs,
        error: error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
      },
      "[auth-plugin] stage failed",
    );
    throw error;
  }
}
