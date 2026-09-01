import { isDeepStrictEqual } from "node:util";

import { SupplierPurchasableSkuCommandFailureSchema } from
  "@/repositories/supplier-purchasable-sku-records";
import { SupplierProductAccessService } from
  "@/services/supplier-product-access";
import type { AuthContext } from "@/services/authorization";
import { assertSupplierPurchasableSkuPermissionBoundary } from
  "./supplier-purchasable-sku-permission-boundary";
import type {
  SupplierPurchasableSkuSmokeFixture,
  SupplierPurchasableSkuSmokeSql,
} from "./supplier-purchasable-sku-smoke-fixture";
import {
  commandSupplierPurchasableSku,
  createSupplierPurchasableSkuSmokeCommand,
  setSupplierRelationshipStatus,
} from "./supplier-purchasable-sku-smoke-queries";

function assertFailure(value: unknown, errorCode: string): void {
  const parsed = SupplierPurchasableSkuCommandFailureSchema.safeParse(value);
  if (!parsed.success || parsed.data.error_code !== errorCode) {
    throw new Error("SMOKE_BOUNDARY_RESULT_INVALID");
  }
}

async function snapshotBoundaryState(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<unknown> {
  const rows = await sql<{ snapshot: unknown }[]>`
    select jsonb_build_object(
      'products', coalesce((select jsonb_agg(to_jsonb(product)
        order by product.id) from public.supplier_products as product
        where product.supplier_id in (
          ${fixture.supplierId}::uuid, ${fixture.platformSupplierId}::uuid
        )), '[]'::jsonb),
      'skus', coalesce((select jsonb_agg(to_jsonb(sku) order by sku.id)
        from public.supplier_skus as sku where sku.supplier_id in (
          ${fixture.supplierId}::uuid, ${fixture.platformSupplierId}::uuid
        )), '[]'::jsonb),
      'lists', coalesce((select jsonb_agg(to_jsonb(price_list)
        order by price_list.id) from public.supplier_price_lists as price_list
        where price_list.supplier_id = ${fixture.supplierId}::uuid),
        '[]'::jsonb),
      'items', coalesce((select jsonb_agg(to_jsonb(item) order by item.id)
        from public.supplier_price_list_items as item
        where item.supplier_id = ${fixture.supplierId}::uuid), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(to_jsonb(event) order by event.id)
        from public.supplier_command_events as event
        where event.actor_user_id in (
          ${fixture.actorUserId}::uuid, ${fixture.otherUserId}::uuid
        )), '[]'::jsonb)
    ) as snapshot
  `;
  return rows[0]?.snapshot;
}

function missingPermissionAuth(
  fixture: SupplierPurchasableSkuSmokeFixture,
): AuthContext {
  return {
    authUserId: fixture.actorUserId,
    employeeId: fixture.actorEmployeeId,
    tenantId: fixture.tenantId,
    tenantName: "task8",
    tenantSlug: `task8-${fixture.token}`,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "task8",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: [{ code: "supplier.product.manage", scope: "all" }],
  };
}

async function verifyMissingPermissionBoundary(
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<void> {
  let repositoryReads = 0;
  const service = new SupplierProductAccessService({
    repository: {
      async getSettings() {
        repositoryReads += 1;
        return null;
      },
      async findRelationship() {
        repositoryReads += 1;
        return null;
      },
    },
  });
  await assertSupplierPurchasableSkuPermissionBoundary(
    () => service.requirePurchasableSkuWrite(
      missingPermissionAuth(fixture),
      fixture.relationshipId,
    ),
    () => repositoryReads,
  );
}

export async function verifySupplierPurchasableSkuBoundaries(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<void> {
  await verifyMissingPermissionBoundary(fixture);
  const before = await snapshotBoundaryState(sql, fixture);

  assertFailure(await commandSupplierPurchasableSku(
    sql,
    createSupplierPurchasableSkuSmokeCommand(fixture, {
      action: "create",
      skuId: crypto.randomUUID(),
      productId: fixture.inactiveProductId,
      unitPrice: "150.00",
      idempotencyKey: `task8:${fixture.token}:inactive-product`,
    }),
  ), "SUPPLIER_PRODUCT_STATE_CONFLICT");

  assertFailure(await commandSupplierPurchasableSku(
    sql,
    createSupplierPurchasableSkuSmokeCommand(fixture, {
      action: "update",
      skuId: fixture.inactiveSkuId,
      expectedSkuVersion: 1,
      unitPrice: "151.00",
      idempotencyKey: `task8:${fixture.token}:inactive-sku`,
    }),
  ), "SUPPLIER_SKU_STATE_CONFLICT");

  assertFailure(await commandSupplierPurchasableSku(
    sql,
    createSupplierPurchasableSkuSmokeCommand(fixture, {
      action: "update",
      skuId: fixture.platformSkuId,
      expectedSkuVersion: 1,
      unitPrice: "152.00",
      idempotencyKey: `task8:${fixture.token}:platform-sku`,
    }),
  ), "SHARED_RESOURCE_READ_ONLY");

  assertFailure(await commandSupplierPurchasableSku(
    sql,
    createSupplierPurchasableSkuSmokeCommand(fixture, {
      action: "create",
      skuId: crypto.randomUUID(),
      tenantId: fixture.otherTenantId,
      actorUserId: fixture.otherUserId,
      actorEmployeeId: fixture.otherEmployeeId,
      unitPrice: "153.00",
      idempotencyKey: `task8:${fixture.token}:other-tenant`,
    }),
  ), "TENANT_SUPPLIER_NOT_FOUND");

  await setSupplierRelationshipStatus(sql, fixture, "suspended");
  try {
    assertFailure(await commandSupplierPurchasableSku(
      sql,
      createSupplierPurchasableSkuSmokeCommand(fixture, {
        action: "create",
        skuId: crypto.randomUUID(),
        unitPrice: "154.00",
        idempotencyKey: `task8:${fixture.token}:suspended`,
      }),
    ), "TENANT_SUPPLIER_NOT_FOUND");
  } finally {
    await setSupplierRelationshipStatus(sql, fixture, "active");
  }

  if (!isDeepStrictEqual(before, await snapshotBoundaryState(sql, fixture))) {
    throw new Error("SMOKE_REJECTED_BOUNDARY_CHANGED_STATE");
  }
}
