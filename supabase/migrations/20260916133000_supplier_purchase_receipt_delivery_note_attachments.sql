CREATE TABLE public.supplier_purchase_receipt_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  supplier_purchase_order_id uuid NOT NULL,
  supplier_purchase_receipt_id uuid NOT NULL,
  file_id uuid NOT NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  scene text NOT NULL DEFAULT 'supplier_purchase_receipt_delivery_note',
  file_name text NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_purchase_receipt_attachments_receipt_fkey
    FOREIGN KEY (supplier_purchase_receipt_id, tenant_id, supplier_purchase_order_id)
    REFERENCES public.supplier_purchase_order_receipts(id, tenant_id, supplier_purchase_order_id)
    ON DELETE RESTRICT,
  CONSTRAINT supplier_purchase_receipt_attachments_scene_check
    CHECK (scene = 'supplier_purchase_receipt_delivery_note'),
  CONSTRAINT supplier_purchase_receipt_attachments_mime_check
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT supplier_purchase_receipt_attachments_size_check
    CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  CONSTRAINT supplier_purchase_receipt_attachments_receipt_file_key
    UNIQUE (tenant_id, supplier_purchase_receipt_id, file_id),
  CONSTRAINT supplier_purchase_receipt_attachments_tenant_file_key
    UNIQUE (tenant_id, file_id)
);

CREATE INDEX supplier_purchase_receipt_attachments_receipt_idx
ON public.supplier_purchase_receipt_attachments(
  tenant_id,
  supplier_purchase_order_id,
  supplier_purchase_receipt_id,
  created_at,
  id
);

ALTER TABLE public.supplier_purchase_receipt_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_purchase_receipt_attachments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.supplier_purchase_receipt_attachments
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.supplier_purchase_receipt_attachments TO service_role;

CREATE OR REPLACE FUNCTION public.create_supplier_purchase_order_receipt_with_attachments(
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
  p_idempotency_key text,
  p_delivery_note_file_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_result jsonb;
  v_file_ids uuid[] := COALESCE(p_delivery_note_file_ids, ARRAY[]::uuid[]);
  v_requested_sorted uuid[];
  v_existing_sorted uuid[];
  v_valid_count integer;
  v_constraint_name text;
BEGIN
  IF cardinality(v_file_ids) > 3 THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_RECEIPT_ATTACHMENT_INVALID'
    );
  END IF;

  SELECT COALESCE(array_agg(file_id ORDER BY file_id), ARRAY[]::uuid[])
  INTO v_requested_sorted
  FROM unnest(v_file_ids) AS file_id;

  IF cardinality(v_file_ids) <> cardinality(
    ARRAY(SELECT DISTINCT file_id FROM unnest(v_file_ids) AS file_id)
  ) THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_RECEIPT_ATTACHMENT_INVALID'
    );
  END IF;

  SELECT count(*)
  INTO v_valid_count
  FROM public.platform_file_objects AS file
  WHERE file.id = ANY(v_file_ids)
    AND file.tenant_id = p_tenant_id
    AND file.scene = 'supplier_purchase_receipt_delivery_note'
    AND file.visibility = 'private'
    AND file.status = 'active'
    AND file.deleted_at IS NULL
    AND file.owner_type = 'supplier_purchase_receipt'
    AND file.owner_id = p_receipt_id
    AND file.created_by_employee_id IS NOT NULL
    AND file.mime_type IN ('image/jpeg', 'image/png', 'image/webp')
    AND file.size_bytes > 0
    AND file.size_bytes <= 10485760
    AND file.metadata ->> 'supplier_purchase_order_id' = p_order_id::text;

  IF v_valid_count <> cardinality(v_file_ids) THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'SUPPLIER_PURCHASE_RECEIPT_ATTACHMENT_INVALID'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.supplier_purchase_receipt_attachments AS attachment
    WHERE attachment.tenant_id = p_tenant_id
      AND attachment.file_id = ANY(v_file_ids)
      AND attachment.supplier_purchase_receipt_id <> p_receipt_id
  ) THEN
    RETURN jsonb_build_object(
      'status', 'state_conflict',
      'error_code', 'SUPPLIER_PURCHASE_RECEIPT_ATTACHMENT_CONFLICT'
    );
  END IF;

  v_result := public.create_supplier_purchase_order_receipt(
    p_receipt_id,
    p_order_id,
    p_tenant_id,
    p_expected_fulfillment_version,
    p_receipt_no,
    p_received_at,
    p_remark,
    p_items,
    p_actor_user_id,
    p_actor_employee_id,
    p_idempotency_key
  );

  IF v_result ->> 'status' <> 'receipt_created' THEN
    RETURN v_result;
  END IF;

  IF COALESCE((v_result ->> 'idempotent')::boolean, false) THEN
    SELECT COALESCE(array_agg(attachment.file_id ORDER BY attachment.file_id), ARRAY[]::uuid[])
    INTO v_existing_sorted
    FROM public.supplier_purchase_receipt_attachments AS attachment
    WHERE attachment.tenant_id = p_tenant_id
      AND attachment.supplier_purchase_receipt_id = p_receipt_id;

    IF v_existing_sorted <> v_requested_sorted THEN
      RETURN jsonb_build_object(
        'status', 'idempotency_conflict',
        'error_code', 'SUPPLIER_IDEMPOTENCY_CONFLICT'
      );
    END IF;
    RETURN v_result;
  END IF;

  INSERT INTO public.supplier_purchase_receipt_attachments (
    tenant_id,
    supplier_purchase_order_id,
    supplier_purchase_receipt_id,
    file_id,
    file_name,
    mime_type,
    size_bytes,
    uploaded_by_employee_id
  )
  SELECT
    p_tenant_id,
    p_order_id,
    p_receipt_id,
    file.id,
    file.original_name,
    file.mime_type,
    file.size_bytes,
    file.created_by_employee_id
  FROM public.platform_file_objects AS file
  WHERE file.id = ANY(v_file_ids)
  ORDER BY file.created_at, file.id;

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name IN (
      'supplier_purchase_receipt_attachments_receipt_file_key',
      'supplier_purchase_receipt_attachments_tenant_file_key'
    ) THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_PURCHASE_RECEIPT_ATTACHMENT_CONFLICT'
      );
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_supplier_purchase_order_receipt_with_attachments(
  uuid, uuid, uuid, integer, text, timestamptz, text, jsonb,
  uuid, uuid, text, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_purchase_order_receipt_with_attachments(
  uuid, uuid, uuid, integer, text, timestamptz, text, jsonb,
  uuid, uuid, text, uuid[]
) TO service_role;

COMMENT ON TABLE public.supplier_purchase_receipt_attachments IS
  '采购收货送货单据附件快照，仅作为收货凭证，不参与库存和应付计算。';
