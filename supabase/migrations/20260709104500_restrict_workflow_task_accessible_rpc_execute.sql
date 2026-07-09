revoke all on function public.list_accessible_workflow_tasks(
  uuid,
  uuid,
  text[],
  text[],
  text,
  text,
  text,
  uuid,
  integer,
  integer
) from public, anon, authenticated;

revoke all on function public.list_accessible_project_workflow_tasks(
  uuid,
  uuid,
  text[],
  text[],
  text[],
  integer
) from public, anon, authenticated;

grant execute on function public.list_accessible_workflow_tasks(
  uuid,
  uuid,
  text[],
  text[],
  text,
  text,
  text,
  uuid,
  integer,
  integer
) to service_role;

grant execute on function public.list_accessible_project_workflow_tasks(
  uuid,
  uuid,
  text[],
  text[],
  text[],
  integer
) to service_role;
