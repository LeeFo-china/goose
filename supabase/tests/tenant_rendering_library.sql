-- Read-only catalog verification after applying the draft foundation migration locally.
-- No tenant fixtures, file contents, credentials, DDL or application data writes.
BEGIN READ ONLY;

DO $$
DECLARE
  v_table oid := to_regclass('public.tenant_rendering_styles');
  v_file_table oid := to_regclass('public.platform_file_objects');
  v_tenant_att smallint;
  v_file_att smallint;
  v_file_tenant_att smallint;
  v_file_id_att smallint;
  v_role text;
  v_privilege text;
  v_index record;
BEGIN
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'tenant_rendering_styles is missing';
  END IF;

  SELECT attnum INTO v_tenant_att FROM pg_attribute WHERE attrelid = v_table AND attname = 'tenant_id';
  SELECT attnum INTO v_file_att FROM pg_attribute WHERE attrelid = v_table AND attname = 'file_id';
  SELECT attnum INTO v_file_tenant_att FROM pg_attribute WHERE attrelid = v_file_table AND attname = 'tenant_id';
  SELECT attnum INTO v_file_id_att FROM pg_attribute WHERE attrelid = v_file_table AND attname = 'id';

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = v_table AND contype = 'f' AND confrelid = v_file_table
      AND conkey = ARRAY[v_tenant_att, v_file_att]
      AND confkey = ARRAY[v_file_tenant_att, v_file_id_att]
      AND confdeltype = 'r' AND convalidated
  ) THEN
    RAISE EXCEPTION 'tenant/file composite RESTRICT foreign key is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = v_table AND relrowsecurity)
    OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_table) THEN
    RAISE EXCEPTION 'draft table must have RLS enabled without client policies';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class AS relation,
      LATERAL aclexplode(coalesce(relation.relacl, acldefault('r', relation.relowner))) AS privilege
    WHERE relation.oid = v_table AND privilege.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not have table privileges';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(v_role, v_table, v_privilege)
        IS DISTINCT FROM (v_role = 'service_role' AND v_privilege IN ('SELECT', 'INSERT', 'UPDATE')) THEN
        RAISE EXCEPTION 'unexpected % privilege for %', v_privilege, v_role;
      END IF;
    END LOOP;
  END LOOP;

  FOR v_index IN
    SELECT * FROM (VALUES
      ('rendering_file_tenant_id_key', 'platform_file_objects', true, 'tenant_id, id', false),
      ('tenant_rendering_styles_tenant_id_key', 'tenant_rendering_styles', true, 'tenant_id, id', false),
      ('tenant_rendering_styles_list_idx', 'tenant_rendering_styles', false, 'tenant_id, sort_order, id', true),
      ('tenant_rendering_styles_filter_idx', 'tenant_rendering_styles', false, 'tenant_id, status, space, style, sort_order, id', true),
      ('tenant_rendering_styles_active_file_key', 'tenant_rendering_styles', true, 'tenant_id, file_id', true)
    ) AS expected(name, table_name, is_unique, columns, is_partial)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index AS index
      JOIN pg_class AS relation ON relation.oid = index.indexrelid
      JOIN pg_am AS method ON method.oid = relation.relam
      WHERE index.indexrelid = to_regclass('public.' || v_index.name)
        AND index.indrelid = to_regclass('public.' || v_index.table_name)
        AND index.indisunique = v_index.is_unique AND index.indisvalid AND index.indisready
        AND method.amname = 'btree'
        AND (
          SELECT string_agg(pg_get_indexdef(index.indexrelid, position, true), ', ' ORDER BY position)
          FROM generate_series(1, index.indnkeyatts) AS position
        ) = v_index.columns
        AND CASE WHEN v_index.is_partial
          THEN pg_get_expr(index.indpred, index.indrelid) = '(deleted_at IS NULL)'
          ELSE index.indpred IS NULL END
    ) THEN
      RAISE EXCEPTION 'missing or mismatched rendering index %', v_index.name;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.permissions
    WHERE module = 'rendering_library' AND resource = 'rendering_library' AND status = 'active'
      AND ((code = 'rendering_library.read' AND action = 'read' AND name = '查看装修效果素材')
        OR (code = 'rendering_library.manage' AND action = 'manage' AND name = '管理装修效果素材'))) <> 2 THEN
    RAISE EXCEPTION 'draft library permissions are missing or malformed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = v_table AND NOT tgisinternal AND tgenabled = 'O'
      AND tgfoid = 'public.update_updated_at_column()'::regprocedure
      AND tgtype = 19 -- ROW + BEFORE + UPDATE
  ) THEN
    RAISE EXCEPTION 'updated_at trigger is missing';
  END IF;
END;
$$;

ROLLBACK;
