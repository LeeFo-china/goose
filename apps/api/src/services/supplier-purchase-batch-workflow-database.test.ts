import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

import { resolveLocalSupabasePostgres } from
  "./supplier-rollout-settings-database.test-helper";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const localPostgres = resolveLocalSupabasePostgres();

function releaseMatrixSql() {
  return String.raw`
\set ON_ERROR_STOP on
INSERT INTO auth.users (id,email) VALUES
 ('85000000-0000-4000-8000-00000000f001','task12-finance@example.invalid'),
 ('85000000-0000-4000-8000-00000000f002','task12-other@example.invalid'),
 ('85000000-0000-4000-8000-00000000f003','task12-scoped@example.invalid');
INSERT INTO public.employees (id,name,status,user_id,tenant_id) VALUES
 ('85000000-0000-4000-8000-00000000f011','Task12 Finance','active','85000000-0000-4000-8000-00000000f001','85000000-0000-4000-8000-000000000001'),
 ('85000000-0000-4000-8000-00000000f012','Task12 Other','active','85000000-0000-4000-8000-00000000f002','85000000-0000-4000-8000-000000000001'),
 ('85000000-0000-4000-8000-00000000f013','Task12 Scoped','active','85000000-0000-4000-8000-00000000f003','85000000-0000-4000-8000-000000000001');
INSERT INTO public.permissions (id,code,module,resource,action,name)
SELECT '85000000-0000-4000-8000-00000000f020','finance.budget.manage','finance','budget','manage','Task12 Finance'
WHERE NOT EXISTS (SELECT 1 FROM public.permissions WHERE code='finance.budget.manage');
INSERT INTO public.roles (id,tenant_id,code,name) VALUES
 ('85000000-0000-4000-8000-00000000f021','85000000-0000-4000-8000-000000000001','task12_finance','Task12 Finance'),
 ('85000000-0000-4000-8000-00000000f022','85000000-0000-4000-8000-000000000001','task12_other','Task12 Other'),
 ('85000000-0000-4000-8000-00000000f023','85000000-0000-4000-8000-000000000001','task12_scoped','Task12 Scoped');
INSERT INTO public.role_permissions(role_id,permission_id,access_scope)
SELECT '85000000-0000-4000-8000-00000000f021',id,'all' FROM public.permissions WHERE code IN ('finance.budget.manage','supplier.purchase-requisition.view','project.read');
INSERT INTO public.role_permissions(role_id,permission_id,access_scope)
SELECT '85000000-0000-4000-8000-00000000f022',id,'all' FROM public.permissions WHERE code IN ('supplier.purchase-requisition.approve','supplier.purchase-requisition.view','project.read');
INSERT INTO public.role_permissions(role_id,permission_id,access_scope)
SELECT '85000000-0000-4000-8000-00000000f023',id,'assigned' FROM public.permissions WHERE code IN ('supplier.purchase-requisition.approve','supplier.purchase-requisition.view','project.read');
INSERT INTO public.employee_roles(employee_id,role_id) VALUES
 ('85000000-0000-4000-8000-00000000f011','85000000-0000-4000-8000-00000000f021'),
 ('85000000-0000-4000-8000-00000000f012','85000000-0000-4000-8000-00000000f022'),
 ('85000000-0000-4000-8000-00000000f013','85000000-0000-4000-8000-00000000f023');

DO $matrix$
DECLARE
 t uuid := '85000000-0000-4000-8000-000000000001'; p uuid := '85000000-0000-4000-8000-000000000006';
 su uuid := '85000000-0000-4000-8000-000000000002'; se uuid := '85000000-0000-4000-8000-000000000003';
 ru uuid := '85000000-0000-4000-8000-000000000004'; re uuid := '85000000-0000-4000-8000-000000000005';
 fu uuid := '85000000-0000-4000-8000-00000000f001'; fe uuid := '85000000-0000-4000-8000-00000000f011';
 ou uuid := '85000000-0000-4000-8000-00000000f002'; oe uuid := '85000000-0000-4000-8000-00000000f012';
 xu uuid := '85000000-0000-4000-8000-00000000f003'; xe uuid := '85000000-0000-4000-8000-00000000f013';
 sku uuid := '85000000-0000-4000-8000-000000000026'; cat uuid := '85000000-0000-4000-8000-000000000029';
 b uuid; task uuid; result jsonb;
BEGIN
 -- within budget -> purchase approval -> one submitted supplier order
 b := '85000000-0000-4000-8000-000000001001';
 PERFORM public.save_supplier_purchase_batch_draft(b,t,p,0,'Task12 within',NULL,NULL,jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cat,'quantity','1')),su,se,'task12-within-save');
 result := public.submit_supplier_purchase_batch_with_workflow(b,t,1,su,se,'task12-within-submit');
 IF result->'batch'->>'budget_status'<>'within_budget' THEN RAISE EXCEPTION 'within classification failed: %',result; END IF;
 SELECT wt.id INTO STRICT task FROM public.workflow_instances wi JOIN public.workflow_tasks wt ON wt.instance_id=wi.id WHERE wi.subject_id=b::text AND wi.status='running' AND wt.status='pending';
 result := public.complete_supplier_purchase_batch_workflow_task(t,b,task,'approve',NULL,'{}',ru,re,'task12-within-approve');
 IF result->>'status'<>'ordered' OR (SELECT count(*) FROM public.supplier_purchase_orders WHERE purchase_batch_id=b AND status='submitted')<>1 OR (SELECT count(DISTINCT supplier_id) FROM public.supplier_purchase_orders WHERE purchase_batch_id=b)<>1 THEN RAISE EXCEPTION 'within final facts failed: %',result; END IF;

 -- over budget requires purchase then finance; no early order
 b := '85000000-0000-4000-8000-000000001002';
 PERFORM public.save_supplier_purchase_batch_draft(b,t,p,0,'Task12 over',NULL,NULL,jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cat,'quantity','2000')),su,se,'task12-over-save');
 result := public.submit_supplier_purchase_batch_with_workflow(b,t,1,su,se,'task12-over-submit');
 IF result->'batch'->>'budget_status'<>'over_budget' THEN RAISE EXCEPTION 'over classification failed: %',result; END IF;
 SELECT wt.id INTO STRICT task FROM public.workflow_instances wi JOIN public.workflow_tasks wt ON wt.instance_id=wi.id WHERE wi.subject_id=b::text AND wt.node_key='purchase_review' AND wt.status='pending';
 result := public.complete_supplier_purchase_batch_workflow_task(t,b,task,'approve',NULL,'{}',ru,re,'task12-over-purchase');
 IF result->>'status'<>'pending_approval' OR EXISTS(SELECT 1 FROM public.supplier_purchase_orders WHERE purchase_batch_id=b) THEN RAISE EXCEPTION 'over purchase gate failed: %',result; END IF;
 SELECT wt.id INTO STRICT task FROM public.workflow_instances wi JOIN public.workflow_tasks wt ON wt.instance_id=wi.id WHERE wi.subject_id=b::text AND wt.node_key='finance_review' AND wt.status='pending';
 result := public.complete_supplier_purchase_batch_workflow_task(t,b,task,'approve',NULL,'{}',fu,fe,'task12-over-finance');
 IF result->>'status'<>'ordered' OR (SELECT count(*) FROM public.supplier_purchase_orders WHERE purchase_batch_id=b AND status='submitted')<>1 THEN RAISE EXCEPTION 'over final facts failed: %',result; END IF;

 -- purchase reject releases commitments and never orders
 b := '85000000-0000-4000-8000-000000001003';
 PERFORM public.save_supplier_purchase_batch_draft(b,t,p,0,'Task12 purchase reject',NULL,NULL,jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cat,'quantity','1')),su,se,'task12-pr-save');
 PERFORM public.submit_supplier_purchase_batch_with_workflow(b,t,1,su,se,'task12-pr-submit');
 SELECT wt.id INTO STRICT task FROM public.workflow_instances wi JOIN public.workflow_tasks wt ON wt.instance_id=wi.id WHERE wi.subject_id=b::text AND wt.status='pending';
 PERFORM public.complete_supplier_purchase_batch_workflow_task(t,b,task,'reject','Task12 reject','{}',ru,re,'task12-pr-reject');
 IF NOT EXISTS(SELECT 1 FROM public.supplier_purchase_batches WHERE id=b AND status='rejected') OR EXISTS(SELECT 1 FROM public.supplier_purchase_orders WHERE purchase_batch_id=b) OR EXISTS(SELECT 1 FROM public.project_cost_commitments c JOIN public.supplier_purchase_requisitions r ON r.id=c.source_id WHERE r.purchase_batch_id=b AND c.status='reserved') THEN RAISE EXCEPTION 'purchase rejection residue'; END IF;

 -- finance reject has the same release boundary
 b := '85000000-0000-4000-8000-000000001004';
 PERFORM public.save_supplier_purchase_batch_draft(b,t,p,0,'Task12 finance reject',NULL,NULL,jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cat,'quantity','2000')),su,se,'task12-fr-save');
 PERFORM public.submit_supplier_purchase_batch_with_workflow(b,t,1,su,se,'task12-fr-submit');
 SELECT wt.id INTO STRICT task FROM public.workflow_instances wi JOIN public.workflow_tasks wt ON wt.instance_id=wi.id WHERE wi.subject_id=b::text AND wt.node_key='purchase_review' AND wt.status='pending';
 PERFORM public.complete_supplier_purchase_batch_workflow_task(t,b,task,'approve',NULL,'{}',ru,re,'task12-fr-purchase');
 SELECT wt.id INTO STRICT task FROM public.workflow_instances wi JOIN public.workflow_tasks wt ON wt.instance_id=wi.id WHERE wi.subject_id=b::text AND wt.node_key='finance_review' AND wt.status='pending';
 PERFORM public.complete_supplier_purchase_batch_workflow_task(t,b,task,'reject','Task12 finance reject','{}',fu,fe,'task12-fr-finance');
 IF NOT EXISTS(SELECT 1 FROM public.supplier_purchase_batches WHERE id=b AND status='rejected') OR EXISTS(SELECT 1 FROM public.supplier_purchase_orders WHERE purchase_batch_id=b) OR EXISTS(SELECT 1 FROM public.project_cost_commitments c JOIN public.supplier_purchase_requisitions r ON r.id=c.source_id WHERE r.purchase_batch_id=b AND c.status='reserved') THEN RAISE EXCEPTION 'finance rejection residue'; END IF;

 -- missing purchase candidate fails before legacy submit and leaves zero submit facts
 b := '85000000-0000-4000-8000-000000001005';
 PERFORM public.save_supplier_purchase_batch_draft(b,t,p,0,'Task12 no purchase',NULL,NULL,jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cat,'quantity','1')),su,se,'task12-np-save');
 DELETE FROM public.role_permissions rp USING public.permissions pm WHERE rp.permission_id=pm.id AND pm.code='supplier.purchase-requisition.approve' AND rp.access_scope='all';
 BEGIN PERFORM public.submit_supplier_purchase_batch_with_workflow(b,t,1,su,se,'task12-np-submit'); RAISE EXCEPTION 'missing purchase unexpectedly submitted'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'SUPPLIER_PURCHASE_BATCH_NO_APPROVER' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM public.supplier_purchase_requisitions WHERE purchase_batch_id=b) OR EXISTS(SELECT 1 FROM public.workflow_instances WHERE subject_type='supplier_purchase_batch' AND subject_id=b::text) OR EXISTS(SELECT 1 FROM public.supplier_purchase_batch_command_events WHERE purchase_batch_id=b AND command_type='submit') THEN RAISE EXCEPTION 'missing purchase residue'; END IF;
 INSERT INTO public.role_permissions(role_id,permission_id,access_scope) SELECT r.id,pm.id,'all' FROM public.roles r CROSS JOIN public.permissions pm WHERE r.id IN ('85000000-0000-4000-8000-000000000008','85000000-0000-4000-8000-00000000f022') AND pm.code='supplier.purchase-requisition.approve';

 -- missing finance candidate also leaves zero submit facts
 b := '85000000-0000-4000-8000-000000001006';
 PERFORM public.save_supplier_purchase_batch_draft(b,t,p,0,'Task12 no finance',NULL,NULL,jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cat,'quantity','2000')),su,se,'task12-nf-save');
 DELETE FROM public.role_permissions rp USING public.permissions pm WHERE rp.permission_id=pm.id AND pm.code='finance.budget.manage';
 BEGIN PERFORM public.submit_supplier_purchase_batch_with_workflow(b,t,1,su,se,'task12-nf-submit'); RAISE EXCEPTION 'missing finance unexpectedly submitted'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'SUPPLIER_PURCHASE_BATCH_NO_APPROVER' THEN RAISE; END IF; END;
 IF EXISTS(SELECT 1 FROM public.supplier_purchase_requisitions WHERE purchase_batch_id=b) OR EXISTS(SELECT 1 FROM public.project_cost_commitments c JOIN public.supplier_purchase_requisitions r ON r.id=c.source_id WHERE r.purchase_batch_id=b) OR EXISTS(SELECT 1 FROM public.workflow_instances WHERE subject_type='supplier_purchase_batch' AND subject_id=b::text) OR EXISTS(SELECT 1 FROM public.supplier_purchase_batch_command_events WHERE purchase_batch_id=b AND command_type='submit') THEN RAISE EXCEPTION 'missing finance residue'; END IF;
 INSERT INTO public.role_permissions(role_id,permission_id,access_scope) SELECT '85000000-0000-4000-8000-00000000f021',id,'all' FROM public.permissions WHERE code='finance.budget.manage';

 -- replay/conflict and self/project/assignee/tenant gates
 b := '85000000-0000-4000-8000-000000001007';
 PERFORM public.save_supplier_purchase_batch_draft(b,t,p,0,'Task12 boundaries',NULL,NULL,jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cat,'quantity','1')),su,se,'task12-bound-save');
 result := public.submit_supplier_purchase_batch_with_workflow(b,t,1,su,se,'task12-bound-submit');
 result := public.submit_supplier_purchase_batch_with_workflow(b,t,1,su,se,'task12-bound-submit'); IF NOT (result->>'idempotent')::boolean THEN RAISE EXCEPTION 'submit replay not idempotent'; END IF;
 BEGIN PERFORM public.submit_supplier_purchase_batch_with_workflow(b,t,2,su,se,'task12-bound-submit'); RAISE EXCEPTION 'changed replay accepted'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'SUPPLIER_IDEMPOTENCY_CONFLICT' THEN RAISE; END IF; END;
 SELECT wt.id INTO STRICT task FROM public.workflow_instances wi JOIN public.workflow_tasks wt ON wt.instance_id=wi.id WHERE wi.subject_id=b::text AND wt.status='pending';
 BEGIN PERFORM public.complete_supplier_purchase_batch_workflow_task(t,b,task,'approve',NULL,'{}',su,se,'task12-self'); RAISE EXCEPTION 'self review accepted'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'SUPPLIER_PURCHASE_BATCH_SELF_REVIEW' THEN RAISE; END IF; END;
 BEGIN PERFORM public.complete_supplier_purchase_batch_workflow_task(t,b,task,'approve',NULL,'{}',xu,xe,'task12-scope'); RAISE EXCEPTION 'project scope accepted'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF; END;
 UPDATE public.workflow_tasks SET assignee_employee_id=re WHERE id=task;
 BEGIN PERFORM public.complete_supplier_purchase_batch_workflow_task(t,b,task,'approve',NULL,'{}',ou,oe,'task12-assignee'); RAISE EXCEPTION 'wrong assignee accepted'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF; END;
 BEGIN PERFORM public.complete_supplier_purchase_batch_workflow_task('85000000-0000-4000-8000-00000000ffff',b,task,'approve',NULL,'{}',ru,re,'task12-tenant'); RAISE EXCEPTION 'wrong tenant accepted'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM<>'SUPPLIER_PURCHASE_BATCH_WORKFLOW_MISSING' THEN RAISE; END IF; END;

 -- leave a deterministic pending task for the two-session race below
 b := '85000000-0000-4000-8000-000000001008';
 PERFORM public.save_supplier_purchase_batch_draft(b,t,p,0,'Task12 concurrency',NULL,NULL,jsonb_build_array(jsonb_build_object('supplier_sku_id',sku,'cost_category_id',cat,'quantity','1')),su,se,'task12-concurrent-save');
 PERFORM public.submit_supplier_purchase_batch_with_workflow(b,t,1,su,se,'task12-concurrent-submit');
 SELECT wt.id INTO STRICT task FROM public.workflow_instances wi JOIN public.workflow_tasks wt ON wt.instance_id=wi.id WHERE wi.subject_id=b::text AND wt.node_key='purchase_review' AND wt.status='pending';
 PERFORM public.complete_supplier_purchase_batch_workflow_task(t,b,task,'approve',NULL,'{}',ru,re,'task12-concurrent-purchase');
END
$matrix$;
SELECT 'TASK12_RELEASE_MATRIX_READY';
`;
}

function productionCloneScript(container: string) {
  const database = `gooes_task12_release_${process.pid}_${crypto.randomUUID().replaceAll("-", "")}`;
  const migrations = [
    "20260830100000_standardize_new_tenant_organization_template.sql",
    "20260830110000_add_supplier_purchase_batch_workflow_foundation.sql",
    "20260830111000_extend_supplier_workflow_rollout_command.sql",
    "20260830112000_seed_supplier_purchase_batch_workflow.sql",
    "20260830113000_create_supplier_purchase_batch_workflow_submit.sql",
    "20260830113500_list_supplier_purchase_batch_workflow_projection.sql",
    "20260830113600_list_accessible_supplier_purchase_batch_workflow_tasks.sql",
    "20260830113700_fix_supplier_purchase_batch_workflow_task_pagination.sql",
    "20260830113800_fix_supplier_purchase_batch_budget_preflight.sql",
    "20260830114000_create_supplier_purchase_batch_workflow_review.sql",
    "20260830115000_create_supplier_purchase_batch_workflow_withdraw.sql",
  ].join(" ");
  return String.raw`set -euo pipefail
repo_root=${JSON.stringify(repoRoot)}
container=${JSON.stringify(container)}
database=${JSON.stringify(database)}
psql_admin() { docker exec -e PGPASSWORD=postgres -i "$container" psql -h 127.0.0.1 -U supabase_admin -d "$database" -X --set ON_ERROR_STOP=1 "$@"; }
cleanup() { docker exec -e PGPASSWORD=postgres "$container" dropdb -h 127.0.0.1 -U supabase_admin --if-exists --force "$database" >/dev/null 2>&1 || true; }
trap cleanup EXIT
docker exec -e PGPASSWORD=postgres "$container" createdb -h 127.0.0.1 -U supabase_admin "$database"
docker exec "$container" pg_dump -U postgres -d postgres --schema-only --no-owner --no-privileges | psql_admin >/dev/null
for migration in ${migrations}; do psql_admin < "$repo_root/supabase/migrations/$migration" >/dev/null; done
psql_admin < "$repo_root/supabase/tests/supplier_purchase_batch_workflow_withdraw_production_fixture.sql" >/dev/null
psql_admin <<'TASK12_SQL'
${releaseMatrixSql()}
TASK12_SQL
task=$(psql_admin -Atqc "select wt.id from public.workflow_instances wi join public.workflow_tasks wt on wt.instance_id=wi.id where wi.subject_id='85000000-0000-4000-8000-000000001008' and wt.status='pending'" </dev/null)
set +e
psql_admin -c "select public.complete_supplier_purchase_batch_workflow_task('85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000001008','$task','approve',null,'{}','85000000-0000-4000-8000-00000000f001','85000000-0000-4000-8000-00000000f011','task12-race-a')" </dev/null >/tmp/task12-race-a-${process.pid}.log 2>&1 & a=$!
psql_admin -c "select public.complete_supplier_purchase_batch_workflow_task('85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000001008','$task','approve',null,'{}','85000000-0000-4000-8000-00000000f001','85000000-0000-4000-8000-00000000f011','task12-race-b')" </dev/null >/tmp/task12-race-b-${process.pid}.log 2>&1 & b=$!
wait $a; sa=$?; wait $b; sb=$?; set -e
if ! { { [ $sa -eq 0 ] && [ $sb -ne 0 ]; } || { [ $sa -ne 0 ] && [ $sb -eq 0 ]; }; }; then cat /tmp/task12-race-a-${process.pid}.log /tmp/task12-race-b-${process.pid}.log >&2; exit 1; fi
psql_admin -Atqc "do \$verify\$ begin if (select count(*) from public.supplier_purchase_orders where purchase_batch_id='85000000-0000-4000-8000-000000001008' and status='submitted')<>1 or (select count(*) from public.supplier_purchase_batch_command_events where purchase_batch_id='85000000-0000-4000-8000-000000001008' and command_type='review')<>2 then raise exception 'double approval residue'; end if; end \$verify\$;" </dev/null
SUPABASE_DB_DIRECT_URL="postgresql://supabase_admin:postgres@127.0.0.1:54322/$database" bun "$repo_root/apps/api/src/scripts/supplier-purchase-batch-workflow-smoke.ts" --tenant-id 85000000-0000-4000-8000-000000000001 --project-id 85000000-0000-4000-8000-000000000006 --applicant-employee-id 85000000-0000-4000-8000-000000000003 --purchase-approver-id 85000000-0000-4000-8000-000000000005 --finance-approver-id 85000000-0000-4000-8000-00000000f011
SUPABASE_DB_DIRECT_URL="postgresql://supabase_admin:postgres@127.0.0.1:54322/$database" bun "$repo_root/apps/api/src/scripts/supplier-purchase-batch-workflow-smoke.ts" --tenant-id 85000000-0000-4000-8000-000000000001 --project-id 85000000-0000-4000-8000-000000000006 --applicant-employee-id 85000000-0000-4000-8000-000000000003 --purchase-approver-id 85000000-0000-4000-8000-000000000005 --finance-approver-id 85000000-0000-4000-8000-00000000f011 --execute
rm -f /tmp/task12-race-a-${process.pid}.log /tmp/task12-race-b-${process.pid}.log
# Structural eligibility only. The release runbook requires a separate
# default-planner, read-only EXPLAIN on representative dev cardinality.
psql_admin -c "set enable_seqscan=off; explain (analyze,buffers) select id from public.workflow_instances where tenant_id='85000000-0000-4000-8000-000000000001' and subject_type='supplier_purchase_batch' and subject_id='85000000-0000-4000-8000-000000001007' and status='running' order by created_at desc,id desc limit 2; explain (analyze,buffers) select id from public.workflow_tasks where instance_id=(select id from public.workflow_instances where subject_id='85000000-0000-4000-8000-000000001007' and status='running') and status='pending' order by created_at limit 2; explain (analyze,buffers) select subject_id from public.workflow_subject_states where tenant_id='85000000-0000-4000-8000-000000000001' and subject_type='supplier_purchase_batch' and subject_id=any(array['85000000-0000-4000-8000-000000001007'])" </dev/null
echo TASK12_SUPPLIER_PURCHASE_BATCH_WORKFLOW_DATABASE_OK
`;
}

test("runs release matrix, concurrency, and structural index checks on a production-schema clone", async () => {
  if (!localPostgres.available) {
    throw new Error(`本地 Supabase PostgreSQL 不可用：${localPostgres.reason}`);
  }
  const child = Bun.spawn(["bash"], {
    cwd: repoRoot,
    stdin: new Blob([productionCloneScript(localPostgres.container)]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(exitCode, stderr).toBe(0);
  expect(stdout).toContain("TASK12_RELEASE_MATRIX_READY");
  expect(stdout).toContain('"mode": "dry-run"');
  expect(stdout).toContain('"mode": "execute"');
  expect(stdout).toContain('"supplierCount": 1');
  expect(stdout).toContain("TASK12_SUPPLIER_PURCHASE_BATCH_WORKFLOW_DATABASE_OK");
  expect(stdout).toContain("workflow_instances_purchase_batch_lookup_idx");
  expect(stdout).toContain("idx_workflow_tasks_instance_status");
  expect(stdout).toContain("idx_workflow_subject_states_tenant_type_status");
}, 30_000);
