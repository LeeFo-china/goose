-- Rollback: forward-only. Restoring malformed supplier purchase batch budget
-- snapshots is intentionally unsupported because the removed keys are not part
-- of the supplier purchase batch budget snapshot contract.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE FUNCTION public.is_valid_supplier_purchase_batch_budget_snapshot(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  entry record;
  field_name text;
  required_fields constant text[] := ARRAY[
    'requested_amount',
    'budget_amount',
    'expense_amount',
    'other_commitment_amount',
    'available_amount'
  ];
BEGIN
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RETURN false;
  END IF;

  FOR entry IN
    SELECT key AS key_text, value
    FROM jsonb_each(p_snapshot)
  LOOP
    BEGIN
      PERFORM entry.key_text::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN false;
    END;

    IF jsonb_typeof(entry.value) <> 'object' THEN
      RETURN false;
    END IF;

    IF (
      SELECT count(*) FROM jsonb_object_keys(entry.value)
    ) <> 5 THEN
      RETURN false;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_object_keys(entry.value) AS object_key(key_text)
      WHERE object_key.key_text <> ALL(required_fields)
    ) THEN
      RETURN false;
    END IF;

    FOREACH field_name IN ARRAY required_fields LOOP
      IF jsonb_typeof(entry.value -> field_name) <> 'string' THEN
        RETURN false;
      END IF;

      IF field_name = 'available_amount' THEN
        IF (entry.value -> field_name) #>> '{}' !~ '^-?\d+(?:\.\d{1,2})?$' THEN
          RETURN false;
        END IF;
      ELSIF (entry.value -> field_name) #>> '{}' !~ '^\d+(?:\.\d{1,2})?$' THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.is_valid_supplier_purchase_batch_budget_snapshot(jsonb)
IS 'Validates supplier purchase batch budget_snapshot: object keyed by cost category UUID, each value a five-field decimal-string budget entry.';

UPDATE public.supplier_purchase_batches AS batch
SET budget_snapshot = '{}'::jsonb
WHERE NOT public.is_valid_supplier_purchase_batch_budget_snapshot(
  batch.budget_snapshot
);

ALTER TABLE public.supplier_purchase_batches
DROP CONSTRAINT IF EXISTS supplier_purchase_batches_budget_snapshot_check;

ALTER TABLE public.supplier_purchase_batches
ADD CONSTRAINT supplier_purchase_batches_budget_snapshot_check
CHECK (public.is_valid_supplier_purchase_batch_budget_snapshot(budget_snapshot))
NOT VALID;

ALTER TABLE public.supplier_purchase_batches
VALIDATE CONSTRAINT supplier_purchase_batches_budget_snapshot_check;

COMMIT;
