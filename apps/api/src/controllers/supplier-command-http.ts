import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { FastifyRequest } from "fastify";

const MAX_IDEMPOTENCY_KEY_LENGTH = 120;

export function requireSupplierIdempotencyKey(
  request: FastifyRequest,
): string {
  const key = readSupplierIdempotencyKey(request);
  if (!key) {
    throw Errors.business(
      400,
      "缺少有效的 Idempotency-Key",
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  return key;
}

export function readSupplierIdempotencyKey(
  request: FastifyRequest,
): string | null {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0]?.trim() : value?.trim();
  if (value === undefined) return null;
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw Errors.business(
      400,
      "缺少有效的 Idempotency-Key",
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  return key;
}
