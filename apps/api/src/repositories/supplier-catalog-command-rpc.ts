import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { throwSupplierCommandDatabaseError } from "./supplier-command-errors";
import type { SupplierCommandRpcClient } from "./supplier-create-command-rpc";

const CommandEnvelopeSchema = z.object({
  status: z.string(),
  idempotent: z.boolean().optional(),
  error_code: z.string().optional(),
  version: z.number().int().nonnegative().optional(),
}).passthrough();

export async function executeCatalogResourceCommand<Output>(input: {
  client: SupplierCommandRpcClient;
  functionName: string;
  params: Record<string, unknown>;
  expectedStatus: string;
  resourceKey: string;
  resourceSchema: z.ZodType<Output>;
  message: string;
}): Promise<Record<string, unknown> & { resource: Output }> {
  const envelope = await executeCatalogCommand(input);
  if (envelope.status !== input.expectedStatus) {
    throw commandStateError(envelope, input.message);
  }
  const resource = input.resourceSchema.safeParse(
    envelope[input.resourceKey],
  );
  if (!resource.success) {
    throw Errors.dbError(input.message, resource.error.issues);
  }
  return { ...envelope, resource: resource.data };
}

export async function executeCatalogCommand(input: {
  client: SupplierCommandRpcClient;
  functionName: string;
  params: Record<string, unknown>;
  message: string;
}): Promise<Record<string, unknown> & { status: string }> {
  const { data, error } = await input.client.rpc(
    input.functionName,
    input.params,
  );
  if (error) throwSupplierCommandDatabaseError(error, input.message);
  const parsed = CommandEnvelopeSchema.safeParse(data);
  if (!parsed.success) {
    throw Errors.dbError(input.message, parsed.error.issues);
  }
  if (parsed.data.status === "version_conflict") {
    throw commandStateError(parsed.data, input.message);
  }
  return parsed.data;
}

function commandStateError(
  envelope: Record<string, unknown>,
  message: string,
) {
  const code = typeof envelope.error_code === "string"
    ? envelope.error_code
    : "SUPPLIER_CATALOG_CONFLICT";
  return Errors.business(
    code === "SUPPLIER_VERSION_CONFLICT" ? 409 : 409,
    code === "SUPPLIER_VERSION_CONFLICT"
      ? "目录数据版本已变化，请刷新后重试"
      : message,
    code,
    envelope,
  );
}
