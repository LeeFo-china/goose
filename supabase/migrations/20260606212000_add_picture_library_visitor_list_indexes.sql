CREATE INDEX IF NOT EXISTS idx_picture_assets_published_sort_id
ON public.picture_assets(sort_order, created_at DESC, id DESC)
WHERE status = 'published' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_picture_asset_categories_asset_sort
ON public.picture_asset_categories(asset_id, sort_order, created_at ASC, category_id);

CREATE INDEX IF NOT EXISTS idx_picture_asset_categories_category_sort_asset
ON public.picture_asset_categories(category_id, sort_order, created_at DESC, asset_id);

CREATE OR REPLACE FUNCTION public.list_visitor_picture_assets(
  p_category_id uuid,
  p_page integer,
  p_page_size integer
)
RETURNS TABLE(asset jsonb, total_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered_assets AS (
    SELECT pa.*
    FROM public.picture_assets pa
    WHERE pa.status = 'published'
      AND pa.deleted_at IS NULL
      AND (
        p_category_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.picture_asset_categories pac
          JOIN public.picture_categories pc
            ON pc.id = pac.category_id
          WHERE pac.asset_id = pa.id
            AND pac.category_id = p_category_id
            AND pc.status = 'active'
        )
      )
  ),
  counted AS (
    SELECT count(*) AS total_count
    FROM filtered_assets
  ),
  paged_assets AS (
    SELECT *
    FROM filtered_assets
    ORDER BY sort_order ASC, created_at DESC, id DESC
    OFFSET greatest(p_page - 1, 0) * p_page_size
    LIMIT p_page_size
  ),
  variants AS (
    SELECT
      pav.asset_id,
      jsonb_agg(
        jsonb_build_object(
          'asset_id', pav.asset_id,
          'variant', pav.variant,
          'object_key', pav.object_key,
          'width', pav.width,
          'height', pav.height,
          'file_size', pav.file_size,
          'mime_type', pav.mime_type
        )
        ORDER BY pav.variant
      ) AS variants
    FROM public.picture_asset_variants pav
    WHERE pav.asset_id IN (SELECT id FROM paged_assets)
      AND pav.variant IN ('thumb', 'cover', 'original', 'large')
    GROUP BY pav.asset_id
  ),
  categories AS (
    SELECT
      pac.asset_id,
      jsonb_agg(
        jsonb_build_object(
          'id', pc.id,
          'name', pc.name,
          'slug', pc.slug,
          'description', pc.description,
          'cover_asset_id', pc.cover_asset_id,
          'sort_order', pc.sort_order
        )
        ORDER BY pac.sort_order ASC, pac.created_at ASC
      ) AS categories
    FROM public.picture_asset_categories pac
    JOIN public.picture_categories pc
      ON pc.id = pac.category_id
    WHERE pac.asset_id IN (SELECT id FROM paged_assets)
    GROUP BY pac.asset_id
  )
  SELECT *
  FROM (
    SELECT
    jsonb_build_object(
      'id', pa.id,
      'title', pa.title,
      'description', pa.description,
      'width', pa.width,
      'height', pa.height,
      'like_count', pa.like_count,
      'favorite_count', pa.favorite_count,
      'comment_count', pa.comment_count,
      'share_count', pa.share_count,
      'sort_order', pa.sort_order,
      'created_at', pa.created_at,
      'updated_at', pa.updated_at,
      'variants', coalesce(variants.variants, '[]'::jsonb),
      'categories', coalesce(categories.categories, '[]'::jsonb)
    ) AS asset,
    counted.total_count
    FROM paged_assets pa
    CROSS JOIN counted
    LEFT JOIN variants
      ON variants.asset_id = pa.id
    LEFT JOIN categories
      ON categories.asset_id = pa.id
    UNION ALL
    SELECT NULL::jsonb AS asset, counted.total_count
    FROM counted
    WHERE NOT EXISTS (SELECT 1 FROM paged_assets)
  ) result;
$$;

GRANT EXECUTE ON FUNCTION public.list_visitor_picture_assets(uuid, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.list_visitor_picture_assets(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_visitor_picture_assets(uuid, integer, integer) TO service_role;
