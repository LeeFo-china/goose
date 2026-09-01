import type { ReservedSQL } from "bun";

import { SupplierPurchasableSkuCommandResultSchema } from
  "@/repositories/supplier-purchasable-sku-records";
import type {
  SupplierPurchasableSkuExplainGateway,
} from "./supplier-purchasable-sku-explain";
import {
  countSupplierPurchasableSkuSmokeResiduals,
  createSupplierPurchasableSkuSmokeFixture,
  seedSupplierPurchasableSkuSmokeFixture,
  type SupplierPurchasableSkuSmokeSql,
} from "./supplier-purchasable-sku-smoke-fixture";
import {
  commandSupplierPurchasableSku,
  createFutureSupplierPriceVersion,
  createSupplierPurchasableSkuSmokeCommand,
  getSupplierPurchasableSkuSmokeContext,
} from "./supplier-purchasable-sku-smoke-queries";

const CONNECTION_OPTIONS = {
  max: 1,
  prepare: false,
  connectionTimeout: 10,
} as const;

export class DirectSupplierPurchasableSkuExplainGateway
implements SupplierPurchasableSkuExplainGateway {
  private readonly database: Bun.SQL;
  private readonly fixture = createSupplierPurchasableSkuSmokeFixture();
  private readonly copyTargetListId = crypto.randomUUID();
  private reserved: ReservedSQL | undefined;
  private currentListId: string | undefined;
  private currentItemId: string | undefined;

  constructor(private readonly databaseUrl: string) {
    this.database = new Bun.SQL(databaseUrl, CONNECTION_OPTIONS);
  }

  private async initialize(): Promise<ReservedSQL> {
    if (this.reserved) return this.reserved;
    await this.database`analyze public.supplier_price_lists`.simple();
    await this.database`analyze public.supplier_price_list_items`.simple();
    const reserved = await this.database.reserve();
    this.reserved = reserved;
    await reserved`begin`.simple();
    await reserved`set local lock_timeout = '10s'`.simple();
    await reserved`set local statement_timeout = '30s'`.simple();
    await seedSupplierPurchasableSkuSmokeFixture(reserved, this.fixture);
    const created = SupplierPurchasableSkuCommandResultSchema.parse(
      await commandSupplierPurchasableSku(
        reserved,
        createSupplierPurchasableSkuSmokeCommand(this.fixture, {
          action: "create",
          unitPrice: "100.00",
          idempotencyKey: `task8:${this.fixture.token}:explain-create`,
        }),
      ),
    );
    await createFutureSupplierPriceVersion(
      reserved,
      this.fixture,
      created.current_price.supplier_price_list_id,
    );
    const context = await getSupplierPurchasableSkuSmokeContext(
      reserved,
      this.fixture,
    );
    if (!context.current_price) throw new Error("EXPLAIN_CURRENT_PRICE_MISSING");
    this.currentListId = context.current_price.supplier_price_list_id;
    this.currentItemId = context.current_price.supplier_price_list_item_id;
    await this.createCopyTarget(reserved, this.currentListId);
    await this.seedPlannerNoise(reserved, this.currentListId, this.currentItemId);
    await reserved`analyze public.supplier_price_lists`.simple();
    await reserved`analyze public.supplier_price_list_items`.simple();
    return reserved;
  }

  private async createCopyTarget(
    sql: SupplierPurchasableSkuSmokeSql,
    currentListId: string,
  ): Promise<void> {
    await sql`
      insert into public.supplier_price_lists
      select (jsonb_populate_record(
        null::public.supplier_price_lists,
        to_jsonb(source) || jsonb_build_object(
          'id', ${this.copyTargetListId}::uuid,
          'version_number', source.version_number + 20,
          'row_version', 1,
          'lifecycle_status', 'draft',
          'published_at', null,
          'effective_from', now() + interval '20 days',
          'effective_until', null,
          'created_at', now(), 'updated_at', now()
        )
      )).*
      from public.supplier_price_lists as source
      where source.id = ${currentListId}::uuid
    `;
  }

  private async seedPlannerNoise(
    sql: SupplierPurchasableSkuSmokeSql,
    currentListId: string,
    currentItemId: string,
  ): Promise<void> {
    await sql`
      insert into public.supplier_skus
      select (jsonb_populate_record(
        null::public.supplier_skus,
        to_jsonb(source) || jsonb_build_object(
          'id', gen_random_uuid(),
          'sku_code', ${`TS-T8N-${this.fixture.token}-`} ||
            lpad(series.value::text, 4, '0'),
          'name', ${`task8-${this.fixture.token}-noise-`} ||
            series.value::text,
          'version', 1,
          'created_at', now(), 'updated_at', now()
        )
      )).*
      from public.supplier_skus as source
      cross join generate_series(1, 512) as series(value)
      where source.id = ${this.fixture.skuId}::uuid
    `;
    await sql`
      insert into public.supplier_price_lists
      select (jsonb_populate_record(
        null::public.supplier_price_lists,
        to_jsonb(source) || jsonb_build_object(
          'id', gen_random_uuid(),
          'price_list_code', ${`T8N-${this.fixture.token}-`} ||
            lpad(series.value::text, 4, '0'),
          'version_number', 1,
          'row_version', 1,
          'lifecycle_status', 'draft',
          'effective_from', now() + interval '30 days',
          'effective_until', null,
          'supersedes_price_list_id', null,
          'published_at', null,
          'created_at', now(), 'updated_at', now()
        )
      )).*
      from public.supplier_price_lists as source
      cross join generate_series(1, 512) as series(value)
      where source.id = ${currentListId}::uuid
    `;
    await sql`
      insert into public.supplier_price_list_items
      select (jsonb_populate_record(
        null::public.supplier_price_list_items,
        to_jsonb(source_item) || jsonb_build_object(
          'id', gen_random_uuid(),
          'supplier_price_list_id', price_list.id,
          'supplier_sku_id', sku.id,
          'created_at', now(), 'updated_at', now()
        )
      )).*
      from public.supplier_price_list_items as source_item
      cross join generate_series(1, 512) as series(value)
      join public.supplier_price_lists as price_list
        on price_list.price_list_code = ${`T8N-${this.fixture.token}-`} ||
          lpad(series.value::text, 4, '0')
        and price_list.supplier_id = ${this.fixture.supplierId}::uuid
      join public.supplier_skus as sku
        on sku.sku_code = ${`TS-T8N-${this.fixture.token}-`} ||
          lpad(series.value::text, 4, '0')
        and sku.supplier_id = ${this.fixture.supplierId}::uuid
      where source_item.id = ${currentItemId}::uuid
    `;
    await sql`
      update public.supplier_price_lists
      set lifecycle_status = 'retired', published_at = now(),
        row_version = row_version + 1, updated_at = now()
      where supplier_id = ${this.fixture.supplierId}::uuid
        and price_list_code like ${`T8N-${this.fixture.token}-%`}
    `;
  }

  async explain(
    name: "currentDefault" | "earliestFuture" | "targetCurrentItem" |
      "setBasedCopy",
  ): Promise<unknown> {
    const sql = await this.initialize();
    const currentListId = this.currentListId;
    const currentItemId = this.currentItemId;
    if (!currentListId || !currentItemId) {
      throw new Error("EXPLAIN_FIXTURE_NOT_READY");
    }
    switch (name) {
      case "currentDefault":
        return sql`explain (analyze, buffers, format json)
          select price_list.id, price_list.row_version
          from public.supplier_price_lists as price_list
          join public.supplier_price_list_items as item
            on item.supplier_price_list_id = price_list.id
            and item.tenant_id = ${this.fixture.tenantId}::uuid
            and item.supplier_id = ${this.fixture.supplierId}::uuid
          where price_list.tenant_id = ${this.fixture.tenantId}::uuid
            and price_list.tenant_supplier_id = ${this.fixture.relationshipId}::uuid
            and price_list.supplier_id = ${this.fixture.supplierId}::uuid
            and upper(btrim(price_list.price_list_code)) = 'DEFAULT'
            and price_list.scope_type = 'default'
            and price_list.currency = 'CNY'
            and price_list.lifecycle_status = 'published'
            and price_list.effective_from <= now()
            and (price_list.effective_until is null
              or price_list.effective_until > now())
            and item.supplier_product_id = ${this.fixture.productId}::uuid
            and item.supplier_sku_id = ${this.fixture.skuId}::uuid
          order by price_list.version_number desc, price_list.id desc limit 1`;
      case "earliestFuture":
        return sql`explain (analyze, buffers, format json)
          select price_list.id, price_list.effective_from
          from public.supplier_price_lists as price_list
          join public.supplier_price_list_items as item
            on item.supplier_price_list_id = price_list.id
            and item.tenant_id = ${this.fixture.tenantId}::uuid
            and item.supplier_id = ${this.fixture.supplierId}::uuid
          where price_list.tenant_id = ${this.fixture.tenantId}::uuid
            and price_list.tenant_supplier_id = ${this.fixture.relationshipId}::uuid
            and price_list.supplier_id = ${this.fixture.supplierId}::uuid
            and price_list.lifecycle_status = 'published'
            and price_list.effective_from > now()
            and item.supplier_product_id = ${this.fixture.productId}::uuid
            and item.supplier_sku_id = ${this.fixture.skuId}::uuid
          order by price_list.effective_from, price_list.version_number,
            price_list.id limit 1`;
      case "targetCurrentItem":
        return sql`explain (analyze, buffers, format json)
          select item.id, item.unit_price, item.tax_rate
          from public.supplier_price_list_items as item
          where item.id = ${currentItemId}::uuid
            and item.supplier_price_list_id = ${currentListId}::uuid
            and item.tenant_id = ${this.fixture.tenantId}::uuid
            and item.supplier_id = ${this.fixture.supplierId}::uuid
            and item.supplier_product_id = ${this.fixture.productId}::uuid
            and item.supplier_sku_id = ${this.fixture.skuId}::uuid limit 1`;
      case "setBasedCopy":
        return sql`explain (analyze, buffers, format json)
          insert into public.supplier_price_list_items(
            id, tenant_id, supplier_id, supplier_price_list_id,
            supplier_product_id, supplier_sku_id,
            minimum_quantity, maximum_quantity,
            purchase_unit_id, base_unit_id, base_unit_conversion,
            unit_price, tax_rate, tax_inclusive,
            acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
            created_by_employee_id, updated_by_employee_id
          )
          select gen_random_uuid(), source_item.tenant_id,
            source_item.supplier_id, ${this.copyTargetListId}::uuid,
            source_item.supplier_product_id, source_item.supplier_sku_id,
            source_item.minimum_quantity, source_item.maximum_quantity,
            source_item.purchase_unit_id, source_item.base_unit_id,
            source_item.base_unit_conversion, source_item.unit_price,
            source_item.tax_rate, source_item.tax_inclusive,
            source_item.acting_tenant_id, source_item.acting_employee_id,
            source_item.operation_source, source_item.proxy_reason,
            source_item.created_by_employee_id, source_item.updated_by_employee_id
          from public.supplier_price_list_items as source_item
          where source_item.supplier_price_list_id = ${currentListId}::uuid
            and source_item.tenant_id = ${this.fixture.tenantId}::uuid
            and source_item.supplier_id = ${this.fixture.supplierId}::uuid
            and not exists (
              select 1 from public.supplier_price_list_items as target_item
              where target_item.supplier_price_list_id =
                ${this.copyTargetListId}::uuid
                and target_item.supplier_sku_id = source_item.supplier_sku_id
            )`;
    }
  }

  async close(): Promise<void> {
    let residuals = -1;
    try {
      if (this.reserved) {
        await this.reserved`rollback`.simple();
        this.reserved.release();
        this.reserved = undefined;
      }
      await this.database`analyze public.supplier_price_lists`.simple();
      await this.database`analyze public.supplier_price_list_items`.simple();
      residuals = await countSupplierPurchasableSkuSmokeResiduals(
        this.database,
        this.fixture,
      );
    } finally {
      await this.database.close();
    }
    if (residuals !== 0) throw new Error("EXPLAIN_ROLLBACK_RESIDUAL_FOUND");
  }
}
