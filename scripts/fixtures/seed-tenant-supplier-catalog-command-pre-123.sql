-- Runs after 122000 and before 123000 inside the command verifier transaction.
-- It records real events with the deployed pre-v2 platform create functions.
INSERT INTO auth.users(id, role, created_at, updated_at)
VALUES (
  '91200000-0000-0000-0000-000000000001',
  'authenticated',
  now(),
  now()
);

INSERT INTO public.employees(id, name, status, user_id, tenant_id)
VALUES (
  '92200000-0000-0000-0000-000000000001',
  'Pre-123 platform catalog actor',
  'active',
  '91200000-0000-0000-0000-000000000001',
  NULL
);

SET LOCAL ROLE service_role;

SELECT public.create_catalog_unit(
  '96200000-0000-0000-0000-000000000001',
  'PRE123_UNIT',
  'Pre-123 unit',
  'p12u',
  NULL,
  '1.000000',
  'active',
  120,
  '91200000-0000-0000-0000-000000000001',
  '92200000-0000-0000-0000-000000000001',
  'verify-pre-123-unit-create'
);

SELECT public.create_catalog_category(
  '93200000-0000-0000-0000-000000000001',
  NULL,
  'PRE123_CATEGORY',
  'Pre-123 category',
  1,
  'active',
  120,
  '91200000-0000-0000-0000-000000000001',
  '92200000-0000-0000-0000-000000000001',
  'verify-pre-123-category-create'
);

SELECT public.create_catalog_brand(
  '94200000-0000-0000-0000-000000000001',
  'PRE123_BRAND',
  'Pre-123 brand',
  'Pre-123 brand legal name',
  NULL,
  'active',
  120,
  '91200000-0000-0000-0000-000000000001',
  '92200000-0000-0000-0000-000000000001',
  'verify-pre-123-brand-create'
);

RESET ROLE;
