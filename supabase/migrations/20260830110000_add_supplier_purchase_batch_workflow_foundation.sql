BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.supplier_purchase_batches
ADD COLUMN approval_round integer NOT NULL DEFAULT 0;

ALTER TABLE public.supplier_purchase_batches
ADD CONSTRAINT supplier_purchase_batches_approval_round_check CHECK (
  approval_round >= 0
);

ALTER TABLE public.tenant_supplier_settings
ADD COLUMN purchase_batch_workflow_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenant_supplier_settings
ADD CONSTRAINT tenant_supplier_settings_purchase_batch_workflow_parent_check CHECK (
  NOT purchase_batch_workflow_enabled
  OR (
    module_enabled
    AND procurement_snapshot_v1_enabled
  )
);

ALTER TABLE public.workflow_instances
DROP CONSTRAINT workflow_instances_subject_type_check;

ALTER TABLE public.workflow_instances
ADD CONSTRAINT workflow_instances_subject_type_check CHECK (
  subject_type IN ('manual', 'customer', 'project', 'expense_request', 'procedure', 'supplier_purchase_batch')
);

ALTER TABLE public.workflow_subject_states
DROP CONSTRAINT workflow_subject_states_subject_type_check;

ALTER TABLE public.workflow_subject_states
ADD CONSTRAINT workflow_subject_states_subject_type_check CHECK (
  subject_type IN ('manual', 'customer', 'project', 'expense_request', 'procedure', 'supplier_purchase_batch')
);

ALTER TABLE public.workflow_definition_bindings
DROP CONSTRAINT workflow_definition_bindings_subject_check;

ALTER TABLE public.workflow_definition_bindings
ADD CONSTRAINT workflow_definition_bindings_subject_check CHECK (
  subject_type IN ('project', 'supplier_purchase_batch')
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_instances_running_purchase_batch_uidx
ON public.workflow_instances(
  tenant_id,
  subject_type,
  subject_id
)
WHERE status = 'running'
  AND subject_type = 'supplier_purchase_batch';

DO $validate_running_purchase_batch_index$
DECLARE
  v_matches boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_definition
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_catalog.pg_class AS table_relation
      ON table_relation.oid = index_definition.indrelid
    JOIN pg_catalog.pg_namespace AS table_namespace
      ON table_namespace.oid = table_relation.relnamespace
    JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = index_relation.relam
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname =
        'workflow_instances_running_purchase_batch_uidx'
      AND index_relation.relkind = 'i'
      AND table_namespace.nspname = 'public'
      AND table_relation.relname = 'workflow_instances'
      AND access_method.amname = 'btree'
      AND index_definition.indisunique
      AND index_definition.indisvalid
      AND index_definition.indisready
      AND index_definition.indislive
      AND NOT index_definition.indnullsnotdistinct
      AND index_definition.indnkeyatts = 3
      AND index_definition.indnatts = 3
      AND index_definition.indexprs IS NULL
      AND ARRAY(
        SELECT attribute_definition.attname::text
        FROM unnest(index_definition.indkey) WITH ORDINALITY
          AS key_column(attnum, ordinal)
        JOIN pg_catalog.pg_attribute AS attribute_definition
          ON attribute_definition.attrelid = index_definition.indrelid
         AND attribute_definition.attnum = key_column.attnum
        ORDER BY key_column.ordinal
      ) = ARRAY['tenant_id', 'subject_type', 'subject_id']::text[]
      AND ARRAY(
        SELECT opclass_namespace.nspname || '.' ||
          opclass_definition.opcname
        FROM unnest(index_definition.indclass) WITH ORDINALITY
          AS key_opclass(opclass_oid, ordinal)
        JOIN pg_catalog.pg_opclass AS opclass_definition
          ON opclass_definition.oid = key_opclass.opclass_oid
        JOIN pg_catalog.pg_namespace AS opclass_namespace
          ON opclass_namespace.oid = opclass_definition.opcnamespace
        ORDER BY key_opclass.ordinal
      ) = ARRAY[
        'pg_catalog.uuid_ops',
        'pg_catalog.text_ops',
        'pg_catalog.text_ops'
      ]::text[]
      AND ARRAY(
        SELECT CASE
          WHEN key_collation.collation_oid = 0 THEN NULL
          ELSE collation_namespace.nspname || '.' ||
            collation_definition.collname
        END
        FROM unnest(index_definition.indcollation) WITH ORDINALITY
          AS key_collation(collation_oid, ordinal)
        LEFT JOIN pg_catalog.pg_collation AS collation_definition
          ON collation_definition.oid = key_collation.collation_oid
        LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
          ON collation_namespace.oid = collation_definition.collnamespace
        ORDER BY key_collation.ordinal
      ) IS NOT DISTINCT FROM ARRAY[
        NULL,
        'pg_catalog.default',
        'pg_catalog.default'
      ]::text[]
      AND ARRAY(
        SELECT key_option.option
        FROM unnest(index_definition.indoption) WITH ORDINALITY
          AS key_option(option, ordinal)
        ORDER BY key_option.ordinal
      ) = ARRAY[0, 0, 0]::smallint[]
      AND pg_catalog.pg_get_expr(
        index_definition.indpred,
        index_definition.indrelid,
        true
      ) = 'status = ''running''::text AND subject_type = ''supplier_purchase_batch''::text'
  )
  INTO v_matches;

  IF NOT v_matches THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_INDEX_CONTRACT_MISMATCH',
      DETAIL = 'workflow_instances_running_purchase_batch_uidx catalog contract mismatch';
  END IF;
END
$validate_running_purchase_batch_index$;

CREATE INDEX IF NOT EXISTS workflow_instances_purchase_batch_lookup_idx
ON public.workflow_instances(
  tenant_id,
  subject_type,
  subject_id,
  status,
  created_at DESC,
  id DESC
);

DO $validate_purchase_batch_lookup_index$
DECLARE
  v_matches boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_definition
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    JOIN pg_catalog.pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_catalog.pg_class AS table_relation
      ON table_relation.oid = index_definition.indrelid
    JOIN pg_catalog.pg_namespace AS table_namespace
      ON table_namespace.oid = table_relation.relnamespace
    JOIN pg_catalog.pg_am AS access_method
      ON access_method.oid = index_relation.relam
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname =
        'workflow_instances_purchase_batch_lookup_idx'
      AND index_relation.relkind = 'i'
      AND table_namespace.nspname = 'public'
      AND table_relation.relname = 'workflow_instances'
      AND access_method.amname = 'btree'
      AND NOT index_definition.indisunique
      AND index_definition.indisvalid
      AND index_definition.indisready
      AND index_definition.indislive
      AND NOT index_definition.indnullsnotdistinct
      AND index_definition.indnkeyatts = 6
      AND index_definition.indnatts = 6
      AND index_definition.indexprs IS NULL
      AND ARRAY(
        SELECT attribute_definition.attname::text
        FROM unnest(index_definition.indkey) WITH ORDINALITY
          AS key_column(attnum, ordinal)
        JOIN pg_catalog.pg_attribute AS attribute_definition
          ON attribute_definition.attrelid = index_definition.indrelid
         AND attribute_definition.attnum = key_column.attnum
        ORDER BY key_column.ordinal
      ) = ARRAY[
        'tenant_id',
        'subject_type',
        'subject_id',
        'status',
        'created_at',
        'id'
      ]::text[]
      AND ARRAY(
        SELECT opclass_namespace.nspname || '.' ||
          opclass_definition.opcname
        FROM unnest(index_definition.indclass) WITH ORDINALITY
          AS key_opclass(opclass_oid, ordinal)
        JOIN pg_catalog.pg_opclass AS opclass_definition
          ON opclass_definition.oid = key_opclass.opclass_oid
        JOIN pg_catalog.pg_namespace AS opclass_namespace
          ON opclass_namespace.oid = opclass_definition.opcnamespace
        ORDER BY key_opclass.ordinal
      ) = ARRAY[
        'pg_catalog.uuid_ops',
        'pg_catalog.text_ops',
        'pg_catalog.text_ops',
        'pg_catalog.text_ops',
        'pg_catalog.timestamptz_ops',
        'pg_catalog.uuid_ops'
      ]::text[]
      AND ARRAY(
        SELECT CASE
          WHEN key_collation.collation_oid = 0 THEN NULL
          ELSE collation_namespace.nspname || '.' ||
            collation_definition.collname
        END
        FROM unnest(index_definition.indcollation) WITH ORDINALITY
          AS key_collation(collation_oid, ordinal)
        LEFT JOIN pg_catalog.pg_collation AS collation_definition
          ON collation_definition.oid = key_collation.collation_oid
        LEFT JOIN pg_catalog.pg_namespace AS collation_namespace
          ON collation_namespace.oid = collation_definition.collnamespace
        ORDER BY key_collation.ordinal
      ) IS NOT DISTINCT FROM ARRAY[
        NULL,
        'pg_catalog.default',
        'pg_catalog.default',
        'pg_catalog.default',
        NULL,
        NULL
      ]::text[]
      AND ARRAY(
        SELECT key_option.option
        FROM unnest(index_definition.indoption) WITH ORDINALITY
          AS key_option(option, ordinal)
        ORDER BY key_option.ordinal
      ) = ARRAY[0, 0, 0, 0, 3, 3]::smallint[]
      AND index_definition.indpred IS NULL
  )
  INTO v_matches;

  IF NOT v_matches THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_PURCHASE_BATCH_WORKFLOW_INDEX_CONTRACT_MISMATCH',
      DETAIL = 'workflow_instances_purchase_batch_lookup_idx catalog contract mismatch';
  END IF;
END
$validate_purchase_batch_lookup_index$;

COMMIT;

-- Rollback: forward-fix. Disable the purchase workflow rollout through the
-- supported command before a separately reviewed migration removes these
-- additive indexes or constraints. Preserve approval rounds and workflow
-- history; never repair database state manually.
