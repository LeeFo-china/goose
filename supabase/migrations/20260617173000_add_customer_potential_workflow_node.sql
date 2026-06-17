DO $$
DECLARE
  definition_record record;
  v_start_node_id uuid;
  v_following_node_id uuid;
  v_potential_node_id uuid;
  v_next_version_number integer;
  v_nodes jsonb;
  v_edges jsonb;
  v_new_snapshot jsonb;
  v_new_version_id uuid;
BEGIN
  FOR definition_record IN
    SELECT
      definition.id AS definition_id,
      definition.tenant_id,
      definition.active_version_id,
      version.snapshot,
      version.validation_result,
      version.published_by
    FROM public.workflow_definitions definition
    JOIN public.workflow_versions version
      ON version.id = definition.active_version_id
     AND version.definition_id = definition.id
     AND version.tenant_id = definition.tenant_id
    WHERE definition.workflow_key = 'customer_main'
      AND definition.active_version_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(version.snapshot->'nodes', '[]'::jsonb)) AS node
        WHERE node->>'node_key' = 'following'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(version.snapshot->'nodes', '[]'::jsonb)) AS node
        WHERE node->>'node_key' = 'potential'
      )
  LOOP
    SELECT (node->>'id')::uuid
    INTO v_start_node_id
    FROM jsonb_array_elements(COALESCE(definition_record.snapshot->'nodes', '[]'::jsonb)) AS node
    WHERE node->>'node_key' = 'start'
    LIMIT 1;

    SELECT (node->>'id')::uuid
    INTO v_following_node_id
    FROM jsonb_array_elements(COALESCE(definition_record.snapshot->'nodes', '[]'::jsonb)) AS node
    WHERE node->>'node_key' = 'following'
    LIMIT 1;

    IF v_start_node_id IS NULL OR v_following_node_id IS NULL THEN
      CONTINUE;
    END IF;

    v_potential_node_id := gen_random_uuid();

    WITH patched_nodes AS (
      SELECT
        CASE node->>'node_key'
          WHEN 'following' THEN jsonb_set(
            jsonb_set(node, '{position}', '{"x":520,"y":180}'::jsonb, true),
            '{sort_order}',
            '30'::jsonb,
            true
          )
          WHEN 'arrived' THEN jsonb_set(
            jsonb_set(node, '{position}', '{"x":740,"y":180}'::jsonb, true),
            '{sort_order}',
            '40'::jsonb,
            true
          )
          WHEN 'designing' THEN jsonb_set(
            jsonb_set(node, '{position}', '{"x":960,"y":180}'::jsonb, true),
            '{sort_order}',
            '50'::jsonb,
            true
          )
          WHEN 'signed' THEN jsonb_set(
            jsonb_set(node, '{position}', '{"x":1180,"y":180}'::jsonb, true),
            '{sort_order}',
            '60'::jsonb,
            true
          )
          WHEN 'end' THEN jsonb_set(
            jsonb_set(node, '{position}', '{"x":1400,"y":180}'::jsonb, true),
            '{sort_order}',
            '70'::jsonb,
            true
          )
          ELSE node
        END AS node
      FROM jsonb_array_elements(COALESCE(definition_record.snapshot->'nodes', '[]'::jsonb)) AS node
      UNION ALL
      SELECT jsonb_build_object(
        'id', v_potential_node_id::text,
        'tenant_id', definition_record.tenant_id::text,
        'definition_id', definition_record.definition_id::text,
        'node_key', 'potential',
        'node_type', 'business',
        'business_kind', 'customer_lead',
        'title', '潜在客户',
        'description', '对应客户状态：潜在客户。',
        'position', '{"x":300,"y":180}'::jsonb,
        'config', '{"required_permissions":["customer.update"]}'::jsonb,
        'sort_order', 20,
        'created_at', now(),
        'updated_at', now()
      )
    )
    SELECT COALESCE(
      jsonb_agg(
        node
        ORDER BY COALESCE((node->>'sort_order')::integer, 100), node->>'created_at'
      ),
      '[]'::jsonb
    )
    INTO v_nodes
    FROM patched_nodes;

    WITH patched_edges AS (
      SELECT edge
      FROM jsonb_array_elements(COALESCE(definition_record.snapshot->'edges', '[]'::jsonb)) AS edge
      WHERE NOT (
        edge->>'source_node_id' = v_start_node_id::text
        AND edge->>'target_node_id' = v_following_node_id::text
      )
      UNION ALL
      SELECT jsonb_build_object(
        'id', gen_random_uuid()::text,
        'tenant_id', definition_record.tenant_id::text,
        'definition_id', definition_record.definition_id::text,
        'source_node_id', v_start_node_id::text,
        'target_node_id', v_potential_node_id::text,
        'label', '登记客户',
        'condition', '{"operator":"always"}'::jsonb,
        'priority', 10,
        'created_at', now(),
        'updated_at', now()
      )
      UNION ALL
      SELECT jsonb_build_object(
        'id', gen_random_uuid()::text,
        'tenant_id', definition_record.tenant_id::text,
        'definition_id', definition_record.definition_id::text,
        'source_node_id', v_potential_node_id::text,
        'target_node_id', v_following_node_id::text,
        'label', '开始跟进',
        'condition', '{"operator":"always"}'::jsonb,
        'priority', 20,
        'created_at', now(),
        'updated_at', now()
      )
    )
    SELECT COALESCE(
      jsonb_agg(
        edge
        ORDER BY COALESCE((edge->>'priority')::integer, 100), edge->>'created_at'
      ),
      '[]'::jsonb
    )
    INTO v_edges
    FROM patched_edges;

    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_version_number
    FROM public.workflow_versions
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.definition_id;

    v_new_snapshot := jsonb_set(
      jsonb_set(
        jsonb_set(definition_record.snapshot, '{nodes}', v_nodes, true),
        '{edges}',
        v_edges,
        true
      ),
      '{version_number}',
      to_jsonb(v_next_version_number),
      true
    );

    INSERT INTO public.workflow_versions (
      tenant_id,
      definition_id,
      version_number,
      status,
      snapshot,
      validation_result,
      published_by
    )
    VALUES (
      definition_record.tenant_id,
      definition_record.definition_id,
      v_next_version_number,
      'published',
      v_new_snapshot,
      COALESCE(definition_record.validation_result, '{}'::jsonb),
      definition_record.published_by
    )
    RETURNING id
    INTO v_new_version_id;

    UPDATE public.workflow_definitions
    SET active_version_id = v_new_version_id
    WHERE id = definition_record.definition_id
      AND tenant_id = definition_record.tenant_id;
  END LOOP;
END;
$$;

DO $$
DECLARE
  definition_record record;
  v_start_node_id uuid;
  v_following_node_id uuid;
  v_potential_node_id uuid;
BEGIN
  FOR definition_record IN
    SELECT id AS definition_id, tenant_id
    FROM public.workflow_definitions definition
    WHERE definition.workflow_key = 'customer_main'
  LOOP
    SELECT id
    INTO v_start_node_id
    FROM public.workflow_nodes
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.definition_id
      AND node_key = 'start'
    LIMIT 1;

    SELECT id
    INTO v_following_node_id
    FROM public.workflow_nodes
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.definition_id
      AND node_key = 'following'
    LIMIT 1;

    IF v_start_node_id IS NULL OR v_following_node_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id
    INTO v_potential_node_id
    FROM public.workflow_nodes
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.definition_id
      AND node_key = 'potential'
    LIMIT 1;

    IF v_potential_node_id IS NULL THEN
      INSERT INTO public.workflow_nodes (
        tenant_id,
        definition_id,
        node_key,
        node_type,
        business_kind,
        title,
        description,
        position,
        config,
        sort_order
      )
      VALUES (
        definition_record.tenant_id,
        definition_record.definition_id,
        'potential',
        'business',
        'customer_lead',
        '潜在客户',
        '对应客户状态：潜在客户。',
        '{"x":300,"y":180}'::jsonb,
        '{"required_permissions":["customer.update"]}'::jsonb,
        20
      )
      RETURNING id
      INTO v_potential_node_id;
    END IF;

    UPDATE public.workflow_nodes
    SET
      position = CASE node_key
        WHEN 'potential' THEN '{"x":300,"y":180}'::jsonb
        WHEN 'following' THEN '{"x":520,"y":180}'::jsonb
        WHEN 'arrived' THEN '{"x":740,"y":180}'::jsonb
        WHEN 'designing' THEN '{"x":960,"y":180}'::jsonb
        WHEN 'signed' THEN '{"x":1180,"y":180}'::jsonb
        WHEN 'end' THEN '{"x":1400,"y":180}'::jsonb
        ELSE position
      END,
      sort_order = CASE node_key
        WHEN 'potential' THEN 20
        WHEN 'following' THEN 30
        WHEN 'arrived' THEN 40
        WHEN 'designing' THEN 50
        WHEN 'signed' THEN 60
        WHEN 'end' THEN 70
        ELSE sort_order
      END
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.definition_id
      AND node_key IN ('potential', 'following', 'arrived', 'designing', 'signed', 'end');

    DELETE FROM public.workflow_edges
    WHERE tenant_id = definition_record.tenant_id
      AND definition_id = definition_record.definition_id
      AND source_node_id = v_start_node_id
      AND target_node_id = v_following_node_id;

    INSERT INTO public.workflow_edges (
      tenant_id,
      definition_id,
      source_node_id,
      target_node_id,
      label,
      condition,
      priority
    )
    SELECT
      definition_record.tenant_id,
      definition_record.definition_id,
      v_start_node_id,
      v_potential_node_id,
      '登记客户',
      '{"operator":"always"}'::jsonb,
      10
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workflow_edges
      WHERE tenant_id = definition_record.tenant_id
        AND definition_id = definition_record.definition_id
        AND source_node_id = v_start_node_id
        AND target_node_id = v_potential_node_id
    );

    INSERT INTO public.workflow_edges (
      tenant_id,
      definition_id,
      source_node_id,
      target_node_id,
      label,
      condition,
      priority
    )
    SELECT
      definition_record.tenant_id,
      definition_record.definition_id,
      v_potential_node_id,
      v_following_node_id,
      '开始跟进',
      '{"operator":"always"}'::jsonb,
      20
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workflow_edges
      WHERE tenant_id = definition_record.tenant_id
        AND definition_id = definition_record.definition_id
        AND source_node_id = v_potential_node_id
        AND target_node_id = v_following_node_id
    );
  END LOOP;
END;
$$;
