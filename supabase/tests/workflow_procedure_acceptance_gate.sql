\set ON_ERROR_STOP on
-- Run only in an isolated local database. All fixtures roll back.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
DO $$
DECLARE
 t uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); v uuid:=gen_random_uuid();
 i uuid:=gen_random_uuid(); n uuid:=gen_random_uuid(); next_id uuid:=gen_random_uuid();
 run_id uuid:=gen_random_uuid(); task_id uuid:=gen_random_uuid();
 employee uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid(); project uuid:=gen_random_uuid();
 a uuid:=gen_random_uuid(); assignment uuid:=gen_random_uuid();
 node jsonb; next_node jsonb; result jsonb; previous_output jsonb;
BEGIN
 INSERT INTO public.tenants(id,name,slug,status) VALUES(t,'验收门禁验证','acceptance-gate-test','active');
 INSERT INTO public.employees(id,tenant_id,name,status) VALUES(employee,t,'验收验证员工','active');
 INSERT INTO public.customers(id,tenant_id,name) VALUES(customer,t,'验收验证客户');
 INSERT INTO public.projects(id,tenant_id,customer_id,name,status) VALUES(project,t,customer,'验收门禁验证项目','constructing');
 node:=jsonb_build_object('id',n,'node_key','water','node_type','procedure','title','水电','config',jsonb_build_object('stage_key','plumbing_electrical','trigger_acceptance',true,'require_procedure_assignment',true));
 next_node:=jsonb_build_object('id',next_id,'node_key','wood','node_type','procedure','title','木工','config',jsonb_build_object('stage_key','woodwork','trigger_acceptance',false));
 INSERT INTO public.workflow_definitions(id,tenant_id,workflow_key,name,category,status) VALUES(d,t,'acceptance_gate','验收门禁','construction','active');
 INSERT INTO public.workflow_versions(id,tenant_id,definition_id,version_number,snapshot) VALUES(v,t,d,1,jsonb_build_object('nodes',jsonb_build_array(node,next_node),'edges',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'source_node_id',n,'target_node_id',next_id,'condition',jsonb_build_object('operator','always')))));
 UPDATE public.workflow_definitions SET active_version_id=v WHERE id=d;
 INSERT INTO public.workflow_instances(id,tenant_id,definition_id,version_id,subject_type,subject_id,current_node_id,current_node_key,current_node_snapshot) VALUES(i,t,d,v,'project',project::text,n,'water',node);
 INSERT INTO public.workflow_instance_nodes(id,tenant_id,instance_id,definition_id,version_id,node_id,node_key,node_type,node_snapshot,status) VALUES(run_id,t,i,d,v,n,'water','procedure',node,'running');
 INSERT INTO public.workflow_tasks(id,tenant_id,instance_id,instance_node_id,definition_id,version_id,node_id,node_key,node_type,title) VALUES(task_id,t,i,run_id,d,v,n,'water','procedure','水电');
 INSERT INTO public.project_procedure_assignments(id,tenant_id,project_id,workflow_instance_id,workflow_instance_node_id,node_key,stage_code,assignee_employee_id,planned_start_date,planned_duration_days,status) VALUES(assignment,t,project,i,run_id,'water','plumbing_electrical',employee,current_date,1,'in_progress');

 PERFORM pg_temp.assert_true(NOT has_function_privilege('anon','public.complete_workflow_instance_node(uuid,uuid,uuid,text,text,jsonb,uuid)','EXECUTE'), 'anonymous callers cannot bypass API authorization');
 PERFORM pg_temp.assert_true(NOT has_function_privilege('authenticated','public.complete_workflow_instance_node(uuid,uuid,uuid,text,text,jsonb,uuid)','EXECUTE'), 'authenticated callers cannot bypass API authorization');
 result:=public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance','{"procedure_completed":true}',NULL);
 PERFORM pg_temp.assert_true(result->>'reason'='procedure_not_completed','client cannot forge construction completion');
 UPDATE public.project_procedure_assignments SET planned_start_date=current_date+1 WHERE id=assignment;
 result:=public.complete_workflow_instance_node(t,d,i,'water','complete_procedure','{}',employee);
 PERFORM pg_temp.assert_true(result->>'reason'='procedure_not_completed','future assignment cannot finish');
 UPDATE public.project_procedure_assignments SET planned_start_date=current_date WHERE id=assignment;
 SET LOCAL ROLE service_role;
 result:=public.complete_workflow_instance_node(t,d,i,'water','complete_procedure','{}',employee);
 RESET ROLE;
 PERFORM pg_temp.assert_true(result->>'awaiting_acceptance'='true','construction completion must wait for acceptance');
 PERFORM pg_temp.assert_true((SELECT current_node_key='water' FROM public.workflow_instances WHERE id=i),'must retain water as current node');
 PERFORM pg_temp.assert_true((SELECT status='running' AND output->>'procedure_completed'='true' FROM public.workflow_instance_nodes WHERE id=run_id),'node must remain running with completion fact');
 PERFORM pg_temp.assert_true((SELECT status='pending' FROM public.workflow_tasks WHERE id=task_id),'task must remain pending');
 PERFORM pg_temp.assert_true((SELECT status='completed' FROM public.project_procedure_assignments WHERE id=assignment),'assignment must complete atomically');
 PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.workflow_transition_logs WHERE instance_id=i),'no transition before acceptance');
 SELECT output INTO previous_output FROM public.workflow_instance_nodes WHERE id=run_id;
 result:=public.complete_workflow_instance_node(t,d,i,'water','complete_procedure','{"reason":"retry"}',employee);
 PERFORM pg_temp.assert_true(result->>'awaiting_acceptance'='true' AND (SELECT output=previous_output FROM public.workflow_instance_nodes WHERE id=run_id),'duplicate finish must not alter original fact');
 result:=public.complete_workflow_instance_node(t,d,i,'water','complete','{"procedure_completed":true}',employee);
 PERFORM pg_temp.assert_true(result->>'reason'='acceptance_required','generic completion must not bypass acceptance');
 result:=public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance','{}',NULL);
 PERFORM pg_temp.assert_true(result->>'reason'='acceptance_not_confirmed','action name alone cannot confirm acceptance');
 INSERT INTO public.project_acceptances(id,tenant_id,project_id,stage_code,title,initiator_id,customer_id,status) VALUES(a,t,project,'plumbing_electrical','水电验收',employee,customer,'draft');
 FOR result IN SELECT jsonb_build_object('acceptance_id',a,'customer_id',customer,'stage_code','plumbing_electrical','project_id',project) LOOP
   PERFORM pg_temp.assert_true(public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance',result,NULL)->>'reason'='acceptance_not_confirmed','draft acceptance cannot advance');
 END LOOP;
 UPDATE public.project_acceptances SET status='leader_approved' WHERE id=a;
 PERFORM pg_temp.assert_true(public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance',jsonb_build_object('acceptance_id',a,'customer_id',customer),NULL)->>'reason'='acceptance_not_confirmed','leader approval cannot advance');
 UPDATE public.project_acceptances SET status='rejected' WHERE id=a;
 PERFORM pg_temp.assert_true(public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance',jsonb_build_object('acceptance_id',a,'customer_id',customer),NULL)->>'reason'='acceptance_not_confirmed','rejected acceptance cannot advance');
 UPDATE public.project_acceptances SET status='cancelled' WHERE id=a;
 PERFORM pg_temp.assert_true(public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance',jsonb_build_object('acceptance_id',a,'customer_id',customer),NULL)->>'reason'='acceptance_not_confirmed','cancelled acceptance cannot advance');
 UPDATE public.project_acceptances SET status='customer_confirmed',customer_confirmed_at=now() WHERE id=a;
 PERFORM pg_temp.assert_true(public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance',jsonb_build_object('acceptance_id',a,'customer_id',gen_random_uuid()),NULL)->>'reason'='acceptance_not_confirmed','wrong customer cannot advance');
 UPDATE public.project_acceptances SET stage_code='woodwork' WHERE id=a;
 PERFORM pg_temp.assert_true(public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance',jsonb_build_object('acceptance_id',a,'customer_id',customer),NULL)->>'reason'='acceptance_not_confirmed','another stage acceptance cannot advance water');
 UPDATE public.project_acceptances SET stage_code='plumbing_electrical' WHERE id=a;
 PERFORM pg_temp.assert_true(public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance',jsonb_build_object('acceptance_id',gen_random_uuid(),'customer_id',customer),NULL)->>'reason'='acceptance_not_confirmed','another acceptance ID cannot advance');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.project_procedure_assignment_logs WHERE assignment_id=assignment AND action='complete'),'duplicate finish must log only once');
 result:=public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance',jsonb_build_object('acceptance_id',a,'customer_id',customer,'stage_code','plumbing_electrical','project_id',project),NULL);
 PERFORM pg_temp.assert_true(result->>'ok'='true' AND result->'instance'->>'current_node_key'='wood','confirmed acceptance advances to next node');
 result:=public.complete_workflow_instance_node(t,d,i,'water','customer_confirm_acceptance',jsonb_build_object('acceptance_id',a,'customer_id',customer),NULL);
 PERFORM pg_temp.assert_true(result->>'reason'='node_not_current','repeat confirmation cannot advance next node');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.workflow_transition_logs WHERE instance_id=i),'only one transition allowed');
 result:=public.complete_workflow_instance_node(t,d,i,'wood','complete_procedure','{}',employee);
 PERFORM pg_temp.assert_true(result->>'ok'='true' AND result->'instance'->>'status'='completed','exempt procedure must retain completion behavior');
 -- Explicitly optional assignment: completion still waits for acceptance.
 UPDATE public.workflow_instances SET status='running',completed_at=NULL,completed_by=NULL,current_node_id=n,current_node_key='water',current_node_snapshot=jsonb_set(node,'{config,require_procedure_assignment}','false') WHERE id=i;
 UPDATE public.workflow_instance_nodes SET status='running',completed_at=NULL,completed_by=NULL,output='{}' WHERE id=run_id;
 UPDATE public.workflow_tasks SET status='pending',completed_at=NULL,completed_by=NULL WHERE id=task_id;
 result:=public.complete_workflow_instance_node(t,d,i,'water','complete_procedure','{}',employee);
 PERFORM pg_temp.assert_true(result->>'awaiting_acceptance'='true','optional assignment still waits for acceptance');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.project_procedure_assignment_logs WHERE assignment_id=assignment AND action='complete'),'optional assignment creates no duplicate assignment log');
 RAISE NOTICE 'PASS: atomic finish, pending acceptance, retry, generic/forged bypass rejection, real confirmation, single advancement, exemption';
END $$;
ROLLBACK;
