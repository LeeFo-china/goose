ALTER TABLE public.posts
ALTER COLUMN code TYPE varchar(64);

ALTER TABLE public.posts
DROP CONSTRAINT IF EXISTS posts_code_check;

ALTER TABLE public.posts
ADD CONSTRAINT posts_code_check
CHECK (
  code IS NULL OR code ~ '^[A-Z][A-Z0-9_]{1,63}$'
);
