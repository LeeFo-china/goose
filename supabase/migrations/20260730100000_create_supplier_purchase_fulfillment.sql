-- Rollback: use a forward migration to revoke the fulfillment commands and
-- hide their API/UI entry points. Preserve every fulfillment accumulator,
-- shipment, receipt, line, and supplier command event as fulfillment audit
-- facts. A rollback must never erase submitted-order history.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.supplier_purchase_order_items
ADD CONSTRAINT supplier_purchase_order_items_id_tenant_order_key
UNIQUE (id, tenant_id, supplier_purchase_order_id);

CREATE TABLE public.supplier_purchase_order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  ordered_quantity numeric(20, 4) NOT NULL DEFAULT 0,
  shipped_quantity numeric(20, 4) NOT NULL DEFAULT 0,
  received_quantity numeric(20, 4) NOT NULL DEFAULT 0,
  accepted_quantity numeric(20, 4) NOT NULL DEFAULT 0,
  rejected_quantity numeric(20, 4) NOT NULL DEFAULT 0,
  accepted_subtotal_amount numeric(18, 2) NOT NULL DEFAULT 0,
  accepted_tax_amount numeric(18, 2) NOT NULL DEFAULT 0,
  accepted_total_amount numeric(18, 2) NOT NULL DEFAULT 0,
  confirmed_at timestamptz NOT NULL,
  confirmed_by_user_id uuid NOT NULL,
  confirmed_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  confirmation_remark text NULL,
  cancelled_at timestamptz NULL,
  cancelled_by_user_id uuid NULL,
  cancelled_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  cancel_reason text NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_order_fulfillments_order_tenant_fkey
    FOREIGN KEY (supplier_purchase_order_id, tenant_id)
    REFERENCES public.supplier_purchase_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_fulfillments_status_check
    CHECK (status IN (
      'confirmed',
      'partially_shipped',
      'shipped',
      'partially_received',
      'received',
      'received_with_variance',
      'cancelled'
    )
  ),
  CONSTRAINT supplier_purchase_order_fulfillments_quantities_check CHECK (
    ordered_quantity >= 0
    AND shipped_quantity >= 0
    AND received_quantity >= 0
    AND accepted_quantity >= 0
    AND rejected_quantity >= 0
    AND received_quantity <= shipped_quantity
    AND shipped_quantity <= ordered_quantity
    AND accepted_quantity + rejected_quantity = received_quantity
  ),
  CONSTRAINT supplier_purchase_order_fulfillments_amounts_check CHECK (
    accepted_subtotal_amount >= 0
    AND accepted_tax_amount >= 0
    AND accepted_total_amount >= 0
    AND accepted_total_amount =
      accepted_subtotal_amount + accepted_tax_amount
  ),
  CONSTRAINT supplier_purchase_order_fulfillments_version_check
    CHECK (version > 0),
  CONSTRAINT supplier_purchase_order_fulfillments_remark_check CHECK (
    confirmation_remark IS NULL
    OR (
      confirmation_remark = btrim(confirmation_remark)
      AND confirmation_remark <> ''
      AND char_length(confirmation_remark) <= 500
    )
  ),
  CONSTRAINT supplier_purchase_order_fulfillments_cancel_check CHECK (
    (
      status <> 'cancelled'
      AND cancelled_at IS NULL
      AND cancelled_by_user_id IS NULL
      AND cancelled_by_employee_id IS NULL
      AND cancel_reason IS NULL
    )
    OR (
      status = 'cancelled'
      AND cancelled_at IS NOT NULL
      AND cancelled_by_user_id IS NOT NULL
      AND cancelled_by_employee_id IS NOT NULL
      AND cancel_reason IS NOT NULL
      AND cancel_reason = btrim(cancel_reason)
      AND cancel_reason <> ''
      AND char_length(cancel_reason) <= 500
    )
  ),
  CONSTRAINT supplier_purchase_order_fulfillments_order_key
    UNIQUE (supplier_purchase_order_id),
  CONSTRAINT supplier_purchase_order_fulfillments_id_tenant_order_key
    UNIQUE (id, tenant_id, supplier_purchase_order_id)
);

CREATE TABLE public.supplier_purchase_order_item_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  supplier_purchase_order_fulfillment_id uuid NOT NULL,
  supplier_purchase_order_item_id uuid NOT NULL,
  ordered_quantity numeric(18, 4) NOT NULL,
  shipped_quantity numeric(18, 4) NOT NULL DEFAULT 0,
  received_quantity numeric(18, 4) NOT NULL DEFAULT 0,
  accepted_quantity numeric(18, 4) NOT NULL DEFAULT 0,
  rejected_quantity numeric(18, 4) NOT NULL DEFAULT 0,
  accepted_subtotal_amount numeric(18, 2) NOT NULL DEFAULT 0,
  accepted_tax_amount numeric(18, 2) NOT NULL DEFAULT 0,
  accepted_total_amount numeric(18, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_order_item_fulfillments_parent_fkey
    FOREIGN KEY (supplier_purchase_order_fulfillment_id, tenant_id, supplier_purchase_order_id)
    REFERENCES public.supplier_purchase_order_fulfillments(
      id, tenant_id, supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_item_fulfillments_item_fkey
    FOREIGN KEY (supplier_purchase_order_item_id, tenant_id, supplier_purchase_order_id)
    REFERENCES public.supplier_purchase_order_items(
      id, tenant_id, supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_item_fulfillments_quantities_check CHECK (
    ordered_quantity > 0
    AND shipped_quantity >= 0
    AND received_quantity >= 0
    AND accepted_quantity >= 0
    AND rejected_quantity >= 0
    AND received_quantity <= shipped_quantity
    AND shipped_quantity <= ordered_quantity
    AND accepted_quantity + rejected_quantity = received_quantity
  ),
  CONSTRAINT supplier_purchase_order_item_fulfillments_amounts_check CHECK (
    accepted_subtotal_amount >= 0
    AND accepted_tax_amount >= 0
    AND accepted_total_amount >= 0
    AND accepted_total_amount =
      accepted_subtotal_amount + accepted_tax_amount
  ),
  CONSTRAINT supplier_purchase_order_item_fulfillments_parent_item_key
    UNIQUE (
      supplier_purchase_order_fulfillment_id,
      supplier_purchase_order_item_id
    ),
  CONSTRAINT supplier_purchase_order_item_fulfillments_id_parent_item_key
    UNIQUE (
      id,
      supplier_purchase_order_fulfillment_id,
      supplier_purchase_order_item_id
    )
);

CREATE TABLE public.supplier_purchase_order_shipments (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  supplier_purchase_order_fulfillment_id uuid NOT NULL,
  shipment_no text NOT NULL,
  shipped_at timestamptz NOT NULL,
  carrier_name text NULL,
  tracking_no text NULL,
  remark text NULL,
  created_by_user_id uuid NOT NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_order_shipments_parent_fkey
    FOREIGN KEY (supplier_purchase_order_fulfillment_id, tenant_id, supplier_purchase_order_id)
    REFERENCES public.supplier_purchase_order_fulfillments(
      id, tenant_id, supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_shipments_no_check CHECK (
    shipment_no = btrim(shipment_no)
    AND shipment_no <> ''
    AND char_length(shipment_no) <= 80
  ),
  CONSTRAINT supplier_purchase_order_shipments_text_check CHECK (
    (
      carrier_name IS NULL
      OR (
        carrier_name = btrim(carrier_name)
        AND carrier_name <> ''
        AND char_length(carrier_name) <= 100
      )
    )
    AND (
      tracking_no IS NULL
      OR (
        tracking_no = btrim(tracking_no)
        AND tracking_no <> ''
        AND char_length(tracking_no) <= 120
      )
    )
    AND (
      remark IS NULL
      OR (
        remark = btrim(remark)
        AND remark <> ''
        AND char_length(remark) <= 500
      )
    )
  ),
  CONSTRAINT supplier_purchase_order_shipments_order_no_key
    UNIQUE (supplier_purchase_order_id, shipment_no),
  CONSTRAINT supplier_purchase_order_shipments_id_tenant_order_key
    UNIQUE (id, tenant_id, supplier_purchase_order_id),
  CONSTRAINT supplier_purchase_order_shipments_id_tenant_parent_order_key
    UNIQUE (
      id,
      tenant_id,
      supplier_purchase_order_fulfillment_id,
      supplier_purchase_order_id
    )
);

CREATE TABLE public.supplier_purchase_order_shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  supplier_purchase_order_fulfillment_id uuid NOT NULL,
  shipment_id uuid NOT NULL,
  supplier_purchase_order_item_id uuid NOT NULL,
  quantity numeric(18, 4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_order_shipment_items_parent_fkey
    FOREIGN KEY (
      shipment_id,
      tenant_id,
      supplier_purchase_order_fulfillment_id,
      supplier_purchase_order_id
    )
    REFERENCES public.supplier_purchase_order_shipments(
      id,
      tenant_id,
      supplier_purchase_order_fulfillment_id,
      supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_shipment_items_item_fkey
    FOREIGN KEY (supplier_purchase_order_item_id, tenant_id, supplier_purchase_order_id)
    REFERENCES public.supplier_purchase_order_items(
      id, tenant_id, supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_shipment_items_quantity_check
    CHECK (quantity > 0),
  CONSTRAINT supplier_purchase_order_shipment_items_parent_item_key
    UNIQUE (
      shipment_id,
      supplier_purchase_order_item_id
    )
);

CREATE TABLE public.supplier_purchase_order_receipts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  supplier_purchase_order_fulfillment_id uuid NOT NULL,
  receipt_no text NOT NULL,
  received_at timestamptz NOT NULL,
  remark text NULL,
  created_by_user_id uuid NOT NULL,
  received_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_order_receipts_parent_fkey
    FOREIGN KEY (supplier_purchase_order_fulfillment_id, tenant_id, supplier_purchase_order_id)
    REFERENCES public.supplier_purchase_order_fulfillments(
      id, tenant_id, supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_receipts_no_check CHECK (
    receipt_no = btrim(receipt_no)
    AND receipt_no <> ''
    AND char_length(receipt_no) <= 80
  ),
  CONSTRAINT supplier_purchase_order_receipts_remark_check CHECK (
    remark IS NULL
    OR (
      remark = btrim(remark)
      AND remark <> ''
      AND char_length(remark) <= 500
    )
  ),
  CONSTRAINT supplier_purchase_order_receipts_order_no_key
    UNIQUE (supplier_purchase_order_id, receipt_no),
  CONSTRAINT supplier_purchase_order_receipts_id_tenant_order_key
    UNIQUE (id, tenant_id, supplier_purchase_order_id),
  CONSTRAINT supplier_purchase_order_receipts_id_tenant_parent_order_key
    UNIQUE (
      id,
      tenant_id,
      supplier_purchase_order_fulfillment_id,
      supplier_purchase_order_id
    )
);

CREATE TABLE public.supplier_purchase_order_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  supplier_purchase_order_fulfillment_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  supplier_purchase_order_item_id uuid NOT NULL,
  accepted_quantity numeric(18, 4) NOT NULL DEFAULT 0,
  rejected_quantity numeric(18, 4) NOT NULL DEFAULT 0,
  variance_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_order_receipt_items_parent_fkey
    FOREIGN KEY (
      receipt_id,
      tenant_id,
      supplier_purchase_order_fulfillment_id,
      supplier_purchase_order_id
    )
    REFERENCES public.supplier_purchase_order_receipts(
      id,
      tenant_id,
      supplier_purchase_order_fulfillment_id,
      supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_receipt_items_item_fkey
    FOREIGN KEY (supplier_purchase_order_item_id, tenant_id, supplier_purchase_order_id)
    REFERENCES public.supplier_purchase_order_items(
      id, tenant_id, supplier_purchase_order_id
    )
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_order_receipt_items_quantity_check CHECK (
    accepted_quantity >= 0
    AND rejected_quantity >= 0
    AND accepted_quantity + rejected_quantity > 0
  ),
  CONSTRAINT supplier_purchase_order_receipt_items_reason_check CHECK (
    (
      rejected_quantity > 0
      AND variance_reason IS NOT NULL
      AND variance_reason = btrim(variance_reason)
      AND variance_reason <> ''
      AND char_length(variance_reason) <= 500
    )
    OR (
      rejected_quantity = 0
      AND variance_reason IS NULL
    )
  ),
  CONSTRAINT supplier_purchase_order_receipt_items_parent_item_key
    UNIQUE (
      receipt_id,
      supplier_purchase_order_item_id
    )
);

CREATE INDEX supplier_purchase_order_fulfillments_tenant_status_updated_idx
ON public.supplier_purchase_order_fulfillments(
  tenant_id,
  status,
  updated_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_order_shipments_tenant_order_shipped_idx
ON public.supplier_purchase_order_shipments(
  tenant_id,
  supplier_purchase_order_id,
  shipped_at DESC,
  id DESC
);

CREATE INDEX supplier_purchase_order_receipts_tenant_order_received_idx
ON public.supplier_purchase_order_receipts(
  tenant_id,
  supplier_purchase_order_id,
  received_at DESC,
  id DESC
);

CREATE FUNCTION public.prevent_supplier_purchase_fulfillment_direct_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_command text := COALESCE(
    pg_catalog.current_setting(
      'private.supplier_purchase_fulfillment_command',
      true
    ),
    ''
  );
BEGIN
  IF TG_OP = 'DELETE'
    OR (
      TG_TABLE_NAME = 'supplier_purchase_order_fulfillments'
      AND NOT (
        (v_command = 'confirm' AND TG_OP IN ('INSERT', 'UPDATE'))
        OR (
          v_command IN ('shipment', 'receipt', 'cancel')
          AND TG_OP = 'UPDATE'
        )
      )
    )
    OR (
      TG_TABLE_NAME = 'supplier_purchase_order_item_fulfillments'
      AND NOT (
        (v_command = 'confirm' AND TG_OP IN ('INSERT', 'UPDATE'))
        OR (
          v_command IN ('shipment', 'receipt')
          AND TG_OP = 'UPDATE'
        )
      )
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_DIRECT_WRITE_FORBIDDEN';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
public.prevent_supplier_purchase_fulfillment_direct_mutation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.prevent_supplier_purchase_fulfillment_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE')
    OR COALESCE(
      pg_catalog.current_setting(
        'private.supplier_purchase_fulfillment_command',
        true
      ),
      ''
    ) NOT IN ('shipment', 'receipt')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_EVENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
public.prevent_supplier_purchase_fulfillment_event_mutation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER supplier_purchase_order_fulfillments_command_only
BEFORE INSERT OR UPDATE OR DELETE
ON public.supplier_purchase_order_fulfillments
FOR EACH ROW
EXECUTE FUNCTION
public.prevent_supplier_purchase_fulfillment_direct_mutation();

CREATE TRIGGER supplier_purchase_order_item_fulfillments_command_only
BEFORE INSERT OR UPDATE OR DELETE
ON public.supplier_purchase_order_item_fulfillments
FOR EACH ROW
EXECUTE FUNCTION
public.prevent_supplier_purchase_fulfillment_direct_mutation();

CREATE TRIGGER supplier_purchase_order_shipments_immutable
BEFORE INSERT OR UPDATE OR DELETE
ON public.supplier_purchase_order_shipments
FOR EACH ROW
EXECUTE FUNCTION
public.prevent_supplier_purchase_fulfillment_event_mutation();

CREATE TRIGGER supplier_purchase_order_shipment_items_immutable
BEFORE INSERT OR UPDATE OR DELETE
ON public.supplier_purchase_order_shipment_items
FOR EACH ROW
EXECUTE FUNCTION
public.prevent_supplier_purchase_fulfillment_event_mutation();

CREATE TRIGGER supplier_purchase_order_receipts_immutable
BEFORE INSERT OR UPDATE OR DELETE
ON public.supplier_purchase_order_receipts
FOR EACH ROW
EXECUTE FUNCTION
public.prevent_supplier_purchase_fulfillment_event_mutation();

CREATE TRIGGER supplier_purchase_order_receipt_items_immutable
BEFORE INSERT OR UPDATE OR DELETE
ON public.supplier_purchase_order_receipt_items
FOR EACH ROW
EXECUTE FUNCTION
public.prevent_supplier_purchase_fulfillment_event_mutation();

CREATE FUNCTION private.recalculate_supplier_purchase_order_fulfillment(
  p_fulfillment_id uuid
)
RETURNS public.supplier_purchase_order_fulfillments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_fulfillment public.supplier_purchase_order_fulfillments%ROWTYPE;
BEGIN
  PERFORM item_fulfillment.id
  FROM public.supplier_purchase_order_item_fulfillments AS item_fulfillment
  WHERE item_fulfillment.supplier_purchase_order_fulfillment_id =
    p_fulfillment_id
  ORDER BY item_fulfillment.id
  FOR UPDATE;

  UPDATE public.supplier_purchase_order_item_fulfillments
    AS item_fulfillment
  SET accepted_subtotal_amount = CASE
        WHEN purchase_item.tax_inclusive THEN
          round(
            round(
              item_fulfillment.accepted_quantity *
                purchase_item.unit_price,
              2
            ) / (1 + purchase_item.tax_rate),
            2
          )
        ELSE round(
          item_fulfillment.accepted_quantity * purchase_item.unit_price,
          2
        )
      END,
      accepted_tax_amount = CASE
        WHEN purchase_item.tax_inclusive THEN
          round(
            item_fulfillment.accepted_quantity * purchase_item.unit_price,
            2
          ) - round(
            round(
              item_fulfillment.accepted_quantity *
                purchase_item.unit_price,
              2
            ) / (1 + purchase_item.tax_rate),
            2
          )
        ELSE round(
          round(
            item_fulfillment.accepted_quantity * purchase_item.unit_price,
            2
          ) * purchase_item.tax_rate,
          2
        )
      END,
      accepted_total_amount = CASE
        WHEN purchase_item.tax_inclusive THEN
          round(
            item_fulfillment.accepted_quantity * purchase_item.unit_price,
            2
          )
        ELSE
          round(
            item_fulfillment.accepted_quantity * purchase_item.unit_price,
            2
          ) + round(
            round(
              item_fulfillment.accepted_quantity *
                purchase_item.unit_price,
              2
            ) * purchase_item.tax_rate,
            2
          )
      END,
      updated_at = now()
  FROM public.supplier_purchase_order_items AS purchase_item
  WHERE item_fulfillment.supplier_purchase_order_fulfillment_id =
      p_fulfillment_id
    AND purchase_item.id =
      item_fulfillment.supplier_purchase_order_item_id
    AND purchase_item.tenant_id = item_fulfillment.tenant_id
    AND purchase_item.supplier_purchase_order_id =
      item_fulfillment.supplier_purchase_order_id;

  WITH amounts AS MATERIALIZED (
    SELECT
      COALESCE(SUM(item_fulfillment.ordered_quantity), 0)::numeric(20, 4)
        AS ordered_quantity,
      COALESCE(SUM(item_fulfillment.shipped_quantity), 0)::numeric(20, 4)
        AS shipped_quantity,
      COALESCE(SUM(item_fulfillment.received_quantity), 0)::numeric(20, 4)
        AS received_quantity,
      COALESCE(SUM(item_fulfillment.accepted_quantity), 0)::numeric(20, 4)
        AS accepted_quantity,
      COALESCE(SUM(item_fulfillment.rejected_quantity), 0)::numeric(20, 4)
        AS rejected_quantity,
      COALESCE(SUM(
        CASE
          WHEN purchase_item.tax_inclusive THEN
            round(
              round(
                item_fulfillment.accepted_quantity *
                  purchase_item.unit_price,
                2
              ) / (1 + purchase_item.tax_rate),
              2
            )
          ELSE round(item_fulfillment.accepted_quantity * purchase_item.unit_price, 2)
        END
      ), 0)::numeric(18, 2) AS accepted_subtotal_amount,
      COALESCE(SUM(
        CASE
          WHEN purchase_item.tax_inclusive THEN
            round(item_fulfillment.accepted_quantity * purchase_item.unit_price, 2) - round(
              round(
                item_fulfillment.accepted_quantity *
                  purchase_item.unit_price,
                2
              ) / (1 + purchase_item.tax_rate),
              2
            )
          ELSE round(
            round(
              item_fulfillment.accepted_quantity * purchase_item.unit_price,
              2
            ) * purchase_item.tax_rate,
            2
          )
        END
      ), 0)::numeric(18, 2) AS accepted_tax_amount,
      COALESCE(SUM(
        CASE
          WHEN purchase_item.tax_inclusive THEN
            round(item_fulfillment.accepted_quantity * purchase_item.unit_price, 2)
          ELSE
            round(item_fulfillment.accepted_quantity * purchase_item.unit_price, 2) + round(
              round(
                item_fulfillment.accepted_quantity *
                  purchase_item.unit_price,
                2
              ) * purchase_item.tax_rate,
              2
            )
        END
      ), 0)::numeric(18, 2) AS accepted_total_amount
    FROM public.supplier_purchase_order_item_fulfillments
      AS item_fulfillment
    JOIN public.supplier_purchase_order_items AS purchase_item
      ON purchase_item.id =
        item_fulfillment.supplier_purchase_order_item_id
      AND purchase_item.tenant_id = item_fulfillment.tenant_id
      AND purchase_item.supplier_purchase_order_id =
        item_fulfillment.supplier_purchase_order_id
    WHERE item_fulfillment.supplier_purchase_order_fulfillment_id =
      p_fulfillment_id
  )
  UPDATE public.supplier_purchase_order_fulfillments AS fulfillment
  SET ordered_quantity = amounts.ordered_quantity,
      shipped_quantity = amounts.shipped_quantity,
      received_quantity = amounts.received_quantity,
      accepted_quantity = amounts.accepted_quantity,
      rejected_quantity = amounts.rejected_quantity,
      accepted_subtotal_amount = amounts.accepted_subtotal_amount,
      accepted_tax_amount = amounts.accepted_tax_amount,
      accepted_total_amount = amounts.accepted_total_amount,
      status = CASE
        WHEN fulfillment.status = 'cancelled' THEN 'cancelled'
        WHEN amounts.received_quantity = amounts.ordered_quantity
          AND amounts.rejected_quantity > 0
          THEN 'received_with_variance'
        WHEN amounts.received_quantity = amounts.ordered_quantity
          THEN 'received'
        WHEN amounts.received_quantity > 0 THEN 'partially_received'
        WHEN amounts.shipped_quantity = amounts.ordered_quantity
          THEN 'shipped'
        WHEN amounts.shipped_quantity > 0 THEN 'partially_shipped'
        ELSE 'confirmed'
      END,
      updated_at = now()
  FROM amounts
  WHERE fulfillment.id = p_fulfillment_id
  RETURNING fulfillment.* INTO v_fulfillment;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_NOT_CONFIRMED';
  END IF;
  RETURN v_fulfillment;
END;
$$;

REVOKE ALL ON FUNCTION private.recalculate_supplier_purchase_order_fulfillment(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.supplier_purchase_order_fulfillment_snapshot(
  p_fulfillment public.supplier_purchase_order_fulfillments
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public, private
AS $$
  SELECT jsonb_build_object(
    'id', p_fulfillment.id,
    'tenant_id', p_fulfillment.tenant_id,
    'supplier_purchase_order_id',
      p_fulfillment.supplier_purchase_order_id,
    'status', p_fulfillment.status,
    'confirmed_at', p_fulfillment.confirmed_at,
    'confirmed_by_employee_id',
      p_fulfillment.confirmed_by_employee_id,
    'confirmation_remark', p_fulfillment.confirmation_remark,
    'version', p_fulfillment.version,
    'created_at', p_fulfillment.created_at,
    'updated_at', p_fulfillment.updated_at
  );
$$;

REVOKE ALL ON FUNCTION
private.supplier_purchase_order_fulfillment_snapshot(
  public.supplier_purchase_order_fulfillments
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.confirm_supplier_purchase_order_fulfillment(
  p_order_id uuid,
  p_tenant_id uuid,
  p_expected_order_version integer,
  p_confirmed_at timestamptz,
  p_remark text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_fulfillment public.supplier_purchase_order_fulfillments%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
  v_item_count integer;
  v_remark text := NULLIF(btrim(p_remark), '');
BEGIN
  IF p_order_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_order_version IS NULL
    OR p_expected_order_version <= 0
    OR p_confirmed_at IS NULL
    OR char_length(v_remark) > 500
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'order_id', p_order_id,
    'expected_order_version', p_expected_order_version,
    'confirmed_at', p_confirmed_at,
    'remark', v_remark,
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
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <>
        'confirm_supplier_purchase_order_fulfillment'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-order-id:' || p_order_id::text,
      6720240730100000
    )
  );

  SELECT purchase_order.*
  INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
    );
  END IF;
  IF v_order.status <> 'submitted' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;
  IF v_order.version <> p_expected_order_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT'
    );
  END IF;

  SELECT fulfillment.*
  INTO v_fulfillment
  FROM public.supplier_purchase_order_fulfillments AS fulfillment
  WHERE fulfillment.supplier_purchase_order_id = p_order_id
    AND fulfillment.tenant_id = p_tenant_id
  ORDER BY fulfillment.id
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_ALREADY_CONFIRMED'
    );
  END IF;

  PERFORM purchase_item.id
  FROM public.supplier_purchase_order_items AS purchase_item
  WHERE purchase_item.supplier_purchase_order_id = p_order_id
    AND purchase_item.tenant_id = p_tenant_id
  ORDER BY purchase_item.id
  FOR SHARE;

  SELECT COUNT(*)::integer
  INTO v_item_count
  FROM public.supplier_purchase_order_items AS purchase_item
  WHERE purchase_item.supplier_purchase_order_id = p_order_id
    AND purchase_item.tenant_id = p_tenant_id;
  IF v_item_count = 0 THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;

  PERFORM pg_catalog.set_config(
    'private.supplier_purchase_fulfillment_command',
    'confirm',
    true
  );

  INSERT INTO public.supplier_purchase_order_fulfillments (
    tenant_id,
    supplier_purchase_order_id,
    status,
    confirmed_at,
    confirmed_by_user_id,
    confirmed_by_employee_id,
    confirmation_remark,
    version,
    updated_by_employee_id
  )
  VALUES (
    p_tenant_id,
    p_order_id,
    'confirmed',
    p_confirmed_at,
    p_actor_user_id,
    p_actor_employee_id,
    v_remark,
    1,
    p_actor_employee_id
  )
  RETURNING * INTO v_fulfillment;

  INSERT INTO public.supplier_purchase_order_item_fulfillments (
    tenant_id,
    supplier_purchase_order_id,
    supplier_purchase_order_fulfillment_id,
    supplier_purchase_order_item_id,
    ordered_quantity
  )
  SELECT
    p_tenant_id,
    p_order_id,
    v_fulfillment.id,
    purchase_item.id,
    purchase_item.quantity
  FROM public.supplier_purchase_order_items AS purchase_item
  WHERE purchase_item.supplier_purchase_order_id = p_order_id
    AND purchase_item.tenant_id = p_tenant_id
  ORDER BY purchase_item.id;

  v_fulfillment :=
    private.recalculate_supplier_purchase_order_fulfillment(
      v_fulfillment.id
    );

  v_result := jsonb_build_object(
    'status', 'confirmed',
    'idempotent', false,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'fulfillment', private.supplier_purchase_order_fulfillment_snapshot(
      v_fulfillment
    ),
    'version', 1
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_purchase_order',
    p_order_id,
    'confirm_supplier_purchase_order_fulfillment',
    jsonb_build_object('_request', v_request) ||
      jsonb_build_object(
        'purchase_order',
        public.supplier_purchase_order_snapshot(v_order)
      ),
    v_result,
    v_remark,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    1
  );

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.create_supplier_purchase_order_shipment(
  p_shipment_id uuid,
  p_order_id uuid,
  p_tenant_id uuid,
  p_expected_fulfillment_version integer,
  p_shipment_no text,
  p_shipped_at timestamptz,
  p_carrier_name text,
  p_tracking_no text,
  p_remark text,
  p_items jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_fulfillment public.supplier_purchase_order_fulfillments%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
  v_normalized_items jsonb;
  v_requested_count integer;
  v_distinct_count integer;
  v_has_duplicates boolean;
  v_matched_count integer;
  v_invalid_quantity boolean;
  v_over_shipped boolean;
  v_global_event_exists boolean;
  v_carrier_name text := NULLIF(btrim(p_carrier_name), '');
  v_tracking_no text := NULLIF(btrim(p_tracking_no), '');
  v_remark text := NULLIF(btrim(p_remark), '');
BEGIN
  IF p_order_id IS NULL
    OR p_shipment_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_fulfillment_version IS NULL
    OR p_expected_fulfillment_version <= 0
    OR p_shipment_no IS NULL
    OR btrim(p_shipment_no) = ''
    OR char_length(btrim(p_shipment_no)) > 80
    OR p_shipped_at IS NULL
    OR char_length(v_carrier_name) > 100
    OR char_length(v_tracking_no) > 120
    OR char_length(v_remark) > 500
    OR p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR NOT jsonb_array_length(p_items) BETWEEN 1 AND 100
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_SHIPMENT_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  WITH requested AS MATERIALIZED (
    SELECT
      item.purchase_order_item_id,
      item.quantity
    FROM jsonb_to_recordset(p_items) AS item(
      purchase_order_item_id uuid,
      quantity numeric
    )
  )
  SELECT
    COUNT(*)::integer,
    COUNT(DISTINCT purchase_order_item_id)::integer,
    COUNT(*) <> COUNT(DISTINCT purchase_order_item_id),
    COALESCE(bool_or(
      purchase_order_item_id IS NULL
      OR quantity IS NULL
      OR quantity <= 0
      OR scale(quantity) > 4
      OR quantity >= 100000000000000
    ), true),
    jsonb_agg(
      jsonb_build_object(
        'purchase_order_item_id',
          requested.purchase_order_item_id,
        'quantity', requested.quantity::numeric(18, 4)
      )
      ORDER BY requested.purchase_order_item_id
    )
  INTO
    v_requested_count,
    v_distinct_count,
    v_has_duplicates,
    v_invalid_quantity,
    v_normalized_items
  FROM requested;

  IF v_has_duplicates
    OR v_requested_count <> v_distinct_count
    OR v_invalid_quantity
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_SHIPMENT_VALIDATION_ERROR'
    );
  END IF;

  v_request := jsonb_build_object(
    'event_id', p_shipment_id,
    'tenant_id', p_tenant_id,
    'order_id', p_order_id,
    'expected_fulfillment_version', p_expected_fulfillment_version,
    'shipment_no', btrim(p_shipment_no),
    'shipped_at', p_shipped_at,
    'carrier_name', v_carrier_name,
    'tracking_no', v_tracking_no,
    'remark', v_remark,
    'items', v_normalized_items,
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
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <> 'create_supplier_purchase_order_shipment'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-order-id:' || p_order_id::text,
      6720240730100000
    )
  );

  SELECT purchase_order.*
  INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
    );
  END IF;
  IF v_order.status <> 'submitted' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;

  SELECT fulfillment.*
  INTO v_fulfillment
  FROM public.supplier_purchase_order_fulfillments AS fulfillment
  WHERE fulfillment.supplier_purchase_order_id = p_order_id
    AND fulfillment.tenant_id = p_tenant_id
  ORDER BY fulfillment.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'FULFILLMENT_NOT_CONFIRMED'
    );
  END IF;
  IF v_fulfillment.status IN (
    'received',
    'received_with_variance',
    'cancelled'
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATE_CONFLICT'
    );
  END IF;
  IF v_fulfillment.version <> p_expected_fulfillment_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'FULFILLMENT_VERSION_CONFLICT'
    );
  END IF;

  PERFORM item_fulfillment.id
  FROM public.supplier_purchase_order_item_fulfillments
    AS item_fulfillment
  JOIN jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    quantity numeric
  )
    ON requested.purchase_order_item_id =
      item_fulfillment.supplier_purchase_order_item_id
  WHERE item_fulfillment.supplier_purchase_order_fulfillment_id =
      v_fulfillment.id
    AND item_fulfillment.tenant_id = p_tenant_id
    AND item_fulfillment.supplier_purchase_order_id = p_order_id
  ORDER BY item_fulfillment.id
  FOR UPDATE;

  SELECT
    COUNT(item_fulfillment.id)::integer,
    COALESCE(bool_or(
      item_fulfillment.shipped_quantity + requested.quantity >
        item_fulfillment.ordered_quantity
    ), false)
  INTO v_matched_count, v_over_shipped
  FROM jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    quantity numeric
  )
  LEFT JOIN public.supplier_purchase_order_item_fulfillments
    AS item_fulfillment
    ON item_fulfillment.supplier_purchase_order_item_id =
      requested.purchase_order_item_id
    AND item_fulfillment.supplier_purchase_order_fulfillment_id =
      v_fulfillment.id
    AND item_fulfillment.tenant_id = p_tenant_id
    AND item_fulfillment.supplier_purchase_order_id = p_order_id;

  IF v_matched_count <> v_requested_count THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND'
    );
  END IF;
  IF v_over_shipped THEN
    RETURN jsonb_build_object(
      'status', 'over_shipped',
      'error_code', 'OVER_SHIPPED'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_purchase_order_shipments AS shipment
    WHERE shipment.id = p_shipment_id
  )
  INTO v_global_event_exists;
  IF v_global_event_exists
    OR EXISTS (
      SELECT 1
      FROM public.supplier_purchase_order_shipments AS shipment
      WHERE shipment.supplier_purchase_order_id = p_order_id
        AND shipment.shipment_no = btrim(p_shipment_no)
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_SHIPMENT_ID_CONFLICT'
    );
  END IF;

  PERFORM pg_catalog.set_config(
    'private.supplier_purchase_fulfillment_command',
    'shipment',
    true
  );

  INSERT INTO public.supplier_purchase_order_shipments (
    id,
    tenant_id,
    supplier_purchase_order_id,
    supplier_purchase_order_fulfillment_id,
    shipment_no,
    shipped_at,
    carrier_name,
    tracking_no,
    remark,
    created_by_user_id,
    created_by_employee_id
  )
  VALUES (
    p_shipment_id,
    p_tenant_id,
    p_order_id,
    v_fulfillment.id,
    btrim(p_shipment_no),
    p_shipped_at,
    v_carrier_name,
    v_tracking_no,
    v_remark,
    p_actor_user_id,
    p_actor_employee_id
  );

  INSERT INTO public.supplier_purchase_order_shipment_items (
    tenant_id,
    supplier_purchase_order_id,
    supplier_purchase_order_fulfillment_id,
    shipment_id,
    supplier_purchase_order_item_id,
    quantity
  )
  SELECT
    p_tenant_id,
    p_order_id,
    v_fulfillment.id,
    p_shipment_id,
    requested.purchase_order_item_id,
    requested.quantity::numeric(18, 4)
  FROM jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    quantity numeric
  )
  ORDER BY requested.purchase_order_item_id;

  UPDATE public.supplier_purchase_order_item_fulfillments
    AS item_fulfillment
  SET shipped_quantity =
        item_fulfillment.shipped_quantity + requested.quantity,
      updated_at = now()
  FROM jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    quantity numeric
  )
  WHERE item_fulfillment.supplier_purchase_order_item_id =
      requested.purchase_order_item_id
    AND item_fulfillment.supplier_purchase_order_fulfillment_id =
      v_fulfillment.id
    AND item_fulfillment.tenant_id = p_tenant_id
    AND item_fulfillment.supplier_purchase_order_id = p_order_id;

  v_fulfillment :=
    private.recalculate_supplier_purchase_order_fulfillment(
      v_fulfillment.id
    );

  UPDATE public.supplier_purchase_order_fulfillments AS fulfillment
  SET version = fulfillment.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE fulfillment.id = v_fulfillment.id
  RETURNING fulfillment.* INTO v_fulfillment;

  v_result := jsonb_build_object(
    'status', 'shipment_created',
    'idempotent', false,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'fulfillment', private.supplier_purchase_order_fulfillment_snapshot(
      v_fulfillment
    ),
    'version', v_fulfillment.version
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_purchase_order',
    p_order_id,
    'create_supplier_purchase_order_shipment',
    jsonb_build_object('_request', v_request) ||
      jsonb_build_object(
        'fulfillment_version',
        p_expected_fulfillment_version
      ),
    v_result,
    v_remark,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_fulfillment.version
  );

  RETURN v_result;
EXCEPTION
  WHEN invalid_parameter_value OR invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_SHIPMENT_VALIDATION_ERROR'
    );
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_SHIPMENT_ID_CONFLICT'
    );
END;
$$;

CREATE FUNCTION public.create_supplier_purchase_order_receipt(
  p_receipt_id uuid,
  p_order_id uuid,
  p_tenant_id uuid,
  p_expected_fulfillment_version integer,
  p_receipt_no text,
  p_received_at timestamptz,
  p_remark text,
  p_items jsonb,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_fulfillment public.supplier_purchase_order_fulfillments%ROWTYPE;
  v_request jsonb;
  v_result jsonb;
  v_normalized_items jsonb;
  v_requested_count integer;
  v_distinct_count integer;
  v_has_duplicates boolean;
  v_matched_count integer;
  v_invalid_quantity boolean;
  v_variance_reason_required boolean;
  v_variance_reason_forbidden boolean;
  v_over_received boolean;
  v_global_event_exists boolean;
  v_remark text := NULLIF(btrim(p_remark), '');
BEGIN
  IF p_order_id IS NULL
    OR p_receipt_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_fulfillment_version IS NULL
    OR p_expected_fulfillment_version <= 0
    OR p_receipt_no IS NULL
    OR btrim(p_receipt_no) = ''
    OR char_length(btrim(p_receipt_no)) > 80
    OR p_received_at IS NULL
    OR char_length(v_remark) > 500
    OR p_items IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR NOT jsonb_array_length(p_items) BETWEEN 1 AND 100
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  WITH requested AS MATERIALIZED (
    SELECT
      item.purchase_order_item_id,
      item.accepted_quantity,
      item.rejected_quantity,
      btrim(item.variance_reason) AS variance_reason,
      item.variance_reason IS NOT NULL AS variance_reason_provided
    FROM jsonb_to_recordset(p_items) AS item(
      purchase_order_item_id uuid,
      accepted_quantity numeric,
      rejected_quantity numeric,
      variance_reason text
    )
  )
  SELECT
    COUNT(*)::integer,
    COUNT(DISTINCT purchase_order_item_id)::integer,
    COUNT(*) <> COUNT(DISTINCT purchase_order_item_id),
    COALESCE(bool_or(
      purchase_order_item_id IS NULL
      OR accepted_quantity IS NULL
      OR rejected_quantity IS NULL
      OR accepted_quantity < 0
      OR rejected_quantity < 0
      OR accepted_quantity + rejected_quantity <= 0
      OR accepted_quantity + rejected_quantity >= 100000000000000
      OR scale(accepted_quantity) > 4
      OR scale(rejected_quantity) > 4
      OR accepted_quantity >= 100000000000000
      OR rejected_quantity >= 100000000000000
    ), true),
    COALESCE(bool_or(
      rejected_quantity > 0
      AND (
        variance_reason IS NULL
        OR variance_reason = ''
        OR char_length(variance_reason) > 500
      )
    ), true),
    COALESCE(bool_or(
      rejected_quantity = 0
      AND variance_reason_provided
    ), true),
    jsonb_agg(
      jsonb_build_object(
        'purchase_order_item_id',
          requested.purchase_order_item_id,
        'accepted_quantity',
          requested.accepted_quantity::numeric(18, 4),
        'rejected_quantity',
          requested.rejected_quantity::numeric(18, 4),
        'variance_reason', requested.variance_reason
      )
      ORDER BY requested.purchase_order_item_id
    )
  INTO
    v_requested_count,
    v_distinct_count,
    v_has_duplicates,
    v_invalid_quantity,
    v_variance_reason_required,
    v_variance_reason_forbidden,
    v_normalized_items
  FROM requested;

  IF v_has_duplicates
    OR v_requested_count <> v_distinct_count
    OR v_invalid_quantity
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR'
    );
  END IF;
  IF v_variance_reason_forbidden THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR'
    );
  END IF;
  IF v_variance_reason_required THEN
    RETURN jsonb_build_object(
      'status', 'variance_reason_required',
      'error_code', 'VARIANCE_REASON_REQUIRED'
    );
  END IF;

  v_request := jsonb_build_object(
    'event_id', p_receipt_id,
    'tenant_id', p_tenant_id,
    'order_id', p_order_id,
    'expected_fulfillment_version', p_expected_fulfillment_version,
    'receipt_no', btrim(p_receipt_no),
    'received_at', p_received_at,
    'remark', v_remark,
    'items', v_normalized_items,
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
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <> 'create_supplier_purchase_order_receipt'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_event.to_state || jsonb_build_object('idempotent', true);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-order-id:' || p_order_id::text,
      6720240730100000
    )
  );

  SELECT purchase_order.*
  INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
    );
  END IF;
  IF v_order.status <> 'submitted' THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;

  SELECT fulfillment.*
  INTO v_fulfillment
  FROM public.supplier_purchase_order_fulfillments AS fulfillment
  WHERE fulfillment.supplier_purchase_order_id = p_order_id
    AND fulfillment.tenant_id = p_tenant_id
  ORDER BY fulfillment.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'FULFILLMENT_NOT_CONFIRMED'
    );
  END IF;
  IF v_fulfillment.status IN (
    'received',
    'received_with_variance',
    'cancelled'
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STATE_CONFLICT'
    );
  END IF;
  IF v_fulfillment.version <> p_expected_fulfillment_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'FULFILLMENT_VERSION_CONFLICT'
    );
  END IF;

  PERFORM item_fulfillment.id
  FROM public.supplier_purchase_order_item_fulfillments
    AS item_fulfillment
  JOIN jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    accepted_quantity numeric,
    rejected_quantity numeric,
    variance_reason text
  )
    ON requested.purchase_order_item_id =
      item_fulfillment.supplier_purchase_order_item_id
  WHERE item_fulfillment.supplier_purchase_order_fulfillment_id =
      v_fulfillment.id
    AND item_fulfillment.tenant_id = p_tenant_id
    AND item_fulfillment.supplier_purchase_order_id = p_order_id
  ORDER BY item_fulfillment.id
  FOR UPDATE;

  SELECT
    COUNT(item_fulfillment.id)::integer,
    COALESCE(bool_or(
      item_fulfillment.received_quantity +
        requested.accepted_quantity +
        requested.rejected_quantity >
        item_fulfillment.shipped_quantity
    ), false)
  INTO v_matched_count, v_over_received
  FROM jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    accepted_quantity numeric,
    rejected_quantity numeric,
    variance_reason text
  )
  LEFT JOIN public.supplier_purchase_order_item_fulfillments
    AS item_fulfillment
    ON item_fulfillment.supplier_purchase_order_item_id =
      requested.purchase_order_item_id
    AND item_fulfillment.supplier_purchase_order_fulfillment_id =
      v_fulfillment.id
    AND item_fulfillment.tenant_id = p_tenant_id
    AND item_fulfillment.supplier_purchase_order_id = p_order_id;

  IF v_matched_count <> v_requested_count THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_ITEM_NOT_FOUND'
    );
  END IF;
  IF v_over_received THEN
    RETURN jsonb_build_object(
      'status', 'over_received',
      'error_code', 'OVER_RECEIVED'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.supplier_purchase_order_receipts AS receipt
    WHERE receipt.id = p_receipt_id
  )
  INTO v_global_event_exists;
  IF v_global_event_exists
    OR EXISTS (
      SELECT 1
      FROM public.supplier_purchase_order_receipts AS receipt
      WHERE receipt.supplier_purchase_order_id = p_order_id
        AND receipt.receipt_no = btrim(p_receipt_no)
    )
  THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT'
    );
  END IF;

  PERFORM pg_catalog.set_config(
    'private.supplier_purchase_fulfillment_command',
    'receipt',
    true
  );

  INSERT INTO public.supplier_purchase_order_receipts (
    id,
    tenant_id,
    supplier_purchase_order_id,
    supplier_purchase_order_fulfillment_id,
    receipt_no,
    received_at,
    remark,
    created_by_user_id,
    received_by_employee_id
  )
  VALUES (
    p_receipt_id,
    p_tenant_id,
    p_order_id,
    v_fulfillment.id,
    btrim(p_receipt_no),
    p_received_at,
    v_remark,
    p_actor_user_id,
    p_actor_employee_id
  );

  INSERT INTO public.supplier_purchase_order_receipt_items (
    tenant_id,
    supplier_purchase_order_id,
    supplier_purchase_order_fulfillment_id,
    receipt_id,
    supplier_purchase_order_item_id,
    accepted_quantity,
    rejected_quantity,
    variance_reason
  )
  SELECT
    p_tenant_id,
    p_order_id,
    v_fulfillment.id,
    p_receipt_id,
    requested.purchase_order_item_id,
    requested.accepted_quantity::numeric(18, 4),
    requested.rejected_quantity::numeric(18, 4),
    requested.variance_reason
  FROM jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    accepted_quantity numeric,
    rejected_quantity numeric,
    variance_reason text
  )
  ORDER BY requested.purchase_order_item_id;

  UPDATE public.supplier_purchase_order_item_fulfillments
    AS item_fulfillment
  SET received_quantity =
        item_fulfillment.received_quantity +
          requested.accepted_quantity +
          requested.rejected_quantity,
      accepted_quantity =
        item_fulfillment.accepted_quantity +
          requested.accepted_quantity,
      rejected_quantity =
        item_fulfillment.rejected_quantity +
          requested.rejected_quantity,
      updated_at = now()
  FROM jsonb_to_recordset(v_normalized_items) AS requested(
    purchase_order_item_id uuid,
    accepted_quantity numeric,
    rejected_quantity numeric,
    variance_reason text
  )
  WHERE item_fulfillment.supplier_purchase_order_item_id =
      requested.purchase_order_item_id
    AND item_fulfillment.supplier_purchase_order_fulfillment_id =
      v_fulfillment.id
    AND item_fulfillment.tenant_id = p_tenant_id
    AND item_fulfillment.supplier_purchase_order_id = p_order_id;

  v_fulfillment :=
    private.recalculate_supplier_purchase_order_fulfillment(
      v_fulfillment.id
    );

  UPDATE public.supplier_purchase_order_fulfillments AS fulfillment
  SET version = fulfillment.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE fulfillment.id = v_fulfillment.id
  RETURNING fulfillment.* INTO v_fulfillment;

  v_result := jsonb_build_object(
    'status', 'receipt_created',
    'idempotent', false,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'fulfillment', private.supplier_purchase_order_fulfillment_snapshot(
      v_fulfillment
    ),
    'version', v_fulfillment.version
  );

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_purchase_order',
    p_order_id,
    'create_supplier_purchase_order_receipt',
    jsonb_build_object('_request', v_request) ||
      jsonb_build_object(
        'fulfillment_version',
        p_expected_fulfillment_version
      ),
    v_result,
    v_remark,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_fulfillment.version
  );

  RETURN v_result;
EXCEPTION
  WHEN invalid_parameter_value OR invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code',
        'SUPPLIER_PURCHASE_ORDER_RECEIPT_VALIDATION_ERROR'
    );
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_RECEIPT_ID_CONFLICT'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_supplier_purchase_order(
  p_order_id uuid,
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
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_order public.supplier_purchase_orders%ROWTYPE;
  v_fulfillment public.supplier_purchase_order_fulfillments%ROWTYPE;
  v_before jsonb;
  v_request jsonb;
  v_cancelled_at timestamptz := clock_timestamp();
  v_has_fulfillment boolean := false;
  v_has_shipment boolean := false;
BEGIN
  IF p_order_id IS NULL
    OR p_tenant_id IS NULL
    OR p_expected_version IS NULL
    OR p_expected_version <= 0
    OR p_reason IS NULL
    OR btrim(p_reason) = ''
    OR char_length(btrim(p_reason)) > 500
    OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VALIDATION_ERROR'
    );
  END IF;

  PERFORM public.assert_supplier_purchase_order_actor(
    p_tenant_id,
    p_actor_user_id,
    p_actor_employee_id
  );

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'order_id', p_order_id,
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
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.resource_type <> 'supplier_purchase_order'
      OR v_event.resource_id <> p_order_id
      OR v_event.command <> 'cancel_supplier_purchase_order'
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'cancelled',
      'idempotent', true,
      'purchase_order', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-purchase-order-id:' || p_order_id::text,
      6720240730100000
    )
  );

  SELECT purchase_order.*
  INTO v_order
  FROM public.supplier_purchase_orders AS purchase_order
  WHERE purchase_order.id = p_order_id
    AND purchase_order.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_NOT_FOUND'
    );
  END IF;
  IF v_order.status NOT IN ('draft', 'submitted') THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT'
    );
  END IF;
  IF v_order.version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'status', 'version_conflict',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT',
      'version', v_order.version
    );
  END IF;

  SELECT fulfillment.*
  INTO v_fulfillment
  FROM public.supplier_purchase_order_fulfillments AS fulfillment
  WHERE fulfillment.supplier_purchase_order_id = p_order_id
    AND fulfillment.tenant_id = p_tenant_id
  ORDER BY fulfillment.id
  FOR UPDATE;
  v_has_fulfillment := FOUND;

  IF v_has_fulfillment THEN
    PERFORM item_fulfillment.id
    FROM public.supplier_purchase_order_item_fulfillments
      AS item_fulfillment
    WHERE item_fulfillment.supplier_purchase_order_fulfillment_id =
        v_fulfillment.id
      AND item_fulfillment.tenant_id = p_tenant_id
      AND item_fulfillment.supplier_purchase_order_id = p_order_id
    ORDER BY item_fulfillment.id
    FOR UPDATE;

    SELECT EXISTS (
      SELECT 1
      FROM public.supplier_purchase_order_shipments AS shipment
      WHERE shipment.supplier_purchase_order_fulfillment_id =
          v_fulfillment.id
        AND shipment.tenant_id = p_tenant_id
        AND shipment.supplier_purchase_order_id = p_order_id
    )
    INTO v_has_shipment;
    IF v_has_shipment THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code',
          'SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED'
      );
    END IF;
  END IF;

  PERFORM project.id
  FROM public.projects AS project
  WHERE project.id = v_order.project_id
    AND project.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'project_invalid',
      'error_code', 'SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID'
    );
  END IF;

  v_before := public.supplier_purchase_order_snapshot(v_order);

  IF v_has_fulfillment THEN
    PERFORM pg_catalog.set_config(
      'private.supplier_purchase_fulfillment_command',
      'cancel',
      true
    );
    UPDATE public.supplier_purchase_order_fulfillments AS fulfillment
    SET status = 'cancelled',
        cancelled_at = v_cancelled_at,
        cancelled_by_user_id = p_actor_user_id,
        cancelled_by_employee_id = p_actor_employee_id,
        cancel_reason = btrim(p_reason),
        version = fulfillment.version + 1,
        updated_by_employee_id = p_actor_employee_id,
        updated_at = now()
    WHERE fulfillment.id = v_fulfillment.id
    RETURNING fulfillment.* INTO v_fulfillment;
  END IF;

  UPDATE public.supplier_purchase_orders AS purchase_order
  SET status = 'cancelled',
      submitted_by_employee_id =
        purchase_order.submitted_by_employee_id,
      submitted_at = purchase_order.submitted_at,
      cancelled_by_employee_id = p_actor_employee_id,
      cancelled_at = v_cancelled_at,
      cancel_reason = btrim(p_reason),
      version = purchase_order.version + 1,
      updated_by_employee_id = p_actor_employee_id,
      updated_at = now()
  WHERE purchase_order.id = p_order_id
  RETURNING * INTO v_order;

  INSERT INTO public.supplier_command_events (
    tenant_id,
    resource_type,
    resource_id,
    command,
    from_state,
    to_state,
    reason,
    actor_user_id,
    actor_employee_id,
    idempotency_key,
    result_version
  )
  VALUES (
    p_tenant_id,
    'supplier_purchase_order',
    p_order_id,
    'cancel_supplier_purchase_order',
    v_before || jsonb_build_object('_request', v_request),
    public.supplier_purchase_order_snapshot(v_order),
    btrim(p_reason),
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key,
    v_order.version
  );

  RETURN jsonb_build_object(
    'status', 'cancelled',
    'idempotent', false,
    'purchase_order', public.supplier_purchase_order_snapshot(v_order),
    'version', v_order.version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_supplier_purchase_order_fulfillment(
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_supplier_purchase_order_fulfillment(
  uuid,
  uuid,
  integer,
  timestamptz,
  text,
  uuid,
  uuid,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.create_supplier_purchase_order_shipment(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  timestamptz,
  text,
  text,
  text,
  jsonb,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_supplier_purchase_order_shipment(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  timestamptz,
  text,
  text,
  text,
  jsonb,
  uuid,
  uuid,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.create_supplier_purchase_order_receipt(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  timestamptz,
  text,
  jsonb,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_supplier_purchase_order_receipt(
  uuid,
  uuid,
  uuid,
  integer,
  text,
  timestamptz,
  text,
  jsonb,
  uuid,
  uuid,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_supplier_purchase_order(
  uuid,
  uuid,
  integer,
  text,
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_supplier_purchase_order(
  uuid,
  uuid,
  integer,
  text,
  uuid,
  uuid,
  text
) TO service_role;

ALTER TABLE public.supplier_purchase_order_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_fulfillments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_item_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_item_fulfillments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_shipments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_shipment_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_order_receipt_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.supplier_purchase_order_fulfillments,
  public.supplier_purchase_order_item_fulfillments,
  public.supplier_purchase_order_shipments,
  public.supplier_purchase_order_shipment_items,
  public.supplier_purchase_order_receipts,
  public.supplier_purchase_order_receipt_items
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.supplier_purchase_order_fulfillments,
  public.supplier_purchase_order_item_fulfillments,
  public.supplier_purchase_order_shipments,
  public.supplier_purchase_order_shipment_items,
  public.supplier_purchase_order_receipts,
  public.supplier_purchase_order_receipt_items
TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
  public.supplier_purchase_order_fulfillments,
  public.supplier_purchase_order_item_fulfillments,
  public.supplier_purchase_order_shipments,
  public.supplier_purchase_order_shipment_items,
  public.supplier_purchase_order_receipts,
  public.supplier_purchase_order_receipt_items
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
