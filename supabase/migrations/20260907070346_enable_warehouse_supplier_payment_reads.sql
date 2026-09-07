-- Stage B financial reads only. Existing project calls default to project-only;
-- warehouse visibility is an explicit service-authorized additional scope.
-- Settlement reads deliberately have no replenishment flag or active-status gate.
-- Rollback: deploy a reviewed forward correction, retaining every financial fact.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE FUNCTION pg_temp.stage_b_payment_read_replace(p_source text,p_old text,p_new text,p_count integer DEFAULT 1)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF p_old='' OR (length(p_source)-length(replace(p_source,p_old,'')))/length(p_old)<>p_count THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='WAREHOUSE_PAYMENT_READ_PATCH_SOURCE_MISMATCH',DETAIL=left(p_old,150);
  END IF;
  RETURN replace(p_source,p_old,p_new);
END;
$$;

DO $lists$
DECLARE
  v_name text; v_signature text; v_definition text; v_alias text; v_count integer;
  v_old text; v_new text; v_scope text; v_target text; v_allocation text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['list_supplier_payables','get_supplier_payables_by_ids',
    'list_supplier_payable_filter_options','list_supplier_payment_requests'] LOOP
    v_signature := CASE v_name
      WHEN 'list_supplier_payables' THEN '(uuid,uuid[],uuid,uuid,uuid,text,timestamptz,timestamptz,integer,integer)'
      WHEN 'get_supplier_payables_by_ids' THEN '(uuid,uuid[],uuid[])'
      WHEN 'list_supplier_payable_filter_options' THEN '(uuid,uuid[],text,text,integer,integer)'
      ELSE '(uuid,uuid[],uuid,uuid,text,text,timestamptz,timestamptz,integer,integer)' END;
    v_definition := pg_get_functiondef(('public.'||v_name||v_signature)::regprocedure);
    IF v_name='get_supplier_payables_by_ids' THEN
      v_definition := pg_temp.stage_b_payment_read_replace(v_definition,'p_payable_event_ids uuid[])',
        'p_payable_event_ids uuid[], p_include_warehouse boolean DEFAULT false)');
    ELSE
      v_definition := pg_temp.stage_b_payment_read_replace(v_definition,'p_page_size integer DEFAULT 20)',
        'p_page_size integer DEFAULT 20, p_include_warehouse boolean DEFAULT false, p_destination_type text DEFAULT NULL::text, p_warehouse_id uuid DEFAULT NULL::uuid)');
      v_definition := pg_temp.stage_b_payment_read_replace(v_definition,'  IF p_tenant_id IS NULL',
        $patch$  IF p_include_warehouse IS NULL
    OR (p_destination_type IS NOT NULL AND p_destination_type NOT IN ('project','warehouse'))
  THEN
    RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='SUPPLIER_PAYMENT_PAGINATION_INVALID';
  END IF;
  IF p_tenant_id IS NULL$patch$);
    END IF;
    IF v_name<>'list_supplier_payment_requests' THEN
      v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
        '    AND cardinality(p_visible_project_ids) = 0',
        '    AND cardinality(p_visible_project_ids) = 0 AND p_include_warehouse IS NOT TRUE');
    END IF;
    v_alias := CASE v_name WHEN 'list_supplier_payment_requests' THEN 'payment_request' ELSE 'payable' END;
    v_count := CASE v_name WHEN 'list_supplier_payable_filter_options' THEN 3 ELSE 1 END;
    v_old := format(E'        p_visible_project_ids IS NULL\n        OR %s.project_id = ANY (p_visible_project_ids)',v_alias);
    -- Use the immutable financial destination, not mutable procurement parents.
    -- Same-tenant warehouse existence is required, but status is not a read gate.
    v_scope := format($patch$        (%1$s.destination_type='project' AND (
          p_visible_project_ids IS NULL OR %1$s.project_id=ANY(p_visible_project_ids)))
        OR (%1$s.destination_type='warehouse' AND p_include_warehouse IS TRUE
          AND EXISTS(SELECT 1 FROM public.warehouses AS scoped_warehouse
            WHERE scoped_warehouse.id=%1$s.warehouse_id AND scoped_warehouse.tenant_id=%1$s.tenant_id))$patch$,v_alias);
    v_definition := pg_temp.stage_b_payment_read_replace(v_definition,v_old,v_scope,v_count);
    IF v_name<>'get_supplier_payables_by_ids' THEN
      v_old := v_alias||'.tenant_id = p_tenant_id';
      v_definition := pg_temp.stage_b_payment_read_replace(v_definition,v_old,v_old||format($patch$
      AND (p_destination_type IS NULL OR %1$s.destination_type=p_destination_type)
      AND (p_warehouse_id IS NULL OR %1$s.warehouse_id=p_warehouse_id)$patch$,v_alias),v_count);
    END IF;

    IF v_name='list_supplier_payable_filter_options' THEN
      v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
        '''project'', ''supplier'', ''purchase_order''','''project'', ''supplier'', ''purchase_order'', ''warehouse''');
      v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
        E'  ),\n  filtered AS MATERIALIZED (',
        $patch$
    UNION ALL
    SELECT DISTINCT payable.warehouse_id AS option_id, warehouse.name AS option_label
    FROM public.supplier_payable_events AS payable
    JOIN public.warehouses AS warehouse ON warehouse.id=payable.warehouse_id AND warehouse.tenant_id=payable.tenant_id
    WHERE p_type='warehouse' AND payable.tenant_id=p_tenant_id
      AND payable.destination_type='warehouse' AND p_include_warehouse IS TRUE
      AND (p_destination_type IS NULL OR payable.destination_type=p_destination_type)
      AND (p_warehouse_id IS NULL OR payable.warehouse_id=p_warehouse_id)
  ),
  filtered AS MATERIALIZED ($patch$);
    ELSE
      v_old := '      '||v_alias||'.project_id,';
      v_new := v_old||E'\n      '||v_alias||'.destination_type, '||v_alias||'.warehouse_id,';
      IF v_name IN('list_supplier_payables','get_supplier_payables_by_ids') THEN
        -- list_supplier_payables selects explicit fields again in balances.
        v_definition := pg_temp.stage_b_payment_read_replace(v_definition,v_old,v_new,
          CASE v_name WHEN 'list_supplier_payables' THEN 2 ELSE 1 END);
        v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
          '    JOIN public.projects AS project','    LEFT JOIN public.projects AS project');
        v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
          '      AND project.tenant_id = payable.tenant_id',
          $patch$      AND project.tenant_id = payable.tenant_id
    LEFT JOIN public.warehouses AS warehouse ON warehouse.id=payable.warehouse_id AND warehouse.tenant_id=payable.tenant_id$patch$);
        v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
          '      project.name AS project_name,','      project.name AS project_name, warehouse.name AS warehouse_name,');
        IF v_name='list_supplier_payables' THEN
          v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
            '      payable.project_name,','      payable.project_name, payable.warehouse_name,');
        END IF;
        v_target := CASE v_name WHEN 'list_supplier_payables' THEN 'target_payable' ELSE 'target' END;
        v_allocation := CASE v_name WHEN 'list_supplier_payables' THEN 'payment_allocation' ELSE 'allocation' END;
        v_old := format(E'    FROM public.supplier_payment_allocations AS %1$s\n    JOIN target_payables AS %2$s\n      ON %2$s.id = %1$s.payable_event_id',v_allocation,v_target);
        -- Authorize the complete financial edge before summing: a scoped
        -- payable alone does not make an unrelated request/payment visible.
        v_definition := pg_temp.stage_b_payment_read_replace(v_definition,v_old,v_old||format($patch$
    JOIN public.supplier_payment_request_allocations AS paid_request_allocation
      ON paid_request_allocation.id=%1$s.payment_request_allocation_id
      AND paid_request_allocation.tenant_id=%1$s.tenant_id
      AND paid_request_allocation.payment_request_id=%1$s.payment_request_id
      AND paid_request_allocation.payable_event_id=%1$s.payable_event_id
    JOIN public.supplier_payment_requests AS paid_request
      ON paid_request.id=%1$s.payment_request_id AND paid_request.tenant_id=%1$s.tenant_id
      AND paid_request.destination_type=%2$s.destination_type
      AND paid_request.project_id IS NOT DISTINCT FROM %2$s.project_id
      AND paid_request.warehouse_id IS NOT DISTINCT FROM %2$s.warehouse_id
      AND paid_request.tenant_supplier_id=%2$s.tenant_supplier_id
      AND paid_request.supplier_id=%2$s.supplier_id AND paid_request.currency=%2$s.currency
    JOIN public.supplier_payments AS paid_payment
      ON paid_payment.id=%1$s.supplier_payment_id AND paid_payment.tenant_id=%1$s.tenant_id
      AND paid_payment.payment_request_id=paid_request.id
      AND paid_payment.destination_type=%2$s.destination_type
      AND paid_payment.project_id IS NOT DISTINCT FROM %2$s.project_id
      AND paid_payment.warehouse_id IS NOT DISTINCT FROM %2$s.warehouse_id
      AND paid_payment.tenant_supplier_id=%2$s.tenant_supplier_id
      AND paid_payment.supplier_id=%2$s.supplier_id AND paid_payment.currency=%2$s.currency$patch$,v_allocation,v_target));
        v_old := '      AND payment_request.tenant_id = allocation.tenant_id';
        v_definition := pg_temp.stage_b_payment_read_replace(v_definition,v_old,v_old||format($patch$
      AND payment_request.destination_type=%1$s.destination_type
      AND payment_request.project_id IS NOT DISTINCT FROM %1$s.project_id
      AND payment_request.warehouse_id IS NOT DISTINCT FROM %1$s.warehouse_id
      AND payment_request.tenant_supplier_id=%1$s.tenant_supplier_id
      AND payment_request.supplier_id=%1$s.supplier_id AND payment_request.currency=%1$s.currency$patch$,v_target));
      ELSE
        v_definition := pg_temp.stage_b_payment_read_replace(v_definition,v_old,v_new||E'\n      warehouse.name AS warehouse_name,');
        v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
          '    FROM public.supplier_payment_requests AS payment_request',
          $patch$    FROM public.supplier_payment_requests AS payment_request
    LEFT JOIN public.warehouses AS warehouse ON warehouse.id=payment_request.warehouse_id AND warehouse.tenant_id=payment_request.tenant_id$patch$);
      END IF;
      v_alias := CASE v_name WHEN 'get_supplier_payables_by_ids' THEN 'facts' ELSE 'page_rows' END;
      v_old := '''project_id'', '||v_alias||'.project_id,';
      v_definition := pg_temp.stage_b_payment_read_replace(v_definition,v_old,v_old||format(
        E'\n          ''destination_type'', %1$s.destination_type, ''warehouse_id'', %1$s.warehouse_id,\n          ''warehouse_name'', %1$s.warehouse_name,',v_alias));
    END IF;
    -- Drop only the exact old signature after the guarded definition has been
    -- validated. Defaults keep old positional/named calls unambiguous.
    EXECUTE 'DROP FUNCTION public.'||v_name||v_signature;
    EXECUTE v_definition;
    v_signature := left(v_signature,length(v_signature)-1)||
      CASE v_name WHEN 'get_supplier_payables_by_ids' THEN ',boolean)' ELSE ',boolean,text,uuid)' END;
    EXECUTE 'REVOKE ALL ON FUNCTION public.'||v_name||v_signature||' FROM PUBLIC,anon,authenticated,service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||v_name||v_signature||' TO service_role';
  END LOOP;
END;
$lists$;

DO $details$
DECLARE v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.get_supplier_payment_request_detail(uuid,uuid)'::regprocedure);
  v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
    'public.supplier_payment_request_to_jsonb(v_payment_request)',
    $patch$(public.supplier_payment_request_to_jsonb(v_payment_request) || jsonb_build_object(
        'destination_type',v_payment_request.destination_type,'warehouse_id',v_payment_request.warehouse_id))$patch$);
  -- Null project composite FKs cannot protect warehouse allocation identity.
  -- Read only same-tenant, same-supplier, exact-destination financial facts.
  v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
    '    AND payable.tenant_id = allocation.tenant_id',
    $patch$    AND payable.tenant_id = allocation.tenant_id
    AND payable.destination_type=v_payment_request.destination_type
    AND payable.project_id IS NOT DISTINCT FROM v_payment_request.project_id
    AND payable.warehouse_id IS NOT DISTINCT FROM v_payment_request.warehouse_id
    AND payable.tenant_supplier_id=v_payment_request.tenant_supplier_id
    AND payable.supplier_id=v_payment_request.supplier_id
    AND payable.currency=v_payment_request.currency$patch$);
  EXECUTE v_definition;

  v_definition := pg_get_functiondef('public.list_supplier_payment_request_payments(uuid,uuid,integer,integer)'::regprocedure);
  v_definition := pg_temp.stage_b_payment_read_replace(v_definition,'      payment.id,',
    '      payment.id, payment.destination_type, payment.project_id, payment.warehouse_id,');
  v_definition := pg_temp.stage_b_payment_read_replace(v_definition,
    '    FROM public.supplier_payments AS payment',
    $patch$    FROM public.supplier_payments AS payment
    JOIN public.supplier_payment_requests AS payment_request ON payment_request.id=payment.payment_request_id
      AND payment_request.tenant_id=payment.tenant_id
      AND payment_request.destination_type=payment.destination_type
      AND payment_request.project_id IS NOT DISTINCT FROM payment.project_id
      AND payment_request.warehouse_id IS NOT DISTINCT FROM payment.warehouse_id
      AND payment_request.tenant_supplier_id=payment.tenant_supplier_id
      AND payment_request.supplier_id=payment.supplier_id AND payment_request.currency=payment.currency$patch$);
  v_definition := pg_temp.stage_b_payment_read_replace(v_definition,'''id'', page_rows.id,',
    $patch$'id', page_rows.id,
          'destination_type',page_rows.destination_type,'project_id',page_rows.project_id,'warehouse_id',page_rows.warehouse_id,$patch$);
  EXECUTE v_definition;
END;
$details$;

NOTIFY pgrst,'reload schema';
COMMIT;
