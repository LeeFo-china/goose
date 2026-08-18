import { Errors } from "@/errors/error-factory";
import type {
  BrandUpdateReplayRequest,
  CategoryUpdateReplayRequest,
  SpecUpdateReplayRequest,
} from "@/repositories/supplier-catalog-replay";
import type { SupplierCatalogRepositoryPort } from "@/repositories/supplier-catalog";
import type {
  CatalogSpecDefinitionUpdateInput,
  TenantCatalogBrandUpdateInput,
  TenantCatalogCategoryUpdateInput,
} from "@/schema/supplier-catalog";

type Actor = {
  tenantId: string | null;
  authUserId: string;
  employeeId: string;
};

export async function resolveCategoryUpdateReplay(
  repository: SupplierCatalogRepositoryPort,
  actor: Actor & { tenantId: string },
  resourceId: string,
  input: TenantCatalogCategoryUpdateInput,
  idempotencyKey: string,
) {
  const event = await repository.findCatalogUpdateReplay(
    actor.authUserId,
    idempotencyKey,
  );
  if (!event) return null;
  assertIdentity(event, {
    tenantId: actor.tenantId,
    command: "update_tenant_catalog_category",
    resourceType: "catalog_category",
    resourceId,
  });
  const request = event.request as CategoryUpdateReplayRequest;
  assertRecordedTenant(request, actor.tenantId);
  assertPatch(input, request);
  return {
    ...request,
    tenant_id: actor.tenantId,
    actor_user_id: actor.authUserId,
    idempotency_key: idempotencyKey,
  };
}

export async function resolveBrandUpdateReplay(
  repository: SupplierCatalogRepositoryPort,
  actor: Actor & { tenantId: string },
  resourceId: string,
  input: TenantCatalogBrandUpdateInput,
  idempotencyKey: string,
) {
  const event = await repository.findCatalogUpdateReplay(
    actor.authUserId,
    idempotencyKey,
  );
  if (!event) return null;
  assertIdentity(event, {
    tenantId: actor.tenantId,
    command: "update_tenant_catalog_brand",
    resourceType: "catalog_brand",
    resourceId,
  });
  const request = event.request as BrandUpdateReplayRequest;
  assertRecordedTenant(request, actor.tenantId);
  assertPatch(input, request);
  return {
    ...request,
    tenant_id: actor.tenantId,
    actor_user_id: actor.authUserId,
    idempotency_key: idempotencyKey,
  };
}

export async function resolveSpecUpdateReplay(
  repository: SupplierCatalogRepositoryPort,
  actor: Actor,
  categoryId: string,
  resourceId: string,
  input: CatalogSpecDefinitionUpdateInput,
  idempotencyKey: string,
) {
  const event = await repository.findCatalogUpdateReplay(
    actor.authUserId,
    idempotencyKey,
  );
  if (!event) return null;
  assertIdentity(event, {
    tenantId: actor.tenantId,
    command: "update_catalog_spec_definition",
    resourceType: "catalog_spec_definition",
    resourceId,
  });
  const request = event.request as SpecUpdateReplayRequest;
  assertRecordedTenant(request, actor.tenantId);
  if (request.category_id !== categoryId) conflict();
  assertPatch(input, request);
  return {
    ...request,
    actor_user_id: actor.authUserId,
    idempotency_key: idempotencyKey,
  };
}

function assertIdentity(
  event: {
    tenant_id: string | null;
    command: string;
    resource_type: string;
    resource_id: string;
  },
  expected: {
    tenantId: string | null;
    command: string;
    resourceType: string;
    resourceId: string;
  },
) {
  if (
    event.tenant_id !== expected.tenantId ||
    event.command !== expected.command ||
    event.resource_type !== expected.resourceType ||
    event.resource_id !== expected.resourceId
  ) conflict();
}

function assertRecordedTenant(
  request: { tenant_id: string | null },
  tenantId: string | null,
) {
  if (request.tenant_id !== tenantId) conflict();
}

function assertPatch(
  patch: Record<string, unknown>,
  request: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && !sameJson(value, request[key])) conflict();
  }
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function conflict(): never {
  throw Errors.business(
    409,
    "幂等键已用于不同的供应商目录命令",
    "SUPPLIER_IDEMPOTENCY_CONFLICT",
  );
}
