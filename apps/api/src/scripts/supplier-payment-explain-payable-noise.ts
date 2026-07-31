import {
  SUPPLIER_PAYMENT_BASE_IDS,
  SUPPLIER_PAYMENT_SMOKE_IDS,
  type SupplierPaymentSmokeFixture,
  type SupplierPaymentSmokeSql,
} from "./supplier-payment-smoke-fixture";

export async function seedSupplierPayableNoise(
  sql: SupplierPaymentSmokeSql,
  fixture: SupplierPaymentSmokeFixture,
): Promise<void> {
  await sql`
    insert into public.suppliers (
      id, code, name, legal_name, supplier_type, onboarding_status,
      operational_status, reviewed_by_employee_id, reviewed_at,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSupplier}::uuid,
      'SMOKE-EXPLAIN-SUPPLIER', 'EXPLAIN 噪声供应商',
      'EXPLAIN 噪声供应商有限公司', 'manufacturer', 'approved', 'active',
      ${fixture.employee_id}::uuid, now(), ${fixture.employee_id}::uuid,
      ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.tenant_suppliers (
      id, tenant_id, supplier_id, relationship_status, default_currency,
      started_at, created_by_employee_id, updated_by_employee_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseRelationship}::uuid,
      ${fixture.tenant_id}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSupplier}::uuid,
      'active', 'CNY', current_date, ${fixture.employee_id}::uuid,
      ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_products (
      id, supplier_id, product_code, name, category_id, brand_id, status,
      acting_tenant_id, acting_employee_id, proxy_reason,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseProduct}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSupplier}::uuid,
      'SMOKE-EXPLAIN-PRODUCT', 'EXPLAIN 噪声商品',
      ${SUPPLIER_PAYMENT_BASE_IDS.category}::uuid,
      ${SUPPLIER_PAYMENT_BASE_IDS.brand}::uuid, 'draft',
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid,
      '回滚 EXPLAIN 基数', ${fixture.employee_id}::uuid,
      ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_skus (
      id, supplier_id, supplier_product_id, sku_code, name,
      purchase_unit_id, base_unit_id, base_unit_conversion, status,
      acting_tenant_id, acting_employee_id, proxy_reason,
      created_by_employee_id, updated_by_employee_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSku}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSupplier}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseProduct}::uuid,
      'SMOKE-EXPLAIN-SKU', 'EXPLAIN 噪声 SKU',
      ${SUPPLIER_PAYMENT_BASE_IDS.unit}::uuid,
      ${SUPPLIER_PAYMENT_BASE_IDS.unit}::uuid, 1, 'active',
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid,
      '回滚 EXPLAIN 基数', ${fixture.employee_id}::uuid,
      ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    update public.supplier_products
    set status = 'active', version = version + 1
    where id = ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseProduct}::uuid;
  `;
  await sql`
    insert into public.supplier_price_lists (
      id, supplier_id, price_list_code, version_number, name, currency,
      lifecycle_status, effective_from, acting_tenant_id, acting_employee_id,
      proxy_reason, created_by_employee_id, updated_by_employee_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoisePriceList}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSupplier}::uuid,
      'SMOKE-EXPLAIN-PRICE', 1, 'EXPLAIN 噪声价格', 'CNY', 'draft',
      now() - interval '1 day', ${fixture.tenant_id}::uuid,
      ${fixture.employee_id}::uuid, '回滚 EXPLAIN 基数',
      ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_price_list_items (
      id, supplier_id, supplier_price_list_id, supplier_sku_id,
      minimum_quantity, purchase_unit_id, base_unit_id, base_unit_conversion,
      unit_price, tax_rate, tax_inclusive, acting_tenant_id,
      acting_employee_id, proxy_reason, created_by_employee_id,
      updated_by_employee_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoisePriceItem}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSupplier}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoisePriceList}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSku}::uuid, 1,
      ${SUPPLIER_PAYMENT_BASE_IDS.unit}::uuid,
      ${SUPPLIER_PAYMENT_BASE_IDS.unit}::uuid, 1, 10, 0.13, true,
      ${fixture.tenant_id}::uuid, ${fixture.employee_id}::uuid,
      '回滚 EXPLAIN 基数', ${fixture.employee_id}::uuid,
      ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    update public.supplier_price_lists
    set lifecycle_status = 'published', published_at = now(),
        row_version = row_version + 1
    where id = ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoisePriceList}::uuid;
  `;
  await sql`
    insert into public.supplier_purchase_orders (
      id, tenant_id, project_id, tenant_supplier_id, supplier_id, order_no,
      status, currency, priced_at, subtotal_amount, tax_amount, total_amount,
      version, created_by_employee_id, updated_by_employee_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrder}::uuid,
      ${fixture.tenant_id}::uuid, ${fixture.project_id}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseRelationship}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSupplier}::uuid,
      'SMOKE-EXPLAIN-NOISE-ORDER', 'draft', 'CNY', now(), 10, 1.3, 11.3,
      1, ${fixture.employee_id}::uuid, ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    insert into public.supplier_purchase_order_items (
      id, tenant_id, supplier_id, supplier_purchase_order_id, line_no,
      supplier_product_id, supplier_sku_id, supplier_price_list_id,
      supplier_price_list_item_id, product_code_snapshot,
      product_name_snapshot, sku_code_snapshot, sku_name_snapshot,
      purchase_unit_id, purchase_unit_code_snapshot,
      purchase_unit_name_snapshot, purchase_unit_symbol_snapshot,
      base_unit_id, base_unit_code_snapshot, base_unit_name_snapshot,
      base_unit_symbol_snapshot, base_unit_conversion,
      price_list_code_snapshot, price_list_version_snapshot,
      price_effective_from_snapshot, quantity, unit_price, tax_rate,
      tax_inclusive, subtotal_amount, tax_amount, total_amount,
      cost_category_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrderItem}::uuid,
      ${fixture.tenant_id}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSupplier}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrder}::uuid, 1,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseProduct}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSku}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoisePriceList}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoisePriceItem}::uuid,
      'SMOKE-EXPLAIN-PRODUCT', 'EXPLAIN 噪声商品',
      'SMOKE-EXPLAIN-SKU', 'EXPLAIN 噪声 SKU',
      ${SUPPLIER_PAYMENT_BASE_IDS.unit}::uuid, 'SMOKE-PO-PCS', '件', '件',
      ${SUPPLIER_PAYMENT_BASE_IDS.unit}::uuid, 'SMOKE-PO-PCS', '件', '件',
      1, 'SMOKE-EXPLAIN-PRICE', 1, now() - interval '1 day',
      1, 10, 0.13, true, 10, 1.3, 11.3,
      ${fixture.cost_category_id}::uuid
    );
  `;
  await sql`
    select set_config(
      'private.supplier_purchase_fulfillment_command', 'confirm', true
    );
  `;
  await sql`
    insert into public.supplier_purchase_order_fulfillments (
      id, tenant_id, supplier_purchase_order_id, status, ordered_quantity,
      shipped_quantity, received_quantity, accepted_quantity,
      rejected_quantity, accepted_subtotal_amount, accepted_tax_amount,
      accepted_total_amount, confirmed_at, confirmed_by_user_id,
      confirmed_by_employee_id, version, updated_by_employee_id
    ) values (
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseFulfillment}::uuid,
      ${fixture.tenant_id}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrder}::uuid,
      'received', 1, 1, 1, 1, 0, 10, 1.3, 11.3, now(),
      ${fixture.user_id}::uuid, ${fixture.employee_id}::uuid, 1,
      ${fixture.employee_id}::uuid
    );
  `;
  await sql`
    select set_config(
      'private.supplier_purchase_fulfillment_command', 'receipt', true
    );
  `;
  await sql`
    insert into public.supplier_purchase_order_receipts (
      id, tenant_id, supplier_purchase_order_id,
      supplier_purchase_order_fulfillment_id, receipt_no, received_at,
      remark, created_by_user_id, received_by_employee_id
    )
    select
      md5('supplier-payment-explain-noise-receipt-' || generated.no)::uuid,
      ${fixture.tenant_id}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrder}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseFulfillment}::uuid,
      'SMOKE-EXPLAIN-NOISE-' || lpad(generated.no::text, 8, '0'),
      '2026-07-31T03:00:00.000Z'::timestamptz +
        generated.no * interval '1 second',
      '回滚 EXPLAIN 多供应商基数', ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid
    from generate_series(1, 5000) as generated(no);
  `;
  await sql`
    insert into public.supplier_purchase_order_receipt_items (
      id, tenant_id, supplier_purchase_order_id,
      supplier_purchase_order_fulfillment_id, receipt_id,
      supplier_purchase_order_item_id, accepted_quantity,
      rejected_quantity, variance_reason
    )
    select
      md5('supplier-payment-explain-noise-item-' || generated.no)::uuid,
      ${fixture.tenant_id}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrder}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseFulfillment}::uuid,
      md5('supplier-payment-explain-noise-receipt-' || generated.no)::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrderItem}::uuid,
      0.0001, 0, null
    from generate_series(1, 5000) as generated(no);
  `;
  await sql`
    insert into public.supplier_payable_events (
      tenant_id, project_id, cost_category_id, tenant_supplier_id,
      supplier_id, supplier_purchase_order_id,
      supplier_purchase_order_item_id, supplier_purchase_order_receipt_id,
      supplier_purchase_order_receipt_item_id, source_type, source_id,
      accepted_quantity, amount, occurred_at, due_at,
      invoice_required_before_payment, created_by_employee_id
    )
    select
      ${fixture.tenant_id}::uuid, ${fixture.project_id}::uuid,
      ${fixture.cost_category_id}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseRelationship}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseSupplier}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrder}::uuid,
      ${SUPPLIER_PAYMENT_SMOKE_IDS.explainNoiseOrderItem}::uuid,
      md5('supplier-payment-explain-noise-receipt-' || generated.no)::uuid,
      md5('supplier-payment-explain-noise-item-' || generated.no)::uuid,
      'supplier_purchase_receipt_item',
      md5('supplier-payment-explain-noise-item-' || generated.no)::uuid,
      0.0001, 0.01,
      '2026-07-31T03:00:00.000Z'::timestamptz +
        generated.no * interval '1 second',
      '2026-08-30T03:00:00.000Z'::timestamptz +
        generated.no * interval '1 second',
      false, ${fixture.employee_id}::uuid
    from generate_series(1, 5000) as generated(no);
  `;
}
