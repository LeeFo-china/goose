import type { FastifyRequest } from "fastify";
import type { z } from "zod";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";

const MAX_IDEMPOTENCY_KEY_LENGTH = 120;

export function requireIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0]?.trim() : value?.trim();
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw Errors.business(
      400,
      "缺少有效的 Idempotency-Key",
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  return key;
}

export function parseCatalogRequest<Schema extends z.ZodTypeAny>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(input || {});
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}
