-- The local runner loads this BEFORE the H5 migration, inside its rollback-only
-- transaction, so history preservation is verified against actual pre-change rows.
CREATE TEMP TABLE h5_customer_lead_history_snapshot (
  id uuid PRIMARY KEY,
  payload jsonb NOT NULL
) ON COMMIT DROP;

DO $historical_fixture$
DECLARE
  t uuid := gen_random_uuid(); employee uuid := gen_random_uuid();
  customer uuid := gen_random_uuid(); page uuid := gen_random_uuid(); pv uuid := gen_random_uuid();
BEGIN
  ASSERT current_setting('customer_lead_smoke.local_endpoint', true) = '127.0.0.1:54322';
  ASSERT to_regprocedure('public.h5_customer_lead_guard()') IS NULL,
    'Historical fixture must run before the new migration';
  INSERT INTO public.tenants(id, name, slug)
    VALUES (t, 'Historical H5 SQL smoke', 'h5-history-' || t);
  INSERT INTO public.employees(id, tenant_id, name, status)
    VALUES (employee, t, '历史负责人', 'active');
  INSERT INTO public.customers(id, tenant_id, name, phone, status, source, owner_id)
    VALUES (customer, t, '历史客户', '13900000910', 'designing', 'h5_campaign', employee);
  INSERT INTO public.marketing_pages(id, tenant_id, title, slug)
    VALUES (page, t, '历史活动', 'h5-history-' || t);
  INSERT INTO public.marketing_page_versions(id, tenant_id, page_id, version_no)
    VALUES (pv, t, page, 1);
  INSERT INTO public.marketing_leads(tenant_id, page_id, page_version_id, source,
    customer_id, name, phone, lead_status, followed_by, followed_at, follow_remark,
    assigned_employee_id, assigned_at, created_at)
  SELECT t, page, pv, 'h5', CASE WHEN status = 'converted' THEN customer END,
    '历史' || status, '13900000910', status,
    CASE WHEN status <> 'new' THEN employee END,
    CASE WHEN status <> 'new' THEN now() - interval '100 days' END,
    CASE WHEN status <> 'new' THEN '保留历史备注：' || status END,
    CASE WHEN status <> 'new' THEN employee END,
    CASE WHEN status <> 'new' THEN now() - interval '120 days' END,
    now() - interval '365 days'
  FROM unnest(ARRAY['new', 'contacted', 'converted', 'invalid']) AS fixture(status);
  INSERT INTO h5_customer_lead_history_snapshot(id, payload)
    SELECT lead.id, to_jsonb(lead) FROM public.marketing_leads AS lead WHERE tenant_id = t;
END;
$historical_fixture$;
