-- supabase/migrations/xxx_create_project_logs.sql

create table if not exists public.project_logs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  employee_id uuid references public.employees(id) on delete set null not null,
  node_name text not null, 
  content text,           
  images jsonb default '[]'::jsonb, -- 默认给个空数组，防止前端遍历报错
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
comment on table public.project_logs is '项目进度反馈记录表';