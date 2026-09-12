\if :{?tenant_id}
\else
  \echo 'tenant_id is required'
  \quit 2
\endif
\if :{?tenant_slug}
\else
  \echo 'tenant_slug is required'
  \quit 2
\endif

INSERT INTO public.tenants (id, slug, name, status)
VALUES (
  :'tenant_id'::uuid,
  :'tenant_slug',
  '客户生图额度并发测试',
  'active'
);
