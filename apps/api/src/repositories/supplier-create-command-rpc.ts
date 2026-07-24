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
  ]),
  idempotent: z.boolean().optional(),
  error_code: z.string().optional(),
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
  if (error) throw Errors.dbError(input.message, error);

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
  const isMissing = envelope.status === "supplier_not_found";
  const code = envelope.error_code ??
    (isMissing ? "SUPPLIER_NOT_FOUND" : "SUPPLIER_STATE_CONFLICT");
  return Errors.business(
    isMissing ? 404 : 409,
    isMissing ? "供应商不存在" : "创建数据与当前状态冲突",
    code,
    envelope,
  );
}
