-- Seed one immutable default purchase-batch approval version without replacing
-- tenant-authored definitions or published versions.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.__gooes_ensure_supplier_purchase_batch_workflow_template(
  p_tenant_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate_definition_id uuid := pg_catalog.gen_random_uuid();
  v_definition public.workflow_definitions%ROWTYPE;
  v_created boolean := false;
  v_active_published_id uuid;
  v_existing_published_id uuid;
  v_version_id uuid := pg_catalog.gen_random_uuid();
  v_version_number integer;
  v_published_at timestamptz := pg_catalog.clock_timestamp();
  v_start_id uuid := pg_catalog.gen_random_uuid();
  v_purchase_review_id uuid := pg_catalog.gen_random_uuid();
  v_finance_review_id uuid := pg_catalog.gen_random_uuid();
  v_approved_end_id uuid := pg_catalog.gen_random_uuid();
  v_rejected_end_id uuid := pg_catalog.gen_random_uuid();
  v_nodes jsonb;
  v_edges jsonb;
  v_snapshot jsonb;
BEGIN
  INSERT INTO public.workflow_definitions (
    id,
    tenant_id,
    workflow_key,
    name,
    description,
    category,
    status
  )
  VALUES (
    v_candidate_definition_id,
    p_tenant_id,
    'supplier_purchase_batch_approval',
    '采购批次审批',
    '采购负责人先审批采购批次，超预算时再由财务审批。',
    'approval',
    'draft'
  )
  ON CONFLICT (tenant_id, workflow_key) DO NOTHING
  RETURNING * INTO v_definition;

  v_created := FOUND;

  SELECT definition.*
  INTO v_definition
  FROM public.workflow_definitions AS definition
  WHERE definition.tenant_id = p_tenant_id
    AND definition.workflow_key = 'supplier_purchase_batch_approval'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_DEFINITION_MISSING';
  END IF;

  IF v_definition.status = 'archived' THEN
    RETURN v_definition.active_version_id;
  END IF;

  SELECT version.id
  INTO v_active_published_id
  FROM public.workflow_versions AS version
  WHERE version.id = v_definition.active_version_id
    AND version.tenant_id = p_tenant_id
    AND version.definition_id = v_definition.id
    AND version.status = 'published';

  IF v_active_published_id IS NOT NULL
    AND v_definition.status = 'active' THEN
    RETURN v_active_published_id;
  END IF;

  SELECT version.id
  INTO v_existing_published_id
  FROM public.workflow_versions AS version
  WHERE version.tenant_id = p_tenant_id
    AND version.definition_id = v_definition.id
    AND version.status = 'published'
  ORDER BY version.version_number DESC, version.id DESC
  LIMIT 1;

  IF v_existing_published_id IS NOT NULL THEN
    UPDATE public.workflow_definitions AS definition
    SET
      active_version_id = v_existing_published_id,
      status = 'active'
    WHERE definition.id = v_definition.id
      AND definition.tenant_id = p_tenant_id
      AND (
        definition.active_version_id IS DISTINCT FROM v_existing_published_id
        OR definition.status <> 'active'
      );

    RETURN v_existing_published_id;
  END IF;

  SELECT COALESCE(MAX(version.version_number), 0) + 1
  INTO v_version_number
  FROM public.workflow_versions AS version
  WHERE version.tenant_id = p_tenant_id
    AND version.definition_id = v_definition.id;

  v_nodes := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'id', v_start_id,
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'node_key', 'start',
      'node_type', 'start',
      'business_kind', NULL,
      'title', '开始',
      'description', '采购批次提交审批。',
      'position', pg_catalog.jsonb_build_object('x', 80, 'y', 200),
      'config', pg_catalog.jsonb_build_object(
        'required_permissions', pg_catalog.jsonb_build_array()
      ),
      'sort_order', 10,
      'created_at', v_published_at,
      'updated_at', v_published_at
    ),
    pg_catalog.jsonb_build_object(
      'id', v_purchase_review_id,
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'node_key', 'purchase_review',
      'node_type', 'approval',
      'business_kind', NULL,
      'title', '采购审批',
      'description', '采购负责人审核采购批次。',
      'position', pg_catalog.jsonb_build_object('x', 320, 'y', 200),
      'config', pg_catalog.jsonb_build_object(
        'required_permissions', pg_catalog.jsonb_build_array(
          'supplier.purchase-requisition.approve'
        ),
        'approval_type', 'workflow_approval',
        'assignee_rule', 'role',
        'assignee_permission_code',
          'supplier.purchase-requisition.approve',
        'approve_mode', 'any',
        'actions', pg_catalog.jsonb_build_array('approve', 'reject')
      ),
      'sort_order', 20,
      'created_at', v_published_at,
      'updated_at', v_published_at
    ),
    pg_catalog.jsonb_build_object(
      'id', v_finance_review_id,
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'node_key', 'finance_review',
      'node_type', 'approval',
      'business_kind', NULL,
      'title', '财务审批',
      'description', '财务负责人审核超预算采购批次。',
      'position', pg_catalog.jsonb_build_object('x', 600, 'y', 340),
      'config', pg_catalog.jsonb_build_object(
        'required_permissions', pg_catalog.jsonb_build_array(
          'finance.budget.manage'
        ),
        'approval_type', 'workflow_approval',
        'assignee_rule', 'role',
        'assignee_permission_code', 'finance.budget.manage',
        'approve_mode', 'any',
        'actions', pg_catalog.jsonb_build_array('approve', 'reject')
      ),
      'sort_order', 30,
      'created_at', v_published_at,
      'updated_at', v_published_at
    ),
    pg_catalog.jsonb_build_object(
      'id', v_approved_end_id,
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'node_key', 'approved_end',
      'node_type', 'end',
      'business_kind', NULL,
      'title', '审批通过',
      'description', '采购批次审批通过。',
      'position', pg_catalog.jsonb_build_object('x', 880, 'y', 160),
      'config', pg_catalog.jsonb_build_object(
        'required_permissions', pg_catalog.jsonb_build_array()
      ),
      'sort_order', 40,
      'created_at', v_published_at,
      'updated_at', v_published_at
    ),
    pg_catalog.jsonb_build_object(
      'id', v_rejected_end_id,
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'node_key', 'rejected_end',
      'node_type', 'end',
      'business_kind', NULL,
      'title', '审批驳回',
      'description', '采购批次审批驳回，申请人可修改后重新提交。',
      'position', pg_catalog.jsonb_build_object('x', 600, 'y', 500),
      'config', pg_catalog.jsonb_build_object(
        'required_permissions', pg_catalog.jsonb_build_array()
      ),
      'sort_order', 50,
      'created_at', v_published_at,
      'updated_at', v_published_at
    )
  );

  v_edges := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'id', pg_catalog.gen_random_uuid(),
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'source_node_id', v_start_id,
      'source_node_key', 'start',
      'target_node_id', v_purchase_review_id,
      'target_node_key', 'purchase_review',
      'label', '提交审批',
      'condition', pg_catalog.jsonb_build_object('operator', 'always'),
      'priority', 10,
      'created_at', v_published_at,
      'updated_at', v_published_at
    ),
    pg_catalog.jsonb_build_object(
      'id', pg_catalog.gen_random_uuid(),
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'source_node_id', v_purchase_review_id,
      'source_node_key', 'purchase_review',
      'target_node_id', v_rejected_end_id,
      'target_node_key', 'rejected_end',
      'label', '采购驳回',
      'condition', pg_catalog.jsonb_build_object(
        'operator', 'eq',
        'field', 'decision',
        'value', 'rejected'
      ),
      'priority', 10,
      'created_at', v_published_at,
      'updated_at', v_published_at
    ),
    pg_catalog.jsonb_build_object(
      'id', pg_catalog.gen_random_uuid(),
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'source_node_id', v_purchase_review_id,
      'source_node_key', 'purchase_review',
      'target_node_id', v_approved_end_id,
      'target_node_key', 'approved_end',
      'label', '采购通过',
      'condition', pg_catalog.jsonb_build_object(
        'operator', 'neq',
        'field', 'budget_status',
        'value', 'over_budget'
      ),
      'priority', 20,
      'created_at', v_published_at,
      'updated_at', v_published_at
    ),
    pg_catalog.jsonb_build_object(
      'id', pg_catalog.gen_random_uuid(),
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'source_node_id', v_purchase_review_id,
      'source_node_key', 'purchase_review',
      'target_node_id', v_finance_review_id,
      'target_node_key', 'finance_review',
      'label', '超预算复核',
      'condition', pg_catalog.jsonb_build_object(
        'operator', 'eq',
        'field', 'budget_status',
        'value', 'over_budget'
      ),
      'priority', 30,
      'created_at', v_published_at,
      'updated_at', v_published_at
    ),
    pg_catalog.jsonb_build_object(
      'id', pg_catalog.gen_random_uuid(),
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'source_node_id', v_finance_review_id,
      'source_node_key', 'finance_review',
      'target_node_id', v_approved_end_id,
      'target_node_key', 'approved_end',
      'label', '财务通过',
      'condition', pg_catalog.jsonb_build_object(
        'operator', 'eq',
        'field', 'decision',
        'value', 'approved'
      ),
      'priority', 10,
      'created_at', v_published_at,
      'updated_at', v_published_at
    ),
    pg_catalog.jsonb_build_object(
      'id', pg_catalog.gen_random_uuid(),
      'tenant_id', p_tenant_id,
      'definition_id', v_definition.id,
      'source_node_id', v_finance_review_id,
      'source_node_key', 'finance_review',
      'target_node_id', v_rejected_end_id,
      'target_node_key', 'rejected_end',
      'label', '财务驳回',
      'condition', pg_catalog.jsonb_build_object(
        'operator', 'eq',
        'field', 'decision',
        'value', 'rejected'
      ),
      'priority', 20,
      'created_at', v_published_at,
      'updated_at', v_published_at
    )
  );

  IF v_created THEN
    INSERT INTO public.workflow_nodes (
      id,
      tenant_id,
      definition_id,
      node_key,
      node_type,
      business_kind,
      title,
      description,
      position,
      config,
      sort_order,
      created_at,
      updated_at
    )
    SELECT
      (node->>'id')::uuid,
      p_tenant_id,
      v_definition.id,
      node->>'node_key',
      node->>'node_type',
      node->>'business_kind',
      node->>'title',
      node->>'description',
      node->'position',
      node->'config',
      (node->>'sort_order')::integer,
      v_published_at,
      v_published_at
    FROM pg_catalog.jsonb_array_elements(v_nodes) AS node;

    INSERT INTO public.workflow_edges (
      id,
      tenant_id,
      definition_id,
      source_node_id,
      target_node_id,
      label,
      condition,
      priority,
      created_at,
      updated_at
    )
    SELECT
      (edge->>'id')::uuid,
      p_tenant_id,
      v_definition.id,
      (edge->>'source_node_id')::uuid,
      (edge->>'target_node_id')::uuid,
      edge->>'label',
      edge->'condition',
      (edge->>'priority')::integer,
      v_published_at,
      v_published_at
    FROM pg_catalog.jsonb_array_elements(v_edges) AS edge;
  END IF;

  v_snapshot := pg_catalog.jsonb_build_object(
    'definition_id', v_definition.id,
    'workflow_key', 'supplier_purchase_batch_approval',
    'subject_type', 'supplier_purchase_batch',
    'category', 'approval',
    'published_at', v_published_at,
    'version_number', v_version_number,
    'nodes', v_nodes,
    'edges', v_edges
  );

  INSERT INTO public.workflow_versions (
    id,
    tenant_id,
    definition_id,
    version_number,
    version_label,
    status,
    snapshot,
    validation_result,
    published_by,
    published_at,
    created_at
  )
  VALUES (
    v_version_id,
    p_tenant_id,
    v_definition.id,
    v_version_number,
    pg_catalog.format('采购批次审批 v%s', v_version_number),
    'published',
    v_snapshot,
    pg_catalog.jsonb_build_object(
      'valid', true,
      'issues', pg_catalog.jsonb_build_array(),
      'checked_at', v_published_at
    ),
    NULL,
    v_published_at,
    v_published_at
  );

  UPDATE public.workflow_definitions AS definition
  SET
    active_version_id = v_version_id,
    status = 'active'
  WHERE definition.id = v_definition.id
    AND definition.tenant_id = p_tenant_id;

  RETURN v_version_id;
END;
$$;

REVOKE ALL ON FUNCTION public.__gooes_ensure_supplier_purchase_batch_workflow_template(uuid)
FROM PUBLIC, anon, authenticated, service_role;

DO $seed_existing_tenants$
DECLARE
  setting record;
BEGIN
  FOR setting IN
    SELECT supplier_setting.tenant_id
    FROM public.tenant_supplier_settings AS supplier_setting
    WHERE supplier_setting.module_enabled
    ORDER BY supplier_setting.tenant_id
  LOOP
    PERFORM public.__gooes_ensure_supplier_purchase_batch_workflow_template(
      setting.tenant_id
    );
  END LOOP;
END;
$seed_existing_tenants$;

DO $preserve_tenant_initializer$
DECLARE
  v_private_oid oid := pg_catalog.to_regprocedure(
    'public.__gooes_initialize_default_decoration_tenant_20260830(uuid,text,text,uuid)'
  );
  v_public_oid oid := pg_catalog.to_regprocedure(
    'public.initialize_default_decoration_tenant(uuid,text,text,uuid)'
  );
  v_private_comment text;
  v_public_comment text;
  v_private_owner oid;
  v_public_owner oid;
  v_private_security_definer boolean;
  v_public_security_definer boolean;
  v_private_config text[];
  v_public_config text[];
  v_private_acl aclitem[];
  v_public_acl aclitem[];
  v_public_source text;
  v_expected_wrapper_source text := $expected_wrapper_source$
DECLARE
  v_initialization jsonb;
BEGIN
  v_initialization :=
    public.__gooes_initialize_default_decoration_tenant_20260830(
      p_tenant_id,
      p_admin_name,
      p_admin_phone,
      p_operator_employee_id
    );

  PERFORM public.__gooes_ensure_supplier_purchase_batch_workflow_template(
    p_tenant_id
  );

  RETURN v_initialization;
END;
$expected_wrapper_source$;
BEGIN
  IF v_private_oid IS NULL THEN
    IF v_public_oid IS NULL
      OR pg_catalog.obj_description(v_public_oid, 'pg_proc') =
        'gooes:20260830112000:tenant-initializer-wrapper:v1' THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'SUPPLIER_PURCHASE_BATCH_INITIALIZER_COLLISION';
    END IF;

    REVOKE ALL ON FUNCTION public.initialize_default_decoration_tenant(
      uuid,
      text,
      text,
      uuid
    ) FROM PUBLIC, anon, authenticated, service_role;

    ALTER FUNCTION public.initialize_default_decoration_tenant(
      uuid,
      text,
      text,
      uuid
    ) RENAME TO __gooes_initialize_default_decoration_tenant_20260830;

    COMMENT ON FUNCTION public.__gooes_initialize_default_decoration_tenant_20260830(
      uuid,
      text,
      text,
      uuid
    ) IS 'gooes:20260830112000:tenant-initializer-private:v1';
  ELSE
    IF v_public_oid IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'SUPPLIER_PURCHASE_BATCH_INITIALIZER_COLLISION';
    END IF;

    SELECT
      pg_catalog.obj_description(v_private_oid, 'pg_proc'),
      procedure.proowner,
      procedure.prosecdef,
      procedure.proconfig,
      procedure.proacl
    INTO
      v_private_comment,
      v_private_owner,
      v_private_security_definer,
      v_private_config,
      v_private_acl
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = v_private_oid;

    SELECT
      pg_catalog.obj_description(v_public_oid, 'pg_proc'),
      procedure.proowner,
      procedure.prosecdef,
      procedure.proconfig,
      procedure.proacl,
      procedure.prosrc
    INTO
      v_public_comment,
      v_public_owner,
      v_public_security_definer,
      v_public_config,
      v_public_acl,
      v_public_source
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid = v_public_oid;

    IF v_private_comment IS DISTINCT FROM
        'gooes:20260830112000:tenant-initializer-private:v1'
      OR v_public_comment IS DISTINCT FROM
        'gooes:20260830112000:tenant-initializer-wrapper:v1'
      OR v_private_owner IS DISTINCT FROM v_public_owner
      OR pg_catalog.pg_get_function_arguments(v_private_oid) IS DISTINCT FROM
        'p_tenant_id uuid, p_admin_name text, p_admin_phone text, p_operator_employee_id uuid DEFAULT NULL::uuid'
      OR pg_catalog.pg_get_function_arguments(v_public_oid) IS DISTINCT FROM
        'p_tenant_id uuid, p_admin_name text, p_admin_phone text, p_operator_employee_id uuid DEFAULT NULL::uuid'
      OR pg_catalog.pg_get_function_result(v_private_oid) IS DISTINCT FROM
        'jsonb'
      OR pg_catalog.pg_get_function_result(v_public_oid) IS DISTINCT FROM
        'jsonb'
      OR (
        SELECT language.lanname
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_language AS language
          ON language.oid = procedure.prolang
        WHERE procedure.oid = v_private_oid
      ) IS DISTINCT FROM 'plpgsql'
      OR (
        SELECT language.lanname
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_language AS language
          ON language.oid = procedure.prolang
        WHERE procedure.oid = v_public_oid
      ) IS DISTINCT FROM 'plpgsql'
      OR NOT v_private_security_definer
      OR NOT v_public_security_definer
      OR v_private_config IS DISTINCT FROM
        ARRAY['search_path=pg_catalog, public, auth']::text[]
      OR v_public_config IS DISTINCT FROM
        ARRAY['search_path=pg_catalog, public, auth']::text[]
      OR v_public_source IS DISTINCT FROM v_expected_wrapper_source
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(
            v_private_acl,
            pg_catalog.acldefault('f', v_private_owner)
          )
        ) AS privilege
        WHERE privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
      )
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(v_public_acl, pg_catalog.acldefault('f', v_public_owner))
        ) AS privilege
        WHERE privilege.grantee = 0
          AND privilege.privilege_type = 'EXECUTE'
      )
      OR pg_catalog.has_function_privilege(
        'anon', v_private_oid, 'EXECUTE'
      )
      OR pg_catalog.has_function_privilege(
        'authenticated', v_private_oid, 'EXECUTE'
      )
      OR pg_catalog.has_function_privilege(
        'service_role', v_private_oid, 'EXECUTE'
      )
      OR pg_catalog.has_function_privilege(
        'anon', v_public_oid, 'EXECUTE'
      )
      OR pg_catalog.has_function_privilege(
        'authenticated', v_public_oid, 'EXECUTE'
      )
      OR NOT pg_catalog.has_function_privilege(
        'service_role', v_public_oid, 'EXECUTE'
      ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'SUPPLIER_PURCHASE_BATCH_INITIALIZER_COLLISION';
    END IF;
  END IF;
END;
$preserve_tenant_initializer$;

REVOKE ALL ON FUNCTION public.__gooes_initialize_default_decoration_tenant_20260830(
  uuid,
  text,
  text,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.initialize_default_decoration_tenant(
  p_tenant_id uuid,
  p_admin_name text,
  p_admin_phone text,
  p_operator_employee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_initialization jsonb;
BEGIN
  v_initialization :=
    public.__gooes_initialize_default_decoration_tenant_20260830(
      p_tenant_id,
      p_admin_name,
      p_admin_phone,
      p_operator_employee_id
    );

  PERFORM public.__gooes_ensure_supplier_purchase_batch_workflow_template(
    p_tenant_id
  );

  RETURN v_initialization;
END;
$$;

DO $restore_tenant_initializer_owner$
DECLARE
  v_original_owner name;
BEGIN
  SELECT role.rolname
  INTO v_original_owner
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_roles AS role
    ON role.oid = procedure.proowner
  WHERE procedure.oid = pg_catalog.to_regprocedure(
    'public.__gooes_initialize_default_decoration_tenant_20260830(uuid,text,text,uuid)'
  );

  IF v_original_owner IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_INITIALIZER_COLLISION';
  END IF;

  EXECUTE pg_catalog.format(
    'ALTER FUNCTION public.initialize_default_decoration_tenant(uuid, text, text, uuid) OWNER TO %I',
    v_original_owner
  );
END;
$restore_tenant_initializer_owner$;

REVOKE ALL ON FUNCTION public.initialize_default_decoration_tenant(
  uuid,
  text,
  text,
  uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.initialize_default_decoration_tenant(
  uuid,
  text,
  text,
  uuid
) TO service_role;

COMMENT ON FUNCTION public.__gooes_ensure_supplier_purchase_batch_workflow_template(uuid)
IS 'Private idempotent seed for the tenant-scoped supplier purchase batch approval workflow. Existing published versions always win, and archived definitions are never reactivated.';

COMMENT ON FUNCTION public.__gooes_initialize_default_decoration_tenant_20260830(
  uuid,
  text,
  text,
  uuid
)
IS 'gooes:20260830112000:tenant-initializer-private:v1';

COMMENT ON FUNCTION public.initialize_default_decoration_tenant(
  uuid,
  text,
  text,
  uuid
)
IS 'gooes:20260830112000:tenant-initializer-wrapper:v1';

COMMIT;

-- Rollback: forward-fix only. A corrective migration must preserve every tenant
-- definition and published version, adjust only missing defaults, and never
-- delete or rewrite tenant-authored workflow history manually.
