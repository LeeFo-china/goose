ALTER TABLE public.customers
DROP CONSTRAINT IF EXISTS customers_status_check;

ALTER TABLE public.customers
ADD CONSTRAINT customers_status_check
CHECK (
  status IS NULL OR status = ANY (
    ARRAY[
      'potential'::text,
      'following'::text,
      'arrived'::text,
      'ordered'::text,
      'designing'::text,
      'contracted'::text,
      'dormant'::text,
      'invalid'::text
    ]
  )
);
