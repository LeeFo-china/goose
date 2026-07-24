import { z } from "zod";

import { Errors } from "@/errors/error-factory";

export type CreateCommandResult<
  ResourceKey extends string,
  Resource,
> = {
  status: "created";
  idempotent: boolean;
  version: number;
} & Record<ResourceKey, Resource>;

export type SupplierCommandRpcClient = {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export function rpcCommandContext(input: {
  actor_user_id: string;
  actor_employee_id: string;
  idempotency_key: string;
}) {
  return {
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
  };
}

const envelopeSchema = z.object({
  status: z.enum([
    "created",
    "supplier_not_found",
    "state_conflict",
    "idempotency_conflict",
    "validation_error",
  ]),
  idempotent: z.boolean().optional(),
  error_code: z.string().optional(),
  reason: z.string().optional(),
  version: z.number().int().nonnegative().optional(),
}).passthrough();

export async function executeCreateCommand<
  ResourceKey extends string,
  Resource,
>(input: {
  client: SupplierCommandRpcClient;
  functionName: string;
  params: Record<string, unknown>;
  resourceKey: ResourceKey;
  resourceSchema: z.ZodType<Resource>;
  message: string;
}): Promise<CreateCommandResult<ResourceKey, Resource>> {
  const { data, error } = await input.client.rpc(
    input.functionName,
    input.params,
  );
  if (error) {
    if (isSupplierIdempotencyConflict(error)) {
      throw Errors.business(
        409,
        "幂等键已用于其他供应商操作",
        "SUPPLIER_IDEMPOTENCY_CONFLICT",
      );
    }
    throw Errors.dbError(input.message, error);
  }

  const envelope = envelopeSchema.safeParse(data);
  if (!envelope.success) {
    throw Errors.dbError(input.message, envelope.error.issues);
  }
  if (envelope.data.status !== "created") {
    throw createCommandError(envelope.data);
  }
  const resource = input.resourceSchema.safeParse(
    envelope.data[input.resourceKey],
  );
  if (!resource.success || envelope.data.version === undefined) {
    throw Errors.dbError(
      input.message,
      resource.success ? data : resource.error.issues,
    );
  }
  return {
    status: "created",
    idempotent: envelope.data.idempotent ?? false,
    version: envelope.data.version,
    [input.resourceKey]: resource.data,
  } as CreateCommandResult<ResourceKey, Resource>;
}

function createCommandError(
  envelope: z.infer<typeof envelopeSchema>,
) {
  if (envelope.status === "validation_error") {
    return Errors.business(
      400,
      envelope.reason ?? "请求参数校验失败",
      envelope.error_code ?? "VALIDATION_ERROR",
      envelope,
    );
  }
  if (envelope.status === "supplier_not_found") {
    return Errors.business(
      404,
      "供应商不存在",
      envelope.error_code ?? "SUPPLIER_NOT_FOUND",
      envelope,
    );
  }
  return Errors.business(
    409,
    envelope.reason ?? "创建数据与当前状态冲突",
    envelope.error_code ?? "SUPPLIER_STATE_CONFLICT",
    envelope,
  );
}

export function isSupplierIdempotencyConflict(error: unknown): boolean {
  if (typeof error === "string") {
    return error.includes("SUPPLIER_IDEMPOTENCY_CONFLICT");
  }
  if (Array.isArray(error)) {
    return error.some((item) => isSupplierIdempotencyConflict(item));
  }
  if (typeof error !== "object" || error === null) return false;
  return Object.values(error).some(
    (value) => isSupplierIdempotencyConflict(value),
  );
}
