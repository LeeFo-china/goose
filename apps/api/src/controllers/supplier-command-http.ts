import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { FastifyRequest } from "fastify";

const MAX_IDEMPOTENCY_KEY_LENGTH = 120;

export function requireSupplierIdempotencyKey(
  request: FastifyRequest,
): string {
  const key = readOptionalIdempotencyKey(request)?.trim();
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw Errors.business(
      400,
      "缺少有效的 Idempotency-Key",
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  return key;
}

export function readOptionalIdempotencyKey(
  request: FastifyRequest,
): string | null {
  const value = request.headers["idempotency-key"];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
