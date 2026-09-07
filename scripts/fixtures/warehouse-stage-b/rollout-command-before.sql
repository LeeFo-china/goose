-- Synthetic historical commands are made with BOTH real old implementations.
CREATE TABLE public.stage_b_rollout_history (event jsonb);
CREATE TABLE public.stage_b_rollout_settings_before (setting jsonb);
INSERT INTO public.tenants(id,name,slug) VALUES
  ('92000000-0000-4000-8000-000000000001','Rollout fixture','stage-b-rollout');
INSERT INTO public.employees(id,name,status,tenant_id) VALUES
  ('92000000-0000-4000-8000-000000000002','Rollout actor','active','92000000-0000-4000-8000-000000000001');
SELECT public.set_tenant_supplier_rollout_settings(
  '92000000-0000-4000-8000-000000000001',true,false,false,false,false,false,
  0,'92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','historical-five',NULL);
SELECT public.set_tenant_supplier_rollout_settings(
  '92000000-0000-4000-8000-000000000001',true,false,true,false,false,false,false,
  1,'92000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','historical-six',NULL);
INSERT INTO public.stage_b_rollout_history SELECT to_jsonb(event) FROM public.supplier_command_events event;
INSERT INTO public.stage_b_rollout_settings_before SELECT to_jsonb(setting) FROM public.tenant_supplier_settings setting;
