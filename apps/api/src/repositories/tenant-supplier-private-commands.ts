import { z } from "zod";

import { Errors } from "@/errors/error-factory";

import {
  mapSupplierCommandDatabaseError,
  throwSupplierCommandDatabaseError,
} from "./supplier-command-errors";
import {
  CodeAllocationSchema,
  CreateRelationshipCommandEnvelopeSchema,
  PlatformRelationshipSchema,
  UpdatePrivateSupplierMasterEnvelopeSchema,
  PrivateSupplierRelationshipSchema,
  PrivateSupplierMasterSchema,
  parse,
} from "./tenant-suppliers-mappers";
import type {
  AllocateCodeCommand,
  CreatePrivateSupplierCommand,
  CreateSharedRelationshipCommand,
  UpdatePrivateSupplierMasterCommand,
} from "./tenant-suppliers";

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
export type TenantSupplierCommandClient = {
  rpc: (name: string, params: Record<string, unknown>) => RpcResult;
};

export async function allocateInternalCode(
  client: TenantSupplierCommandClient,
  input: AllocateCodeCommand,
) {
  return parse(
    CodeAllocationSchema,
    await commandRpc(client, "allocate_tenant_supplier_code", {
      p_tenant_id: input.tenant_id,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    }, "生成租户供应商内部编码失败"),
    "生成租户供应商内部编码失败",
  );
}

export async function createPrivateSupplier(
  client: TenantSupplierCommandClient,
  input: CreatePrivateSupplierCommand,
) {
  const result = parse(
    CreateRelationshipCommandEnvelopeSchema,
    await commandRpc(client, "create_tenant_private_supplier", {
      p_tenant_id: input.tenant_id,
      p_name: input.name,
      p_legal_name: input.legal_name,
      p_unified_social_credit_code: input.unified_social_credit_code ?? null,
      p_supplier_type: input.supplier_type,
      p_code_source: input.code_source,
      p_internal_supplier_code: input.internal_supplier_code,
      p_allocation_id: input.code_source === "generated"
        ? input.allocation_id
        : null,
      p_primary_contact: input.primary_contact ?? null,
      p_address: input.address ?? null,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    }, "创建租户私有供应商失败"),
    "创建租户私有供应商失败",
  );
  return parseCreatedRelationship(
    result,
    PrivateSupplierRelationshipSchema,
    "创建租户私有供应商失败",
  );
}

export async function createSharedRelationship(
  client: TenantSupplierCommandClient,
  input: CreateSharedRelationshipCommand,
) {
  const result = parse(
    CreateRelationshipCommandEnvelopeSchema,
    await commandRpc(client, "create_tenant_shared_supplier_relationship", {
      p_tenant_id: input.tenant_id,
      p_supplier_id: input.supplier_id,
      p_code_source: input.code_source,
      p_internal_supplier_code: input.internal_supplier_code,
      p_allocation_id: input.code_source === "generated"
        ? input.allocation_id
        : null,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
      p_idempotency_key: input.idempotency_key,
    }, "关联平台共享供应商失败"),
    "关联平台共享供应商失败",
  );
  return parseCreatedRelationship(
    result,
    PlatformRelationshipSchema,
    "关联平台共享供应商失败",
  );
}

export async function updatePrivateSupplierMaster(
  client: TenantSupplierCommandClient,
  input: UpdatePrivateSupplierMasterCommand,
) {
  const creditCodeProvided = Object.prototype.hasOwnProperty.call(
    input,
    "unified_social_credit_code",
  );
  const result = parse(
    UpdatePrivateSupplierMasterEnvelopeSchema,
    await commandRpc(client, "update_tenant_private_supplier_master", {
      p_tenant_id: input.tenant_id,
      p_tenant_supplier_id: input.tenant_supplier_id,
      p_expected_version: input.expected_version,
      p_name: input.name ?? null,
      p_legal_name: input.legal_name ?? null,
      p_unified_social_credit_code: input.unified_social_credit_code ?? null,
      p_unified_social_credit_code_provided: creditCodeProvided,
      p_supplier_type: input.supplier_type ?? null,
      p_actor_user_id: input.actor_user_id,
      p_actor_employee_id: input.actor_employee_id,
    }, "更新租户私有供应商主档失败"),
    "更新租户私有供应商主档失败",
  );
  if (result.status === "updated" && result.supplier !== undefined) {
    return parse(
      PrivateSupplierMasterSchema,
      result.supplier,
      "更新租户私有供应商主档失败",
    );
  }
  const businessError = result.error_code
    ? mapSupplierCommandDatabaseError(result.error_code)
    : null;
  if (businessError) throw businessError;
  throw Errors.dbError("更新租户私有供应商主档失败", result);
}

async function commandRpc(
  client: TenantSupplierCommandClient,
  name: string,
  params: Record<string, unknown>,
  message: string,
) {
  const { data, error } = await client.rpc(name, params);
  if (error) throwSupplierCommandDatabaseError(error, message);
  return data;
}

function parseCreatedRelationship<T>(
  result: z.infer<typeof CreateRelationshipCommandEnvelopeSchema>,
  schema: z.ZodType<T>,
  message: string,
): T {
  if (result.status === "created" && result.tenant_supplier !== undefined) {
    return parse(schema, result.tenant_supplier, message);
  }
  const businessError = result.error_code
    ? mapSupplierCommandDatabaseError(result.error_code)
    : null;
  if (businessError) throw businessError;
  throw Errors.dbError(message, result);
}
