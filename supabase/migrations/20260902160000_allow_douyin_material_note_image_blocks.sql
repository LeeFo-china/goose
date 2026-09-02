BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Forward-only rollback procedure:
-- 1. Deploy callers that stop writing image blocks.
-- 2. Append replacement material note versions that contain text-only blocks.
-- 3. In a reviewed forward migration, replace this validator with the previous
--    text-only body once no image-block versions remain in active use.

CREATE OR REPLACE FUNCTION public.is_valid_douyin_material_note_content_blocks(
  p_blocks jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  block jsonb;
BEGIN
  IF p_blocks IS NULL
    OR jsonb_typeof(p_blocks) <> 'array'
    OR jsonb_array_length(p_blocks) > 100
    OR pg_column_size(p_blocks) > 524288
    OR octet_length(convert_to(p_blocks::text, 'UTF8')) > 524288
  THEN
    RETURN false;
  END IF;

  FOR block IN SELECT value FROM jsonb_array_elements(p_blocks)
  LOOP
    IF jsonb_typeof(block) <> 'object'
      OR jsonb_typeof(block -> 'type') <> 'string'
    THEN
      RETURN false;
    END IF;

    CASE block ->> 'type'
      WHEN 'paragraph' THEN
        IF NOT (block ?& ARRAY['type', 'text'])
          OR block - ARRAY['type', 'text']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'text') <> 'string'
          OR char_length(btrim(block ->> 'text')) NOT BETWEEN 1 AND 20000
        THEN
          RETURN false;
        END IF;
      WHEN 'heading' THEN
        IF NOT (block ?& ARRAY['type', 'level', 'text'])
          OR block - ARRAY['type', 'level', 'text']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'level') <> 'number'
          OR block ->> 'level' NOT IN ('2', '3')
          OR jsonb_typeof(block -> 'text') <> 'string'
          OR char_length(btrim(block ->> 'text')) NOT BETWEEN 1 AND 300
        THEN
          RETURN false;
        END IF;
      WHEN 'quote' THEN
        IF NOT (block ?& ARRAY['type', 'text'])
          OR block - ARRAY['type', 'text', 'attribution']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'text') <> 'string'
          OR char_length(btrim(block ->> 'text')) NOT BETWEEN 1 AND 20000
          OR (
            block ? 'attribution'
            AND (
              jsonb_typeof(block -> 'attribution') <> 'string'
              OR char_length(btrim(block ->> 'attribution')) NOT BETWEEN 1 AND 300
            )
          )
        THEN
          RETURN false;
        END IF;
      WHEN 'list' THEN
        IF NOT (block ?& ARRAY['type', 'style', 'items'])
          OR block - ARRAY['type', 'style', 'items']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'style') <> 'string'
          OR block ->> 'style' NOT IN ('ordered', 'unordered')
          OR jsonb_typeof(block -> 'items') <> 'array'
          OR jsonb_array_length(block -> 'items') NOT BETWEEN 1 AND 50
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(block -> 'items') AS item(value)
            WHERE jsonb_typeof(item.value) <> 'string'
              OR char_length(btrim(item.value #>> '{}')) NOT BETWEEN 1 AND 2000
          )
        THEN
          RETURN false;
        END IF;
      WHEN 'callout' THEN
        IF NOT (block ?& ARRAY['type', 'tone', 'title', 'text'])
          OR block - ARRAY['type', 'tone', 'title', 'text']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'tone') <> 'string'
          OR block ->> 'tone' NOT IN ('info', 'warning')
          OR jsonb_typeof(block -> 'title') <> 'string'
          OR char_length(btrim(block ->> 'title')) NOT BETWEEN 1 AND 300
          OR jsonb_typeof(block -> 'text') <> 'string'
          OR char_length(btrim(block ->> 'text')) NOT BETWEEN 1 AND 20000
        THEN
          RETURN false;
        END IF;
      WHEN 'image' THEN
        IF NOT (block ?& ARRAY['type', 'fileId', 'alt'])
          OR block - ARRAY['type', 'fileId', 'alt', 'caption']::text[] <> '{}'::jsonb
          OR jsonb_typeof(block -> 'fileId') <> 'string'
          OR block ->> 'fileId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          OR jsonb_typeof(block -> 'alt') <> 'string'
          OR char_length(btrim(block ->> 'alt')) NOT BETWEEN 1 AND 300
          OR (
            block ? 'caption'
            AND (
              jsonb_typeof(block -> 'caption') <> 'string'
              OR char_length(btrim(block ->> 'caption')) NOT BETWEEN 1 AND 1000
            )
          )
        THEN
          RETURN false;
        END IF;
      ELSE
        RETURN false;
    END CASE;
  END LOOP;

  RETURN true;
END;
$function$;

COMMIT;
