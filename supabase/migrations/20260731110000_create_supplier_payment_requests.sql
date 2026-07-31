-- Rollback: use a forward migration to revoke command execution and stop writes,
-- roll back the application entry points, and post compensating accounting
-- entries where required. Payment and accounting facts must not DROP once any
-- payment has been confirmed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

ALTER TABLE public.supplier_command_events
DROP CONSTRAINT supplier_command_events_resource_type_check;

ALTER TABLE public.supplier_command_events
ADD CONSTRAINT supplier_command_events_resource_type_check CHECK (
  resource_type IN (
    'supplier',
    'supplier_qualification_type',
    'supplier_qualification',
    'supplier_service_region',
    'supplier_address',
    'supplier_contact',
    'catalog_category',
    'catalog_brand',
    'catalog_unit',
    'tenant_supplier',
    'supplier_contract',
    'supplier_product',
    'supplier_sku',
    'supplier_price_list',
    'supplier_purchase_order',
    'supplier_purchase_requisition',
    'supplier_payment_request',
    'supplier_payment'
  )
) NOT VALID;

ALTER TABLE public.supplier_command_events
VALIDATE CONSTRAINT supplier_command_events_resource_type_check;

ALTER TABLE public.finance_ledger_entries
DROP CONSTRAINT finance_ledger_entries_entry_type_check;

ALTER TABLE public.finance_ledger_entries
ADD CONSTRAINT finance_ledger_entries_entry_type_check CHECK (
  entry_type IN (
    'project_payment',
    'expense_settlement',
    'refund',
    'adjustment',
    'supplier_payment'
  )
) NOT VALID;

ALTER TABLE public.finance_ledger_entries
VALIDATE CONSTRAINT finance_ledger_entries_entry_type_check;

ALTER TABLE public.finance_ledger_entries
ALTER COLUMN amount TYPE numeric(18, 2);

ALTER TABLE public.employees
ADD CONSTRAINT employees_id_tenant_key UNIQUE (id, tenant_id);

ALTER TABLE public.supplier_payable_events
ADD CONSTRAINT supplier_payable_events_id_tenant_key
UNIQUE (id, tenant_id);

CREATE SEQUENCE public.supplier_payment_request_number_seq
AS bigint
START WITH 1
INCREMENT BY 1
NO MINVALUE
MAXVALUE 99999999
NO CYCLE
CACHE 1;

CREATE SEQUENCE public.supplier_payment_number_seq
AS bigint
START WITH 1
INCREMENT BY 1
NO MINVALUE
MAXVALUE 99999999
NO CYCLE
CACHE 1;

CREATE TABLE public.supplier_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  tenant_supplier_id uuid NOT NULL,
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  request_no text NOT NULL DEFAULT (
    'SPR-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
      lpad(
        nextval('public.supplier_payment_request_number_seq')::text,
        8,
        '0'
      )
  ),
  status text NOT NULL DEFAULT 'draft',
  currency char(3) NOT NULL DEFAULT 'CNY',
  requested_amount numeric(18, 2) NOT NULL DEFAULT 0,
  paid_amount numeric(18, 2) NOT NULL DEFAULT 0,
  reason text NOT NULL,
  remark text NULL,
  version integer NOT NULL DEFAULT 1,
  submitted_by_employee_id uuid NULL,
  submitted_at timestamptz NULL,
  reviewed_by_employee_id uuid NULL,
  reviewed_at timestamptz NULL,
  review_remark text NULL,
  cancelled_by_employee_id uuid NULL,
  cancelled_at timestamptz NULL,
  cancel_reason text NULL,
  closed_by_employee_id uuid NULL,
  closed_at timestamptz NULL,
  close_reason text NULL,
  created_by_employee_id uuid NOT NULL,
  updated_by_employee_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_payment_requests_project_tenant_fkey
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_requests_relationship_scope_fkey
    FOREIGN KEY (tenant_supplier_id, tenant_id, supplier_id)
    REFERENCES public.tenant_suppliers(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_requests_created_employee_tenant_fkey
    FOREIGN KEY (created_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_requests_updated_employee_tenant_fkey
    FOREIGN KEY (updated_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_requests_submitted_employee_tenant_fkey
    FOREIGN KEY (submitted_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_requests_reviewed_employee_tenant_fkey
    FOREIGN KEY (reviewed_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_requests_cancelled_employee_tenant_fkey
    FOREIGN KEY (cancelled_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_requests_closed_employee_tenant_fkey
    FOREIGN KEY (closed_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_requests_status_check CHECK (
    status IN (
      'draft',
      'pending_approval',
      'approved',
      'partially_paid',
      'paid',
      'rejected',
      'cancelled',
      'closed'
    )
  ),
  CONSTRAINT supplier_payment_requests_currency_check
    CHECK (currency = 'CNY'),
  CONSTRAINT supplier_payment_requests_amount_check CHECK (
    requested_amount >= 0
    AND paid_amount >= 0
    AND paid_amount <= requested_amount
  ),
  CONSTRAINT supplier_payment_requests_text_check CHECK (
    reason = btrim(reason)
    AND reason <> ''
    AND char_length(reason) <= 500
    AND (
      remark IS NULL
      OR (
        remark = btrim(remark)
        AND remark <> ''
        AND char_length(remark) <= 500
      )
    )
    AND (
      review_remark IS NULL
      OR (
        review_remark = btrim(review_remark)
        AND review_remark <> ''
        AND char_length(review_remark) <= 500
      )
    )
    AND (
      cancel_reason IS NULL
      OR (
        cancel_reason = btrim(cancel_reason)
        AND cancel_reason <> ''
        AND char_length(cancel_reason) <= 500
      )
    )
    AND (
      close_reason IS NULL
      OR (
        close_reason = btrim(close_reason)
        AND close_reason <> ''
        AND char_length(close_reason) <= 500
      )
    )
  ),
  CONSTRAINT supplier_payment_requests_version_check CHECK (version > 0),
  CONSTRAINT supplier_payment_requests_state_audit_check CHECK (
    (
      status = 'draft'
      AND submitted_by_employee_id IS NULL
      AND submitted_at IS NULL
      AND reviewed_by_employee_id IS NULL
      AND reviewed_at IS NULL
      AND review_remark IS NULL
      AND cancelled_by_employee_id IS NULL
      AND cancelled_at IS NULL
      AND cancel_reason IS NULL
      AND closed_by_employee_id IS NULL
      AND closed_at IS NULL
      AND close_reason IS NULL
    )
    OR (
      status = 'pending_approval'
      AND submitted_by_employee_id IS NOT NULL
      AND submitted_at IS NOT NULL
      AND reviewed_by_employee_id IS NULL
      AND reviewed_at IS NULL
      AND review_remark IS NULL
      AND cancelled_by_employee_id IS NULL
      AND cancelled_at IS NULL
      AND cancel_reason IS NULL
      AND closed_by_employee_id IS NULL
      AND closed_at IS NULL
      AND close_reason IS NULL
    )
    OR (
      status IN ('approved', 'partially_paid', 'paid')
      AND submitted_by_employee_id IS NOT NULL
      AND submitted_at IS NOT NULL
      AND reviewed_by_employee_id IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND cancelled_by_employee_id IS NULL
      AND cancelled_at IS NULL
      AND cancel_reason IS NULL
      AND closed_by_employee_id IS NULL
      AND closed_at IS NULL
      AND close_reason IS NULL
    )
    OR (
      status = 'rejected'
      AND submitted_by_employee_id IS NOT NULL
      AND submitted_at IS NOT NULL
      AND reviewed_by_employee_id IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND review_remark IS NOT NULL
      AND cancelled_by_employee_id IS NULL
      AND cancelled_at IS NULL
      AND cancel_reason IS NULL
      AND closed_by_employee_id IS NULL
      AND closed_at IS NULL
      AND close_reason IS NULL
    )
    OR (
      status = 'cancelled'
      AND cancelled_by_employee_id IS NOT NULL
      AND cancelled_at IS NOT NULL
      AND cancel_reason IS NOT NULL
      AND closed_by_employee_id IS NULL
      AND closed_at IS NULL
      AND close_reason IS NULL
    )
    OR (
      status = 'closed'
      AND submitted_by_employee_id IS NOT NULL
      AND submitted_at IS NOT NULL
      AND reviewed_by_employee_id IS NOT NULL
      AND reviewed_at IS NOT NULL
      AND closed_by_employee_id IS NOT NULL
      AND closed_at IS NOT NULL
      AND close_reason IS NOT NULL
      AND cancelled_by_employee_id IS NULL
      AND cancelled_at IS NULL
      AND cancel_reason IS NULL
    )
  ),
  CONSTRAINT supplier_payment_requests_id_tenant_key
    UNIQUE (id, tenant_id),
  CONSTRAINT supplier_payment_requests_scope_key
    UNIQUE (
      id,
      tenant_id,
      project_id,
      tenant_supplier_id,
      supplier_id,
      currency
    ),
  CONSTRAINT supplier_payment_requests_tenant_request_no_key
    UNIQUE (tenant_id, request_no)
);

CREATE TABLE public.supplier_payment_request_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  payment_request_id uuid NOT NULL,
  payable_event_id uuid NOT NULL,
  requested_amount numeric(18, 2) NOT NULL,
  paid_amount numeric(18, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_payment_request_allocations_request_tenant_fkey
    FOREIGN KEY (payment_request_id, tenant_id)
    REFERENCES public.supplier_payment_requests(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_request_allocations_payable_tenant_fkey
    FOREIGN KEY (payable_event_id, tenant_id)
    REFERENCES public.supplier_payable_events(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_request_allocations_amount_check CHECK (
    requested_amount > 0
    AND paid_amount >= 0
    AND paid_amount <= requested_amount
  ),
  CONSTRAINT supplier_payment_request_allocations_request_payable_key
    UNIQUE (payment_request_id, payable_event_id),
  CONSTRAINT supplier_payment_request_allocations_id_scope_key
    UNIQUE (id, tenant_id, payable_event_id)
);

CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  tenant_supplier_id uuid NOT NULL,
  supplier_id uuid NOT NULL
    REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  payment_request_id uuid NOT NULL,
  payment_no text NOT NULL DEFAULT (
    'SP-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' ||
      lpad(
        nextval('public.supplier_payment_number_seq')::text,
        8,
        '0'
      )
  ),
  currency char(3) NOT NULL DEFAULT 'CNY',
  amount numeric(18, 2) NOT NULL,
  payment_method text NOT NULL,
  payment_reference text NOT NULL,
  paid_at timestamptz NOT NULL,
  evidence_images jsonb NOT NULL,
  remark text NULL,
  confirmed_by_employee_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_payments_request_scope_fkey
    FOREIGN KEY (
      payment_request_id,
      tenant_id,
      project_id,
      tenant_supplier_id,
      supplier_id,
      currency
    )
    REFERENCES public.supplier_payment_requests(
      id,
      tenant_id,
      project_id,
      tenant_supplier_id,
      supplier_id,
      currency
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payments_project_tenant_fkey
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payments_relationship_scope_fkey
    FOREIGN KEY (tenant_supplier_id, tenant_id, supplier_id)
    REFERENCES public.tenant_suppliers(id, tenant_id, supplier_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payments_confirmed_employee_tenant_fkey
    FOREIGN KEY (confirmed_by_employee_id, tenant_id)
    REFERENCES public.employees(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payments_currency_check CHECK (currency = 'CNY'),
  CONSTRAINT supplier_payments_amount_check CHECK (amount > 0),
  CONSTRAINT supplier_payments_method_check CHECK (
    payment_method IN (
      'bank_transfer',
      'wechat',
      'alipay',
      'cash',
      'other'
    )
  ),
  CONSTRAINT supplier_payments_reference_check CHECK (
    payment_reference = btrim(payment_reference)
    AND payment_reference <> ''
    AND char_length(payment_reference) <= 200
  ),
  CONSTRAINT supplier_payments_evidence_check CHECK (
    jsonb_typeof(evidence_images) = 'array'
    AND jsonb_array_length(evidence_images) BETWEEN 1 AND 9
  ),
  CONSTRAINT supplier_payments_other_remark_check CHECK (
    payment_method <> 'other'
    OR (
      remark IS NOT NULL
      AND remark = btrim(remark)
      AND remark <> ''
      AND char_length(remark) <= 500
    )
  ),
  CONSTRAINT supplier_payments_optional_remark_check CHECK (
    remark IS NULL
    OR (
      remark = btrim(remark)
      AND remark <> ''
      AND char_length(remark) <= 500
    )
  ),
  CONSTRAINT supplier_payments_idempotency_key_check CHECK (
    idempotency_key = btrim(idempotency_key)
    AND idempotency_key <> ''
    AND char_length(idempotency_key) <= 120
  ),
  CONSTRAINT supplier_payments_id_tenant_key UNIQUE (id, tenant_id),
  CONSTRAINT supplier_payments_tenant_payment_no_key
    UNIQUE (tenant_id, payment_no),
  CONSTRAINT supplier_payments_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE public.supplier_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_payment_id uuid NOT NULL,
  payment_request_allocation_id uuid NOT NULL,
  payable_event_id uuid NOT NULL,
  amount numeric(18, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_payment_allocations_payment_tenant_fkey
    FOREIGN KEY (supplier_payment_id, tenant_id)
    REFERENCES public.supplier_payments(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_allocations_request_payable_tenant_fkey
    FOREIGN KEY (
      payment_request_allocation_id,
      tenant_id,
      payable_event_id
    )
    REFERENCES public.supplier_payment_request_allocations(
      id,
      tenant_id,
      payable_event_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_allocations_payable_tenant_fkey
    FOREIGN KEY (payable_event_id, tenant_id)
    REFERENCES public.supplier_payable_events(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_payment_allocations_amount_check CHECK (amount > 0),
  CONSTRAINT supplier_payment_allocations_payment_request_key
    UNIQUE (supplier_payment_id, payment_request_allocation_id)
);

CREATE INDEX supplier_payable_events_tenant_status_query_idx
ON public.supplier_payable_events(
  tenant_id,
  project_id,
  tenant_supplier_id,
  due_at,
  id
)
INCLUDE (amount, currency, supplier_purchase_order_id);

CREATE INDEX supplier_payable_events_order_summary_idx
ON public.supplier_payable_events(
  tenant_id,
  supplier_purchase_order_id,
  id
)
INCLUDE (amount, due_at);

CREATE INDEX supplier_payment_requests_tenant_status_updated_idx
ON public.supplier_payment_requests(
  tenant_id,
  status,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_payment_requests_tenant_project_supplier_updated_idx
ON public.supplier_payment_requests(
  tenant_id,
  project_id,
  tenant_supplier_id,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_payment_request_allocations_active_payable_idx
ON public.supplier_payment_request_allocations(
  tenant_id,
  payable_event_id,
  payment_request_id
)
INCLUDE (requested_amount, paid_amount);

CREATE INDEX supplier_payment_request_allocations_request_idx
ON public.supplier_payment_request_allocations(
  tenant_id,
  payment_request_id,
  payable_event_id,
  id
)
INCLUDE (requested_amount, paid_amount);

CREATE INDEX supplier_payments_tenant_request_paid_idx
ON public.supplier_payments(
  tenant_id,
  payment_request_id,
  paid_at DESC,
  id DESC
);

CREATE INDEX supplier_payment_allocations_payable_idx
ON public.supplier_payment_allocations(
  tenant_id,
  payable_event_id,
  supplier_payment_id
)
INCLUDE (amount);

CREATE INDEX supplier_payment_allocations_payment_idx
ON public.supplier_payment_allocations(
  tenant_id,
  supplier_payment_id,
  payment_request_allocation_id
)
INCLUDE (payable_event_id, amount);

CREATE FUNCTION public.prevent_supplier_payment_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PAYMENT_FACT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.require_supplier_payment_command_context()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('app.supplier_payment_command', true)
    IS DISTINCT FROM 'on'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PAYMENT_COMMAND_REQUIRED';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_payment_requests_command_only
BEFORE INSERT OR UPDATE OR DELETE
ON public.supplier_payment_requests
FOR EACH ROW
EXECUTE FUNCTION public.require_supplier_payment_command_context();

CREATE TRIGGER supplier_payment_request_allocations_command_only
BEFORE INSERT OR UPDATE OR DELETE
ON public.supplier_payment_request_allocations
FOR EACH ROW
EXECUTE FUNCTION public.require_supplier_payment_command_context();

CREATE TRIGGER supplier_payments_immutable
BEFORE UPDATE OR DELETE
ON public.supplier_payments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_supplier_payment_fact_mutation();

CREATE TRIGGER supplier_payment_allocations_immutable
BEFORE UPDATE OR DELETE
ON public.supplier_payment_allocations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_supplier_payment_fact_mutation();

ALTER TABLE public.supplier_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_request_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_request_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_allocations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.supplier_payment_requests,
  public.supplier_payment_request_allocations,
  public.supplier_payments,
  public.supplier_payment_allocations
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.review_supplier_payment_request(
  p_payment_request_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_action text,
  p_remark text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_payment_request public.supplier_payment_requests%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
BEGIN
  IF p_payment_request_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_action IS NULL
    OR p_action NOT IN ('approve', 'reject')
    OR (
      p_action = 'reject'
      AND (p_remark IS NULL OR btrim(p_remark) = '')
    )
    OR (
      p_remark IS NOT NULL
      AND char_length(btrim(p_remark)) > 500
    )
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(btrim(p_idempotency_key)) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PAYMENT_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'payment_request_id', p_payment_request_id,
    'tenant_id', p_tenant_id,
    'expected_version', p_expected_version,
    'action', p_action,
    'remark', CASE
      WHEN p_remark IS NULL THEN NULL
      ELSE btrim(p_remark)
    END,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );
  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_payment_request'
      OR v_event.resource_id <> p_payment_request_id
      OR v_event.command <> 'review_supplier_payment_request'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object(
      'idempotent', true
    );
  END IF;

  SELECT payment_request.*
  INTO v_payment_request
  FROM public.supplier_payment_requests AS payment_request
  WHERE payment_request.id = p_payment_request_id
    AND payment_request.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_result := jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_NOT_FOUND',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'review_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key, 1
    );
  END IF;
  IF v_payment_request.version <> p_expected_version THEN
    v_result := jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'review_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;
  IF v_payment_request.status <> 'pending_approval' THEN
    v_result := jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'review_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;
  IF v_payment_request.submitted_by_employee_id = p_actor_employee_id THEN
    v_result := jsonb_build_object(
      'status', 'self_review',
      'error_code',
        'SUPPLIER_PAYMENT_REQUEST_SELF_REVIEW_FORBIDDEN',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'review_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  PERFORM set_config('app.supplier_payment_command', 'on', true);
  IF p_action = 'approve' THEN
    UPDATE public.supplier_payment_requests AS payment_request
    SET status = 'approved',
        reviewed_by_employee_id = p_actor_employee_id,
        reviewed_at = now(),
        review_remark = CASE
          WHEN p_remark IS NULL OR btrim(p_remark) = '' THEN NULL
          ELSE btrim(p_remark)
        END,
        version = payment_request.version + 1,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = now()
    WHERE payment_request.id = p_payment_request_id
      AND payment_request.tenant_id = p_tenant_id
    RETURNING * INTO v_payment_request;
  ELSE
    UPDATE public.supplier_payment_requests AS payment_request
    SET status = 'rejected',
        reviewed_by_employee_id = p_actor_employee_id,
        reviewed_at = now(),
        review_remark = btrim(p_remark),
        version = payment_request.version + 1,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = now()
    WHERE payment_request.id = p_payment_request_id
      AND payment_request.tenant_id = p_tenant_id
    RETURNING * INTO v_payment_request;
  END IF;

  v_result := jsonb_build_object(
    'status', CASE
      WHEN p_action = 'approve' THEN 'approved'
      ELSE 'rejected'
    END,
    'idempotent', false,
    'payment_request',
      public.supplier_payment_request_to_jsonb(v_payment_request),
    'version', v_payment_request.version
  );
  RETURN public.record_supplier_payment_command_result(
    p_tenant_id, 'supplier_payment_request', p_payment_request_id,
    'review_supplier_payment_request', v_request, v_result,
    p_actor_user_id, p_actor_employee_id, p_idempotency_key,
    v_payment_request.version
  );
END;
$$;

CREATE FUNCTION public.cancel_supplier_payment_request(
  p_payment_request_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_payment_request public.supplier_payment_requests%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
BEGIN
  IF p_payment_request_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_reason IS NULL
    OR btrim(p_reason) = ''
    OR char_length(btrim(p_reason)) > 500
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(btrim(p_idempotency_key)) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PAYMENT_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'payment_request_id', p_payment_request_id,
    'tenant_id', p_tenant_id,
    'expected_version', p_expected_version,
    'reason', btrim(p_reason),
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );
  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_payment_request'
      OR v_event.resource_id <> p_payment_request_id
      OR v_event.command <> 'cancel_supplier_payment_request'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object(
      'idempotent', true
    );
  END IF;

  SELECT payment_request.*
  INTO v_payment_request
  FROM public.supplier_payment_requests AS payment_request
  WHERE payment_request.id = p_payment_request_id
    AND payment_request.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    v_result := jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_NOT_FOUND',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'cancel_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key, 1
    );
  END IF;
  IF v_payment_request.version <> p_expected_version THEN
    v_result := jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'cancel_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;
  IF v_payment_request.status NOT IN (
    'draft', 'pending_approval', 'approved'
  ) OR v_payment_request.paid_amount <> 0 THEN
    v_result := jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'cancel_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  PERFORM set_config('app.supplier_payment_command', 'on', true);
  UPDATE public.supplier_payment_requests AS payment_request
  SET status = 'cancelled',
      cancelled_by_employee_id = p_actor_employee_id,
      cancelled_at = now(),
      cancel_reason = btrim(p_reason),
      version = payment_request.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE payment_request.id = p_payment_request_id
    AND payment_request.tenant_id = p_tenant_id
  RETURNING * INTO v_payment_request;

  v_result := jsonb_build_object(
    'status', 'cancelled',
    'idempotent', false,
    'payment_request',
      public.supplier_payment_request_to_jsonb(v_payment_request),
    'version', v_payment_request.version
  );
  RETURN public.record_supplier_payment_command_result(
    p_tenant_id, 'supplier_payment_request', p_payment_request_id,
    'cancel_supplier_payment_request', v_request, v_result,
    p_actor_user_id, p_actor_employee_id, p_idempotency_key,
    v_payment_request.version
  );
END;
$$;

CREATE FUNCTION public.close_supplier_payment_request(
  p_payment_request_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_payment_request public.supplier_payment_requests%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
BEGIN
  IF p_payment_request_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_reason IS NULL
    OR btrim(p_reason) = ''
    OR char_length(btrim(p_reason)) > 500
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(btrim(p_idempotency_key)) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PAYMENT_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'payment_request_id', p_payment_request_id,
    'tenant_id', p_tenant_id,
    'expected_version', p_expected_version,
    'reason', btrim(p_reason),
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );
  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_payment_request'
      OR v_event.resource_id <> p_payment_request_id
      OR v_event.command <> 'close_supplier_payment_request'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object(
      'idempotent', true
    );
  END IF;

  SELECT payment_request.*
  INTO v_payment_request
  FROM public.supplier_payment_requests AS payment_request
  WHERE payment_request.id = p_payment_request_id
    AND payment_request.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    v_result := jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_NOT_FOUND',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'close_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key, 1
    );
  END IF;
  IF v_payment_request.version <> p_expected_version THEN
    v_result := jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'close_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;
  IF v_payment_request.status <> 'partially_paid' THEN
    v_result := jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'close_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  PERFORM set_config('app.supplier_payment_command', 'on', true);
  UPDATE public.supplier_payment_requests AS payment_request
  SET status = 'closed',
      closed_by_employee_id = p_actor_employee_id,
      closed_at = now(),
      close_reason = btrim(p_reason),
      version = payment_request.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE payment_request.id = p_payment_request_id
    AND payment_request.tenant_id = p_tenant_id
  RETURNING * INTO v_payment_request;

  v_result := jsonb_build_object(
    'status', 'closed',
    'idempotent', false,
    'payment_request',
      public.supplier_payment_request_to_jsonb(v_payment_request),
    'version', v_payment_request.version
  );
  RETURN public.record_supplier_payment_command_result(
    p_tenant_id, 'supplier_payment_request', p_payment_request_id,
    'close_supplier_payment_request', v_request, v_result,
    p_actor_user_id, p_actor_employee_id, p_idempotency_key,
    v_payment_request.version
  );
END;
$$;

CREATE FUNCTION public.confirm_supplier_payment(
  p_payment_id uuid,
  p_payment_request_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_payment_method text,
  p_payment_reference text,
  p_paid_at timestamptz,
  p_evidence_images jsonb,
  p_remark text,
  p_allocations jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_payment_request public.supplier_payment_requests%ROWTYPE;
  v_payment public.supplier_payments%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
  v_input_count integer;
  v_resolved_count integer;
  v_payment_amount numeric(18, 2);
  v_invalid_count integer;
  v_ledger_rows integer;
  v_supplier_name text;
BEGIN
  IF p_payment_id IS NULL
    OR p_payment_request_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_payment_method IS NULL
    OR p_payment_method NOT IN (
      'bank_transfer',
      'wechat',
      'alipay',
      'cash',
      'other'
    )
    OR p_payment_reference IS NULL
    OR btrim(p_payment_reference) = ''
    OR char_length(btrim(p_payment_reference)) > 200
    OR p_paid_at IS NULL
    OR p_paid_at > clock_timestamp() + interval '5 minutes'
    OR p_allocations IS NULL
    OR jsonb_typeof(p_allocations) <> 'array'
    OR NOT jsonb_array_length(p_allocations) BETWEEN 1 AND 100
    OR (
      p_payment_method = 'other'
      AND (p_remark IS NULL OR btrim(p_remark) = '')
    )
    OR (
      p_remark IS NOT NULL
      AND (
        btrim(p_remark) = ''
        OR char_length(btrim(p_remark)) > 500
      )
    )
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(btrim(p_idempotency_key)) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PAYMENT_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'payment_id', p_payment_id,
    'tenant_id', p_tenant_id,
    'payment_request_id', p_payment_request_id,
    'expected_version', p_expected_version,
    'payment_method', p_payment_method,
    'payment_reference', btrim(p_payment_reference),
    'paid_at', p_paid_at,
    'evidence_images', p_evidence_images,
    'remark', CASE
      WHEN p_remark IS NULL THEN NULL
      ELSE btrim(p_remark)
    END,
    'allocations', p_allocations,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );
  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_payment'
      OR v_event.resource_id <> p_payment_id
      OR v_event.command <> 'confirm_supplier_payment'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object(
      'idempotent', true
    );
  END IF;

  SELECT payment_request.*
  INTO v_payment_request
  FROM public.supplier_payment_requests AS payment_request
  WHERE payment_request.id = p_payment_request_id
    AND payment_request.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_result := jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_NOT_FOUND',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment', p_payment_id,
      'confirm_supplier_payment', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key, 1
    );
  END IF;
  IF v_payment_request.version <> p_expected_version THEN
    v_result := jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment', p_payment_id,
      'confirm_supplier_payment', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;
  IF v_payment_request.status NOT IN ('approved', 'partially_paid') THEN
    v_result := jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment', p_payment_id,
      'confirm_supplier_payment', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  IF p_evidence_images IS NULL
    OR jsonb_typeof(p_evidence_images) <> 'array'
    OR NOT jsonb_array_length(p_evidence_images) BETWEEN 1 AND 9
    OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_evidence_images) AS evidence(value)
    WHERE jsonb_typeof(evidence.value) <> 'string'
      OR btrim(evidence.value #>> '{}') = ''
      OR char_length(evidence.value #>> '{}') > 2048
  )
  THEN
    v_result := jsonb_build_object(
      'status', 'evidence_required',
      'error_code', 'SUPPLIER_PAYMENT_EVIDENCE_REQUIRED',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment', p_payment_id,
      'confirm_supplier_payment', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'object'
      OR item.value ->> 'payment_request_allocation_id' IS NULL
      OR NOT (
        item.value ->> 'payment_request_allocation_id' ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      OR item.value ->> 'payable_event_id' IS NULL
      OR NOT (
        item.value ->> 'payable_event_id' ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      OR item.value ->> 'amount' IS NULL
      OR NOT (
        item.value ->> 'amount' ~
          '^(0|[1-9][0-9]{0,15})[.][0-9]{2}$'
      )
      OR (item.value ->> 'amount')::numeric <= 0
  ) THEN
    v_result := jsonb_build_object(
      'status', 'allocation_invalid',
      'error_code', 'SUPPLIER_PAYMENT_ALLOCATION_INVALID',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment', p_payment_id,
      'confirm_supplier_payment', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  WITH input AS MATERIALIZED (
    SELECT
      (item.value ->> 'payment_request_allocation_id')::uuid
        AS payment_request_allocation_id,
      (item.value ->> 'payable_event_id')::uuid AS payable_event_id,
      (item.value ->> 'amount')::numeric(18, 2) AS amount
    FROM jsonb_array_elements(p_allocations) AS item(value)
  )
  SELECT
    COUNT(*),
    LEAST(
      COUNT(DISTINCT input.payment_request_allocation_id),
      COUNT(DISTINCT input.payable_event_id)
    ),
    SUM(input.amount)::numeric(18, 2)
  INTO v_input_count, v_resolved_count, v_payment_amount
  FROM input;

  IF v_input_count <> v_resolved_count OR v_payment_amount <= 0 THEN
    v_result := jsonb_build_object(
      'status', 'allocation_invalid',
      'error_code', 'SUPPLIER_PAYMENT_ALLOCATION_INVALID',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment', p_payment_id,
      'confirm_supplier_payment', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  PERFORM payable.id
  FROM public.supplier_payable_events AS payable
  JOIN (
    SELECT
      (item.value ->> 'payable_event_id')::uuid AS payable_event_id
    FROM jsonb_array_elements(p_allocations) AS item(value)
  ) AS input
    ON input.payable_event_id = payable.id
  WHERE payable.tenant_id = p_tenant_id
  ORDER BY payable.id
  FOR UPDATE OF payable;

  PERFORM active_allocation.id
  FROM public.supplier_payment_request_allocations AS active_allocation
  JOIN public.supplier_payment_requests AS active_request
    ON active_request.id = active_allocation.payment_request_id
    AND active_request.tenant_id = active_allocation.tenant_id
  WHERE active_allocation.tenant_id = p_tenant_id
    AND active_allocation.payable_event_id IN (
      SELECT
        (item.value ->> 'payable_event_id')::uuid
      FROM jsonb_array_elements(p_allocations) AS item(value)
    )
    AND active_request.status IN (
      'pending_approval',
      'approved',
      'partially_paid'
    )
  ORDER BY
    active_allocation.payment_request_id,
    active_allocation.payable_event_id
  FOR UPDATE OF active_allocation;

  PERFORM current_allocation.id
  FROM public.supplier_payment_request_allocations AS current_allocation
  JOIN (
    SELECT
      (item.value ->> 'payment_request_allocation_id')::uuid
        AS payment_request_allocation_id
    FROM jsonb_array_elements(p_allocations) AS item(value)
  ) AS input
    ON input.payment_request_allocation_id = current_allocation.id
  WHERE current_allocation.payment_request_id = p_payment_request_id
    AND current_allocation.tenant_id = p_tenant_id
  ORDER BY current_allocation.payable_event_id
  FOR UPDATE OF current_allocation;

  WITH input AS MATERIALIZED (
    SELECT
      (item.value ->> 'payment_request_allocation_id')::uuid
        AS payment_request_allocation_id,
      (item.value ->> 'payable_event_id')::uuid AS payable_event_id,
      (item.value ->> 'amount')::numeric(18, 2) AS amount
    FROM jsonb_array_elements(p_allocations) AS item(value)
  )
  SELECT COUNT(*)
  INTO v_invalid_count
  FROM input
  LEFT JOIN public.supplier_payment_request_allocations AS allocation
    ON allocation.id = input.payment_request_allocation_id
    AND allocation.tenant_id = p_tenant_id
    AND allocation.payment_request_id = p_payment_request_id
    AND allocation.payable_event_id = input.payable_event_id
  WHERE allocation.id IS NULL
    OR input.amount >
      allocation.requested_amount - allocation.paid_amount;

  IF v_invalid_count > 0
    OR v_payment_amount >
      v_payment_request.requested_amount - v_payment_request.paid_amount
  THEN
    v_result := jsonb_build_object(
      'status', 'allocation_invalid',
      'error_code', 'SUPPLIER_PAYMENT_ALLOCATION_INVALID',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment', p_payment_id,
      'confirm_supplier_payment', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_payable_events AS payable
    JOIN (
      SELECT
        (item.value ->> 'payable_event_id')::uuid AS payable_event_id,
        (item.value ->> 'amount')::numeric(18, 2) AS amount
      FROM jsonb_array_elements(p_allocations) AS item(value)
    ) AS input
      ON input.payable_event_id = payable.id
    LEFT JOIN (
      SELECT
        payment_allocation.payable_event_id,
        SUM(payment_allocation.amount)::numeric(18, 2) AS amount
      FROM public.supplier_payment_allocations AS payment_allocation
      WHERE payment_allocation.tenant_id = p_tenant_id
        AND payment_allocation.payable_event_id IN (
          SELECT
            (item.value ->> 'payable_event_id')::uuid
          FROM jsonb_array_elements(p_allocations) AS item(value)
        )
      GROUP BY payment_allocation.payable_event_id
    ) AS paid
      ON paid.payable_event_id = payable.id
    WHERE payable.tenant_id <> p_tenant_id
      OR payable.project_id <> v_payment_request.project_id
      OR payable.tenant_supplier_id <>
        v_payment_request.tenant_supplier_id
      OR payable.supplier_id <> v_payment_request.supplier_id
      OR payable.currency <> v_payment_request.currency
      OR input.amount > payable.amount - COALESCE(paid.amount, 0)
  ) THEN
    v_result := jsonb_build_object(
      'status', 'amount_unavailable',
      'error_code', 'SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment', p_payment_id,
      'confirm_supplier_payment', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_payable_events AS payable
    JOIN (
      SELECT
        (item.value ->> 'payable_event_id')::uuid AS payable_event_id
      FROM jsonb_array_elements(p_allocations) AS item(value)
    ) AS input
      ON input.payable_event_id = payable.id
    WHERE payable.tenant_id = p_tenant_id
      AND payable.invoice_required_before_payment
  ) THEN
    v_result := jsonb_build_object(
      'status', 'invoice_required',
      'error_code',
        'SUPPLIER_PAYMENT_INVOICE_CAPABILITY_REQUIRED',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment', p_payment_id,
      'confirm_supplier_payment', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  SELECT supplier.name
  INTO v_supplier_name
  FROM public.suppliers AS supplier
  WHERE supplier.id = v_payment_request.supplier_id;

  INSERT INTO public.supplier_payments (
    id,
    tenant_id,
    project_id,
    tenant_supplier_id,
    supplier_id,
    payment_request_id,
    amount,
    payment_method,
    payment_reference,
    paid_at,
    evidence_images,
    remark,
    confirmed_by_employee_id,
    idempotency_key
  )
  VALUES (
    p_payment_id,
    p_tenant_id,
    v_payment_request.project_id,
    v_payment_request.tenant_supplier_id,
    v_payment_request.supplier_id,
    p_payment_request_id,
    v_payment_amount,
    p_payment_method,
    btrim(p_payment_reference),
    p_paid_at,
    p_evidence_images,
    CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
    p_actor_employee_id,
    btrim(p_idempotency_key)
  )
  RETURNING * INTO v_payment;

  INSERT INTO public.supplier_payment_allocations (
    tenant_id,
    supplier_payment_id,
    payment_request_allocation_id,
    payable_event_id,
    amount
  )
  SELECT
    p_tenant_id,
    p_payment_id,
    (item.value ->> 'payment_request_allocation_id')::uuid,
    (item.value ->> 'payable_event_id')::uuid,
    (item.value ->> 'amount')::numeric(18, 2)
  FROM jsonb_array_elements(p_allocations) AS item(value);

  PERFORM set_config('app.supplier_payment_command', 'on', true);
  WITH input AS MATERIALIZED (
    SELECT
      (item.value ->> 'payment_request_allocation_id')::uuid
        AS payment_request_allocation_id,
      (item.value ->> 'amount')::numeric(18, 2) AS amount
    FROM jsonb_array_elements(p_allocations) AS item(value)
  )
  UPDATE public.supplier_payment_request_allocations AS allocation
  SET paid_amount = allocation.paid_amount + input.amount,
      updated_at = now()
  FROM input
  WHERE allocation.id = input.payment_request_allocation_id
    AND allocation.tenant_id = p_tenant_id
    AND allocation.payment_request_id = p_payment_request_id;

  UPDATE public.supplier_payment_requests AS payment_request
  SET paid_amount = paid_amount + v_payment_amount,
      status = CASE
        WHEN paid_amount + v_payment_amount = requested_amount
        THEN 'paid'
        ELSE 'partially_paid'
      END,
      version = payment_request.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE payment_request.id = p_payment_request_id
    AND payment_request.tenant_id = p_tenant_id
  RETURNING * INTO v_payment_request;

  INSERT INTO public.finance_ledger_entries (
    tenant_id,
    project_id,
    direction,
    entry_type,
    amount,
    currency,
    occurred_at,
    source_type,
    source_id,
    handled_by,
    summary,
    metadata
  )
  VALUES (
    p_tenant_id,
    v_payment_request.project_id,
    'out',
    'supplier_payment',
    v_payment_amount,
    'CNY',
    p_paid_at,
    'supplier_payment',
    p_payment_id,
    p_actor_employee_id,
    '供应商付款',
    jsonb_build_object(
      'payment_request_no', v_payment_request.request_no,
      'payment_no', v_payment.payment_no,
      'supplier_name', v_supplier_name
    )
  )
  ON CONFLICT (tenant_id, source_type, source_id, entry_type) DO NOTHING;
  GET DIAGNOSTICS v_ledger_rows = ROW_COUNT;
  IF v_ledger_rows <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PAYMENT_LEDGER_CONFLICT';
  END IF;

  v_result := jsonb_build_object(
    'status', v_payment_request.status,
    'idempotent', false,
    'payment_request',
      public.supplier_payment_request_to_jsonb(v_payment_request),
    'payment', public.supplier_payment_to_jsonb(v_payment),
    'version', v_payment_request.version
  );
  RETURN public.record_supplier_payment_command_result(
    p_tenant_id, 'supplier_payment', p_payment_id,
    'confirm_supplier_payment', v_request, v_result,
    p_actor_user_id, p_actor_employee_id, p_idempotency_key,
    v_payment_request.version
  );
END;
$$;

CREATE FUNCTION public.save_supplier_payment_request_draft(
  p_payment_request_id uuid,
  p_tenant_id uuid,
  p_project_id uuid,
  p_tenant_supplier_id uuid,
  p_expected_version integer,
  p_reason text,
  p_remark text,
  p_allocations jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_payment_request public.supplier_payment_requests%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
  v_supplier_id uuid;
  v_allocation_count integer;
  v_resolved_count integer;
  v_requested_amount numeric(18, 2);
  v_request_exists boolean;
BEGIN
  IF p_payment_request_id IS NULL
    OR p_tenant_id IS NULL
    OR p_project_id IS NULL
    OR p_tenant_supplier_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 0
    OR p_reason IS NULL
    OR btrim(p_reason) = ''
    OR char_length(btrim(p_reason)) > 500
    OR (
      p_remark IS NOT NULL
      AND (
        btrim(p_remark) = ''
        OR char_length(btrim(p_remark)) > 500
      )
    )
    OR p_allocations IS NULL
    OR jsonb_typeof(p_allocations) <> 'array'
    OR NOT jsonb_array_length(p_allocations) BETWEEN 1 AND 100
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(btrim(p_idempotency_key)) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PAYMENT_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  v_request := jsonb_build_object(
    'payment_request_id', p_payment_request_id,
    'tenant_id', p_tenant_id,
    'project_id', p_project_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'expected_version', p_expected_version,
    'reason', btrim(p_reason),
    'remark', CASE
      WHEN p_remark IS NULL THEN NULL
      ELSE btrim(p_remark)
    END,
    'allocations', p_allocations,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );

  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_payment_request'
      OR v_event.resource_id <> p_payment_request_id
      OR v_event.command <> 'save_supplier_payment_request_draft'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object(
      'idempotent', true
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-payment-request-id:' || p_payment_request_id::text,
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_allocations) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'object'
      OR item.value ->> 'payable_event_id' IS NULL
      OR NOT (
        item.value ->> 'payable_event_id' ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
      OR item.value ->> 'requested_amount' IS NULL
      OR NOT (
        item.value ->> 'requested_amount' ~
          '^(0|[1-9][0-9]{0,15})[.][0-9]{2}$'
      )
      OR (item.value ->> 'requested_amount')::numeric <= 0
  ) THEN
    v_result := jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PAYMENT_VALIDATION_ERROR',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id,
      'supplier_payment_request',
      p_payment_request_id,
      'save_supplier_payment_request_draft',
      v_request,
      v_result,
      p_actor_user_id,
      p_actor_employee_id,
      p_idempotency_key,
      GREATEST(p_expected_version, 1)
    );
  END IF;

  WITH input AS MATERIALIZED (
    SELECT
      (item.value ->> 'payable_event_id')::uuid AS payable_event_id,
      (item.value ->> 'requested_amount')::numeric(18, 2)
        AS requested_amount
    FROM jsonb_array_elements(p_allocations) AS item(value)
  )
  SELECT
    COUNT(*),
    COUNT(DISTINCT input.payable_event_id),
    SUM(input.requested_amount)::numeric(18, 2)
  INTO
    v_allocation_count,
    v_resolved_count,
    v_requested_amount
  FROM input;

  IF v_allocation_count <> v_resolved_count THEN
    v_result := jsonb_build_object(
      'status', 'allocation_invalid',
      'error_code', 'SUPPLIER_PAYMENT_ALLOCATION_INVALID',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id,
      'supplier_payment_request',
      p_payment_request_id,
      'save_supplier_payment_request_draft',
      v_request,
      v_result,
      p_actor_user_id,
      p_actor_employee_id,
      p_idempotency_key,
      GREATEST(p_expected_version, 1)
    );
  END IF;

  PERFORM payable.id
  FROM public.supplier_payable_events AS payable
  JOIN (
    SELECT
      (item.value ->> 'payable_event_id')::uuid AS payable_event_id
    FROM jsonb_array_elements(p_allocations) AS item(value)
  ) AS input
    ON input.payable_event_id = payable.id
  ORDER BY payable.id
  FOR SHARE OF payable;

  SELECT
    COUNT(*),
    MIN(payable.supplier_id::text)::uuid
  INTO
    v_resolved_count,
    v_supplier_id
  FROM public.supplier_payable_events AS payable
  JOIN (
    SELECT
      (item.value ->> 'payable_event_id')::uuid AS payable_event_id
    FROM jsonb_array_elements(p_allocations) AS item(value)
  ) AS input
    ON input.payable_event_id = payable.id
  WHERE payable.tenant_id = p_tenant_id
    AND payable.project_id = p_project_id
    AND payable.tenant_supplier_id = p_tenant_supplier_id
    AND payable.currency = 'CNY';

  IF v_resolved_count <> v_allocation_count
    OR EXISTS (
      SELECT 1
      FROM public.supplier_payable_events AS payable
      JOIN (
        SELECT
          (item.value ->> 'payable_event_id')::uuid AS payable_event_id
        FROM jsonb_array_elements(p_allocations) AS item(value)
      ) AS input
        ON input.payable_event_id = payable.id
      WHERE payable.supplier_id IS DISTINCT FROM v_supplier_id
    )
  THEN
    v_result := jsonb_build_object(
      'status', 'scope_mismatch',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_SCOPE_MISMATCH',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id,
      'supplier_payment_request',
      p_payment_request_id,
      'save_supplier_payment_request_draft',
      v_request,
      v_result,
      p_actor_user_id,
      p_actor_employee_id,
      p_idempotency_key,
      GREATEST(p_expected_version, 1)
    );
  END IF;

  SELECT payment_request.*
  INTO v_payment_request
  FROM public.supplier_payment_requests AS payment_request
  WHERE payment_request.id = p_payment_request_id
  FOR UPDATE;
  v_request_exists := FOUND;

  IF v_request_exists
    AND v_payment_request.tenant_id IS DISTINCT FROM p_tenant_id
  THEN
    v_result := jsonb_build_object(
      'status', 'scope_mismatch',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_SCOPE_MISMATCH',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id,
      'supplier_payment_request',
      p_payment_request_id,
      'save_supplier_payment_request_draft',
      v_request,
      v_result,
      p_actor_user_id,
      p_actor_employee_id,
      p_idempotency_key,
      GREATEST(p_expected_version, 1)
    );
  END IF;

  IF v_request_exists
    AND v_payment_request.version <> p_expected_version
  THEN
    v_result := jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id,
      'supplier_payment_request',
      p_payment_request_id,
      'save_supplier_payment_request_draft',
      v_request,
      v_result,
      p_actor_user_id,
      p_actor_employee_id,
      p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  IF v_request_exists AND v_payment_request.status <> 'draft' THEN
    v_result := jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id,
      'supplier_payment_request',
      p_payment_request_id,
      'save_supplier_payment_request_draft',
      v_request,
      v_result,
      p_actor_user_id,
      p_actor_employee_id,
      p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  IF NOT v_request_exists AND p_expected_version <> 0 THEN
    v_result := jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id,
      'supplier_payment_request',
      p_payment_request_id,
      'save_supplier_payment_request_draft',
      v_request,
      v_result,
      p_actor_user_id,
      p_actor_employee_id,
      p_idempotency_key,
      1
    );
  END IF;

  PERFORM set_config('app.supplier_payment_command', 'on', true);

  IF NOT v_request_exists THEN
    INSERT INTO public.supplier_payment_requests (
      id,
      tenant_id,
      project_id,
      tenant_supplier_id,
      supplier_id,
      requested_amount,
      reason,
      remark,
      created_by_employee_id,
      updated_by_employee_id
    )
    VALUES (
      p_payment_request_id,
      p_tenant_id,
      p_project_id,
      p_tenant_supplier_id,
      v_supplier_id,
      v_requested_amount,
      btrim(p_reason),
      CASE WHEN p_remark IS NULL THEN NULL ELSE btrim(p_remark) END,
      p_actor_employee_id,
      p_actor_employee_id
    )
    RETURNING * INTO v_payment_request;
  ELSE
    UPDATE public.supplier_payment_requests AS payment_request
    SET project_id = p_project_id,
        tenant_supplier_id = p_tenant_supplier_id,
        supplier_id = v_supplier_id,
        requested_amount = v_requested_amount,
        reason = btrim(p_reason),
        remark = CASE
          WHEN p_remark IS NULL THEN NULL
          ELSE btrim(p_remark)
        END,
        version = payment_request.version + 1,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = now()
    WHERE payment_request.id = p_payment_request_id
      AND payment_request.tenant_id = p_tenant_id
      AND payment_request.status = 'draft'
    RETURNING * INTO v_payment_request;

    DELETE FROM public.supplier_payment_request_allocations
    WHERE payment_request_id = p_payment_request_id
      AND tenant_id = p_tenant_id;
  END IF;

  INSERT INTO public.supplier_payment_request_allocations (
    tenant_id,
    payment_request_id,
    payable_event_id,
    requested_amount
  )
  SELECT
    p_tenant_id,
    p_payment_request_id,
    (item.value ->> 'payable_event_id')::uuid,
    (item.value ->> 'requested_amount')::numeric(18, 2)
  FROM jsonb_array_elements(p_allocations) AS item(value);

  v_result := jsonb_build_object(
    'status', 'saved',
    'idempotent', false,
    'payment_request',
      public.supplier_payment_request_to_jsonb(v_payment_request),
    'version', v_payment_request.version
  );
  RETURN public.record_supplier_payment_command_result(
    p_tenant_id,
    'supplier_payment_request',
    p_payment_request_id,
    'save_supplier_payment_request_draft',
    v_request,
    v_result,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_payment_request.version
  );
END;
$$;

CREATE FUNCTION public.submit_supplier_payment_request(
  p_payment_request_id uuid,
  p_tenant_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_payment_request public.supplier_payment_requests%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
  v_requested_amount numeric(18, 2);
  v_unavailable_count integer;
BEGIN
  IF p_payment_request_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version < 1
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(btrim(p_idempotency_key)) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PAYMENT_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );
  v_request := jsonb_build_object(
    'payment_request_id', p_payment_request_id,
    'tenant_id', p_tenant_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' ||
        p_idempotency_key,
      0
    )
  );
  SELECT event.*
  INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_payment_request'
      OR v_event.resource_id <> p_payment_request_id
      OR v_event.command <> 'submit_supplier_payment_request'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object(
      'idempotent', true
    );
  END IF;

  SELECT payment_request.*
  INTO v_payment_request
  FROM public.supplier_payment_requests AS payment_request
  WHERE payment_request.id = p_payment_request_id
    AND payment_request.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_result := jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_NOT_FOUND',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'submit_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key, 1
    );
  END IF;

  IF v_payment_request.version <> p_expected_version THEN
    v_result := jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'submit_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  IF v_payment_request.status <> 'draft' THEN
    v_result := jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'submit_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  PERFORM payable.id
  FROM public.supplier_payable_events AS payable
  JOIN public.supplier_payment_request_allocations AS current_allocation
    ON current_allocation.payable_event_id = payable.id
    AND current_allocation.tenant_id = payable.tenant_id
  WHERE current_allocation.payment_request_id = p_payment_request_id
    AND current_allocation.tenant_id = p_tenant_id
  ORDER BY payable.id
  FOR UPDATE OF payable;

  PERFORM active_allocation.id
  FROM public.supplier_payment_request_allocations AS active_allocation
  JOIN public.supplier_payment_requests AS active_request
    ON active_request.id = active_allocation.payment_request_id
    AND active_request.tenant_id = active_allocation.tenant_id
  WHERE active_allocation.tenant_id = p_tenant_id
    AND active_allocation.payable_event_id IN (
      SELECT allocation.payable_event_id
      FROM public.supplier_payment_request_allocations AS allocation
      WHERE allocation.payment_request_id = p_payment_request_id
        AND allocation.tenant_id = p_tenant_id
    )
    AND active_request.status IN (
      'pending_approval',
      'approved',
      'partially_paid'
    )
  ORDER BY
    active_allocation.payment_request_id,
    active_allocation.payable_event_id
  FOR UPDATE OF active_allocation;

  PERFORM current_allocation.id
  FROM public.supplier_payment_request_allocations AS current_allocation
  WHERE current_allocation.payment_request_id = p_payment_request_id
    AND current_allocation.tenant_id = p_tenant_id
  ORDER BY current_allocation.payable_event_id
  FOR UPDATE;

  WITH current_allocations AS MATERIALIZED (
    SELECT allocation.*
    FROM public.supplier_payment_request_allocations AS allocation
    WHERE allocation.payment_request_id = p_payment_request_id
      AND allocation.tenant_id = p_tenant_id
  ),
  paid AS MATERIALIZED (
    SELECT
      payment_allocation.payable_event_id,
      SUM(payment_allocation.amount)::numeric(18, 2) AS amount
    FROM public.supplier_payment_allocations AS payment_allocation
    WHERE payment_allocation.tenant_id = p_tenant_id
      AND payment_allocation.payable_event_id IN (
        SELECT payable_event_id FROM current_allocations
      )
    GROUP BY payment_allocation.payable_event_id
  ),
  other_reserved AS MATERIALIZED (
    SELECT
      active_allocation.payable_event_id,
      SUM(
        active_allocation.requested_amount -
          active_allocation.paid_amount
      )::numeric(18, 2) AS amount
    FROM public.supplier_payment_request_allocations AS active_allocation
    JOIN public.supplier_payment_requests AS active_request
      ON active_request.id = active_allocation.payment_request_id
      AND active_request.tenant_id = active_allocation.tenant_id
    WHERE active_allocation.tenant_id = p_tenant_id
      AND active_allocation.payment_request_id <> p_payment_request_id
      AND active_request.status IN (
        'pending_approval',
        'approved',
        'partially_paid'
      )
      AND active_allocation.payable_event_id IN (
        SELECT payable_event_id FROM current_allocations
      )
    GROUP BY active_allocation.payable_event_id
  )
  SELECT
    COUNT(*) FILTER (
      WHERE current_allocation.requested_amount >
        payable.amount -
          COALESCE(paid.amount, 0) -
          COALESCE(other_reserved.amount, 0)
    ),
    SUM(current_allocation.requested_amount)::numeric(18, 2)
  INTO v_unavailable_count, v_requested_amount
  FROM current_allocations AS current_allocation
  JOIN public.supplier_payable_events AS payable
    ON payable.id = current_allocation.payable_event_id
    AND payable.tenant_id = current_allocation.tenant_id
  LEFT JOIN paid
    ON paid.payable_event_id = current_allocation.payable_event_id
  LEFT JOIN other_reserved
    ON other_reserved.payable_event_id =
      current_allocation.payable_event_id;

  IF v_requested_amount IS NULL OR v_requested_amount <= 0 THEN
    v_result := jsonb_build_object(
      'status', 'allocation_invalid',
      'error_code', 'SUPPLIER_PAYMENT_ALLOCATION_INVALID',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'submit_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  IF v_unavailable_count > 0 THEN
    v_result := jsonb_build_object(
      'status', 'amount_unavailable',
      'error_code', 'SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE',
      'idempotent', false
    );
    RETURN public.record_supplier_payment_command_result(
      p_tenant_id, 'supplier_payment_request', p_payment_request_id,
      'submit_supplier_payment_request', v_request, v_result,
      p_actor_user_id, p_actor_employee_id, p_idempotency_key,
      v_payment_request.version
    );
  END IF;

  PERFORM set_config('app.supplier_payment_command', 'on', true);
  UPDATE public.supplier_payment_requests AS payment_request
  SET status = 'pending_approval',
      requested_amount = v_requested_amount,
      submitted_by_employee_id = p_actor_employee_id,
      submitted_at = now(),
      version = payment_request.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE payment_request.id = p_payment_request_id
    AND payment_request.tenant_id = p_tenant_id
  RETURNING * INTO v_payment_request;

  v_result := jsonb_build_object(
    'status', 'submitted',
    'idempotent', false,
    'payment_request',
      public.supplier_payment_request_to_jsonb(v_payment_request),
    'version', v_payment_request.version
  );
  RETURN public.record_supplier_payment_command_result(
    p_tenant_id, 'supplier_payment_request', p_payment_request_id,
    'submit_supplier_payment_request', v_request, v_result,
    p_actor_user_id, p_actor_employee_id, p_idempotency_key,
    v_payment_request.version
  );
END;
$$;

GRANT SELECT ON TABLE
  public.supplier_payment_requests,
  public.supplier_payment_request_allocations,
  public.supplier_payments,
  public.supplier_payment_allocations
TO service_role;

REVOKE ALL ON FUNCTION
  public.prevent_supplier_payment_fact_mutation(),
  public.require_supplier_payment_command_context()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.supplier_payment_request_to_jsonb(
  p_request public.supplier_payment_requests
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', p_request.id,
    'tenant_id', p_request.tenant_id,
    'project_id', p_request.project_id,
    'tenant_supplier_id', p_request.tenant_supplier_id,
    'supplier_id', p_request.supplier_id,
    'request_no', p_request.request_no,
    'status', p_request.status,
    'currency', p_request.currency,
    'requested_amount', p_request.requested_amount::text,
    'paid_amount', p_request.paid_amount::text,
    'reason', p_request.reason,
    'remark', p_request.remark,
    'version', p_request.version,
    'submitted_by_employee_id', p_request.submitted_by_employee_id,
    'submitted_at', p_request.submitted_at,
    'reviewed_by_employee_id', p_request.reviewed_by_employee_id,
    'reviewed_at', p_request.reviewed_at,
    'review_remark', p_request.review_remark,
    'cancelled_by_employee_id', p_request.cancelled_by_employee_id,
    'cancelled_at', p_request.cancelled_at,
    'cancel_reason', p_request.cancel_reason,
    'closed_by_employee_id', p_request.closed_by_employee_id,
    'closed_at', p_request.closed_at,
    'close_reason', p_request.close_reason,
    'created_by_employee_id', p_request.created_by_employee_id,
    'updated_by_employee_id', p_request.updated_by_employee_id,
    'created_at', p_request.created_at,
    'updated_at', p_request.updated_at
  );
$$;

CREATE FUNCTION public.supplier_payment_to_jsonb(
  p_payment public.supplier_payments
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', p_payment.id,
    'tenant_id', p_payment.tenant_id,
    'project_id', p_payment.project_id,
    'tenant_supplier_id', p_payment.tenant_supplier_id,
    'supplier_id', p_payment.supplier_id,
    'payment_request_id', p_payment.payment_request_id,
    'payment_no', p_payment.payment_no,
    'currency', p_payment.currency,
    'amount', p_payment.amount::text,
    'payment_method', p_payment.payment_method,
    'payment_reference', p_payment.payment_reference,
    'paid_at', p_payment.paid_at,
    'evidence_images', p_payment.evidence_images,
    'remark', p_payment.remark,
    'confirmed_by_employee_id', p_payment.confirmed_by_employee_id,
    'idempotency_key', p_payment.idempotency_key,
    'created_at', p_payment.created_at
  );
$$;

CREATE FUNCTION public.record_supplier_payment_command_result(
  p_tenant_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_command text,
  p_request jsonb,
  p_result jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_result_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    p_resource_type,
    p_resource_id,
    p_command,
    jsonb_build_object('_request', p_request),
    p_result - 'idempotent',
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    GREATEST(p_result_version, 1)
  );
  RETURN p_result;
END;
$$;

REVOKE ALL ON FUNCTION
  public.supplier_payment_request_to_jsonb(
    public.supplier_payment_requests
  ),
  public.supplier_payment_to_jsonb(public.supplier_payments),
  public.record_supplier_payment_command_result(
    uuid,
    text,
    uuid,
    text,
    jsonb,
    jsonb,
    uuid,
    uuid,
    text,
    integer
  )
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.list_supplier_payables(
  p_tenant_id uuid,
  p_project_id uuid DEFAULT NULL,
  p_tenant_supplier_id uuid DEFAULT NULL,
  p_purchase_order_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_due_from timestamptz DEFAULT NULL,
  p_due_to timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_items jsonb;
  v_total bigint;
BEGIN
  IF p_tenant_id IS NULL
    OR p_page IS NULL
    OR p_page_size IS NULL
    OR p_page < 1
    OR p_page_size NOT BETWEEN 1 AND 100
    OR p_status IS NOT NULL
      AND p_status NOT IN (
        'open', 'reserved', 'partially_paid', 'paid', 'overdue'
      )
    OR p_due_from IS NOT NULL
      AND p_due_to IS NOT NULL
      AND p_due_to < p_due_from
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PAYMENT_PAGINATION_INVALID';
  END IF;

  WITH paid AS MATERIALIZED (
    SELECT
      payment_allocation.payable_event_id,
      SUM(payment_allocation.amount)::numeric(18, 2) AS paid_amount
    FROM public.supplier_payment_allocations AS payment_allocation
    JOIN public.supplier_payable_events AS payable
      ON payable.id = payment_allocation.payable_event_id
      AND payable.tenant_id = payment_allocation.tenant_id
    WHERE payment_allocation.tenant_id = p_tenant_id
    GROUP BY payment_allocation.payable_event_id
  ),
  reserved AS MATERIALIZED (
    SELECT
      allocation.payable_event_id,
      SUM(
        allocation.requested_amount - allocation.paid_amount
      )::numeric(18, 2) AS reserved_amount
    FROM public.supplier_payment_request_allocations AS allocation
    JOIN public.supplier_payment_requests AS payment_request
      ON payment_request.id = allocation.payment_request_id
      AND payment_request.tenant_id = allocation.tenant_id
    WHERE allocation.tenant_id = p_tenant_id
      AND payment_request.status IN (
        'pending_approval',
        'approved',
        'partially_paid'
      )
    GROUP BY allocation.payable_event_id
  ),
  balances AS MATERIALIZED (
    SELECT
      payable.id,
      payable.project_id,
      payable.tenant_supplier_id,
      payable.supplier_id,
      payable.supplier_purchase_order_id,
      payable.amount,
      payable.currency,
      payable.occurred_at,
      payable.due_at,
      COALESCE(paid.paid_amount, 0)::numeric(18, 2) AS paid_amount,
      COALESCE(reserved.reserved_amount, 0)::numeric(18, 2)
        AS reserved_amount,
      (
        payable.amount - COALESCE(paid.paid_amount, 0)
      )::numeric(18, 2) AS open_amount
    FROM public.supplier_payable_events AS payable
    LEFT JOIN paid ON paid.payable_event_id = payable.id
    LEFT JOIN reserved ON reserved.payable_event_id = payable.id
    WHERE payable.tenant_id = p_tenant_id
      AND (
        p_project_id IS NULL
        OR payable.project_id = p_project_id
      )
      AND (
        p_tenant_supplier_id IS NULL
        OR payable.tenant_supplier_id = p_tenant_supplier_id
      )
      AND (
        p_purchase_order_id IS NULL
        OR payable.supplier_purchase_order_id = p_purchase_order_id
      )
      AND (p_due_from IS NULL OR payable.due_at >= p_due_from)
      AND (p_due_to IS NULL OR payable.due_at <= p_due_to)
  ),
  classified AS MATERIALIZED (
    SELECT
      balances.*,
      CASE
        WHEN balances.open_amount = 0 THEN 'paid'
        WHEN balances.paid_amount > 0 THEN 'partially_paid'
        WHEN balances.due_at < now() THEN 'overdue'
        WHEN balances.reserved_amount > 0 THEN 'reserved'
        ELSE 'open'
      END AS payable_status
    FROM balances
  ),
  filtered AS MATERIALIZED (
    SELECT *
    FROM classified
    WHERE p_status IS NULL OR payable_status = p_status
  ),
  page_rows AS MATERIALIZED (
    SELECT
      filtered.*,
      COUNT(*) OVER () AS total_count
    FROM filtered
    ORDER BY filtered.due_at ASC, filtered.id DESC
    LIMIT p_page_size
    OFFSET (p_page - 1) * p_page_size
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', page_rows.id,
          'project_id', page_rows.project_id,
          'tenant_supplier_id', page_rows.tenant_supplier_id,
          'supplier_id', page_rows.supplier_id,
          'supplier_purchase_order_id',
            page_rows.supplier_purchase_order_id,
          'amount', page_rows.amount::text,
          'paid_amount', page_rows.paid_amount::text,
          'reserved_amount', page_rows.reserved_amount::text,
          'open_amount', page_rows.open_amount::text,
          'currency', page_rows.currency,
          'occurred_at', page_rows.occurred_at,
          'due_at', page_rows.due_at,
          'status', page_rows.payable_status
        )
        ORDER BY page_rows.due_at ASC, page_rows.id DESC
      ),
      '[]'::jsonb
    ),
    (SELECT COUNT(*) FROM filtered)
  INTO v_items, v_total
  FROM page_rows;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$;

CREATE FUNCTION public.list_supplier_payment_requests(
  p_tenant_id uuid,
  p_project_id uuid DEFAULT NULL,
  p_tenant_supplier_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_keyword text DEFAULT NULL,
  p_created_from timestamptz DEFAULT NULL,
  p_created_to timestamptz DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_items jsonb;
  v_total bigint;
BEGIN
  IF p_tenant_id IS NULL
    OR p_page IS NULL
    OR p_page_size IS NULL
    OR p_page < 1
    OR p_page_size NOT BETWEEN 1 AND 100
    OR p_status IS NOT NULL
      AND p_status NOT IN (
        'draft',
        'pending_approval',
        'approved',
        'partially_paid',
        'paid',
        'rejected',
        'cancelled',
        'closed'
      )
    OR p_keyword IS NOT NULL
      AND (
        btrim(p_keyword) = ''
        OR char_length(btrim(p_keyword)) > 100
      )
    OR p_created_from IS NOT NULL
      AND p_created_to IS NOT NULL
      AND p_created_to < p_created_from
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PAYMENT_PAGINATION_INVALID';
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT
      payment_request.id,
      payment_request.project_id,
      payment_request.tenant_supplier_id,
      payment_request.supplier_id,
      supplier.name AS supplier_name,
      payment_request.request_no,
      payment_request.status,
      payment_request.currency,
      payment_request.requested_amount,
      payment_request.paid_amount,
      payment_request.reason,
      payment_request.version,
      payment_request.created_at,
      payment_request.updated_at
    FROM public.supplier_payment_requests AS payment_request
    JOIN public.suppliers AS supplier
      ON supplier.id = payment_request.supplier_id
    WHERE payment_request.tenant_id = p_tenant_id
      AND (
        p_project_id IS NULL
        OR payment_request.project_id = p_project_id
      )
      AND (
        p_tenant_supplier_id IS NULL
        OR payment_request.tenant_supplier_id = p_tenant_supplier_id
      )
      AND (p_status IS NULL OR payment_request.status = p_status)
      AND (
        p_keyword IS NULL
        OR payment_request.request_no ILIKE
          '%' || btrim(p_keyword) || '%'
        OR supplier.name ILIKE '%' || btrim(p_keyword) || '%'
      )
      AND (
        p_created_from IS NULL
        OR payment_request.created_at >= p_created_from
      )
      AND (
        p_created_to IS NULL
        OR payment_request.created_at <= p_created_to
      )
  ),
  page_rows AS MATERIALIZED (
    SELECT
      filtered.*,
      COUNT(*) OVER () AS total_count
    FROM filtered
    ORDER BY filtered.updated_at DESC, filtered.id DESC
    LIMIT p_page_size
    OFFSET (p_page - 1) * p_page_size
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', page_rows.id,
          'project_id', page_rows.project_id,
          'tenant_supplier_id', page_rows.tenant_supplier_id,
          'supplier_id', page_rows.supplier_id,
          'supplier_name', page_rows.supplier_name,
          'request_no', page_rows.request_no,
          'status', page_rows.status,
          'currency', page_rows.currency,
          'requested_amount', page_rows.requested_amount::text,
          'paid_amount', page_rows.paid_amount::text,
          'reason', page_rows.reason,
          'version', page_rows.version,
          'created_at', page_rows.created_at,
          'updated_at', page_rows.updated_at
        )
        ORDER BY page_rows.updated_at DESC, page_rows.id DESC
      ),
      '[]'::jsonb
    ),
    (SELECT COUNT(*) FROM filtered)
  INTO v_items, v_total
  FROM page_rows;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$;

CREATE FUNCTION public.get_supplier_payment_request_detail(
  p_tenant_id uuid,
  p_payment_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_payment_request public.supplier_payment_requests%ROWTYPE;
  v_allocations jsonb;
BEGIN
  SELECT payment_request.*
  INTO v_payment_request
  FROM public.supplier_payment_requests AS payment_request
  WHERE payment_request.id = p_payment_request_id
    AND payment_request.tenant_id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', allocation.id,
        'payable_event_id', allocation.payable_event_id,
        'requested_amount', allocation.requested_amount::text,
        'paid_amount', allocation.paid_amount::text,
        'payable_amount', payable.amount::text,
        'due_at', payable.due_at,
        'supplier_purchase_order_id',
          payable.supplier_purchase_order_id
      )
      ORDER BY payable.due_at, allocation.payable_event_id
    ),
    '[]'::jsonb
  )
  INTO v_allocations
  FROM public.supplier_payment_request_allocations AS allocation
  JOIN public.supplier_payable_events AS payable
    ON payable.id = allocation.payable_event_id
    AND payable.tenant_id = allocation.tenant_id
  WHERE allocation.payment_request_id = p_payment_request_id
    AND allocation.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'payment_request',
      public.supplier_payment_request_to_jsonb(v_payment_request),
    'allocations', v_allocations
  );
END;
$$;

CREATE FUNCTION public.list_supplier_payment_request_payments(
  p_tenant_id uuid,
  p_payment_request_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_items jsonb;
  v_total bigint;
BEGIN
  IF p_tenant_id IS NULL
    OR p_payment_request_id IS NULL
    OR p_page IS NULL
    OR p_page_size IS NULL
    OR p_page < 1
    OR p_page_size NOT BETWEEN 1 AND 100
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PAYMENT_PAGINATION_INVALID';
  END IF;

  WITH filtered AS MATERIALIZED (
    SELECT
      payment.id,
      payment.payment_no,
      payment.amount,
      payment.currency,
      payment.payment_method,
      payment.payment_reference,
      payment.paid_at,
      payment.evidence_images,
      payment.remark,
      payment.confirmed_by_employee_id,
      payment.created_at
    FROM public.supplier_payments AS payment
    WHERE payment.tenant_id = p_tenant_id
      AND payment.payment_request_id = p_payment_request_id
  ),
  page_rows AS MATERIALIZED (
    SELECT
      filtered.*,
      COUNT(*) OVER () AS total_count
    FROM filtered
    ORDER BY filtered.paid_at DESC, filtered.id DESC
    LIMIT p_page_size
    OFFSET (p_page - 1) * p_page_size
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', page_rows.id,
          'payment_no', page_rows.payment_no,
          'amount', page_rows.amount::text,
          'currency', page_rows.currency,
          'payment_method', page_rows.payment_method,
          'payment_reference', page_rows.payment_reference,
          'paid_at', page_rows.paid_at,
          'evidence_images', page_rows.evidence_images,
          'remark', page_rows.remark,
          'confirmed_by_employee_id',
            page_rows.confirmed_by_employee_id,
          'created_at', page_rows.created_at
        )
        ORDER BY page_rows.paid_at DESC, page_rows.id DESC
      ),
      '[]'::jsonb
    ),
    (SELECT COUNT(*) FROM filtered)
  INTO v_items, v_total
  FROM page_rows;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$;

CREATE FUNCTION public.get_supplier_purchase_order_financial_summary(
  p_tenant_id uuid,
  p_supplier_purchase_order_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH costs AS (
    SELECT COALESCE(SUM(cost.amount), 0)::numeric(18, 2) AS amount
    FROM public.project_cost_events AS cost
    WHERE cost.tenant_id = p_tenant_id
      AND cost.supplier_purchase_order_id =
        p_supplier_purchase_order_id
  ),
  payables AS (
    SELECT COALESCE(SUM(payable.amount), 0)::numeric(18, 2) AS amount
    FROM public.supplier_payable_events AS payable
    WHERE payable.tenant_id = p_tenant_id
      AND payable.supplier_purchase_order_id =
        p_supplier_purchase_order_id
  ),
  paid AS (
    SELECT
      COALESCE(SUM(payment_allocation.amount), 0)::numeric(18, 2)
        AS amount
    FROM public.supplier_payment_allocations AS payment_allocation
    JOIN public.supplier_payable_events AS payable
      ON payable.id = payment_allocation.payable_event_id
      AND payable.tenant_id = payment_allocation.tenant_id
    WHERE payment_allocation.tenant_id = p_tenant_id
      AND payable.supplier_purchase_order_id =
        p_supplier_purchase_order_id
  )
  SELECT jsonb_build_object(
    'supplier_purchase_order_id', p_supplier_purchase_order_id,
    'recognized_cost_amount', costs.amount::text,
    'payable_amount', payables.amount::text,
    'paid_amount', paid.amount::text,
    'outstanding_amount',
      GREATEST(payables.amount - paid.amount, 0)::text
  )
  FROM costs CROSS JOIN payables CROSS JOIN paid;
$$;

REVOKE ALL ON FUNCTION
  public.save_supplier_payment_request_draft(
    uuid,
    uuid,
    uuid,
    uuid,
    integer,
    text,
    text,
    jsonb,
    uuid,
    uuid,
    text
  ),
  public.submit_supplier_payment_request(
    uuid,
    uuid,
    integer,
    uuid,
    uuid,
    text
  ),
  public.review_supplier_payment_request(
    uuid,
    uuid,
    integer,
    text,
    text,
    uuid,
    uuid,
    text
  ),
  public.cancel_supplier_payment_request(
    uuid,
    uuid,
    integer,
    text,
    uuid,
    uuid,
    text
  ),
  public.close_supplier_payment_request(
    uuid,
    uuid,
    integer,
    text,
    uuid,
    uuid,
    text
  ),
  public.confirm_supplier_payment(
    uuid,
    uuid,
    uuid,
    integer,
    text,
    text,
    timestamptz,
    jsonb,
    text,
    jsonb,
    uuid,
    uuid,
    text
  ),
  public.list_supplier_payables(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    timestamptz,
    timestamptz,
    integer,
    integer
  ),
  public.list_supplier_payment_requests(
    uuid,
    uuid,
    uuid,
    text,
    text,
    timestamptz,
    timestamptz,
    integer,
    integer
  ),
  public.get_supplier_payment_request_detail(uuid, uuid),
  public.list_supplier_payment_request_payments(
    uuid,
    uuid,
    integer,
    integer
  ),
  public.get_supplier_purchase_order_financial_summary(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.save_supplier_payment_request_draft(
    uuid,
    uuid,
    uuid,
    uuid,
    integer,
    text,
    text,
    jsonb,
    uuid,
    uuid,
    text
  ),
  public.submit_supplier_payment_request(
    uuid,
    uuid,
    integer,
    uuid,
    uuid,
    text
  ),
  public.review_supplier_payment_request(
    uuid,
    uuid,
    integer,
    text,
    text,
    uuid,
    uuid,
    text
  ),
  public.cancel_supplier_payment_request(
    uuid,
    uuid,
    integer,
    text,
    uuid,
    uuid,
    text
  ),
  public.close_supplier_payment_request(
    uuid,
    uuid,
    integer,
    text,
    uuid,
    uuid,
    text
  ),
  public.confirm_supplier_payment(
    uuid,
    uuid,
    uuid,
    integer,
    text,
    text,
    timestamptz,
    jsonb,
    text,
    jsonb,
    uuid,
    uuid,
    text
  ),
  public.list_supplier_payables(
    uuid,
    uuid,
    uuid,
    uuid,
    text,
    timestamptz,
    timestamptz,
    integer,
    integer
  ),
  public.list_supplier_payment_requests(
    uuid,
    uuid,
    uuid,
    text,
    text,
    timestamptz,
    timestamptz,
    integer,
    integer
  ),
  public.get_supplier_payment_request_detail(uuid, uuid),
  public.list_supplier_payment_request_payments(
    uuid,
    uuid,
    integer,
    integer
  ),
  public.get_supplier_purchase_order_financial_summary(uuid, uuid)
TO service_role;

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
  (
    'supplier.payable.view',
    '查看供应商应付',
    'supplier',
    'payable',
    'view',
    '查看当前租户项目供应商应付余额',
    'active'
  ),
  (
    'supplier.payment-request.view',
    '查看供应商付款申请',
    'supplier',
    'payment_request',
    'view',
    '查看当前租户供应商付款申请和付款记录',
    'active'
  ),
  (
    'supplier.payment-request.manage',
    '管理供应商付款申请',
    'supplier',
    'payment_request',
    'manage',
    '保存、提交、取消和关闭供应商付款申请',
    'active'
  ),
  (
    'supplier.payment-request.approve',
    '审批供应商付款申请',
    'supplier',
    'payment_request',
    'approve',
    '批准或驳回供应商付款申请',
    'active'
  ),
  (
    'supplier.payment-request.pay',
    '确认供应商付款',
    'supplier',
    'payment_request',
    'pay',
    '确认供应商付款并写入现金台账',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (
  role_id,
  permission_id,
  access_scope
)
SELECT
  roles.id,
  permissions.id,
  'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'supplier.payable.view',
    'supplier.payment-request.view',
    'supplier.payment-request.manage',
    'supplier.payment-request.approve',
    'supplier.payment-request.pay'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMIT;
