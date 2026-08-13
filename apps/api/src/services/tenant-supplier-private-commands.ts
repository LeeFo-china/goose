import { Errors } from "@/errors/error-factory";
import type { TenantSuppliersRepositoryPort } from "@/repositories/tenant-suppliers";
import type {
  TenantPrivateSupplierUpdateInput,
  TenantSupplierPrivateCreateInput,
  TenantSupplierSharedCreateInput,
} from "@/schema/tenant-suppliers";
import type { AuthContext } from "@/services/authorization";
import { effectiveSupplierRolloutSettings } from "@/services/supplier-rollout-settings";

export type SupplierActor = {
  tenantId: string;
  authUserId: string;
  employeeId: string;
};

export async function requirePrivateSupplierWrites(
  repository: TenantSuppliersRepositoryPort,
  actor: SupplierActor,
) {
  const settings = await repository.getSettings(actor.tenantId);
  if (!settings?.module_enabled) {
    throw Errors.business(
      403,
      "当前租户尚未启用供应商模块",
      "SUPPLIER_MODULE_DISABLED",
    );
  }
  const effective = effectiveSupplierRolloutSettings(settings);
  if (effective.private_supplier_writes_enabled) return effective;
  throw Errors.business(
    403,
    "当前租户尚未开放私有供应商维护",
    "SUPPLIER_PRIVATE_WRITES_DISABLED",
  );
}

export function allocateInternalCode(
  repository: TenantSuppliersRepositoryPort,
  actor: SupplierActor,
  idempotencyKey: string,
) {
  return repository.allocateInternalCode({
    tenant_id: actor.tenantId,
    actor_user_id: actor.authUserId,
    actor_employee_id: actor.employeeId,
    idempotency_key: idempotencyKey,
  });
}

export function createPrivateSupplier(
  repository: TenantSuppliersRepositoryPort,
  actor: SupplierActor,
  input: TenantSupplierPrivateCreateInput,
  idempotencyKey: string,
) {
  const command = {
    ...input,
    tenant_id: actor.tenantId,
    actor_user_id: actor.authUserId,
    actor_employee_id: actor.employeeId,
    idempotency_key: idempotencyKey,
  };
  return repository.createPrivateSupplier(command);
}

export function createSharedRelationship(
  repository: TenantSuppliersRepositoryPort,
  actor: SupplierActor,
  input: TenantSupplierSharedCreateInput,
  idempotencyKey: string,
) {
  const command = {
    ...input,
    tenant_id: actor.tenantId,
    actor_user_id: actor.authUserId,
    actor_employee_id: actor.employeeId,
    idempotency_key: idempotencyKey,
  };
  return repository.createSharedRelationship(command);
}

export function updatePrivateSupplierMaster(
  repository: TenantSuppliersRepositoryPort,
  actor: SupplierActor,
  tenantSupplierId: string,
  input: TenantPrivateSupplierUpdateInput,
) {
  return repository.updatePrivateSupplierMaster({
    ...omitTenantId(input),
    tenant_id: actor.tenantId,
    tenant_supplier_id: tenantSupplierId,
    updated_by_employee_id: actor.employeeId,
  });
}

export function requireActor(
  authContext: AuthContext,
  tenantId: string,
): SupplierActor {
  if (!authContext.employeeId || !authContext.authUserId) {
    throw Errors.forbidden();
  }
  return {
    tenantId,
    authUserId: authContext.authUserId,
    employeeId: authContext.employeeId,
  };
}

function omitTenantId<T extends object>(input: T): Omit<T, "tenant_id"> {
  const { tenant_id: _tenantId, ...rest } =
    input as T & { tenant_id?: unknown };
  return rest;
}
