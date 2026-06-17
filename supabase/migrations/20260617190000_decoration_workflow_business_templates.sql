CREATE OR REPLACE FUNCTION public.__gooes_decoration_workflow_template_nodes(
  p_template text
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT CASE p_template
    WHEN 'customer_main' THEN jsonb_build_array(
      jsonb_build_object(
        'node_key', 'start',
        'node_type', 'start',
        'business_kind', NULL,
        'title', '开始',
        'description', '客户进入主流程。',
        'position', '{"x":80,"y":180}'::jsonb,
        'config', '{"required_permissions":[]}'::jsonb,
        'sort_order', 10
      ),
      jsonb_build_object(
        'node_key', 'potential',
        'node_type', 'business',
        'business_kind', 'customer_lead',
        'title', '潜在客户',
        'description', '对应客户状态：潜在客户。',
        'position', '{"x":300,"y":180}'::jsonb,
        'config', '{"required_permissions":["customer.update"]}'::jsonb,
        'sort_order', 20
      ),
      jsonb_build_object(
        'node_key', 'following',
        'node_type', 'business',
        'business_kind', 'phone_follow_up',
        'title', '电话跟进',
        'description', '对应客户状态：跟进中。',
        'position', '{"x":520,"y":180}'::jsonb,
        'config', '{"required_permissions":["customer.update"]}'::jsonb,
        'sort_order', 30
      ),
      jsonb_build_object(
        'node_key', 'arrived',
        'node_type', 'business',
        'business_kind', 'store_visit',
        'title', '到店接待',
        'description', '对应客户状态：已到店。',
        'position', '{"x":740,"y":180}'::jsonb,
        'config', '{"required_permissions":["customer.update"]}'::jsonb,
        'sort_order', 40
      ),
      jsonb_build_object(
        'node_key', 'designing',
        'node_type', 'business',
        'business_kind', 'design',
        'title', '方案设计',
        'description', '对应客户状态：设计中。',
        'position', '{"x":960,"y":180}'::jsonb,
        'config', '{"required_permissions":["customer.update"]}'::jsonb,
        'sort_order', 50
      ),
      jsonb_build_object(
        'node_key', 'end',
        'node_type', 'end',
        'business_kind', NULL,
        'title', '结束',
        'description', '客户主流程完成。',
        'position', '{"x":1180,"y":180}'::jsonb,
        'config', '{"required_permissions":[]}'::jsonb,
        'sort_order', 60
      )
    )
    WHEN 'project_signing' THEN jsonb_build_array(
      jsonb_build_object(
        'node_key', 'start',
        'node_type', 'start',
        'business_kind', NULL,
        'title', '开始',
        'description', '项目进入签约主流程。',
        'position', '{"x":80,"y":220}'::jsonb,
        'config', '{"required_permissions":[]}'::jsonb,
        'sort_order', 10
      ),
      jsonb_build_object(
        'node_key', 'designing',
        'node_type', 'business',
        'business_kind', 'design',
        'title', '设计中',
        'description', '对应项目状态：设计中。',
        'position', '{"x":280,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"]}'::jsonb,
        'sort_order', 20
      ),
      jsonb_build_object(
        'node_key', 'proposal_confirmed',
        'node_type', 'business',
        'business_kind', 'design',
        'title', '方案已确认',
        'description', '对应项目状态：方案已确认。',
        'position', '{"x":500,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"]}'::jsonb,
        'sort_order', 30
      ),
      jsonb_build_object(
        'node_key', 'signed',
        'node_type', 'business',
        'business_kind', 'contract',
        'title', '项目签约',
        'description', '对应项目状态：已签约。',
        'position', '{"x":720,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"]}'::jsonb,
        'sort_order', 40
      ),
      jsonb_build_object(
        'node_key', 'design_finalized',
        'node_type', 'business',
        'business_kind', 'design',
        'title', '设计定稿',
        'description', '对应项目状态：设计定稿。',
        'position', '{"x":940,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"]}'::jsonb,
        'sort_order', 50
      ),
      jsonb_build_object(
        'node_key', 'pending_start',
        'node_type', 'business',
        'business_kind', 'construction_start',
        'title', '排期开工',
        'description', '对应项目状态：待开工。',
        'position', '{"x":1160,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"]}'::jsonb,
        'sort_order', 60
      ),
      jsonb_build_object(
        'node_key', 'end',
        'node_type', 'end',
        'business_kind', NULL,
        'title', '结束',
        'description', '项目签约主流程结束。',
        'position', '{"x":1380,"y":220}'::jsonb,
        'config', '{"required_permissions":[]}'::jsonb,
        'sort_order', 70
      )
    )
    WHEN 'construction_main' THEN jsonb_build_array(
      jsonb_build_object(
        'node_key', 'start',
        'node_type', 'start',
        'business_kind', NULL,
        'title', '开始',
        'description', '项目进入施工主流程。',
        'position', '{"x":80,"y":220}'::jsonb,
        'config', '{"required_permissions":[]}'::jsonb,
        'sort_order', 10
      ),
      jsonb_build_object(
        'node_key', 'started',
        'node_type', 'construction_stage',
        'business_kind', 'construction_start',
        'title', '确认开工',
        'description', '对应项目状态：已开工。',
        'position', '{"x":280,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"]}'::jsonb,
        'sort_order', 20
      ),
      jsonb_build_object(
        'node_key', 'procedure_demolition',
        'node_type', 'procedure',
        'business_kind', 'procedure_template',
        'title', '拆改',
        'description', '拆改工序完成后放行。',
        'position', '{"x":500,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"],"stage_key":"demolition","require_log":true,"min_image_count":1,"trigger_acceptance":false,"customer_visible":true}'::jsonb,
        'sort_order', 30
      ),
      jsonb_build_object(
        'node_key', 'procedure_plumbing_electrical',
        'node_type', 'procedure',
        'business_kind', 'procedure_template',
        'title', '水电',
        'description', '水电工序完成后放行。',
        'position', '{"x":720,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"],"stage_key":"plumbing_electrical","require_log":true,"min_image_count":1,"trigger_acceptance":false,"customer_visible":true}'::jsonb,
        'sort_order', 40
      ),
      jsonb_build_object(
        'node_key', 'payment_stage_2',
        'node_type', 'confirmation',
        'business_kind', 'payment_collection',
        'title', '中期收款',
        'description', '水电完成后确认中期款。',
        'position', '{"x":940,"y":220}'::jsonb,
        'config', '{"required_permissions":["finance.payment.confirm"],"finance_type":"payment_collection","payment_type":"stage_2","requirement_mode":"any_confirmed","required_percentage":null,"block_message":"请先确认项目收款后再推进流程","finance_reviewer_employee_id":null}'::jsonb,
        'sort_order', 50
      ),
      jsonb_build_object(
        'node_key', 'procedure_tiling',
        'node_type', 'procedure',
        'business_kind', 'procedure_template',
        'title', '瓦工',
        'description', '瓦工工序完成后放行。',
        'position', '{"x":1160,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"],"stage_key":"tiling","require_log":true,"min_image_count":1,"trigger_acceptance":false,"customer_visible":true}'::jsonb,
        'sort_order', 60
      ),
      jsonb_build_object(
        'node_key', 'procedure_woodwork',
        'node_type', 'procedure',
        'business_kind', 'procedure_template',
        'title', '木工',
        'description', '木工工序完成后放行。',
        'position', '{"x":1380,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"],"stage_key":"woodwork","require_log":true,"min_image_count":1,"trigger_acceptance":false,"customer_visible":true}'::jsonb,
        'sort_order', 70
      ),
      jsonb_build_object(
        'node_key', 'payment_stage_3',
        'node_type', 'confirmation',
        'business_kind', 'payment_collection',
        'title', '中期收款',
        'description', '木工完成后确认中期款。',
        'position', '{"x":1600,"y":220}'::jsonb,
        'config', '{"required_permissions":["finance.payment.confirm"],"finance_type":"payment_collection","payment_type":"stage_3","requirement_mode":"any_confirmed","required_percentage":null,"block_message":"请先确认项目收款后再推进流程","finance_reviewer_employee_id":null}'::jsonb,
        'sort_order', 80
      ),
      jsonb_build_object(
        'node_key', 'procedure_painting',
        'node_type', 'procedure',
        'business_kind', 'procedure_template',
        'title', '油工',
        'description', '油工工序完成后放行。',
        'position', '{"x":1820,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"],"stage_key":"painting","require_log":true,"min_image_count":1,"trigger_acceptance":false,"customer_visible":true}'::jsonb,
        'sort_order', 90
      ),
      jsonb_build_object(
        'node_key', 'procedure_installation',
        'node_type', 'procedure',
        'business_kind', 'procedure_template',
        'title', '安装',
        'description', '安装工序完成后放行。',
        'position', '{"x":2040,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"],"stage_key":"installation","require_log":true,"min_image_count":1,"trigger_acceptance":false,"customer_visible":true}'::jsonb,
        'sort_order', 100
      ),
      jsonb_build_object(
        'node_key', 'final_acceptance',
        'node_type', 'construction_stage',
        'business_kind', 'final_acceptance',
        'title', '竣工验收',
        'description', '对应项目状态：竣工验收。',
        'position', '{"x":2260,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"]}'::jsonb,
        'sort_order', 110
      ),
      jsonb_build_object(
        'node_key', 'handover',
        'node_type', 'confirmation',
        'business_kind', NULL,
        'title', '交房',
        'description', '竣工验收后完成交房确认。',
        'position', '{"x":2480,"y":220}'::jsonb,
        'config', '{"required_permissions":["project.update"]}'::jsonb,
        'sort_order', 120
      ),
      jsonb_build_object(
        'node_key', 'end',
        'node_type', 'end',
        'business_kind', NULL,
        'title', '结束',
        'description', '项目施工主流程结束。',
        'position', '{"x":2700,"y":220}'::jsonb,
        'config', '{"required_permissions":[]}'::jsonb,
        'sort_order', 130
      )
    )
    ELSE '[]'::jsonb
  END;
$$;

CREATE OR REPLACE FUNCTION public.__gooes_decoration_workflow_template_edges(
  p_template text
)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT CASE p_template
    WHEN 'customer_main' THEN jsonb_build_array(
      jsonb_build_object('source_node_key', 'start', 'target_node_key', 'potential', 'label', '登记客户', 'condition', '{"operator":"always"}'::jsonb, 'priority', 10),
      jsonb_build_object('source_node_key', 'potential', 'target_node_key', 'following', 'label', '开始跟进', 'condition', '{"operator":"always"}'::jsonb, 'priority', 20),
      jsonb_build_object('source_node_key', 'following', 'target_node_key', 'arrived', 'label', '标记到店', 'condition', '{"operator":"always"}'::jsonb, 'priority', 30),
      jsonb_build_object('source_node_key', 'arrived', 'target_node_key', 'designing', 'label', '开始设计', 'condition', '{"operator":"always"}'::jsonb, 'priority', 40),
      jsonb_build_object('source_node_key', 'designing', 'target_node_key', 'end', 'label', '设计完成', 'condition', '{"operator":"always"}'::jsonb, 'priority', 50)
    )
    WHEN 'project_signing' THEN jsonb_build_array(
      jsonb_build_object('source_node_key', 'start', 'target_node_key', 'designing', 'label', '进入设计', 'condition', '{"operator":"always"}'::jsonb, 'priority', 10),
      jsonb_build_object('source_node_key', 'designing', 'target_node_key', 'proposal_confirmed', 'label', '方案确认', 'condition', '{"operator":"always"}'::jsonb, 'priority', 20),
      jsonb_build_object('source_node_key', 'proposal_confirmed', 'target_node_key', 'signed', 'label', '项目签约', 'condition', '{"operator":"always"}'::jsonb, 'priority', 30),
      jsonb_build_object('source_node_key', 'signed', 'target_node_key', 'design_finalized', 'label', '设计定稿', 'condition', '{"operator":"always"}'::jsonb, 'priority', 40),
      jsonb_build_object('source_node_key', 'design_finalized', 'target_node_key', 'pending_start', 'label', '排期开工', 'condition', '{"operator":"always"}'::jsonb, 'priority', 50),
      jsonb_build_object('source_node_key', 'pending_start', 'target_node_key', 'end', 'label', '流程完成', 'condition', '{"operator":"always"}'::jsonb, 'priority', 60)
    )
    WHEN 'construction_main' THEN jsonb_build_array(
      jsonb_build_object('source_node_key', 'start', 'target_node_key', 'started', 'label', '确认开工', 'condition', '{"operator":"always"}'::jsonb, 'priority', 10),
      jsonb_build_object('source_node_key', 'started', 'target_node_key', 'procedure_demolition', 'label', '拆改', 'condition', '{"operator":"always"}'::jsonb, 'priority', 20),
      jsonb_build_object('source_node_key', 'procedure_demolition', 'target_node_key', 'procedure_plumbing_electrical', 'label', '水电', 'condition', '{"operator":"always"}'::jsonb, 'priority', 30),
      jsonb_build_object('source_node_key', 'procedure_plumbing_electrical', 'target_node_key', 'payment_stage_2', 'label', '中期收款', 'condition', '{"operator":"always"}'::jsonb, 'priority', 40),
      jsonb_build_object('source_node_key', 'payment_stage_2', 'target_node_key', 'procedure_tiling', 'label', '瓦工', 'condition', '{"operator":"always"}'::jsonb, 'priority', 50),
      jsonb_build_object('source_node_key', 'procedure_tiling', 'target_node_key', 'procedure_woodwork', 'label', '木工', 'condition', '{"operator":"always"}'::jsonb, 'priority', 60),
      jsonb_build_object('source_node_key', 'procedure_woodwork', 'target_node_key', 'payment_stage_3', 'label', '中期收款', 'condition', '{"operator":"always"}'::jsonb, 'priority', 70),
      jsonb_build_object('source_node_key', 'payment_stage_3', 'target_node_key', 'procedure_painting', 'label', '油工', 'condition', '{"operator":"always"}'::jsonb, 'priority', 80),
      jsonb_build_object('source_node_key', 'procedure_painting', 'target_node_key', 'procedure_installation', 'label', '安装', 'condition', '{"operator":"always"}'::jsonb, 'priority', 90),
      jsonb_build_object('source_node_key', 'procedure_installation', 'target_node_key', 'final_acceptance', 'label', '竣工验收', 'condition', '{"operator":"always"}'::jsonb, 'priority', 100),
      jsonb_build_object('source_node_key', 'final_acceptance', 'target_node_key', 'handover', 'label', '交房', 'condition', '{"operator":"always"}'::jsonb, 'priority', 110),
      jsonb_build_object('source_node_key', 'handover', 'target_node_key', 'end', 'label', '流程完成', 'condition', '{"operator":"always"}'::jsonb, 'priority', 120)
    )
    ELSE '[]'::jsonb
  END;
$$;

DO $$
DECLARE
  tenant_record record;
  definition_record record;
  v_definition_id uuid;
  v_graph jsonb;
  v_publish jsonb;
  v_snapshot jsonb;
  v_should_publish boolean;
  v_expected_updated_at timestamptz;
BEGIN
  FOR tenant_record IN
    SELECT DISTINCT tenant_id
    FROM public.workflow_definitions
    WHERE status = 'active'
      AND workflow_key IN (
        'customer_main',
        'project_main',
        'project_signing',
        'construction_main'
      )
  LOOP
    SELECT id
    INTO v_definition_id
    FROM public.workflow_definitions
    WHERE tenant_id = tenant_record.tenant_id
      AND workflow_key = 'project_signing'
    LIMIT 1;

    v_should_publish := v_definition_id IS NULL;
    IF NOT v_should_publish THEN
      SELECT
        definition.status <> 'active'
        OR definition.active_version_id IS NULL
      INTO v_should_publish
      FROM public.workflow_definitions definition
      WHERE definition.id = v_definition_id
        AND definition.tenant_id = tenant_record.tenant_id;
    END IF;

    IF v_definition_id IS NULL THEN
      INSERT INTO public.workflow_definitions (
        tenant_id,
        workflow_key,
        name,
        description,
        category,
        status
      )
      VALUES (
        tenant_record.tenant_id,
        'project_signing',
        '项目签约主流程',
        '项目从设计、方案确认、签约、设计定稿到排期开工的标准主流程模板。',
        'construction',
        'draft'
      )
      RETURNING id
      INTO v_definition_id;
    ELSIF v_should_publish THEN
      UPDATE public.workflow_definitions
      SET
        name = '项目签约主流程',
        description = '项目从设计、方案确认、签约、设计定稿到排期开工的标准主流程模板。',
        category = 'construction'
      WHERE tenant_id = tenant_record.tenant_id
        AND id = v_definition_id;
    END IF;

    IF v_should_publish THEN
      DROP TABLE IF EXISTS pg_temp.tmp_workflow_draft_nodes;

      v_graph := public.replace_workflow_draft_graph(
        tenant_record.tenant_id,
        v_definition_id,
        public.__gooes_decoration_workflow_template_nodes('project_signing'),
        public.__gooes_decoration_workflow_template_edges('project_signing')
      );

      IF v_graph->>'ok' <> 'true' THEN
        RAISE EXCEPTION 'replace project_signing graph failed for tenant %: %',
          tenant_record.tenant_id,
          v_graph;
      END IF;

      SELECT updated_at
      INTO v_expected_updated_at
      FROM public.workflow_definitions
      WHERE tenant_id = tenant_record.tenant_id
        AND id = v_definition_id;

      v_snapshot := jsonb_build_object(
        'definition_id', v_definition_id::text,
        'workflow_key', 'project_signing',
        'category', 'construction',
        'published_at', now(),
        'nodes', v_graph->'nodes',
        'edges', v_graph->'edges'
      );

      v_publish := public.publish_workflow_definition(
        p_tenant_id => tenant_record.tenant_id,
        p_definition_id => v_definition_id,
        p_snapshot => v_snapshot,
        p_validation_result => jsonb_build_object(
          'valid', true,
          'issues', '[]'::jsonb,
          'checked_at', now()
        ),
        p_published_by => NULL,
        p_updated_by => NULL,
        p_expected_updated_at => v_expected_updated_at
      );

      IF v_publish->>'ok' <> 'true' THEN
        RAISE EXCEPTION 'publish project_signing failed for tenant %: %',
          tenant_record.tenant_id,
          v_publish;
      END IF;
    END IF;

    SELECT id
    INTO v_definition_id
    FROM public.workflow_definitions
    WHERE tenant_id = tenant_record.tenant_id
      AND workflow_key = 'construction_main'
    LIMIT 1;

    v_should_publish := v_definition_id IS NULL;
    IF NOT v_should_publish THEN
      SELECT
        definition.status <> 'active'
        OR definition.active_version_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.workflow_versions version,
            jsonb_array_elements(
              COALESCE(version.snapshot->'nodes', '[]'::jsonb)
            ) AS node
          WHERE version.id = definition.active_version_id
            AND (
              node->>'node_key' IN (
                'designing',
                'proposal_confirmed',
                'signed',
                'design_finalized',
                'pending_start',
                'on_hold',
                'invalid'
              )
              OR node->>'business_kind' = 'contract'
            )
        )
      INTO v_should_publish
      FROM public.workflow_definitions definition
      WHERE definition.id = v_definition_id
        AND definition.tenant_id = tenant_record.tenant_id;
    END IF;

    IF v_definition_id IS NULL THEN
      INSERT INTO public.workflow_definitions (
        tenant_id,
        workflow_key,
        name,
        description,
        category,
        status
      )
      VALUES (
        tenant_record.tenant_id,
        'construction_main',
        '项目施工主流程',
        '项目从确认开工、工序施工、中期收款、竣工验收到交房的标准主流程模板。',
        'construction',
        'draft'
      )
      RETURNING id
      INTO v_definition_id;
    ELSIF v_should_publish THEN
      UPDATE public.workflow_definitions
      SET
        name = '项目施工主流程',
        description = '项目从确认开工、工序施工、中期收款、竣工验收到交房的标准主流程模板。',
        category = 'construction'
      WHERE tenant_id = tenant_record.tenant_id
        AND id = v_definition_id;
    END IF;

    IF v_should_publish THEN
      DROP TABLE IF EXISTS pg_temp.tmp_workflow_draft_nodes;

      v_graph := public.replace_workflow_draft_graph(
        tenant_record.tenant_id,
        v_definition_id,
        public.__gooes_decoration_workflow_template_nodes('construction_main'),
        public.__gooes_decoration_workflow_template_edges('construction_main')
      );

      IF v_graph->>'ok' <> 'true' THEN
        RAISE EXCEPTION 'replace construction_main graph failed for tenant %: %',
          tenant_record.tenant_id,
          v_graph;
      END IF;

      SELECT updated_at
      INTO v_expected_updated_at
      FROM public.workflow_definitions
      WHERE tenant_id = tenant_record.tenant_id
        AND id = v_definition_id;

      v_snapshot := jsonb_build_object(
        'definition_id', v_definition_id::text,
        'workflow_key', 'construction_main',
        'category', 'construction',
        'published_at', now(),
        'nodes', v_graph->'nodes',
        'edges', v_graph->'edges'
      );

      v_publish := public.publish_workflow_definition(
        p_tenant_id => tenant_record.tenant_id,
        p_definition_id => v_definition_id,
        p_snapshot => v_snapshot,
        p_validation_result => jsonb_build_object(
          'valid', true,
          'issues', '[]'::jsonb,
          'checked_at', now()
        ),
        p_published_by => NULL,
        p_updated_by => NULL,
        p_expected_updated_at => v_expected_updated_at
      );

      IF v_publish->>'ok' <> 'true' THEN
        RAISE EXCEPTION 'publish construction_main failed for tenant %: %',
          tenant_record.tenant_id,
          v_publish;
      END IF;
    END IF;
  END LOOP;

  FOR definition_record IN
    SELECT definition.id, definition.tenant_id
    FROM public.workflow_definitions definition
    JOIN public.workflow_versions version
      ON version.id = definition.active_version_id
    WHERE definition.workflow_key = 'customer_main'
      AND definition.status = 'active'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(version.snapshot->'nodes', '[]'::jsonb)
        ) AS node
        WHERE node->>'node_key' = 'signed'
           OR node->>'business_kind' = 'contract'
      )
  LOOP
    UPDATE public.workflow_definitions
    SET
      name = '客户主流程',
      description = '客户从线索、跟进、到店到设计的标准主流程模板。',
      category = 'sales'
    WHERE tenant_id = definition_record.tenant_id
      AND id = definition_record.id;

    DROP TABLE IF EXISTS pg_temp.tmp_workflow_draft_nodes;

    v_graph := public.replace_workflow_draft_graph(
      definition_record.tenant_id,
      definition_record.id,
      public.__gooes_decoration_workflow_template_nodes('customer_main'),
      public.__gooes_decoration_workflow_template_edges('customer_main')
    );

    IF v_graph->>'ok' <> 'true' THEN
      RAISE EXCEPTION 'replace customer_main graph failed for definition %: %',
        definition_record.id,
        v_graph;
    END IF;

    SELECT updated_at
    INTO v_expected_updated_at
    FROM public.workflow_definitions
    WHERE tenant_id = definition_record.tenant_id
      AND id = definition_record.id;

    v_snapshot := jsonb_build_object(
      'definition_id', definition_record.id::text,
      'workflow_key', 'customer_main',
      'category', 'sales',
      'published_at', now(),
      'nodes', v_graph->'nodes',
      'edges', v_graph->'edges'
    );

    v_publish := public.publish_workflow_definition(
      p_tenant_id => definition_record.tenant_id,
      p_definition_id => definition_record.id,
      p_snapshot => v_snapshot,
      p_validation_result => jsonb_build_object(
        'valid', true,
        'issues', '[]'::jsonb,
        'checked_at', now()
      ),
      p_published_by => NULL,
      p_updated_by => NULL,
      p_expected_updated_at => v_expected_updated_at
    );

    IF v_publish->>'ok' <> 'true' THEN
      RAISE EXCEPTION 'publish customer_main failed for definition %: %',
        definition_record.id,
        v_publish;
    END IF;
  END LOOP;
END;
$$;

DROP FUNCTION public.__gooes_decoration_workflow_template_edges(text);
DROP FUNCTION public.__gooes_decoration_workflow_template_nodes(text);
