CREATE OR REPLACE FUNCTION public.replace_workflow_draft_graph(
  p_tenant_id uuid,
  p_definition_id uuid,
  p_nodes jsonb,
  p_edges jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_definition_exists boolean;
  v_nodes jsonb := COALESCE(p_nodes, '[]'::jsonb);
  v_edges jsonb := COALESCE(p_edges, '[]'::jsonb);
  v_inserted_nodes jsonb;
  v_inserted_edges jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.workflow_definitions
    WHERE id = p_definition_id
      AND tenant_id = p_tenant_id
  )
  INTO v_definition_exists;

  IF NOT v_definition_exists THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'definition_not_found'
    );
  END IF;

  CREATE TEMP TABLE tmp_workflow_draft_nodes (
    id uuid NOT NULL,
    node_key text NOT NULL
  ) ON COMMIT DROP;

  DELETE FROM public.workflow_edges
  WHERE tenant_id = p_tenant_id
    AND definition_id = p_definition_id;

  DELETE FROM public.workflow_nodes
  WHERE tenant_id = p_tenant_id
    AND definition_id = p_definition_id;

  WITH input_nodes AS (
    SELECT
      COALESCE(row.id, gen_random_uuid()) AS id,
      row.node_key,
      row.node_type,
      row.business_kind,
      row.title,
      row.description,
      COALESCE(row.position, '{"x":0,"y":0}'::jsonb) AS position,
      COALESCE(row.config, '{}'::jsonb) AS config,
      COALESCE(row.sort_order, 100) AS sort_order
    FROM jsonb_to_recordset(v_nodes) AS row(
      id uuid,
      node_key text,
      node_type text,
      business_kind text,
      title text,
      description text,
      position jsonb,
      config jsonb,
      sort_order integer
    )
  ),
  inserted_nodes AS (
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
      sort_order
    )
    SELECT
      id,
      p_tenant_id,
      p_definition_id,
      node_key,
      node_type,
      business_kind,
      title,
      description,
      position,
      config,
      sort_order
    FROM input_nodes
    RETURNING *
  )
  SELECT COALESCE(
    jsonb_agg(to_jsonb(inserted_nodes) ORDER BY sort_order, created_at),
    '[]'::jsonb
  )
  INTO v_inserted_nodes
  FROM inserted_nodes
  ;

  INSERT INTO tmp_workflow_draft_nodes (id, node_key)
  SELECT id, node_key
  FROM public.workflow_nodes
  WHERE tenant_id = p_tenant_id
    AND definition_id = p_definition_id;

  WITH input_edges AS (
    SELECT
      COALESCE(row.id, gen_random_uuid()) AS id,
      row.source_node_key,
      row.target_node_key,
      row.label,
      COALESCE(row.condition, '{"operator":"always"}'::jsonb) AS condition,
      COALESCE(row.priority, 100) AS priority
    FROM jsonb_to_recordset(v_edges) AS row(
      id uuid,
      source_node_key text,
      target_node_key text,
      label text,
      condition jsonb,
      priority integer
    )
  ),
  inserted_edges AS (
    INSERT INTO public.workflow_edges (
      id,
      tenant_id,
      definition_id,
      source_node_id,
      target_node_id,
      label,
      condition,
      priority
    )
    SELECT
      edge.id,
      p_tenant_id,
      p_definition_id,
      (
        SELECT node.id
        FROM tmp_workflow_draft_nodes node
        WHERE node.node_key = edge.source_node_key
      ),
      (
        SELECT node.id
        FROM tmp_workflow_draft_nodes node
        WHERE node.node_key = edge.target_node_key
      ),
      edge.label,
      edge.condition,
      edge.priority
    FROM input_edges edge
    RETURNING *
  )
  SELECT COALESCE(
    jsonb_agg(to_jsonb(inserted_edges) ORDER BY priority, created_at),
    '[]'::jsonb
  )
  INTO v_inserted_edges
  FROM inserted_edges
  ;

  RETURN jsonb_build_object(
    'ok', true,
    'nodes', COALESCE(v_inserted_nodes, '[]'::jsonb),
    'edges', COALESCE(v_inserted_edges, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.replace_workflow_draft_graph(uuid, uuid, jsonb, jsonb)
IS 'Atomically replaces a tenant workflow draft graph and returns inserted nodes/edges.';
