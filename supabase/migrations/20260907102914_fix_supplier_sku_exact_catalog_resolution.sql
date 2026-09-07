-- Preserve historical SKU codes and idempotency requests. Keyword search is a
-- public listing contract, not an exact identity check for the save command.
-- Rollback: forward-only migration restoring the previous command/resolver
-- definitions, then dropping the unused private helper. Never recode SKUs or
-- delete command/price history; restoration reintroduces the legacy save bug.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '1min';

DO $patch$
DECLARE
  catalog_oid regprocedure := 'public.resolve_supplier_purchase_order_catalog(uuid,uuid,timestamptz,text,integer,integer)'::regprocedure;
  command_oid regprocedure := 'public.command_supplier_purchasable_sku_v1(text,uuid,uuid,uuid,uuid,uuid,integer,jsonb,jsonb,uuid,integer,uuid,uuid,text)'::regprocedure;
  catalog_body text;
  command_body text;
  command_definition text;
  catalog_owner oid;
  command_owner oid;
  catalog_anchor text := E'      AND sku.status = ''active''\n      AND (';
  command_anchor text := $old$SELECT public.resolve_supplier_purchase_order_catalog(
      p_tenant_id,
      p_tenant_supplier_id,
      v_priced_at,
      v_effective_sku ->> 'sku_code',
      1,
      1
    ) INTO v_catalog_response;$old$;
BEGIN
  SELECT prosrc,proowner INTO STRICT catalog_body,catalog_owner FROM pg_proc WHERE oid=catalog_oid;
  SELECT prosrc,proowner INTO STRICT command_body,command_owner FROM pg_proc WHERE oid=command_oid;
  IF md5(catalog_body) <> 'bbf2a8489d95e75e904f738c869894a8'
    OR md5(command_body) <> '59afd4946de800213992c1b83dcb5825'
    OR catalog_owner <> command_owner THEN
    RAISE EXCEPTION 'Supplier catalog / SKU command baseline drift; review before migration';
  END IF;
  IF to_regprocedure('public.__gooes_resolve_supplier_purchase_order_catalog_v1(uuid,uuid,timestamptz,text,integer,integer,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Private exact SKU catalog helper already exists; review before migration';
  END IF;
  IF (length(catalog_body)-length(replace(catalog_body,catalog_anchor,'')))/length(catalog_anchor) <> 1
    OR (length(command_body)-length(replace(command_body,command_anchor,'')))/length(command_anchor) <> 1 THEN
    RAISE EXCEPTION 'Supplier exact SKU catalog patch anchors changed';
  END IF;

  -- One shared eligibility/price query: public searches pass NULL; saves pass
  -- the locked SKU UUID. Do not filter by price-list/item ID: two eligible
  -- prices for the same SKU must still fail the command's total=1 check.
  catalog_body := replace(catalog_body,catalog_anchor,
    E'      AND sku.status = ''active''\n      AND (p_exact_sku_id IS NULL OR sku.id = p_exact_sku_id)\n      AND (');
  EXECUTE format($create$
    CREATE FUNCTION public.__gooes_resolve_supplier_purchase_order_catalog_v1(
      p_tenant_id uuid,p_tenant_supplier_id uuid,p_priced_at timestamptz,
      p_keyword text,p_page integer,p_page_size integer,p_exact_sku_id uuid
    ) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
      SET search_path = pg_catalog, public AS %L
  $create$,catalog_body);
  EXECUTE format('ALTER FUNCTION public.__gooes_resolve_supplier_purchase_order_catalog_v1(uuid,uuid,timestamptz,text,integer,integer,uuid) OWNER TO %I',
    pg_get_userbyid(catalog_owner));

  command_definition := pg_get_functiondef(command_oid);
  EXECUTE replace(command_definition,command_anchor,$new$SELECT public.__gooes_resolve_supplier_purchase_order_catalog_v1(
      p_tenant_id,
      p_tenant_supplier_id,
      v_priced_at,
      NULL::text,
      1,
      1,
      v_sku.id
    ) INTO v_catalog_response;$new$);
END;
$patch$;

REVOKE ALL ON FUNCTION public.__gooes_resolve_supplier_purchase_order_catalog_v1(
  uuid,uuid,timestamptz,text,integer,integer,uuid
) FROM PUBLIC,anon,authenticated,service_role;

-- Keep the original signature/defaults, SECURITY DEFINER owner, ACL, errors,
-- substring search semantics, total count and bounded pagination unchanged.
CREATE OR REPLACE FUNCTION public.resolve_supplier_purchase_order_catalog(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_priced_at timestamptz,
  p_keyword text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN public.__gooes_resolve_supplier_purchase_order_catalog_v1(
    p_tenant_id,p_tenant_supplier_id,p_priced_at,p_keyword,p_page,p_page_size,NULL::uuid
  );
END;
$$;
COMMIT;
