\set ON_ERROR_STOP on

\if :{?tenant_id}
\else
  \echo '缺少 tenant_id'
  \quit 2
\endif
\if :{?lock_script}
\else
  \echo '缺少 lock_script'
  \quit 2
\endif
\if :{?preflight_script}
\else
  \echo '缺少 preflight_script'
  \quit 2
\endif
\if :{?copy_script}
\else
  \echo '缺少 copy_script'
  \quit 2
\endif
\if :{?remap_script}
\else
  \echo '缺少 remap_script'
  \quit 2
\endif
\if :{?verification_script}
\else
  \echo '缺少 verification_script'
  \quit 2
\endif
\if :{?commit_transfer}
\else
  \echo '缺少 commit_transfer'
  \quit 2
\endif

BEGIN;

SET LOCAL lock_timeout = '30s';
SET LOCAL statement_timeout = '10min';
SELECT set_config('tenant_transfer.tenant_id', :'tenant_id', true)
\g /dev/null

SELECT pg_advisory_xact_lock(
  hashtextextended('gooes:tenant-transfer:' || :'tenant_id', 0)
);
\i :lock_script

CREATE TEMP TABLE tenant_target_conflicts (
  conflict_type text NOT NULL,
  object_name text NOT NULL,
  conflict_count bigint NOT NULL
) ON COMMIT DROP;

\i :preflight_script

DO $reject_target_conflicts$
BEGIN
  IF EXISTS (SELECT 1 FROM tenant_target_conflicts WHERE conflict_count > 0) THEN
    RAISE EXCEPTION '目标租户 ID、名称或 slug 已存在，或迁移主键/唯一键发生冲突';
  END IF;
END
$reject_target_conflicts$;

SET LOCAL session_replication_role = replica;

-- tenant_transfer_copy_commands: generated \copy-equivalent inserts are loaded only after conflict checks.
\i :copy_script

\i :remap_script

SET LOCAL session_replication_role = origin;

DO $suspend_transferred_tenant$
DECLARE
  updated_rows integer;
BEGIN
  UPDATE public.tenants
  SET status = 'suspended'
  WHERE id = current_setting('tenant_transfer.tenant_id')::uuid;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN
    RAISE EXCEPTION '迁移租户状态更新行数异常: %', updated_rows;
  END IF;
END
$suspend_transferred_tenant$;

-- Generated verification fills tenant_transfer_expected_counts first, then
-- tenant_transfer_fk_violations, and raises before this transaction can commit.
\i :verification_script

\if :commit_transfer
  COMMIT;
\else
  ROLLBACK;
\endif
