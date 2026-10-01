-- Restore customer_main runtime state for the production candidates frozen by
-- audit run 36834292601. This migration is tenant-scoped, fail-closed, and
-- idempotent for its own source-tagged rows.
--
-- Rollback: restore the pre-migration database backup, or ship a dedicated
-- follow-up migration that reverses only rows carrying v_repair_source after
-- business approval. No existing runtime is modified by this migration.
DO $repair$
DECLARE
  v_tenant_id constant uuid := '3eebca47-961f-4899-b976-a3d3208d326b';
  v_created_before constant timestamptz := '2026-10-01T08:06:46.000Z';
  v_expected_count constant integer := 8;
  v_repair_source constant text := '20261001120000_backfill_qingtian_potential_customer_workflow';
  v_definition public.workflow_definitions%ROWTYPE;
  v_version public.workflow_versions%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_start_node jsonb;
  v_potential_node jsonb;
  v_following_node jsonb;
  v_start_edge jsonb;
  v_start_result jsonb;
  v_instance_id uuid;
  v_task_id uuid;
  v_definition_count integer;
  v_node_count integer;
  v_edge_count integer;
  v_candidate_count integer;
  v_repaired_count integer;
  v_pending_task_count integer;
  v_projection_count integer;
  v_remaining_count integer;
  v_affected_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants AS tenant
    WHERE tenant.id = v_tenant_id
  ) THEN
    RAISE NOTICE 'Target tenant is absent; customer workflow repair is a no-op.';
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_definition_count
  FROM public.workflow_definitions AS definition
  WHERE definition.tenant_id = v_tenant_id
    AND definition.workflow_key = 'customer_main'
    AND definition.status = 'active'
    AND definition.active_version_id IS NOT NULL;

  IF v_definition_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active customer_main definition, found %',
      v_definition_count;
  END IF;

  SELECT definition.*
  INTO v_definition
  FROM public.workflow_definitions AS definition
  WHERE definition.tenant_id = v_tenant_id
    AND definition.workflow_key = 'customer_main'
    AND definition.status = 'active'
    AND definition.active_version_id IS NOT NULL
  FOR UPDATE;

  SELECT version.*
  INTO v_version
  FROM public.workflow_versions AS version
  WHERE version.tenant_id = v_tenant_id
    AND version.definition_id = v_definition.id
    AND version.id = v_definition.active_version_id
    AND version.status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Published active customer_main version is missing.';
  END IF;

  SELECT count(*)::integer
  INTO v_node_count
  FROM jsonb_array_elements(COALESCE(v_version.snapshot->'nodes', '[]'::jsonb)) AS node
  WHERE node->>'node_key' = 'start'
    AND node->>'node_type' = 'start';
  IF v_node_count <> 1 THEN
    RAISE EXCEPTION 'customer_main must contain exactly one start node.';
  END IF;
  SELECT node
  INTO v_start_node
  FROM jsonb_array_elements(v_version.snapshot->'nodes') AS node
  WHERE node->>'node_key' = 'start'
    AND node->>'node_type' = 'start';

  SELECT count(*)::integer
  INTO v_node_count
  FROM jsonb_array_elements(COALESCE(v_version.snapshot->'nodes', '[]'::jsonb)) AS node
  WHERE node->>'node_key' = 'potential'
    AND node->>'node_type' <> 'end';
  IF v_node_count <> 1 THEN
    RAISE EXCEPTION 'customer_main must contain exactly one non-terminal potential node.';
  END IF;
  SELECT node
  INTO v_potential_node
  FROM jsonb_array_elements(v_version.snapshot->'nodes') AS node
  WHERE node->>'node_key' = 'potential'
    AND node->>'node_type' <> 'end';

  SELECT count(*)::integer
  INTO v_node_count
  FROM jsonb_array_elements(COALESCE(v_version.snapshot->'nodes', '[]'::jsonb)) AS node
  WHERE node->>'node_key' = 'following'
    AND node->>'node_type' <> 'end';
  IF v_node_count <> 1 THEN
    RAISE EXCEPTION 'customer_main must contain exactly one non-terminal following node.';
  END IF;
  SELECT node
  INTO v_following_node
  FROM jsonb_array_elements(v_version.snapshot->'nodes') AS node
  WHERE node->>'node_key' = 'following'
    AND node->>'node_type' <> 'end';

  SELECT edge
  INTO v_start_edge
  FROM jsonb_array_elements(COALESCE(v_version.snapshot->'edges', '[]'::jsonb)) AS edge
  WHERE edge->>'source_node_id' = v_start_node->>'id'
  ORDER BY COALESCE((edge->>'priority')::integer, 100), edge->>'created_at'
  LIMIT 1;

  IF v_start_edge IS NULL
    OR v_start_edge->>'target_node_id' <> v_potential_node->>'id' THEN
    RAISE EXCEPTION 'customer_main start node must enter potential.';
  END IF;

  SELECT count(*)::integer
  INTO v_edge_count
  FROM jsonb_array_elements(COALESCE(v_version.snapshot->'edges', '[]'::jsonb)) AS edge
  WHERE edge->>'source_node_id' = v_potential_node->>'id'
    AND edge->>'target_node_id' = v_following_node->>'id';
  IF v_edge_count < 1 THEN
    RAISE EXCEPTION 'customer_main potential node must advance to following.';
  END IF;

  PERFORM customer.id
  FROM public.customers AS customer
  WHERE customer.tenant_id = v_tenant_id
    AND customer.status = 'potential'
    AND customer.created_at <= v_created_before
    AND NOT EXISTS (
      SELECT 1
      FROM public.workflow_instances AS instance
      WHERE instance.tenant_id = customer.tenant_id
        AND instance.subject_type = 'customer'
        AND instance.subject_id = customer.id::text
    )
  ORDER BY customer.created_at, customer.id
  FOR UPDATE OF customer;

  SELECT count(*)::integer
  INTO v_candidate_count
  FROM public.customers AS customer
  WHERE customer.tenant_id = v_tenant_id
    AND customer.status = 'potential'
    AND customer.created_at <= v_created_before
    AND NOT EXISTS (
      SELECT 1
      FROM public.workflow_instances AS instance
      WHERE instance.tenant_id = customer.tenant_id
        AND instance.subject_type = 'customer'
        AND instance.subject_id = customer.id::text
    );

  SELECT count(*)::integer
  INTO v_repaired_count
  FROM public.workflow_instances AS instance
  WHERE instance.tenant_id = v_tenant_id
    AND instance.subject_type = 'customer'
    AND instance.context->>'source' = v_repair_source;

  IF v_candidate_count = 0 AND v_repaired_count = v_expected_count THEN
    RAISE NOTICE 'Customer workflow repair already applied; validating final state.';
  ELSIF v_candidate_count <> v_expected_count OR v_repaired_count <> 0 THEN
    RAISE EXCEPTION
      'Audit drift detected: expected % candidates and 0 repaired rows, found % candidates and % repaired rows',
      v_expected_count,
      v_candidate_count,
      v_repaired_count;
  ELSE
    FOR v_customer IN
      SELECT customer.*
      FROM public.customers AS customer
      WHERE customer.tenant_id = v_tenant_id
        AND customer.status = 'potential'
        AND customer.created_at <= v_created_before
        AND NOT EXISTS (
          SELECT 1
          FROM public.workflow_instances AS instance
          WHERE instance.tenant_id = customer.tenant_id
            AND instance.subject_type = 'customer'
            AND instance.subject_id = customer.id::text
        )
      ORDER BY customer.created_at, customer.id
      FOR UPDATE OF customer
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.workflow_instances AS instance
        WHERE instance.tenant_id = v_customer.tenant_id
          AND instance.subject_type = 'customer'
          AND instance.subject_id = v_customer.id::text
      ) THEN
        RAISE EXCEPTION 'Customer runtime appeared after audit candidate locking.';
      END IF;

      SELECT public.start_workflow_instance(
        v_tenant_id,
        v_definition.id,
        'customer',
        v_customer.id::text,
        jsonb_build_object(
          'source', v_repair_source,
          'audit_created_before', v_created_before,
          'legacy_status', v_customer.status,
          'owner_id', v_customer.owner_id
        ),
        v_customer.owner_id
      )
      INTO v_start_result;

      IF COALESCE((v_start_result->>'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'Failed to start audited customer workflow runtime: %',
          COALESCE(v_start_result->>'reason', 'unknown');
      END IF;
      IF v_start_result->'instance'->>'current_node_key' <> 'potential'
        OR v_start_result->'instance'->>'status' <> 'running' THEN
        RAISE EXCEPTION 'Started customer workflow runtime is not running at potential.';
      END IF;

      v_instance_id := (v_start_result->'instance'->>'id')::uuid;
      v_task_id := (v_start_result->'task'->>'id')::uuid;
      IF v_instance_id IS NULL OR v_task_id IS NULL THEN
        RAISE EXCEPTION 'Started customer workflow runtime did not return instance and task IDs.';
      END IF;

      UPDATE public.workflow_tasks AS task
      SET
        assignee_employee_id = v_customer.owner_id,
        updated_at = now()
      WHERE task.id = v_task_id
        AND task.tenant_id = v_tenant_id
        AND task.instance_id = v_instance_id
        AND task.node_key = 'potential'
        AND task.status = 'pending';
      GET DIAGNOSTICS v_affected_count = ROW_COUNT;
      IF v_affected_count <> 1 THEN
        RAISE EXCEPTION 'Expected one pending potential task for the repaired customer runtime.';
      END IF;

      INSERT INTO public.workflow_subject_states (
        tenant_id,
        subject_type,
        subject_id,
        definition_id,
        instance_id,
        instance_status,
        current_node_key,
        current_node_title,
        current_business_kind,
        pending_task_count
      )
      SELECT
        instance.tenant_id,
        instance.subject_type,
        instance.subject_id,
        instance.definition_id,
        instance.id,
        instance.status,
        instance.current_node_key,
        instance.current_node_snapshot->>'title',
        instance.current_node_snapshot->>'business_kind',
        (
          SELECT count(*)::integer
          FROM public.workflow_tasks AS task
          WHERE task.tenant_id = instance.tenant_id
            AND task.instance_id = instance.id
            AND task.status = 'pending'
        )
      FROM public.workflow_instances AS instance
      WHERE instance.id = v_instance_id
        AND instance.tenant_id = v_tenant_id
        AND instance.status = 'running'
        AND instance.current_node_key = 'potential'
      ON CONFLICT (tenant_id, subject_type, subject_id)
      DO UPDATE SET
        definition_id = EXCLUDED.definition_id,
        instance_id = EXCLUDED.instance_id,
        instance_status = EXCLUDED.instance_status,
        current_node_key = EXCLUDED.current_node_key,
        current_node_title = EXCLUDED.current_node_title,
        current_business_kind = EXCLUDED.current_business_kind,
        pending_task_count = EXCLUDED.pending_task_count,
        updated_at = now();
      GET DIAGNOSTICS v_affected_count = ROW_COUNT;
      IF v_affected_count <> 1 THEN
        RAISE EXCEPTION 'Expected one customer workflow subject projection.';
      END IF;
    END LOOP;
  END IF;

  SELECT count(*)::integer
  INTO v_repaired_count
  FROM public.workflow_instances AS instance
  WHERE instance.tenant_id = v_tenant_id
    AND instance.definition_id = v_definition.id
    AND instance.version_id = v_version.id
    AND instance.subject_type = 'customer'
    AND instance.status = 'running'
    AND instance.current_node_key = 'potential'
    AND instance.context->>'source' = v_repair_source;

  SELECT count(*)::integer
  INTO v_pending_task_count
  FROM public.workflow_instances AS instance
  JOIN public.customers AS customer
    ON customer.tenant_id = instance.tenant_id
   AND customer.id::text = instance.subject_id
  JOIN public.workflow_tasks AS task
    ON task.tenant_id = instance.tenant_id
   AND task.instance_id = instance.id
  WHERE instance.tenant_id = v_tenant_id
    AND instance.subject_type = 'customer'
    AND instance.context->>'source' = v_repair_source
    AND task.status = 'pending'
    AND task.node_key = 'potential'
    AND task.assignee_employee_id IS NOT DISTINCT FROM customer.owner_id;

  SELECT count(*)::integer
  INTO v_projection_count
  FROM public.workflow_instances AS instance
  JOIN public.workflow_subject_states AS state
    ON state.tenant_id = instance.tenant_id
   AND state.subject_type = instance.subject_type
   AND state.subject_id = instance.subject_id
   AND state.definition_id = instance.definition_id
   AND state.instance_id = instance.id
  WHERE instance.tenant_id = v_tenant_id
    AND instance.subject_type = 'customer'
    AND instance.context->>'source' = v_repair_source
    AND state.instance_status = 'running'
    AND state.current_node_key = 'potential'
    AND state.pending_task_count >= 1;

  SELECT count(*)::integer
  INTO v_remaining_count
  FROM public.customers AS customer
  WHERE customer.tenant_id = v_tenant_id
    AND customer.status = 'potential'
    AND customer.created_at <= v_created_before
    AND NOT EXISTS (
      SELECT 1
      FROM public.workflow_instances AS instance
      WHERE instance.tenant_id = customer.tenant_id
        AND instance.subject_type = 'customer'
        AND instance.subject_id = customer.id::text
    );

  IF v_repaired_count <> v_expected_count
    OR v_pending_task_count <> v_expected_count
    OR v_projection_count <> v_expected_count
    OR v_remaining_count <> 0 THEN
    RAISE EXCEPTION
      'Customer workflow repair verification failed: instances %, tasks %, projections %, remaining %',
      v_repaired_count,
      v_pending_task_count,
      v_projection_count,
      v_remaining_count;
  END IF;

  RAISE NOTICE 'Customer workflow repair verified for % audited candidates.',
    v_expected_count;
END
$repair$;
