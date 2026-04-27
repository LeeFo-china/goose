create table if not exists public.customer_follow_up_comments (
  id uuid primary key default gen_random_uuid(),
  follow_up_id uuid not null references public.customer_follow_ups(id) on delete cascade,
  parent_id uuid null references public.customer_follow_up_comments(id) on delete cascade,
  author_employee_id uuid not null references public.employees(id) on delete restrict,
  content text not null,
  images text[] not null default '{}'::text[],
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_follow_up_comments_status_check
    check (status in ('active', 'hidden'))
);

create index if not exists idx_customer_follow_up_comments_follow_up_id
  on public.customer_follow_up_comments(follow_up_id);

create index if not exists idx_customer_follow_up_comments_parent_id
  on public.customer_follow_up_comments(parent_id);

create index if not exists idx_customer_follow_up_comments_author_employee_id
  on public.customer_follow_up_comments(author_employee_id);

comment on table public.customer_follow_up_comments is '客户跟进记录评论';
comment on column public.customer_follow_up_comments.follow_up_id is '所属客户跟进记录';
comment on column public.customer_follow_up_comments.parent_id is '父评论ID，仅支持回复顶级评论';
comment on column public.customer_follow_up_comments.author_employee_id is '评论作者员工ID';
comment on column public.customer_follow_up_comments.images is '评论图片URL数组';
