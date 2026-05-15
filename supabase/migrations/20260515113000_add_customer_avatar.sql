alter table public.customers
add column if not exists avatar text;

comment on column public.customers.avatar is '客户头像，保存平台存储 object key、历史 URL 或兼容路径';
