import { Errors } from "@/errors/error-factory";
import type { TenantSuppliersRepositoryPort } from "@/repositories/tenant-suppliers";
import type {
  TenantPrivateSupplierUpdateInput,
  TenantSupplierExplicitPrivateCreateInput,
  TenantSupplierPrivateCreateInput,
  TenantSupplierSharedCreateInput,
} from "@/schema/tenant-suppliers";
import type { AuthContext } from "@/services/authorization";
import { effectiveSupplierRolloutSettings } from "@/services/supplier-rollout-settings";
import { resolveSupplierOwnershipAccess } from "@/services/supplier-ownership-access";
import type { TenantSupplierDetail } from "@/repositories/tenant-suppliers";

export type SupplierActor = {
  tenantId: string;
  authUserId: string;
  employeeId: string;
};
const PRIVATE_SUPPLIER_DEFAULTS = {
  supplier_type: "other" as const,
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
  input: TenantSupplierExplicitPrivateCreateInput,
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

export async function createSimplifiedPrivateSupplier(
  repository: TenantSuppliersRepositoryPort,
  actor: SupplierActor,
  input: Pick<TenantSupplierPrivateCreateInput, "name" | "primary_contact">,
  idempotencyKey: string,
) {
  const allocation = await allocateInternalCode(
    repository,
    actor,
    supplierCodeAllocationKey(idempotencyKey),
  );
  return createPrivateSupplier(
    repository,
    actor,
    {
      name: input.name,
      legal_name: input.name,
      supplier_type: PRIVATE_SUPPLIER_DEFAULTS.supplier_type,
      primary_contact: input.primary_contact,
      code_source: "generated",
      internal_supplier_code: allocation.code,
      allocation_id: allocation.allocation_id,
    },
    idempotencyKey,
  );
}

export function isSimplifiedPrivateSupplierInput(
  input: TenantSupplierPrivateCreateInput,
): input is Exclude<
  TenantSupplierPrivateCreateInput,
  TenantSupplierExplicitPrivateCreateInput
> {
  return !("code_source" in input);
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
    actor_user_id: actor.authUserId,
    actor_employee_id: actor.employeeId,
  });
}

export function assertPrivateSupplierMasterWritable(
  relationship: TenantSupplierDetail,
  tenantId: string,
) {
  const ownership = relationship.supplier.ownership_scope === "tenant" &&
      relationship.supplier.owner_tenant_id
    ? {
      ownershipScope: "tenant" as const,
      ownerTenantId: relationship.supplier.owner_tenant_id,
    }
    : { ownershipScope: "platform" as const, ownerTenantId: null };
  const access = resolveSupplierOwnershipAccess({
    actor: { kind: "tenant", tenantId },
    resourceKind: "supplier",
    ownership,
    relationshipStatus: relationship.relationship_status,
    operation: "write",
    permissionGranted: true,
  });
  if (access.writable) return;
  throw Errors.business(
    access.visible ? 403 : 404,
    "当前供应商主档不可由本租户维护",
    access.visible ? "PRIVATE_RESOURCE_FORBIDDEN" : "TENANT_SUPPLIER_NOT_FOUND",
  );
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

function supplierCodeAllocationKey(idempotencyKey: string) {
  const key = `private-code:${idempotencyKey}`;
  return key.length <= 120 ? key : key.slice(0, 120);
}
