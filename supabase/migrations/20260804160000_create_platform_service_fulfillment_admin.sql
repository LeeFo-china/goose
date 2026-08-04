-- Platform service fulfillment admin phase.
-- Rollback: disable the Admin route first, resolve in-flight submitted
-- acceptance preparations and approved refund reviews, then drop the RPCs,
-- policies, fulfillment tables, indexes, and additive version/assignment
-- columns only after confirming no API code depends on them.

ALTER TABLE public.tenant_service_work_orders
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NULL;

ALTER TABLE public.tenant_service_work_orders
  DROP CONSTRAINT IF EXISTS tenant_service_work_orders_version_check;

ALTER TABLE public.tenant_service_work_orders
  ADD CONSTRAINT tenant_service_work_orders_version_check
  CHECK (version > 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_service_work_orders_identity_key'
      AND conrelid = 'public.tenant_service_work_orders'::regclass
  ) THEN
    ALTER TABLE public.tenant_service_work_orders
      ADD CONSTRAINT tenant_service_work_orders_identity_key
      UNIQUE (id, tenant_id);
  END IF;
END $$;

ALTER TABLE public.tenant_service_refund_requests
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.tenant_service_refund_requests
  DROP CONSTRAINT IF EXISTS tenant_service_refund_requests_version_check;

ALTER TABLE public.tenant_service_refund_requests
  ADD CONSTRAINT tenant_service_refund_requests_version_check
  CHECK (version > 0);

CREATE TABLE public.tenant_service_work_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_order_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  action text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  remark text NULL,
  operator_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_work_order_events_tenant_id_fkey
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_work_order_events_order_identity_fkey
    FOREIGN KEY (service_order_id, tenant_id)
    REFERENCES public.tenant_service_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_work_order_events_work_order_identity_fkey
    FOREIGN KEY (work_order_id, tenant_id)
    REFERENCES public.tenant_service_work_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_work_order_events_action_check
    CHECK (action IN (
      'assign',
      'transition',
      'fulfillment_record_create',
      'acceptance_prepare',
      'acceptance_submit',
      'refund_review'
    )),
  CONSTRAINT tenant_service_work_order_events_status_check
    CHECK (
      (from_status IS NULL OR from_status IN (
        'waiting_assignment',
        'configuring',
        'deploying',
        'training',
        'awaiting_acceptance',
        'rectifying',
        'accepted',
        'active',
        'canceled'
      ))
      AND
      (to_status IS NULL OR to_status IN (
        'waiting_assignment',
        'configuring',
        'deploying',
        'training',
        'awaiting_acceptance',
        'rectifying',
        'accepted',
        'active',
        'canceled'
      ))
    ),
  CONSTRAINT tenant_service_work_order_events_remark_length
    CHECK (remark IS NULL OR char_length(remark) <= 1000),
  CONSTRAINT tenant_service_work_order_events_metadata_object
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE public.tenant_service_fulfillment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_order_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  record_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_fulfillment_records_tenant_id_fkey
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_fulfillment_records_order_identity_fkey
    FOREIGN KEY (service_order_id, tenant_id)
    REFERENCES public.tenant_service_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_fulfillment_records_work_order_identity_fkey
    FOREIGN KEY (work_order_id, tenant_id)
    REFERENCES public.tenant_service_work_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_fulfillment_records_identity_key
    UNIQUE (id, tenant_id),
  CONSTRAINT tenant_service_fulfillment_records_type_check
    CHECK (record_type IN (
      'environment_setup',
      'server_configuration',
      'onsite_training',
      'remote_training',
      'annual_operation',
      'acceptance_preparation',
      'rectification'
    )),
  CONSTRAINT tenant_service_fulfillment_records_title_not_blank
    CHECK (btrim(title) <> '' AND char_length(title) <= 120),
  CONSTRAINT tenant_service_fulfillment_records_content_not_blank
    CHECK (btrim(content) <> '' AND char_length(content) <= 5000)
);

CREATE TABLE public.tenant_service_fulfillment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_order_id uuid NOT NULL,
  work_order_id uuid NOT NULL,
  fulfillment_record_id uuid NULL,
  file_id uuid NOT NULL
    REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  file_name text NULL,
  mime_type text NULL,
  size_bytes bigint NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_fulfillment_attachments_tenant_id_fkey
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_fulfillment_attachments_order_identity_fkey
    FOREIGN KEY (service_order_id, tenant_id)
    REFERENCES public.tenant_service_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_fulfillment_attachments_work_order_identity_fkey
    FOREIGN KEY (work_order_id, tenant_id)
    REFERENCES public.tenant_service_work_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_fulfillment_attachments_record_identity_fkey
    FOREIGN KEY (fulfillment_record_id, tenant_id)
    REFERENCES public.tenant_service_fulfillment_records(id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT tenant_service_fulfillment_attachments_file_name_length
    CHECK (file_name IS NULL OR char_length(file_name) <= 255),
  CONSTRAINT tenant_service_fulfillment_attachments_mime_type_length
    CHECK (mime_type IS NULL OR char_length(mime_type) <= 120),
  CONSTRAINT tenant_service_fulfillment_attachments_size_check
    CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

CREATE TABLE public.tenant_service_acceptance_preparations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  service_order_id uuid NOT NULL,
  work_order_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  summary text NOT NULL,
  prepared_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_acceptance_preparations_tenant_id_fkey
    FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_acceptance_preparations_order_identity_fkey
    FOREIGN KEY (service_order_id, tenant_id)
    REFERENCES public.tenant_service_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_acceptance_preparations_work_order_identity_fkey
    FOREIGN KEY (work_order_id, tenant_id)
    REFERENCES public.tenant_service_work_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_acceptance_preparations_status_check
    CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected', 'cancelled')),
  CONSTRAINT tenant_service_acceptance_preparations_summary_not_blank
    CHECK (btrim(summary) <> '' AND char_length(summary) <= 5000),
  CONSTRAINT tenant_service_acceptance_preparations_submitted_at_check
    CHECK (
      (status = 'submitted' AND submitted_at IS NOT NULL)
      OR (status <> 'submitted')
    )
);

CREATE INDEX tenant_service_work_order_events_work_order_created_idx
  ON public.tenant_service_work_order_events (work_order_id, created_at DESC);
CREATE INDEX tenant_service_work_order_events_tenant_created_idx
  ON public.tenant_service_work_order_events (tenant_id, created_at DESC);
CREATE INDEX tenant_service_fulfillment_records_work_order_created_idx
  ON public.tenant_service_fulfillment_records (work_order_id, created_at DESC);
CREATE INDEX tenant_service_fulfillment_records_type_occurred_idx
  ON public.tenant_service_fulfillment_records (record_type, occurred_at DESC);
CREATE INDEX tenant_service_fulfillment_attachments_work_order_created_idx
  ON public.tenant_service_fulfillment_attachments (work_order_id, created_at DESC);
CREATE INDEX tenant_service_fulfillment_attachments_record_created_idx
  ON public.tenant_service_fulfillment_attachments (fulfillment_record_id, created_at DESC)
  WHERE fulfillment_record_id IS NOT NULL;
CREATE INDEX tenant_service_acceptance_preparations_status_updated_idx
  ON public.tenant_service_acceptance_preparations (status, updated_at DESC);
CREATE INDEX tenant_service_refund_requests_status_created_idx
  ON public.tenant_service_refund_requests (status, created_at DESC);

CREATE TRIGGER tr_tenant_service_fulfillment_records_updated_at
BEFORE UPDATE ON public.tenant_service_fulfillment_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_tenant_service_acceptance_preparations_updated_at
BEFORE UPDATE ON public.tenant_service_acceptance_preparations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.platform_service_assign_work_order(
  p_work_order_id uuid,
  p_assignee_employee_id uuid,
  p_expected_version integer,
  p_operator_employee_id uuid,
  p_remark text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_work_order public.tenant_service_work_orders%ROWTYPE;
  v_order public.tenant_service_orders%ROWTYPE;
  v_from_status text;
  v_to_status text;
BEGIN
  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE id = p_work_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
  END IF;

  IF v_work_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'error_code', 'SERVICE_WORK_ORDER_VERSION_CONFLICT'
    );
  END IF;

  IF v_work_order.status IN ('active', 'canceled') THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'error_code', 'SERVICE_WORK_ORDER_INVALID_STATE'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.id = p_assignee_employee_id
      AND employee.status = 'active'
  ) THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'error_code', 'SERVICE_WORK_ORDER_ASSIGNEE_INVALID'
    );
  END IF;

  v_from_status := v_work_order.status;
  v_to_status := CASE
    WHEN v_work_order.status = 'waiting_assignment' THEN 'configuring'
    ELSE v_work_order.status
  END;

  UPDATE public.tenant_service_work_orders
  SET
    assignee_employee_id = p_assignee_employee_id,
    assigned_at = now(),
    status = v_to_status,
    version = version + 1
  WHERE id = v_work_order.id
  RETURNING * INTO v_work_order;

  UPDATE public.tenant_service_orders
  SET
    service_status = v_to_status,
    version = version + 1
  WHERE id = v_work_order.service_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.tenant_service_work_order_events (
    tenant_id,
    service_order_id,
    work_order_id,
    action,
    from_status,
    to_status,
    remark,
    operator_employee_id,
    metadata
  )
  VALUES (
    v_work_order.tenant_id,
    v_work_order.service_order_id,
    v_work_order.id,
    'assign',
    v_from_status,
    v_to_status,
    p_remark,
    p_operator_employee_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'work_order', to_jsonb(v_work_order),
    'order', to_jsonb(v_order),
    'error_code', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_transition_work_order(
  p_work_order_id uuid,
  p_to_status text,
  p_expected_version integer,
  p_operator_employee_id uuid,
  p_remark text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_work_order public.tenant_service_work_orders%ROWTYPE;
  v_order public.tenant_service_orders%ROWTYPE;
  v_from_status text;
BEGIN
  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE id = p_work_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_WORK_ORDER_NOT_FOUND';
  END IF;

  IF v_work_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'error_code', 'SERVICE_WORK_ORDER_VERSION_CONFLICT'
    );
  END IF;

  v_from_status := v_work_order.status;

  IF NOT (
    (v_from_status = 'waiting_assignment' AND p_to_status = 'configuring')
    OR (v_from_status = 'configuring' AND p_to_status = 'deploying')
    OR (v_from_status = 'deploying' AND p_to_status = 'training')
    OR (v_from_status = 'training' AND p_to_status = 'awaiting_acceptance')
    OR (v_from_status = 'awaiting_acceptance' AND p_to_status IN ('accepted', 'rectifying'))
    OR (v_from_status = 'rectifying' AND p_to_status = 'awaiting_acceptance')
    OR (v_from_status = 'accepted' AND p_to_status = 'active')
    OR (
      v_from_status IN (
        'waiting_assignment',
        'configuring',
        'deploying',
        'training',
        'awaiting_acceptance',
        'rectifying'
      )
      AND p_to_status = 'canceled'
    )
  ) THEN
    RETURN jsonb_build_object(
      'work_order', NULL,
      'order', NULL,
      'error_code', 'SERVICE_WORK_ORDER_INVALID_STATE'
    );
  END IF;

  UPDATE public.tenant_service_work_orders
  SET
    status = p_to_status,
    version = version + 1
  WHERE id = v_work_order.id
  RETURNING * INTO v_work_order;

  UPDATE public.tenant_service_orders
  SET
    service_status = p_to_status,
    version = version + 1
  WHERE id = v_work_order.service_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.tenant_service_work_order_events (
    tenant_id,
    service_order_id,
    work_order_id,
    action,
    from_status,
    to_status,
    remark,
    operator_employee_id,
    metadata
  )
  VALUES (
    v_work_order.tenant_id,
    v_work_order.service_order_id,
    v_work_order.id,
    'transition',
    v_from_status,
    p_to_status,
    p_remark,
    p_operator_employee_id,
    coalesce(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object(
    'work_order', to_jsonb(v_work_order),
    'order', to_jsonb(v_order),
    'error_code', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_review_refund_request(
  p_refund_request_id uuid,
  p_decision text,
  p_expected_version integer,
  p_operator_employee_id uuid,
  p_review_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_refund public.tenant_service_refund_requests%ROWTYPE;
  v_order public.tenant_service_orders%ROWTYPE;
BEGIN
  SELECT *
  INTO v_refund
  FROM public.tenant_service_refund_requests
  WHERE id = p_refund_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_REFUND_REQUEST_NOT_FOUND';
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = v_refund.service_order_id
  FOR UPDATE;

  IF v_refund.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'refund_request', NULL,
      'order', NULL,
      'error_code', 'SERVICE_WORK_ORDER_VERSION_CONFLICT'
    );
  END IF;

  IF v_refund.status <> 'reviewing'
    OR p_decision NOT IN ('approved', 'rejected')
    OR v_order.payment_status <> 'refund_reviewing'
  THEN
    RETURN jsonb_build_object(
      'refund_request', NULL,
      'order', NULL,
      'error_code', 'SERVICE_REFUND_REVIEW_INVALID_STATE'
    );
  END IF;

  UPDATE public.tenant_service_refund_requests
  SET
    status = p_decision,
    reviewed_by_employee_id = p_operator_employee_id,
    reviewed_at = now(),
    review_remark = p_review_remark,
    version = version + 1
  WHERE id = v_refund.id
  RETURNING * INTO v_refund;

  IF p_decision = 'rejected' THEN
    UPDATE public.tenant_service_orders
    SET
      payment_status = 'paid',
      version = version + 1
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  END IF;

  INSERT INTO public.tenant_service_work_order_events (
    tenant_id,
    service_order_id,
    work_order_id,
    action,
    from_status,
    to_status,
    remark,
    operator_employee_id,
    metadata
  )
  SELECT
    work_order.tenant_id,
    work_order.service_order_id,
    work_order.id,
    'refund_review',
    work_order.status,
    work_order.status,
    p_review_remark,
    p_operator_employee_id,
    jsonb_build_object('decision', p_decision, 'refund_request_id', v_refund.id)
  FROM public.tenant_service_work_orders AS work_order
  WHERE work_order.service_order_id = v_order.id;

  RETURN jsonb_build_object(
    'refund_request', to_jsonb(v_refund),
    'order', to_jsonb(v_order),
    'error_code', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_assign_work_order(
  uuid,
  uuid,
  integer,
  uuid,
  text,
  jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_service_assign_work_order(
  uuid,
  uuid,
  integer,
  uuid,
  text,
  jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_transition_work_order(
  uuid,
  text,
  integer,
  uuid,
  text,
  jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_service_transition_work_order(
  uuid,
  text,
  integer,
  uuid,
  text,
  jsonb
) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_review_refund_request(
  uuid,
  text,
  integer,
  uuid,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_service_review_refund_request(
  uuid,
  text,
  integer,
  uuid,
  text
) TO service_role;

ALTER TABLE public.tenant_service_work_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_fulfillment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_fulfillment_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_acceptance_preparations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_service_work_order_events_self_read
  ON public.tenant_service_work_order_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.user_id = auth.uid()
        AND employee.tenant_id = tenant_service_work_order_events.tenant_id
        AND employee.status = 'active'
    )
  );

CREATE POLICY tenant_service_fulfillment_records_self_read
  ON public.tenant_service_fulfillment_records
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.user_id = auth.uid()
        AND employee.tenant_id = tenant_service_fulfillment_records.tenant_id
        AND employee.status = 'active'
    )
  );

CREATE POLICY tenant_service_fulfillment_attachments_self_read
  ON public.tenant_service_fulfillment_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.user_id = auth.uid()
        AND employee.tenant_id = tenant_service_fulfillment_attachments.tenant_id
        AND employee.status = 'active'
    )
  );

CREATE POLICY tenant_service_acceptance_preparations_self_read
  ON public.tenant_service_acceptance_preparations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.user_id = auth.uid()
        AND employee.tenant_id = tenant_service_acceptance_preparations.tenant_id
        AND employee.status = 'active'
    )
  );

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES
  ('platform.service_refund.review', '审核技术服务退款', 'platform_service', 'service_refund', 'review', '审核平台技术服务订单退款申请，不直接执行微信退款出款', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code = 'platform.service_refund.review'
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMENT ON TABLE public.tenant_service_work_order_events
  IS '平台技术服务实施工单事件。记录分配、状态流转、验收准备和退款审核等操作留痕。';
COMMENT ON TABLE public.tenant_service_fulfillment_records
  IS '平台技术服务履约记录。承接部署、服务器配置、培训和年度运维等无实体物流履约依据。';
COMMENT ON TABLE public.tenant_service_fulfillment_attachments
  IS '平台技术服务履约附件绑定。仅保存已有平台文件对象 ID 和展示元数据。';
COMMENT ON TABLE public.tenant_service_acceptance_preparations
  IS '平台技术服务验收准备资料。后续小程序客户确认验收读取该表。';
