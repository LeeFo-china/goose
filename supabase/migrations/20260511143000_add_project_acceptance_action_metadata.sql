alter table public.project_acceptance_actions
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.project_acceptance_actions.metadata is
  '项目工序验收操作记录扩展数据，如客户疑问补充图片和引用验收图片';
