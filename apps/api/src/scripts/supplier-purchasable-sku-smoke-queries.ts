import type { SupplierPurchasableSkuSaveInput } from
  "@/repositories/supplier-purchasable-skus";
import { SupplierPurchasableSkuPriceContextEnvelopeSchema } from
  "@/repositories/supplier-purchasable-sku-records";
import type {
  SupplierPurchasableSkuSmokeFixture,
  SupplierPurchasableSkuSmokeSql,
} from "./supplier-purchasable-sku-smoke-fixture";

export function createSupplierPurchasableSkuSmokeCommand(
  fixture: SupplierPurchasableSkuSmokeFixture,
  input: {
    action: "create" | "update";
    skuId?: string;
    productId?: string;
    tenantId?: string;
    relationshipId?: string;
    supplierId?: string;
    actorUserId?: string;
    actorEmployeeId?: string;
    expectedSkuVersion?: number | null;
    expectedPriceListId?: string | null;
    expectedPriceListVersion?: number | null;
    sku?: Record<string, unknown>;
    unitPrice: string;
    idempotencyKey: string;
  },
): SupplierPurchasableSkuSaveInput {
  const skuId = input.skuId ?? fixture.skuId;
  return {
    action: input.action,
    tenant_id: input.tenantId ?? fixture.tenantId,
    tenant_supplier_id: input.relationshipId ?? fixture.relationshipId,
    supplier_id: input.supplierId ?? fixture.supplierId,
    supplier_product_id: input.productId ?? fixture.productId,
    supplier_sku_id: skuId,
    expected_sku_version: input.expectedSkuVersion ?? null,
    sku: input.sku ?? (input.action === "create"
      ? {
        sku_code: `CLIENT-${fixture.token}`,
        name: `task8-${fixture.token}`,
        purchase_unit_id: fixture.unitId,
        batch_managed: false,
        color_managed: false,
        serial_managed: false,
        spec_values: {},
      }
      : { name: `task8-${fixture.token}-edited` }),
    price: {
      unit_price: input.unitPrice,
      tax_rate: "0.13",
      tax_inclusive: false,
    },
    expected_price_list_id: input.expectedPriceListId ?? null,
    expected_price_list_version: input.expectedPriceListVersion ?? null,
    actor_user_id: input.actorUserId ?? fixture.actorUserId,
    actor_employee_id: input.actorEmployeeId ?? fixture.actorEmployeeId,
    idempotency_key: input.idempotencyKey,
  };
}

export async function commandSupplierPurchasableSku(
  sql: SupplierPurchasableSkuSmokeSql,
  input: SupplierPurchasableSkuSaveInput,
): Promise<unknown> {
  const rows = await sql<{ result: unknown }[]>`
    select public.command_supplier_purchasable_sku_v1(
      ${input.action}::text, ${input.tenant_id}::uuid,
      ${input.tenant_supplier_id}::uuid, ${input.supplier_id}::uuid,
      ${input.supplier_product_id}::uuid, ${input.supplier_sku_id}::uuid,
      ${input.expected_sku_version}::integer, ${input.sku}::jsonb,
      ${input.price}::jsonb, ${input.expected_price_list_id}::uuid,
      ${input.expected_price_list_version}::integer,
      ${input.actor_user_id}::uuid, ${input.actor_employee_id}::uuid,
      ${input.idempotency_key}::text
    ) as result
  `;
  return rows[0]?.result;
}

export async function getSupplierPurchasableSkuSmokeContext(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
) {
  const rows = await sql<{ result: unknown }[]>`
    select public.get_supplier_purchasable_sku_price_context_v1(
      ${fixture.tenantId}::uuid, ${fixture.relationshipId}::uuid,
      ${fixture.supplierId}::uuid, ${fixture.productId}::uuid,
      ${fixture.skuId}::uuid
    ) as result
  `;
  return SupplierPurchasableSkuPriceContextEnvelopeSchema.parse(rows[0]?.result);
}

export async function getSupplierPurchasableSkuSmokeVersion(
  sql: SupplierPurchasableSkuSmokeSql,
  skuId: string,
): Promise<number> {
  const rows = await sql<{ version: number }[]>`
    select version from public.supplier_skus where id = ${skuId}::uuid
  `;
  if (!rows[0]?.version) throw new Error("SMOKE_SKU_VERSION_MISSING");
  return rows[0].version;
}

export async function snapshotSupplierPriceItem(
  sql: SupplierPurchasableSkuSmokeSql,
  itemId: string,
): Promise<unknown> {
  const rows = await sql<{ snapshot: unknown }[]>`
    select to_jsonb(item) as snapshot
    from public.supplier_price_list_items as item
    where item.id = ${itemId}::uuid
  `;
  return rows[0]?.snapshot;
}

export async function snapshotSupplierPriceListItems(
  sql: SupplierPurchasableSkuSmokeSql,
  priceListId: string,
): Promise<unknown[]> {
  const rows = await sql<{ snapshot: unknown }[]>`
    select coalesce(
      jsonb_agg(to_jsonb(item) order by item.supplier_sku_id, item.id),
      '[]'::jsonb
    ) as snapshot
    from public.supplier_price_list_items as item
    where item.supplier_price_list_id = ${priceListId}::uuid
  `;
  return Array.isArray(rows[0]?.snapshot) ? rows[0].snapshot : [];
}

export async function snapshotSupplierPriceSeries(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<unknown> {
  const rows = await sql<{ snapshot: unknown }[]>`
    select jsonb_build_object(
      'lists', coalesce((select jsonb_agg(to_jsonb(price_list)
        order by price_list.version_number, price_list.id)
        from public.supplier_price_lists as price_list
        where price_list.tenant_id = ${fixture.tenantId}::uuid
          and price_list.supplier_id = ${fixture.supplierId}::uuid), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(to_jsonb(item)
        order by item.supplier_price_list_id, item.supplier_sku_id)
        from public.supplier_price_list_items as item
        where item.tenant_id = ${fixture.tenantId}::uuid
          and item.supplier_id = ${fixture.supplierId}::uuid), '[]'::jsonb)
    ) as snapshot
  `;
  return rows[0]?.snapshot;
}

export async function snapshotFutureSupplierPrice(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<unknown> {
  const rows = await sql<{ snapshot: unknown }[]>`
    select jsonb_build_object(
      'list', to_jsonb(price_list),
      'items', coalesce(jsonb_agg(to_jsonb(item) order by item.id)
        filter (where item.id is not null), '[]'::jsonb)
    ) as snapshot
    from public.supplier_price_lists as price_list
    left join public.supplier_price_list_items as item
      on item.supplier_price_list_id = price_list.id
    where price_list.id = ${fixture.futurePriceListId}::uuid
    group by price_list.id
  `;
  return rows[0]?.snapshot;
}

export async function setSupplierPriceListEffectiveUntil(
  sql: SupplierPurchasableSkuSmokeSql,
  priceListId: string,
  effectiveUntil: string,
): Promise<void> {
  await sql`update public.supplier_price_lists
    set effective_until = ${effectiveUntil}::timestamptz,
      row_version = row_version + 1, updated_at = now()
    where id = ${priceListId}::uuid`;
}

export async function countSupplierPriceVersions(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select count(*)::integer as count
    from public.supplier_price_lists
    where tenant_id = ${fixture.tenantId}::uuid
      and supplier_id = ${fixture.supplierId}::uuid
  `;
  return rows[0]?.count ?? -1;
}

export async function resolveSupplierPurchasableSkuCatalog(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
  skuCode: string,
): Promise<unknown> {
  const rows = await sql<{ result: unknown }[]>`
    select public.resolve_supplier_purchase_order_catalog(
      ${fixture.tenantId}::uuid, ${fixture.relationshipId}::uuid,
      now(), ${skuCode}::text, 1, 1
    ) as result
  `;
  return rows[0]?.result;
}

export async function createFutureSupplierPriceVersion(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
  currentListId: string,
): Promise<void> {
  const replacementCurrentListId = crypto.randomUUID();
  const futureFrom = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000)
    .toISOString();
  await sql`
    update public.supplier_price_lists
    set lifecycle_status = 'retired', row_version = row_version + 1,
      updated_at = now(), updated_by_employee_id = ${fixture.actorEmployeeId}::uuid
    where id = ${currentListId}::uuid
  `;
  await sql`
    insert into public.supplier_price_lists
    select (jsonb_populate_record(
      null::public.supplier_price_lists,
      to_jsonb(source) || jsonb_build_object(
        'id', ${replacementCurrentListId}::uuid,
        'version_number', source.version_number + 1,
        'row_version', 1,
        'lifecycle_status', 'draft',
        'effective_until', ${futureFrom}::timestamptz,
        'supersedes_price_list_id', source.id,
        'published_at', null,
        'created_at', now(), 'updated_at', now()
      )
    )).*
    from public.supplier_price_lists as source
    where source.id = ${currentListId}::uuid
  `;
  await sql`
    insert into public.supplier_price_list_items
    select (jsonb_populate_record(
      null::public.supplier_price_list_items,
      to_jsonb(source_item) || jsonb_build_object(
        'id', gen_random_uuid(),
        'supplier_price_list_id', ${replacementCurrentListId}::uuid,
        'created_at', now(), 'updated_at', now()
      )
    )).*
    from public.supplier_price_list_items as source_item
    where source_item.supplier_price_list_id = ${currentListId}::uuid
  `;
  await sql`
    update public.supplier_price_lists
    set lifecycle_status = 'published', published_at = now(),
      row_version = row_version + 1, updated_at = now(),
      updated_by_employee_id = ${fixture.actorEmployeeId}::uuid
    where id = ${replacementCurrentListId}::uuid
  `;
  await sql`
    insert into public.supplier_price_lists
    select (jsonb_populate_record(
      null::public.supplier_price_lists,
      to_jsonb(source) || jsonb_build_object(
        'id', ${fixture.futurePriceListId}::uuid,
        'version_number', source.version_number + 2,
        'row_version', 1,
        'lifecycle_status', 'draft',
        'effective_from', ${futureFrom}::timestamptz,
        'effective_until', null,
        'supersedes_price_list_id', source.id,
        'published_at', null,
        'created_at', now(), 'updated_at', now()
      )
    )).*
    from public.supplier_price_lists as source
    where source.id = ${replacementCurrentListId}::uuid
  `;
  await sql`
    insert into public.supplier_price_list_items
    select (jsonb_populate_record(
      null::public.supplier_price_list_items,
      to_jsonb(source_item) || jsonb_build_object(
        'id', gen_random_uuid(),
        'supplier_price_list_id', ${fixture.futurePriceListId}::uuid,
        'unit_price', 888.88,
        'created_at', now(), 'updated_at', now()
      )
    )).*
    from public.supplier_price_list_items as source_item
    where source_item.supplier_price_list_id = ${replacementCurrentListId}::uuid
      and source_item.supplier_sku_id = ${fixture.skuId}::uuid
  `;
  await sql`
    update public.supplier_price_lists
    set lifecycle_status = 'published', published_at = now(),
      row_version = row_version + 1, updated_at = now(),
      updated_by_employee_id = ${fixture.actorEmployeeId}::uuid
    where id = ${fixture.futurePriceListId}::uuid
  `;
}

export async function addMultiItemSourceFixture(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
  currentListId: string,
): Promise<void> {
  const multiItemCurrentListId = crypto.randomUUID();
  await sql`
    insert into public.supplier_skus(
      id, supplier_id, supplier_product_id, sku_code, name,
      purchase_unit_id, base_unit_id, base_unit_conversion, status, version,
      ownership_scope, owner_tenant_id, acting_tenant_id, acting_employee_id,
      operation_source, created_by_employee_id, updated_by_employee_id,
      spec_values
    ) values (${fixture.extraSkuId}::uuid, ${fixture.supplierId}::uuid,
      ${fixture.productId}::uuid,
      ${`TS-${fixture.extraSkuId.replaceAll("-", "").toUpperCase()}`},
      ${`task8-${fixture.token}-extra`}, ${fixture.unitId}::uuid,
      ${fixture.unitId}::uuid, 1, 'active', 1, 'tenant',
      ${fixture.tenantId}::uuid, ${fixture.tenantId}::uuid,
      ${fixture.actorEmployeeId}::uuid, 'tenant',
      ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid,
      '{}'::jsonb)
  `;
  await sql`
    update public.supplier_price_lists
    set lifecycle_status = 'retired', row_version = row_version + 1,
      updated_at = now(), updated_by_employee_id = ${fixture.actorEmployeeId}::uuid
    where id = ${currentListId}::uuid
  `;
  await sql`
    insert into public.supplier_price_lists
    select (jsonb_populate_record(
      null::public.supplier_price_lists,
      to_jsonb(source) || jsonb_build_object(
        'id', ${multiItemCurrentListId}::uuid,
        'version_number', (
          select max(candidate.version_number) + 1
          from public.supplier_price_lists as candidate
          where candidate.tenant_id = ${fixture.tenantId}::uuid
            and candidate.supplier_id = ${fixture.supplierId}::uuid
            and upper(btrim(candidate.price_list_code)) = 'DEFAULT'
        ),
        'row_version', 1,
        'lifecycle_status', 'draft',
        'supersedes_price_list_id', source.id,
        'published_at', null,
        'created_at', now(), 'updated_at', now()
      )
    )).*
    from public.supplier_price_lists as source
    where source.id = ${currentListId}::uuid
  `;
  await sql`
    insert into public.supplier_price_list_items
    select (jsonb_populate_record(
      null::public.supplier_price_list_items,
      to_jsonb(source_item) || jsonb_build_object(
        'id', gen_random_uuid(),
        'supplier_price_list_id', ${multiItemCurrentListId}::uuid,
        'created_at', now(), 'updated_at', now()
      )
    )).*
    from public.supplier_price_list_items as source_item
    where source_item.supplier_price_list_id = ${currentListId}::uuid
  `;
  await sql`
    insert into public.supplier_price_list_items
    select (jsonb_populate_record(
      null::public.supplier_price_list_items,
      to_jsonb(source_item) || jsonb_build_object(
        'id', gen_random_uuid(), 'supplier_sku_id', ${fixture.extraSkuId}::uuid,
        'unit_price', 77.77, 'created_at', now(), 'updated_at', now()
      )
    )).*
    from public.supplier_price_list_items as source_item
    where source_item.supplier_price_list_id = ${multiItemCurrentListId}::uuid
      and source_item.supplier_sku_id = ${fixture.skuId}::uuid
  `;
  await sql`
    update public.supplier_price_lists
    set lifecycle_status = 'published', published_at = now(),
      row_version = row_version + 1, updated_at = now(),
      updated_by_employee_id = ${fixture.actorEmployeeId}::uuid
    where id = ${multiItemCurrentListId}::uuid
  `;
}

export async function setSupplierRelationshipStatus(
  sql: SupplierPurchasableSkuSmokeSql,
  fixture: SupplierPurchasableSkuSmokeFixture,
  status: "active" | "suspended",
): Promise<void> {
  await sql`update public.tenant_suppliers set relationship_status = ${status},
    updated_by_employee_id = ${fixture.actorEmployeeId}::uuid,
    updated_at = now() where id = ${fixture.relationshipId}::uuid`;
}
