-- 1. 增加头像字段 (存储 URL 字符串)
alter table public.employees 
add column if not exists avatar text;

-- 2. 增加最后登录时间字段 (使用带时区的时间戳 timestamptz)
alter table public.employees 
add column if not exists last_login_time timestamptz;

-- 3. (可选) 给新字段添加备注，方便团队协作或日后维护
comment on column public.employees.avatar is '员工头像URL';
comment on column public.employees.last_login_time is '最后一次登录系统的时间';