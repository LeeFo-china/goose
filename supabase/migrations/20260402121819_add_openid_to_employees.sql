-- 添加字段（如果不存在）
alter table public.employees
add column if not exists openid text;

-- 创建唯一索引（如果不存在）
create unique index if not exists employees_openid_unique
on public.employees (openid)
where openid is not null;