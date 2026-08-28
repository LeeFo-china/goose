\set ON_ERROR_STOP on

\if :{?tenant_id}
\else
  \echo '缺少 tenant_id'
  \quit 2
\endif

BEGIN;
CREATE TEMP TABLE tenant_transfer_exclusions (
  table_name text PRIMARY KEY,
  reason text NOT NULL
) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE tenant_transfer_indirect_allowlist (
  constraint_name text PRIMARY KEY
) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE tenant_transfer_active_users (
  user_id uuid PRIMARY KEY
) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE tenant_transfer_selected_rows (
  schema_name text NOT NULL,
  table_name text NOT NULL,
  primary_key jsonb NOT NULL,
  selection_reason text NOT NULL,
  PRIMARY KEY (schema_name, table_name, primary_key)
) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE tenant_transfer_excluded_rows (
  schema_name text NOT NULL,
  table_name text NOT NULL,
  primary_key jsonb NOT NULL,
  exclusion_reason text NOT NULL,
  PRIMARY KEY (schema_name, table_name, primary_key)
) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE tenant_transfer_payloads (
  schema_name text NOT NULL,
  table_name text NOT NULL,
  row_count bigint NOT NULL,
  primary_keys jsonb NOT NULL,
  payload_base64 text NOT NULL,
  column_list text NOT NULL,
  select_list text NOT NULL,
  PRIMARY KEY (schema_name, table_name)
) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE tenant_transfer_unique_indexes (
  schema_name text NOT NULL,
  table_name text NOT NULL,
  index_name text NOT NULL,
  key_expression text NOT NULL,
  non_null_predicate text NOT NULL,
  PRIMARY KEY (schema_name, table_name, index_name)
) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE tenant_transfer_script_parts (
  script_name text NOT NULL,
  ordinal bigint GENERATED ALWAYS AS IDENTITY,
  content text NOT NULL
) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE tenant_transfer_remap_rules (
  child_table text NOT NULL,
  child_column text NOT NULL,
  parent_table text NOT NULL,
  parent_code text NOT NULL,
  source_parent_id uuid NOT NULL,
  parent_scope text NULL,
  PRIMARY KEY (child_table, child_column, source_parent_id)
) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE tenant_transfer_null_rules (
  child_table text NOT NULL,
  child_column text NOT NULL,
  parent_schema text NOT NULL,
  parent_table text NOT NULL,
  PRIMARY KEY (child_table, child_column)
) ON COMMIT PRESERVE ROWS;
CREATE TEMP TABLE tenant_transfer_source_contract (
  source_migration_version text NOT NULL,
  schema_contract text NOT NULL
) ON COMMIT PRESERVE ROWS;
COMMIT;

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT set_config('tenant_transfer.tenant_id', :'tenant_id', true)
\g /dev/null

INSERT INTO tenant_transfer_exclusions (table_name, reason) VALUES
  ('customer_wechat_pay_smoke_notifications', '开发支付 smoke 通知'),
  ('customer_wechat_pay_smoke_orders', '开发支付 smoke 订单'),
  ('douyin_miniapp_authorization_intents', '环境授权状态'),
  ('douyin_miniapp_installations', '环境安装凭证'),
  ('notifications', '环境通知收件箱'),
  ('phone_identity_login_candidates', '一次性登录候选态'),
  ('platform_audit_logs', '平台级审计日志'),
  ('platform_lead_assign_logs', '平台线索分配日志'),
  ('platform_leads', '平台全局线索'),
  ('platform_revenue_events', '平台收入事件'),
  ('supplier_command_events', '可重建的供应商命令审计'),
  ('system_setting_change_logs', '可能包含历史配置值'),
  ('tenant_addon_orders', '环境商业订单'),
  ('tenant_addon_wechat_notifications', '环境支付通知'),
  ('tenant_billing_events', '环境计费事件'),
  ('tenant_billing_subscriptions', '环境订阅状态'),
  ('tenant_credit_accounts', '环境信用账户'),
  ('tenant_credit_ledger', '环境信用流水'),
  ('tenant_credit_orders', '环境充值订单'),
  ('tenant_credit_refund_requests', '环境退款状态'),
  ('tenant_credit_wechat_notifications', '环境支付通知'),
  ('tenant_devices', '环境设备令牌'),
  ('tenant_entitlements', '环境授权权益'),
  ('tenant_onboarding_applications', '环境入驻流程'),
  ('tenant_partner_bindings', '环境合作伙伴关系'),
  ('tenant_payment_configs', '支付密钥与商户配置'),
  ('tenant_pricing_rules', '环境商业定价'),
  ('tenant_service_acceptance_preparations', '平台服务履约状态'),
  ('tenant_service_contracts', '平台服务合同'),
  ('tenant_service_fulfillment_attachments', '平台服务履约附件'),
  ('tenant_service_fulfillment_records', '平台服务履约记录'),
  ('tenant_service_orders', '平台服务订单'),
  ('tenant_service_refund_requests', '平台服务退款'),
  ('tenant_service_trial_commands', '平台服务试用命令'),
  ('tenant_service_trials', '平台服务试用状态'),
  ('tenant_service_wechat_notifications', '平台服务通知'),
  ('tenant_service_work_order_events', '平台服务工单事件'),
  ('tenant_service_work_orders', '平台服务工单'),
  ('tenant_subscription_invoices', '环境订阅发票'),
  ('tenant_usage_daily', '环境用量统计'),
  ('tenant_virtual_addon_orders', '环境虚拟商品订单'),
  ('tenant_virtual_addon_refunds', '环境虚拟商品退款'),
  ('tenant_wechat_pay_applyment_events', '环境进件事件'),
  ('tenant_wechat_pay_applyment_media', '环境进件材料'),
  ('tenant_wechat_pay_applyments', '环境微信支付进件'),
  ('user_location_contexts', '短期定位上下文'),
  ('wechat_payment_notifications', '环境支付通知'),
  ('wechat_payment_orders', '环境支付订单'),
  ('wechat_mini_session_credentials', '小程序会话密钥'),
  ('wechat_rebind_requests', '一次性身份换绑请求');

INSERT INTO tenant_transfer_indirect_allowlist (constraint_name) VALUES
  ('customer_appointment_reward_campaigns_customer_id_fkey'),
  ('customer_follow_up_comments_follow_up_id_fkey'),
  ('customer_follow_ups_customer_id_fkey'),
  ('customer_log_share_assists_campaign_id_fkey'),
  ('customer_log_share_campaigns_customer_id_fkey'),
  ('customer_log_share_opens_campaign_id_fkey'),
  ('customer_phone_access_logs_customer_id_fkey'),
  ('customer_project_log_shares_customer_id_fkey'),
  ('douyin_budget_pricing_items_pricing_version_id_fkey'),
  ('employee_permission_overrides_employee_id_fkey'),
  ('employee_roles_employee_id_fkey'),
  ('payments_project_id_fkey'),
  ('picture_asset_comment_images_file_object_id_fkey'),
  ('picture_asset_variants_file_object_id_fkey'),
  ('project_members_project_id_fkey'),
  ('project_referrals_project_id_fkey'),
  ('project_share_campaign_configs_project_id_fkey'),
  ('role_permissions_role_id_fkey'),
  ('supplier_addresses_supplier_id_fkey'),
  ('supplier_contacts_supplier_id_fkey'),
  ('supplier_qualifications_supplier_id_fkey'),
  ('supplier_service_regions_supplier_id_fkey'),
  ('supplier_sku_unit_conversions_supplier_sku_id_fkey'),
  ('visitor_project_follows_project_id_fkey');

INSERT INTO tenant_transfer_active_users (user_id)
SELECT DISTINCT membership.user_id
FROM public.user_business_memberships AS membership
WHERE membership.tenant_id = :'tenant_id'::uuid
  AND membership.status = 'active';

INSERT INTO tenant_transfer_selected_rows VALUES
  ('public', 'tenants', jsonb_build_object('id', :'tenant_id'::uuid), 'approved_tenant');

DO $direct_scope$
DECLARE
  target record;
  pk_expression text;
  tenant_predicate text;
  extra_predicate text;
  matching_rows bigint;
BEGIN
  FOR target IN
    WITH tenant_edges AS (
      SELECT
        child_ns.nspname AS schema_name,
        child.relname AS table_name,
        child_att.attname AS tenant_column
      FROM pg_constraint AS fk_constraint
      JOIN pg_class AS child ON child.oid = fk_constraint.conrelid
      JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_class AS parent ON parent.oid = fk_constraint.confrelid
      JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
      JOIN LATERAL unnest(fk_constraint.conkey) WITH ORDINALITY AS child_key(attnum, ord) ON true
      JOIN pg_attribute AS child_att
        ON child_att.attrelid = child.oid
       AND child_att.attnum = child_key.attnum
      WHERE fk_constraint.contype = 'f'
        AND parent_ns.nspname = 'public'
        AND parent.relname = 'tenants'
        AND child_ns.nspname = 'public'
    )
    SELECT schema_name, table_name, array_agg(tenant_column ORDER BY tenant_column) AS tenant_columns
    FROM tenant_edges
    WHERE table_name NOT IN (SELECT exclusion.table_name FROM tenant_transfer_exclusions AS exclusion)
    GROUP BY schema_name, table_name
    ORDER BY schema_name, table_name
  LOOP
    SELECT
      'jsonb_build_object(' ||
      string_agg(format('%L, to_jsonb(row.%I)', attribute.attname, attribute.attname), ', ' ORDER BY key_column.ord) ||
      ')'
    INTO pk_expression
    FROM pg_constraint AS primary_key
    JOIN pg_class AS relation ON relation.oid = primary_key.conrelid
    JOIN pg_namespace AS relation_ns ON relation_ns.oid = relation.relnamespace
    JOIN LATERAL unnest(primary_key.conkey) WITH ORDINALITY AS key_column(attnum, ord) ON true
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attnum = key_column.attnum
    WHERE primary_key.contype = 'p'
      AND relation_ns.nspname = target.schema_name
      AND relation.relname = target.table_name;

    SELECT string_agg(
      format('row.%I = %L::uuid', tenant_column, current_setting('tenant_transfer.tenant_id')),
      ' OR '
    )
    INTO tenant_predicate
    FROM unnest(target.tenant_columns) AS tenant_column;

    extra_predicate := CASE target.table_name
      WHEN 'user_business_memberships' THEN ' AND row.status = ''active'''
      WHEN 'platform_file_objects' THEN ' AND row.bucket <> ''dev-fixture-placeholder'''
      WHEN 'marketing_campaigns' THEN
        ' AND row.id NOT IN (
          ''f1700000-0000-4000-8000-000000000001''::uuid,
          ''f1700000-0000-4000-8000-000000000002''::uuid
        )'
      WHEN 'customer_log_share_campaigns' THEN
        ' AND row.id NOT IN (
          ''f1700000-0000-4000-8000-000000000011''::uuid,
          ''f1700000-0000-4000-8000-000000000012''::uuid,
          ''f1700000-0000-4000-8000-000000000013''::uuid,
          ''f1700000-0000-4000-8000-000000000014''::uuid,
          ''f1700000-0000-4000-8000-000000000015''::uuid,
          ''f1700000-0000-4000-8000-000000000016''::uuid
        )'
      WHEN 'customer_appointment_reward_campaigns' THEN
        ' AND row.id <> ''f1700000-0000-4000-8000-000000000021''::uuid'
      WHEN 'supplier_products' THEN
        ' AND row.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid'
      WHEN 'supplier_skus' THEN
        ' AND row.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid'
      WHEN 'supplier_price_lists' THEN
        ' AND EXISTS (
          SELECT 1 FROM public.suppliers AS supplier
          WHERE supplier.id = row.supplier_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'supplier_price_list_items' THEN
        ' AND EXISTS (
          SELECT 1
          FROM public.supplier_price_lists AS price_list
          JOIN public.suppliers AS supplier ON supplier.id = price_list.supplier_id
          WHERE price_list.id = row.supplier_price_list_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'tenant_suppliers' THEN
        ' AND EXISTS (
          SELECT 1 FROM public.suppliers AS supplier
          WHERE supplier.id = row.supplier_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'tenant_supplier_code_registry' THEN
        ' AND (row.tenant_supplier_id IS NULL OR EXISTS (
          SELECT 1
          FROM public.tenant_suppliers AS tenant_supplier
          JOIN public.suppliers AS supplier ON supplier.id = tenant_supplier.supplier_id
          WHERE tenant_supplier.id = row.tenant_supplier_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        ))'
      WHEN 'supplier_purchase_orders' THEN
        ' AND EXISTS (
          SELECT 1 FROM public.suppliers AS supplier
          WHERE supplier.id = row.supplier_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'supplier_purchase_order_items' THEN
        ' AND EXISTS (
          SELECT 1
          FROM public.supplier_purchase_orders AS purchase_order
          JOIN public.suppliers AS supplier ON supplier.id = purchase_order.supplier_id
          WHERE purchase_order.id = row.supplier_purchase_order_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'supplier_purchase_order_fulfillments' THEN
        ' AND EXISTS (
          SELECT 1
          FROM public.supplier_purchase_orders AS purchase_order
          JOIN public.suppliers AS supplier ON supplier.id = purchase_order.supplier_id
          WHERE purchase_order.id = row.supplier_purchase_order_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'supplier_purchase_order_item_fulfillments' THEN
        ' AND EXISTS (
          SELECT 1
          FROM public.supplier_purchase_orders AS purchase_order
          JOIN public.suppliers AS supplier ON supplier.id = purchase_order.supplier_id
          WHERE purchase_order.id = row.supplier_purchase_order_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'supplier_purchase_order_receipts' THEN
        ' AND EXISTS (
          SELECT 1
          FROM public.supplier_purchase_orders AS purchase_order
          JOIN public.suppliers AS supplier ON supplier.id = purchase_order.supplier_id
          WHERE purchase_order.id = row.supplier_purchase_order_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'supplier_purchase_order_receipt_items' THEN
        ' AND EXISTS (
          SELECT 1
          FROM public.supplier_purchase_orders AS purchase_order
          JOIN public.suppliers AS supplier ON supplier.id = purchase_order.supplier_id
          WHERE purchase_order.id = row.supplier_purchase_order_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'supplier_purchase_order_shipments' THEN
        ' AND EXISTS (
          SELECT 1
          FROM public.supplier_purchase_orders AS purchase_order
          JOIN public.suppliers AS supplier ON supplier.id = purchase_order.supplier_id
          WHERE purchase_order.id = row.supplier_purchase_order_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'supplier_purchase_order_shipment_items' THEN
        ' AND EXISTS (
          SELECT 1
          FROM public.supplier_purchase_orders AS purchase_order
          JOIN public.suppliers AS supplier ON supplier.id = purchase_order.supplier_id
          WHERE purchase_order.id = row.supplier_purchase_order_id
            AND supplier.ownership_scope = ''tenant''
            AND supplier.owner_tenant_id = current_setting(''tenant_transfer.tenant_id'')::uuid
        )'
      WHEN 'system_settings' THEN
        ' AND row.key IN (''CUSTOMER_SERVICE_ENABLED'', ''CUSTOMER_SERVICE_PHONE'', ''CUSTOMER_SERVICE_WORKING_HOURS'')'
      ELSE ''
    END;

    IF pk_expression IS NULL THEN
      EXECUTE format(
        'SELECT count(*) FROM %I.%I AS row WHERE (%s)%s',
        target.schema_name,
        target.table_name,
        tenant_predicate,
        extra_predicate
      ) INTO matching_rows;
      IF matching_rows > 0 THEN
        RAISE EXCEPTION '迁移表 %.% 有 % 行但没有主键', target.schema_name, target.table_name, matching_rows;
      END IF;
      CONTINUE;
    END IF;

    EXECUTE format(
      'INSERT INTO tenant_transfer_selected_rows (schema_name, table_name, primary_key, selection_reason)
       SELECT %L, %L, %s, %L
       FROM %I.%I AS row
       WHERE (%s)%s
       ON CONFLICT DO NOTHING',
      target.schema_name,
      target.table_name,
      pk_expression,
      'direct_tenant_fk',
      target.schema_name,
      target.table_name,
      tenant_predicate,
      extra_predicate
    );
  END LOOP;
END
$direct_scope$;

INSERT INTO tenant_transfer_selected_rows (schema_name, table_name, primary_key, selection_reason)
SELECT
  'public',
  'douyin_miniapp_installations',
  jsonb_build_object('id', installation.id),
  'sanitized_douyin_installation'
FROM public.douyin_miniapp_installations AS installation
WHERE installation.tenant_id = :'tenant_id'::uuid
ON CONFLICT DO NOTHING;

INSERT INTO tenant_transfer_selected_rows (schema_name, table_name, primary_key, selection_reason)
SELECT
  'public',
  'sms_verification_codes',
  jsonb_build_object('id', verification_code.id),
  'sanitized_sms_verification_code'
FROM public.sms_verification_codes AS verification_code
WHERE verification_code.id IN (
  SELECT appointment.sms_verification_code_id
  FROM public.douyin_measurement_appointments AS appointment
  WHERE appointment.tenant_id = :'tenant_id'::uuid
)
ON CONFLICT DO NOTHING;

INSERT INTO tenant_transfer_selected_rows (schema_name, table_name, primary_key, selection_reason)
SELECT 'auth', 'users', jsonb_build_object('id', auth_user.id), 'active_business_identity'
FROM auth.users AS auth_user
JOIN tenant_transfer_active_users AS active_user ON active_user.user_id = auth_user.id
ON CONFLICT DO NOTHING;

INSERT INTO tenant_transfer_selected_rows (schema_name, table_name, primary_key, selection_reason)
SELECT 'auth', 'identities', jsonb_build_object('id', identity.id), 'active_user_auth_identity'
FROM auth.identities AS identity
JOIN tenant_transfer_active_users AS active_user ON active_user.user_id = identity.user_id
ON CONFLICT DO NOTHING;

INSERT INTO tenant_transfer_selected_rows (schema_name, table_name, primary_key, selection_reason)
SELECT 'public', 'user_profiles', jsonb_build_object('auth_user_id', profile.auth_user_id), 'active_user_profile'
FROM public.user_profiles AS profile
JOIN tenant_transfer_active_users AS active_user ON active_user.user_id = profile.auth_user_id
ON CONFLICT DO NOTHING;

INSERT INTO tenant_transfer_selected_rows (schema_name, table_name, primary_key, selection_reason)
SELECT 'public', 'user_oauth_identities', jsonb_build_object('id', oauth.id), 'active_oauth_identity'
FROM public.user_oauth_identities AS oauth
JOIN tenant_transfer_active_users AS active_user ON active_user.user_id = oauth.user_id
WHERE oauth.status = 'active'
ON CONFLICT DO NOTHING;

DO $indirect_scope$
DECLARE
  edge record;
  child_pk_expression text;
  parent_pk_expression text;
  join_expression text;
  inserted_rows bigint;
  iteration_inserted bigint;
  iteration integer := 0;
  child_extra_predicate text;
BEGIN
  LOOP
    iteration := iteration + 1;
    iteration_inserted := 0;

    FOR edge IN
      SELECT
        fk_constraint.oid,
        fk_constraint.conname,
        child_ns.nspname AS child_schema,
        child.relname AS child_table,
        parent_ns.nspname AS parent_schema,
        parent.relname AS parent_table
      FROM pg_constraint AS fk_constraint
      JOIN pg_class AS child ON child.oid = fk_constraint.conrelid
      JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_class AS parent ON parent.oid = fk_constraint.confrelid
      JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
      JOIN tenant_transfer_indirect_allowlist AS allowed
        ON allowed.constraint_name = fk_constraint.conname
      WHERE fk_constraint.contype = 'f'
        AND child_ns.nspname = 'public'
        AND parent_ns.nspname IN ('public', 'auth')
        AND EXISTS (
          SELECT 1
          FROM tenant_transfer_selected_rows AS selected
          WHERE selected.schema_name = parent_ns.nspname
            AND selected.table_name = parent.relname
        )
      ORDER BY child.relname, fk_constraint.conname
    LOOP
      SELECT
        'jsonb_build_object(' ||
        string_agg(format('%L, to_jsonb(child.%I)', attribute.attname, attribute.attname), ', ' ORDER BY key_column.ord) ||
        ')'
      INTO child_pk_expression
      FROM pg_constraint AS primary_key
      JOIN LATERAL unnest(primary_key.conkey) WITH ORDINALITY AS key_column(attnum, ord) ON true
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = primary_key.conrelid
       AND attribute.attnum = key_column.attnum
      WHERE primary_key.contype = 'p'
        AND primary_key.conrelid = format('%I.%I', edge.child_schema, edge.child_table)::regclass;

      SELECT
        'jsonb_build_object(' ||
        string_agg(format('%L, to_jsonb(parent.%I)', attribute.attname, attribute.attname), ', ' ORDER BY key_column.ord) ||
        ')'
      INTO parent_pk_expression
      FROM pg_constraint AS primary_key
      JOIN LATERAL unnest(primary_key.conkey) WITH ORDINALITY AS key_column(attnum, ord) ON true
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = primary_key.conrelid
       AND attribute.attnum = key_column.attnum
      WHERE primary_key.contype = 'p'
        AND primary_key.conrelid = format('%I.%I', edge.parent_schema, edge.parent_table)::regclass;

      SELECT string_agg(
        format('child.%I IS NOT DISTINCT FROM parent.%I', child_attribute.attname, parent_attribute.attname),
        ' AND ' ORDER BY key_pair.ord
      )
      INTO join_expression
      FROM pg_constraint AS foreign_key
      JOIN LATERAL unnest(foreign_key.conkey, foreign_key.confkey)
        WITH ORDINALITY AS key_pair(child_attnum, parent_attnum, ord) ON true
      JOIN pg_attribute AS child_attribute
        ON child_attribute.attrelid = foreign_key.conrelid
       AND child_attribute.attnum = key_pair.child_attnum
      JOIN pg_attribute AS parent_attribute
        ON parent_attribute.attrelid = foreign_key.confrelid
       AND parent_attribute.attnum = key_pair.parent_attnum
      WHERE foreign_key.oid = edge.oid;

      IF child_pk_expression IS NULL OR parent_pk_expression IS NULL THEN
        RAISE EXCEPTION '间接迁移路径缺少主键: %.% -> %.%',
          edge.child_schema, edge.child_table, edge.parent_schema, edge.parent_table;
      END IF;

      child_extra_predicate := CASE
        WHEN edge.child_table = 'customer_log_share_campaigns' THEN
          ' WHERE child.id NOT IN (
            ''f1700000-0000-4000-8000-000000000011''::uuid,
            ''f1700000-0000-4000-8000-000000000012''::uuid,
            ''f1700000-0000-4000-8000-000000000013''::uuid,
            ''f1700000-0000-4000-8000-000000000014''::uuid,
            ''f1700000-0000-4000-8000-000000000015''::uuid,
            ''f1700000-0000-4000-8000-000000000016''::uuid
          )'
        WHEN edge.child_table = 'customer_appointment_reward_campaigns' THEN
          ' WHERE child.id <> ''f1700000-0000-4000-8000-000000000021''::uuid'
        WHEN edge.child_table IN ('role_permissions', 'employee_permission_overrides') THEN
          ' WHERE EXISTS (
            SELECT 1
            FROM public.permissions AS permission
            WHERE permission.id = child.permission_id
              AND permission.code NOT LIKE ''platform.%''
              AND permission.code NOT IN (''system.release.read'', ''system.release.run'')
          )'
        ELSE ''
      END;

      EXECUTE format(
        'INSERT INTO tenant_transfer_selected_rows (schema_name, table_name, primary_key, selection_reason)
         SELECT %L, %L, %s, %L
         FROM %I.%I AS child
         JOIN %I.%I AS parent ON %s
         JOIN tenant_transfer_selected_rows AS selected_parent
           ON selected_parent.schema_name = %L
          AND selected_parent.table_name = %L
          AND selected_parent.primary_key = %s
         %s
         ON CONFLICT DO NOTHING',
        edge.child_schema,
        edge.child_table,
        child_pk_expression,
        'indirect_fk:' || edge.conname,
        edge.child_schema,
        edge.child_table,
        edge.parent_schema,
        edge.parent_table,
        join_expression,
        edge.parent_schema,
        edge.parent_table,
        parent_pk_expression,
        child_extra_predicate
      );
      GET DIAGNOSTICS inserted_rows = ROW_COUNT;
      iteration_inserted := iteration_inserted + inserted_rows;
    END LOOP;

    EXIT WHEN iteration_inserted = 0;
    IF iteration >= 20 THEN
      RAISE EXCEPTION '间接迁移范围在 20 轮后仍未收敛';
    END IF;
  END LOOP;
END
$indirect_scope$;

INSERT INTO tenant_transfer_excluded_rows (schema_name, table_name, primary_key, exclusion_reason)
SELECT selected.schema_name, selected.table_name, selected.primary_key, 'known_finance_smoke_project'
FROM tenant_transfer_selected_rows AS selected
WHERE selected.schema_name = 'public'
  AND selected.table_name = 'projects'
  AND selected.primary_key = jsonb_build_object(
    'id',
    '00000000-0000-4000-8000-202606160006'::uuid
  )
ON CONFLICT DO NOTHING;

INSERT INTO tenant_transfer_excluded_rows (schema_name, table_name, primary_key, exclusion_reason)
SELECT selected.schema_name, selected.table_name, selected.primary_key, 'known_finance_smoke_workflow'
FROM tenant_transfer_selected_rows AS selected
JOIN public.workflow_instances AS workflow
  ON selected.schema_name = 'public'
 AND selected.table_name = 'workflow_instances'
 AND selected.primary_key = jsonb_build_object('id', workflow.id)
WHERE workflow.subject_id = '00000000-0000-4000-8000-202606160006'
ON CONFLICT DO NOTHING;

INSERT INTO tenant_transfer_excluded_rows (schema_name, table_name, primary_key, exclusion_reason)
SELECT selected.schema_name, selected.table_name, selected.primary_key, 'known_finance_smoke_workflow_state'
FROM tenant_transfer_selected_rows AS selected
JOIN public.workflow_subject_states AS workflow_state
  ON selected.schema_name = 'public'
 AND selected.table_name = 'workflow_subject_states'
 AND selected.primary_key = jsonb_build_object('id', workflow_state.id)
WHERE workflow_state.subject_id = '00000000-0000-4000-8000-202606160006'
ON CONFLICT DO NOTHING;

DO $exclude_fk_descendants$
DECLARE
  edge record;
  child_pk_expression text;
  parent_pk_expression text;
  join_expression text;
  iteration_inserted bigint;
  inserted_rows bigint;
  iteration integer := 0;
BEGIN
  LOOP
    iteration := iteration + 1;
    iteration_inserted := 0;

    FOR edge IN
      SELECT
        fk_constraint.oid,
        fk_constraint.conname,
        child_ns.nspname AS child_schema,
        child.relname AS child_table,
        parent_ns.nspname AS parent_schema,
        parent.relname AS parent_table
      FROM pg_constraint AS fk_constraint
      JOIN pg_class AS child ON child.oid = fk_constraint.conrelid
      JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
      JOIN pg_class AS parent ON parent.oid = fk_constraint.confrelid
      JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
      WHERE fk_constraint.contype = 'f'
        AND child_ns.nspname IN ('public', 'auth')
        AND parent_ns.nspname IN ('public', 'auth')
        AND EXISTS (
          SELECT 1
          FROM tenant_transfer_excluded_rows AS excluded_parent
          WHERE excluded_parent.schema_name = parent_ns.nspname
            AND excluded_parent.table_name = parent.relname
        )
      ORDER BY child_ns.nspname, child.relname, fk_constraint.conname
    LOOP
      SELECT
        'jsonb_build_object(' ||
        string_agg(format('%L, to_jsonb(child.%I)', attribute.attname, attribute.attname), ', ' ORDER BY key_column.ord) ||
        ')'
      INTO child_pk_expression
      FROM pg_constraint AS primary_key
      JOIN LATERAL unnest(primary_key.conkey) WITH ORDINALITY AS key_column(attnum, ord) ON true
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = primary_key.conrelid
       AND attribute.attnum = key_column.attnum
      WHERE primary_key.contype = 'p'
        AND primary_key.conrelid = format('%I.%I', edge.child_schema, edge.child_table)::regclass;

      SELECT
        'jsonb_build_object(' ||
        string_agg(format('%L, to_jsonb(parent.%I)', attribute.attname, attribute.attname), ', ' ORDER BY key_column.ord) ||
        ')'
      INTO parent_pk_expression
      FROM pg_constraint AS primary_key
      JOIN LATERAL unnest(primary_key.conkey) WITH ORDINALITY AS key_column(attnum, ord) ON true
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = primary_key.conrelid
       AND attribute.attnum = key_column.attnum
      WHERE primary_key.contype = 'p'
        AND primary_key.conrelid = format('%I.%I', edge.parent_schema, edge.parent_table)::regclass;

      SELECT string_agg(
        format('child.%I IS NOT DISTINCT FROM parent.%I', child_attribute.attname, parent_attribute.attname),
        ' AND ' ORDER BY key_pair.ord
      )
      INTO join_expression
      FROM pg_constraint AS foreign_key
      JOIN LATERAL unnest(foreign_key.conkey, foreign_key.confkey)
        WITH ORDINALITY AS key_pair(child_attnum, parent_attnum, ord) ON true
      JOIN pg_attribute AS child_attribute
        ON child_attribute.attrelid = foreign_key.conrelid
       AND child_attribute.attnum = key_pair.child_attnum
      JOIN pg_attribute AS parent_attribute
        ON parent_attribute.attrelid = foreign_key.confrelid
       AND parent_attribute.attnum = key_pair.parent_attnum
      WHERE foreign_key.oid = edge.oid;

      IF child_pk_expression IS NULL OR parent_pk_expression IS NULL THEN
        RAISE EXCEPTION 'fixture 排除路径缺少主键: %.% -> %.%',
          edge.child_schema, edge.child_table, edge.parent_schema, edge.parent_table;
      END IF;

      EXECUTE format(
        'INSERT INTO tenant_transfer_excluded_rows (schema_name, table_name, primary_key, exclusion_reason)
         SELECT %L, %L, %s, %L
         FROM %I.%I AS child
         JOIN %I.%I AS parent ON %s
         JOIN tenant_transfer_excluded_rows AS excluded_parent
           ON excluded_parent.schema_name = %L
          AND excluded_parent.table_name = %L
          AND excluded_parent.primary_key = %s
         JOIN tenant_transfer_selected_rows AS selected_child
           ON selected_child.schema_name = %L
          AND selected_child.table_name = %L
          AND selected_child.primary_key = %s
         ON CONFLICT DO NOTHING',
        edge.child_schema,
        edge.child_table,
        child_pk_expression,
        'fk_descendant:' || edge.conname,
        edge.child_schema,
        edge.child_table,
        edge.parent_schema,
        edge.parent_table,
        join_expression,
        edge.parent_schema,
        edge.parent_table,
        parent_pk_expression,
        edge.child_schema,
        edge.child_table,
        child_pk_expression
      );
      GET DIAGNOSTICS inserted_rows = ROW_COUNT;
      iteration_inserted := iteration_inserted + inserted_rows;
    END LOOP;

    EXIT WHEN iteration_inserted = 0;
    IF iteration >= 20 THEN
      RAISE EXCEPTION 'fixture FK 排除闭包在 20 轮后仍未收敛';
    END IF;
  END LOOP;

  DELETE FROM tenant_transfer_selected_rows AS selected
  USING tenant_transfer_excluded_rows AS excluded
  WHERE excluded.schema_name = selected.schema_name
    AND excluded.table_name = selected.table_name
    AND excluded.primary_key = selected.primary_key;
END
$exclude_fk_descendants$;

DO $collect_remap_rules$
DECLARE
  mapping record;
BEGIN
  FOR mapping IN
    SELECT *
    FROM (VALUES
      ('employee_permission_overrides', 'permission_id', 'permissions', NULL::text),
      ('role_permissions', 'permission_id', 'permissions', NULL::text),
      ('tenant_departments', 'template_id', 'department_templates', NULL::text),
      ('supplier_price_list_items', 'base_unit_id', 'catalog_units', NULL::text),
      ('supplier_price_list_items', 'purchase_unit_id', 'catalog_units', NULL::text),
      ('supplier_price_list_items', 'supplier_id', 'suppliers', 'platform'),
      ('supplier_price_lists', 'supplier_id', 'suppliers', 'platform'),
      ('supplier_products', 'brand_id', 'catalog_brands', 'platform'),
      ('supplier_products', 'category_id', 'catalog_categories', 'platform'),
      ('supplier_products', 'supplier_id', 'suppliers', 'platform'),
      ('supplier_purchase_order_items', 'base_unit_id', 'catalog_units', NULL::text),
      ('supplier_purchase_order_items', 'purchase_unit_id', 'catalog_units', NULL::text),
      ('supplier_purchase_order_items', 'supplier_id', 'suppliers', 'platform'),
      ('supplier_purchase_orders', 'supplier_id', 'suppliers', 'platform'),
      ('supplier_skus', 'base_unit_id', 'catalog_units', NULL::text),
      ('supplier_skus', 'purchase_unit_id', 'catalog_units', NULL::text),
      ('supplier_skus', 'supplier_id', 'suppliers', 'platform'),
      ('supplier_sku_unit_conversions', 'from_unit_id', 'catalog_units', NULL::text),
      ('supplier_sku_unit_conversions', 'to_unit_id', 'catalog_units', NULL::text),
      ('tenant_suppliers', 'supplier_id', 'suppliers', 'platform')
    ) AS configured(child_table, child_column, parent_table, parent_scope)
  LOOP
    EXECUTE format(
      'INSERT INTO tenant_transfer_remap_rules (
         child_table,
         child_column,
         parent_table,
         parent_code,
         source_parent_id,
         parent_scope
       )
       SELECT DISTINCT %L, %L, %L, parent.code, parent.id, %L
       FROM public.%I AS child
       JOIN tenant_transfer_selected_rows AS selected_child
         ON selected_child.schema_name = ''public''
        AND selected_child.table_name = %L
        AND to_jsonb(child) @> selected_child.primary_key
       JOIN public.%I AS parent ON parent.id = child.%I
       LEFT JOIN tenant_transfer_selected_rows AS selected_parent
         ON selected_parent.schema_name = ''public''
        AND selected_parent.table_name = %L
        AND selected_parent.primary_key = jsonb_build_object(''id'', parent.id)
       WHERE selected_parent.primary_key IS NULL
       ON CONFLICT DO NOTHING',
      mapping.child_table,
      mapping.child_column,
      mapping.parent_table,
      mapping.parent_scope,
      mapping.child_table,
      mapping.child_table,
      mapping.parent_table,
      mapping.child_column,
      mapping.parent_table
    );
  END LOOP;
END
$collect_remap_rules$;

INSERT INTO tenant_transfer_null_rules (
  child_table,
  child_column,
  parent_schema,
  parent_table
) VALUES
  ('customer_log_share_opens', 'visitor_auth_user_id', 'auth', 'users'),
  ('ocr_tenant_policies', 'updated_by_employee_id', 'public', 'employees'),
  ('platform_file_objects', 'created_by_auth_user_id', 'auth', 'users'),
  ('project_acceptance_items', 'section_id', 'public', 'project_acceptance_template_sections'),
  ('project_acceptance_items', 'template_item_id', 'public', 'project_acceptance_template_items'),
  ('project_acceptances', 'template_id', 'public', 'project_acceptance_templates'),
  ('tenant_template_applications', 'applied_by_employee_id', 'public', 'employees'),
  ('tenant_template_applications', 'template_id', 'public', 'tenant_templates');

DO $build_payloads$
DECLARE
  target record;
  pk_expression text;
  column_list text;
  select_list text;
  primary_keys jsonb;
  payload jsonb;
  row_json_expression text;
BEGIN
  FOR target IN
    SELECT selected.schema_name, selected.table_name, count(*) AS row_count
    FROM tenant_transfer_selected_rows AS selected
    GROUP BY selected.schema_name, selected.table_name
    ORDER BY selected.schema_name, selected.table_name
  LOOP
    SELECT
      'jsonb_build_object(' ||
      string_agg(format('%L, to_jsonb(row.%I)', attribute.attname, attribute.attname), ', ' ORDER BY key_column.ord) ||
      ')'
    INTO pk_expression
    FROM pg_constraint AS primary_key
    JOIN LATERAL unnest(primary_key.conkey) WITH ORDINALITY AS key_column(attnum, ord) ON true
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = primary_key.conrelid
     AND attribute.attnum = key_column.attnum
    WHERE primary_key.contype = 'p'
      AND primary_key.conrelid = format('%I.%I', target.schema_name, target.table_name)::regclass;

    SELECT
      string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum),
      string_agg(format('record.%I', attribute.attname), ', ' ORDER BY attribute.attnum)
    INTO column_list, select_list
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = format('%I.%I', target.schema_name, target.table_name)::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND attribute.attgenerated = '';

    SELECT jsonb_agg(selected.primary_key ORDER BY selected.primary_key::text)
    INTO primary_keys
    FROM tenant_transfer_selected_rows AS selected
    WHERE selected.schema_name = target.schema_name
      AND selected.table_name = target.table_name;

    row_json_expression := CASE
      WHEN target.schema_name = 'auth' AND target.table_name = 'users' THEN
        'to_jsonb(row) || jsonb_build_object(
          ''aud'', ''authenticated'',
          ''role'', ''authenticated'',
          ''invited_at'', NULL,
          ''confirmation_token'', '''',
          ''confirmation_sent_at'', NULL,
          ''recovery_token'', '''',
          ''recovery_sent_at'', NULL,
          ''email_change_token_new'', '''',
          ''email_change'', '''',
          ''email_change_sent_at'', NULL,
          ''last_sign_in_at'', NULL,
          ''raw_app_meta_data'', jsonb_strip_nulls(jsonb_build_object(
            ''provider'', row.raw_app_meta_data -> ''provider'',
            ''providers'', row.raw_app_meta_data -> ''providers''
          )),
          ''is_super_admin'', false,
          ''phone_change'', '''',
          ''phone_change_token'', '''',
          ''phone_change_sent_at'', NULL,
          ''email_change_token_current'', '''',
          ''email_change_confirm_status'', 0,
          ''banned_until'', NULL,
          ''reauthentication_token'', '''',
          ''reauthentication_sent_at'', NULL,
          ''is_sso_user'', false,
          ''deleted_at'', NULL,
          ''is_anonymous'', false
        )'
      WHEN target.table_name = 'douyin_miniapp_installations' THEN
        'to_jsonb(row) || jsonb_build_object(
          ''component_appid'', ''migrated-disabled'',
          ''authorizer_appid'', ''migrated-disabled-'' || row.id::text,
          ''deployment_key'', NULL,
          ''authorization_status'', ''revoked'',
          ''access_token_ciphertext'', NULL,
          ''access_token_iv'', NULL,
          ''access_token_tag'', NULL,
          ''access_token_key_version'', NULL,
          ''access_token_expires_at'', NULL,
          ''refresh_token_ciphertext'', NULL,
          ''refresh_token_iv'', NULL,
          ''refresh_token_tag'', NULL,
          ''refresh_token_key_version'', NULL,
          ''refresh_token_expires_at'', NULL,
          ''permission_snapshot'', ''[]''::jsonb,
          ''token_refresh_claim_token'', NULL,
          ''token_refresh_claim_expires_at'', NULL,
          ''token_refresh_last_error'', NULL,
          ''runtime_config'', row.runtime_config,
          ''template_id'', NULL,
          ''template_version'', NULL,
          ''template_release_id'', NULL,
          ''revoked_at'', coalesce(row.revoked_at, row.updated_at, row.created_at)
        )'
      WHEN target.table_name = 'sms_verification_codes' THEN
        'to_jsonb(row) || jsonb_build_object(
          ''code'', ''MIGRATED'',
          ''status'', ''expired'',
          ''request_ip'', NULL,
          ''request_device'', NULL
        )'
      WHEN target.table_name = 'ocr_recognitions' THEN
        'to_jsonb(row) || jsonb_build_object(
          ''status'', ''expired'',
          ''result_ciphertext'', NULL,
          ''result_summary'', ''{}''::jsonb,
          ''warnings'', ''[]''::jsonb,
          ''quality'', ''{}''::jsonb,
          ''provider_request_id'', NULL,
          ''provider_error_code'', NULL,
          ''provider_error_message_safe'', NULL,
          ''billable_units'', 0
        )'
      WHEN target.table_name = 'tenant_supplier_settings' THEN
        'to_jsonb(row) || jsonb_build_object(
          ''module_enabled'', false,
          ''enabled_by_employee_id'', NULL,
          ''enabled_at'', NULL,
          ''ownership_reads_enabled'', false,
          ''private_supplier_writes_enabled'', false,
          ''private_catalog_writes_enabled'', false,
          ''procurement_snapshot_v1_enabled'', false
        )'
      ELSE 'to_jsonb(row)'
    END;

    EXECUTE format(
      'SELECT coalesce(jsonb_agg(%s ORDER BY selected.primary_key::text), ''[]''::jsonb)
       FROM %I.%I AS row
       JOIN tenant_transfer_selected_rows AS selected
         ON selected.schema_name = %L
        AND selected.table_name = %L
        AND selected.primary_key = %s',
      row_json_expression,
      target.schema_name,
      target.table_name,
      target.schema_name,
      target.table_name,
      pk_expression
    ) INTO payload;

    INSERT INTO tenant_transfer_payloads (
      schema_name,
      table_name,
      row_count,
      primary_keys,
      payload_base64,
      column_list,
      select_list
    ) VALUES (
      target.schema_name,
      target.table_name,
      target.row_count,
      primary_keys,
      replace(encode(convert_to(payload::text, 'UTF8'), 'base64'), E'\n', ''),
      column_list,
      select_list
    );
  END LOOP;
END
$build_payloads$;

INSERT INTO tenant_transfer_source_contract (source_migration_version, schema_contract)
WITH selected_relations AS (
  SELECT relation.oid, relation_ns.nspname AS schema_name, relation.relname AS table_name
  FROM pg_class AS relation
  JOIN pg_namespace AS relation_ns ON relation_ns.oid = relation.relnamespace
  JOIN tenant_transfer_payloads AS payload
    ON payload.schema_name = relation_ns.nspname
   AND payload.table_name = relation.relname
), contract_items AS (
  SELECT concat_ws('|', 'table', selected.schema_name, selected.table_name) AS item
  FROM selected_relations AS selected
  UNION ALL
  SELECT concat_ws(
    '|',
    'column',
    selected.schema_name,
    selected.table_name,
    attribute.attname,
    format_type(attribute.atttypid, attribute.atttypmod),
    attribute.attnotnull::text,
    coalesce(pg_get_expr(attribute_default.adbin, attribute_default.adrelid), ''),
    attribute.attidentity,
    attribute.attgenerated
  )
  FROM selected_relations AS selected
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = selected.oid
   AND attribute.attnum > 0
   AND NOT attribute.attisdropped
  LEFT JOIN pg_attrdef AS attribute_default
    ON attribute_default.adrelid = attribute.attrelid
   AND attribute_default.adnum = attribute.attnum
  UNION ALL
  SELECT concat_ws(
    '|',
    'constraint',
    selected.schema_name,
    selected.table_name,
    constraint_metadata.conname,
    constraint_metadata.contype::text,
    pg_get_constraintdef(constraint_metadata.oid, true)
  )
  FROM selected_relations AS selected
  JOIN pg_constraint AS constraint_metadata ON constraint_metadata.conrelid = selected.oid
  UNION ALL
  SELECT concat_ws(
    '|',
    'index',
    selected.schema_name,
    selected.table_name,
    index_relation.relname,
    pg_get_indexdef(index_metadata.indexrelid)
  )
  FROM selected_relations AS selected
  JOIN pg_index AS index_metadata ON index_metadata.indrelid = selected.oid
  JOIN pg_class AS index_relation ON index_relation.oid = index_metadata.indexrelid
)
SELECT
  coalesce((SELECT max(version)::text FROM supabase_migrations.schema_migrations), ''),
  md5(string_agg(item, E'\n' ORDER BY item))
FROM contract_items;

INSERT INTO tenant_transfer_unique_indexes (
  schema_name,
  table_name,
  index_name,
  key_expression,
  non_null_predicate
)
SELECT
  relation_ns.nspname,
  relation.relname,
  index_relation.relname,
  'jsonb_build_object(' ||
    string_agg(format('%L, to_jsonb(row.%I)', attribute.attname, attribute.attname), ', ' ORDER BY index_key.ord) ||
    ')',
  string_agg(format('row.%I IS NOT NULL', attribute.attname), ' AND ' ORDER BY index_key.ord)
FROM pg_index AS index_metadata
JOIN pg_class AS relation ON relation.oid = index_metadata.indrelid
JOIN pg_namespace AS relation_ns ON relation_ns.oid = relation.relnamespace
JOIN pg_class AS index_relation ON index_relation.oid = index_metadata.indexrelid
JOIN LATERAL unnest(index_metadata.indkey) WITH ORDINALITY AS index_key(attnum, ord) ON index_key.attnum > 0
JOIN pg_attribute AS attribute
  ON attribute.attrelid = relation.oid
 AND attribute.attnum = index_key.attnum
JOIN tenant_transfer_payloads AS payload
  ON payload.schema_name = relation_ns.nspname
 AND payload.table_name = relation.relname
WHERE index_metadata.indisunique
  AND index_metadata.indisvalid
  AND index_metadata.indexprs IS NULL
  AND index_metadata.indpred IS NULL
GROUP BY relation_ns.nspname, relation.relname, index_relation.relname;

INSERT INTO tenant_transfer_script_parts (script_name, content) VALUES
  ('lock', '\set ON_ERROR_STOP on'),
  ('copy', '\set ON_ERROR_STOP on'),
  ('verification', '\set ON_ERROR_STOP on'),
  ('verification', 'CREATE TEMP TABLE tenant_transfer_expected_counts (schema_name text, table_name text, expected_count bigint, actual_count bigint);'),
  ('verification', 'CREATE TEMP TABLE tenant_transfer_fk_violations (constraint_name text, child_table text, violation_count bigint);'),
  ('preflight', '\set ON_ERROR_STOP on'),
  ('remap', '\set ON_ERROR_STOP on');

INSERT INTO tenant_transfer_script_parts (script_name, content)
SELECT
  'lock',
  'LOCK TABLE ' ||
    string_agg(format('%I.%I', relation.schema_name, relation.table_name), ', ' ORDER BY relation.schema_name, relation.table_name) ||
    ' IN SHARE ROW EXCLUSIVE MODE;'
FROM (
  SELECT payload.schema_name, payload.table_name
  FROM tenant_transfer_payloads AS payload
  UNION
  SELECT parent_ns.nspname, parent.relname
  FROM pg_constraint AS fk_constraint
  JOIN pg_class AS child ON child.oid = fk_constraint.conrelid
  JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
  JOIN pg_class AS parent ON parent.oid = fk_constraint.confrelid
  JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
  JOIN tenant_transfer_payloads AS payload
    ON payload.schema_name = child_ns.nspname
   AND payload.table_name = child.relname
  WHERE fk_constraint.contype = 'f'
) AS relation;

INSERT INTO tenant_transfer_script_parts (script_name, content)
SELECT
  'preflight',
  format(
    'INSERT INTO tenant_target_conflicts (conflict_type, object_name, conflict_count)
     SELECT ''migration_version'', ''supabase_migrations.schema_migrations'', 1
     WHERE coalesce((SELECT max(version)::text FROM supabase_migrations.schema_migrations), '''') IS DISTINCT FROM %L;',
    source_contract.source_migration_version
  )
FROM tenant_transfer_source_contract AS source_contract;

INSERT INTO tenant_transfer_script_parts (script_name, content)
WITH selected_values AS (
  SELECT string_agg(
    format('(%L::text, %L::text)', payload.schema_name, payload.table_name),
    ', ' ORDER BY payload.schema_name, payload.table_name
  ) AS content
  FROM tenant_transfer_payloads AS payload
)
SELECT
  'preflight',
  format(
    'INSERT INTO tenant_target_conflicts (conflict_type, object_name, conflict_count)
     SELECT ''schema_contract'', ''selected_tables'', 1
     WHERE (
       WITH selected_tables(schema_name, table_name) AS (VALUES %s),
       selected_relations AS (
         SELECT relation.oid, relation_ns.nspname AS schema_name, relation.relname AS table_name
         FROM pg_class AS relation
         JOIN pg_namespace AS relation_ns ON relation_ns.oid = relation.relnamespace
         JOIN selected_tables AS selected
           ON selected.schema_name = relation_ns.nspname
          AND selected.table_name = relation.relname
       ), contract_items AS (
         SELECT concat_ws(''|'', ''table'', selected.schema_name, selected.table_name) AS item
         FROM selected_relations AS selected
         UNION ALL
         SELECT concat_ws(
           ''|'', ''column'', selected.schema_name, selected.table_name,
           attribute.attname,
           format_type(attribute.atttypid, attribute.atttypmod),
           attribute.attnotnull::text,
           coalesce(pg_get_expr(attribute_default.adbin, attribute_default.adrelid), ''''),
           attribute.attidentity, attribute.attgenerated
         )
         FROM selected_relations AS selected
         JOIN pg_attribute AS attribute
           ON attribute.attrelid = selected.oid
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
         LEFT JOIN pg_attrdef AS attribute_default
           ON attribute_default.adrelid = attribute.attrelid
          AND attribute_default.adnum = attribute.attnum
         UNION ALL
         SELECT concat_ws(
           ''|'', ''constraint'', selected.schema_name, selected.table_name,
           constraint_metadata.conname, constraint_metadata.contype::text,
           pg_get_constraintdef(constraint_metadata.oid, true)
         )
         FROM selected_relations AS selected
         JOIN pg_constraint AS constraint_metadata ON constraint_metadata.conrelid = selected.oid
         UNION ALL
         SELECT concat_ws(
           ''|'', ''index'', selected.schema_name, selected.table_name,
           index_relation.relname, pg_get_indexdef(index_metadata.indexrelid)
         )
         FROM selected_relations AS selected
         JOIN pg_index AS index_metadata ON index_metadata.indrelid = selected.oid
         JOIN pg_class AS index_relation ON index_relation.oid = index_metadata.indexrelid
       )
       SELECT md5(string_agg(item, E''\n'' ORDER BY item)) FROM contract_items
     ) IS DISTINCT FROM %L;',
    selected_values.content,
    source_contract.schema_contract
  )
FROM selected_values
CROSS JOIN tenant_transfer_source_contract AS source_contract;

INSERT INTO tenant_transfer_script_parts (script_name, content)
SELECT
  'remap',
  format(
    'DO $tenant_douyin_component_remap$
     DECLARE target_component_appid text;
     BEGIN
       SELECT component.component_appid INTO STRICT target_component_appid
       FROM public.douyin_third_party_components AS component
       WHERE component.status = ''active'';
       UPDATE public.douyin_miniapp_installations AS row
       SET component_appid = target_component_appid
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements(%L::jsonb) AS expected(key)
         WHERE to_jsonb(row) @> expected.key
       );
       IF NOT FOUND THEN
         RAISE EXCEPTION ''生产抖音组件映射未命中'';
       END IF;
     END
     $tenant_douyin_component_remap$;',
    payload.primary_keys::text
  )
FROM tenant_transfer_payloads AS payload
WHERE payload.schema_name = 'public'
  AND payload.table_name = 'douyin_miniapp_installations';

INSERT INTO tenant_transfer_script_parts (script_name, content)
SELECT
  'preflight',
  format(
    'INSERT INTO tenant_target_conflicts (conflict_type, object_name, conflict_count)
     SELECT ''tenant_identity'', ''public.tenants'', count(*)
     FROM public.tenants
     WHERE id = %L::uuid OR name = %L OR slug = %L
     HAVING count(*) > 0;',
    tenant.id,
    tenant.name,
    tenant.slug
  )
FROM public.tenants AS tenant
WHERE tenant.id = :'tenant_id'::uuid;

DO $build_scripts$
DECLARE
  payload record;
  unique_index record;
  foreign_key record;
  unique_keys jsonb;
  child_pk_expression text;
  fk_join_expression text;
  fk_non_null_predicate text;
  remap_rule record;
  null_rule record;
  child_primary_keys jsonb;
  parent_scope_predicate text;
BEGIN
  FOR payload IN
    SELECT * FROM tenant_transfer_payloads ORDER BY schema_name, table_name
  LOOP
    INSERT INTO tenant_transfer_script_parts (script_name, content) VALUES (
      'copy',
      format(
        'INSERT INTO %I.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::%I.%I, convert_from(decode(%L, ''base64''), ''UTF8'')::jsonb) AS record;',
        payload.schema_name,
        payload.table_name,
        payload.column_list,
        payload.select_list,
        payload.schema_name,
        payload.table_name,
        payload.payload_base64
      )
    );

    INSERT INTO tenant_transfer_script_parts (script_name, content) VALUES (
      'preflight',
      format(
        'INSERT INTO tenant_target_conflicts (conflict_type, object_name, conflict_count)
         SELECT ''primary_key'', %L, count(*)
         FROM %I.%I AS row
         WHERE EXISTS (
           SELECT 1 FROM jsonb_array_elements(%L::jsonb) AS expected(key)
           WHERE to_jsonb(row) @> expected.key
         )
         HAVING count(*) > 0;',
        payload.schema_name || '.' || payload.table_name,
        payload.schema_name,
        payload.table_name,
        payload.primary_keys::text
      )
    );

    INSERT INTO tenant_transfer_script_parts (script_name, content) VALUES (
      'verification',
      format(
        'INSERT INTO tenant_transfer_expected_counts (schema_name, table_name, expected_count, actual_count)
         SELECT %L, %L, %s, count(*)
         FROM %I.%I AS row
         WHERE EXISTS (
           SELECT 1 FROM jsonb_array_elements(%L::jsonb) AS expected(key)
           WHERE to_jsonb(row) @> expected.key
         );',
        payload.schema_name,
        payload.table_name,
        payload.row_count,
        payload.schema_name,
        payload.table_name,
        payload.primary_keys::text
      )
    );
  END LOOP;

  FOR unique_index IN
    SELECT * FROM tenant_transfer_unique_indexes ORDER BY schema_name, table_name, index_name
  LOOP
    EXECUTE format(
      'SELECT coalesce(jsonb_agg(DISTINCT %s), ''[]''::jsonb)
       FROM %I.%I AS row
       JOIN tenant_transfer_selected_rows AS selected
         ON selected.schema_name = %L
        AND selected.table_name = %L
        AND to_jsonb(row) @> selected.primary_key
       WHERE %s',
      unique_index.key_expression,
      unique_index.schema_name,
      unique_index.table_name,
      unique_index.schema_name,
      unique_index.table_name,
      unique_index.non_null_predicate
    ) INTO unique_keys;

    IF jsonb_array_length(unique_keys) > 0 THEN
      INSERT INTO tenant_transfer_script_parts (script_name, content) VALUES (
        'preflight',
        format(
          'INSERT INTO tenant_target_conflicts (conflict_type, object_name, conflict_count)
           SELECT ''unique_key'', %L, count(*)
           FROM %I.%I AS row
           WHERE EXISTS (
             SELECT 1 FROM jsonb_array_elements(%L::jsonb) AS expected(key)
             WHERE to_jsonb(row) @> expected.key
           )
           HAVING count(*) > 0;',
          unique_index.index_name,
          unique_index.schema_name,
          unique_index.table_name,
          unique_keys::text
        )
      );
    END IF;
  END LOOP;

  FOR remap_rule IN
    SELECT *
    FROM tenant_transfer_remap_rules
    ORDER BY child_table, child_column, source_parent_id
  LOOP
    SELECT selected_payload.primary_keys
    INTO child_primary_keys
    FROM tenant_transfer_payloads AS selected_payload
    WHERE selected_payload.schema_name = 'public'
      AND selected_payload.table_name = remap_rule.child_table;

    parent_scope_predicate := CASE
      WHEN remap_rule.parent_scope IS NULL THEN ''
      ELSE format(' AND parent.ownership_scope = %L', remap_rule.parent_scope)
    END;

    INSERT INTO tenant_transfer_script_parts (script_name, content) VALUES (
      'remap',
      format(
        'DO $tenant_remap$ DECLARE target_parent_id uuid; BEGIN
           SELECT parent.id INTO STRICT target_parent_id
           FROM public.%I AS parent
           WHERE upper(btrim(parent.code)) = upper(btrim(%L))%s;
           UPDATE public.%I AS row
           SET %I = target_parent_id
           WHERE row.%I = %L::uuid
             AND EXISTS (
               SELECT 1 FROM jsonb_array_elements(%L::jsonb) AS expected(key)
               WHERE to_jsonb(row) @> expected.key
           );
           IF NOT FOUND THEN
             RAISE EXCEPTION %L;
           END IF;
         END $tenant_remap$;',
        remap_rule.parent_table,
        remap_rule.parent_code,
        parent_scope_predicate,
        remap_rule.child_table,
        remap_rule.child_column,
        remap_rule.child_column,
        remap_rule.source_parent_id,
        child_primary_keys::text,
        '跨环境字典重映射未命中: ' || remap_rule.child_table || '.' || remap_rule.child_column
      )
    );
  END LOOP;

  FOR null_rule IN
    SELECT *
    FROM tenant_transfer_null_rules
    ORDER BY child_table, child_column
  LOOP
    SELECT selected_payload.primary_keys
    INTO child_primary_keys
    FROM tenant_transfer_payloads AS selected_payload
    WHERE selected_payload.schema_name = 'public'
      AND selected_payload.table_name = null_rule.child_table;

    IF child_primary_keys IS NOT NULL THEN
      INSERT INTO tenant_transfer_script_parts (script_name, content) VALUES (
        'remap',
        format(
          'UPDATE public.%I AS row
           SET %I = NULL
           WHERE row.%I IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM jsonb_array_elements(%L::jsonb) AS expected(key)
               WHERE to_jsonb(row) @> expected.key
             )
             AND NOT EXISTS (
               SELECT 1 FROM %I.%I AS parent WHERE parent.id = row.%I
             );',
          null_rule.child_table,
          null_rule.child_column,
          null_rule.child_column,
          child_primary_keys::text,
          null_rule.parent_schema,
          null_rule.parent_table,
          null_rule.child_column
        )
      );
    END IF;
  END LOOP;

  FOR foreign_key IN
    SELECT
      fk_constraint.oid,
      fk_constraint.conname,
      child_ns.nspname AS child_schema,
      child.relname AS child_table,
      parent_ns.nspname AS parent_schema,
      parent.relname AS parent_table,
      selected_payload.primary_keys
    FROM pg_constraint AS fk_constraint
    JOIN pg_class AS child ON child.oid = fk_constraint.conrelid
    JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class AS parent ON parent.oid = fk_constraint.confrelid
    JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
    JOIN tenant_transfer_payloads AS selected_payload
      ON selected_payload.schema_name = child_ns.nspname
     AND selected_payload.table_name = child.relname
    WHERE fk_constraint.contype = 'f'
    ORDER BY child_ns.nspname, child.relname, fk_constraint.conname
  LOOP
    SELECT
      'jsonb_build_object(' ||
      string_agg(format('%L, to_jsonb(child.%I)', attribute.attname, attribute.attname), ', ' ORDER BY key_column.ord) ||
      ')'
    INTO child_pk_expression
    FROM pg_constraint AS primary_key
    JOIN LATERAL unnest(primary_key.conkey) WITH ORDINALITY AS key_column(attnum, ord) ON true
    JOIN pg_attribute AS attribute
      ON attribute.attrelid = primary_key.conrelid
     AND attribute.attnum = key_column.attnum
    WHERE primary_key.contype = 'p'
      AND primary_key.conrelid = format('%I.%I', foreign_key.child_schema, foreign_key.child_table)::regclass;

    SELECT
      string_agg(
        format('child.%I IS NOT DISTINCT FROM parent.%I', child_attribute.attname, parent_attribute.attname),
        ' AND ' ORDER BY key_pair.ord
      ),
      string_agg(format('child.%I IS NOT NULL', child_attribute.attname), ' AND ' ORDER BY key_pair.ord)
    INTO fk_join_expression, fk_non_null_predicate
    FROM pg_constraint AS fk_constraint
    JOIN LATERAL unnest(fk_constraint.conkey, fk_constraint.confkey)
      WITH ORDINALITY AS key_pair(child_attnum, parent_attnum, ord) ON true
    JOIN pg_attribute AS child_attribute
      ON child_attribute.attrelid = fk_constraint.conrelid
     AND child_attribute.attnum = key_pair.child_attnum
    JOIN pg_attribute AS parent_attribute
      ON parent_attribute.attrelid = fk_constraint.confrelid
     AND parent_attribute.attnum = key_pair.parent_attnum
    WHERE fk_constraint.oid = foreign_key.oid;

    INSERT INTO tenant_transfer_script_parts (script_name, content) VALUES (
      'verification',
      format(
        'INSERT INTO tenant_transfer_fk_violations (constraint_name, child_table, violation_count)
         SELECT %L, %L, count(*)
         FROM %I.%I AS child
         WHERE EXISTS (
           SELECT 1 FROM jsonb_array_elements(%L::jsonb) AS expected(key)
           WHERE to_jsonb(child) @> expected.key
         )
           AND %s
           AND NOT EXISTS (
             SELECT 1 FROM %I.%I AS parent WHERE %s
           )
         HAVING count(*) > 0;',
        foreign_key.conname,
        foreign_key.child_schema || '.' || foreign_key.child_table,
        foreign_key.child_schema,
        foreign_key.child_table,
        foreign_key.primary_keys::text,
        fk_non_null_predicate,
        foreign_key.parent_schema,
        foreign_key.parent_table,
        fk_join_expression
      )
    );
  END LOOP;
END
$build_scripts$;

INSERT INTO tenant_transfer_script_parts (script_name, content) VALUES
  (
    'verification',
    'SELECT ''TRANSFER_COUNT_VIOLATION'', schema_name || ''.'' || table_name, expected_count, actual_count FROM tenant_transfer_expected_counts WHERE expected_count <> actual_count ORDER BY schema_name, table_name;'
  ),
  (
    'verification',
    'SELECT ''TRANSFER_FK_VIOLATION'', constraint_name, child_table, violation_count FROM tenant_transfer_fk_violations WHERE violation_count > 0 ORDER BY child_table, constraint_name;'
  ),
  (
    'verification',
    'DO $verify_counts$ BEGIN IF EXISTS (SELECT 1 FROM tenant_transfer_expected_counts WHERE expected_count <> actual_count) THEN RAISE EXCEPTION ''租户迁移行数校验失败''; END IF; END $verify_counts$;'
  ),
  (
    'verification',
    'DO $verify_fks$ BEGIN IF EXISTS (SELECT 1 FROM tenant_transfer_fk_violations WHERE violation_count > 0) THEN RAISE EXCEPTION ''租户迁移外键校验失败''; END IF; END $verify_fks$;'
  );

WITH tenant AS (
  SELECT id, name, slug
  FROM public.tenants
  WHERE id = :'tenant_id'::uuid
), scripts AS (
  SELECT
    script_name,
    string_agg(content, E'\n' ORDER BY ordinal) AS content
  FROM tenant_transfer_script_parts
  GROUP BY script_name
), manifest AS (
  SELECT jsonb_build_object(
    'tenant_id', :'tenant_id',
    'tenant_name', tenant.name,
    'tenant_slug', tenant.slug,
    'source_migration_version', (SELECT source_migration_version FROM tenant_transfer_source_contract),
    'schema_contract', (SELECT schema_contract FROM tenant_transfer_source_contract),
    'source_transaction', 'read_only',
    'active_users', (SELECT count(*) FROM tenant_transfer_active_users),
    'selected_rows', (SELECT count(*) FROM tenant_transfer_selected_rows),
    'selected_tables', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'schema', payload.schema_name,
          'table', payload.table_name,
          'rows', payload.row_count
        ) ORDER BY payload.schema_name, payload.table_name
      )
      FROM tenant_transfer_payloads AS payload
    ),
    'excluded_tables', (
      SELECT jsonb_agg(
        jsonb_build_object('table', exclusion.table_name, 'reason', exclusion.reason)
        ORDER BY exclusion.table_name
      )
      FROM tenant_transfer_exclusions AS exclusion
    )
  ) AS value
  FROM tenant
)
SELECT jsonb_build_object(
  'manifest', manifest.value,
  'lock_sql', (SELECT content FROM scripts WHERE script_name = 'lock'),
  'copy_sql', (SELECT content FROM scripts WHERE script_name = 'copy'),
  'preflight_sql', (SELECT content FROM scripts WHERE script_name = 'preflight'),
  'remap_sql', (SELECT content FROM scripts WHERE script_name = 'remap'),
  'verification_sql', (SELECT content FROM scripts WHERE script_name = 'verification')
)::text
FROM manifest;

ROLLBACK;
