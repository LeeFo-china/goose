CREATE INDEX IF NOT EXISTS idx_picture_asset_categories_category_sort_created_asset
ON public.picture_asset_categories(category_id, sort_order, created_at ASC, asset_id);

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
    SELECT
      pa.*,
      pac.sort_order AS category_sort_order,
      pac.created_at AS category_relation_created_at
    FROM public.picture_assets pa
    LEFT JOIN public.picture_asset_categories pac
      ON p_category_id IS NOT NULL
      AND pac.asset_id = pa.id
      AND pac.category_id = p_category_id
    LEFT JOIN public.picture_categories pc
      ON pc.id = pac.category_id
    WHERE pa.status = 'published'
      AND pa.deleted_at IS NULL
      AND (
        p_category_id IS NULL
        OR pc.status = 'active'
      )
  ),
  counted AS (
    SELECT count(*) AS total_count
    FROM filtered_assets
  ),
  paged_assets AS (
    SELECT
      *,
      row_number() OVER (
        ORDER BY
          CASE WHEN p_category_id IS NULL THEN sort_order ELSE category_sort_order END ASC,
          CASE WHEN p_category_id IS NULL THEN created_at END DESC NULLS LAST,
          CASE WHEN p_category_id IS NULL THEN id END DESC NULLS LAST,
          CASE WHEN p_category_id IS NOT NULL THEN category_relation_created_at END ASC NULLS LAST,
          CASE WHEN p_category_id IS NOT NULL THEN id END ASC NULLS LAST
      ) AS list_position
    FROM filtered_assets
    ORDER BY
      CASE WHEN p_category_id IS NULL THEN sort_order ELSE category_sort_order END ASC,
      CASE WHEN p_category_id IS NULL THEN created_at END DESC NULLS LAST,
      CASE WHEN p_category_id IS NULL THEN id END DESC NULLS LAST,
      CASE WHEN p_category_id IS NOT NULL THEN category_relation_created_at END ASC NULLS LAST,
      CASE WHEN p_category_id IS NOT NULL THEN id END ASC NULLS LAST
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
      AND pc.status = 'active'
    GROUP BY pac.asset_id
  )
  SELECT asset, total_count
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
    counted.total_count,
    pa.list_position
    FROM paged_assets pa
    CROSS JOIN counted
    LEFT JOIN variants
      ON variants.asset_id = pa.id
    LEFT JOIN categories
      ON categories.asset_id = pa.id
    UNION ALL
    SELECT NULL::jsonb AS asset, counted.total_count, 0 AS list_position
    FROM counted
    WHERE NOT EXISTS (SELECT 1 FROM paged_assets)
  ) result
  ORDER BY result.list_position ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_visitor_picture_asset_navigation(
  p_asset_id uuid,
  p_category_id uuid,
  p_direction text,
  p_limit integer
)
RETURNS TABLE(nav_position text, asset jsonb, context jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH current_asset AS (
    SELECT pa.*
    FROM public.picture_assets pa
    WHERE pa.id = p_asset_id
      AND pa.status = 'published'
      AND pa.deleted_at IS NULL
  ),
  current_categories AS (
    SELECT pac.category_id
    FROM public.picture_asset_categories pac
    JOIN public.picture_categories pc
      ON pc.id = pac.category_id
    WHERE pac.asset_id = p_asset_id
      AND pc.status = 'active'
    ORDER BY pac.sort_order ASC, pac.created_at ASC, pac.category_id
  ),
  resolved_context AS (
    SELECT coalesce(p_category_id, (SELECT category_id FROM current_categories LIMIT 1)) AS category_id
  ),
  ordered_assets AS (
    SELECT
      pa.*,
      pac.sort_order AS category_sort_order,
      pac.created_at AS category_relation_created_at,
      row_number() OVER (
        ORDER BY
          CASE WHEN rc.category_id IS NULL THEN pa.sort_order ELSE pac.sort_order END ASC,
          CASE WHEN rc.category_id IS NULL THEN pa.created_at END DESC NULLS LAST,
          CASE WHEN rc.category_id IS NULL THEN pa.id END DESC NULLS LAST,
          CASE WHEN rc.category_id IS NOT NULL THEN pac.created_at END ASC NULLS LAST,
          CASE WHEN rc.category_id IS NOT NULL THEN pa.id END ASC NULLS LAST
      ) AS row_number
    FROM public.picture_assets pa
    CROSS JOIN resolved_context rc
    LEFT JOIN public.picture_asset_categories pac
      ON rc.category_id IS NOT NULL
      AND pac.asset_id = pa.id
      AND pac.category_id = rc.category_id
    LEFT JOIN public.picture_categories pc
      ON pc.id = pac.category_id
    WHERE pa.status = 'published'
      AND pa.deleted_at IS NULL
      AND (
        rc.category_id IS NULL
        OR pc.status = 'active'
      )
  ),
  current_position AS (
    SELECT oa.row_number
    FROM ordered_assets oa
    JOIN current_asset ca
      ON ca.id = oa.id
  ),
  nav_positions AS (
    SELECT 'current'::text AS nav_position, cp.row_number
    FROM current_position cp
    UNION ALL
    SELECT 'prev'::text AS nav_position, cp.row_number - 1
    FROM current_position cp
    WHERE p_direction IN ('prev', 'both')
      AND greatest(p_limit, 1) >= 1
      AND cp.row_number > 1
    UNION ALL
    SELECT 'next'::text AS nav_position, cp.row_number + 1
    FROM current_position cp
    WHERE p_direction IN ('next', 'both')
      AND greatest(p_limit, 1) >= 1
  ),
  selected_assets AS (
    SELECT np.nav_position, oa.*
    FROM nav_positions np
    JOIN ordered_assets oa
      ON oa.row_number = np.row_number
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
    WHERE pav.asset_id IN (SELECT id FROM selected_assets)
      AND pav.variant IN ('thumb', 'cover', 'original', 'large', 'detail')
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
    WHERE pac.asset_id IN (SELECT id FROM selected_assets)
      AND pc.status = 'active'
    GROUP BY pac.asset_id
  ),
  bounds AS (
    SELECT
      rc.category_id,
      EXISTS (
        SELECT 1
        FROM current_position cp
        WHERE cp.row_number > 1
      ) AS has_prev,
      EXISTS (
        SELECT 1
        FROM current_position cp
        JOIN ordered_assets next_asset
          ON next_asset.row_number = cp.row_number + 1
      ) AS has_next,
      (
        SELECT prev_asset.id
        FROM current_position cp
        JOIN ordered_assets prev_asset
          ON prev_asset.row_number = cp.row_number - 1
        LIMIT 1
      ) AS prev_cursor,
      (
        SELECT next_asset.id
        FROM current_position cp
        JOIN ordered_assets next_asset
          ON next_asset.row_number = cp.row_number + 1
        LIMIT 1
      ) AS next_cursor
    FROM resolved_context rc
  )
  SELECT
    selected.nav_position,
    jsonb_build_object(
      'id', selected.id,
      'title', selected.title,
      'description', selected.description,
      'width', selected.width,
      'height', selected.height,
      'like_count', selected.like_count,
      'favorite_count', selected.favorite_count,
      'comment_count', selected.comment_count,
      'share_count', selected.share_count,
      'sort_order', selected.sort_order,
      'created_at', selected.created_at,
      'updated_at', selected.updated_at,
      'variants', coalesce(variants.variants, '[]'::jsonb),
      'categories', coalesce(categories.categories, '[]'::jsonb)
    ) AS asset,
    jsonb_build_object(
      'category_id', bounds.category_id,
      'direction', p_direction,
      'limit', least(greatest(p_limit, 1), 1),
      'sort', CASE
        WHEN bounds.category_id IS NULL THEN 'asset_sort_order asc, asset_created_at desc, asset_id desc'
        ELSE 'category_sort_order asc, category_relation_created_at asc, asset_id asc'
      END,
      'has_prev', bounds.has_prev,
      'has_next', bounds.has_next,
      'prev_cursor', bounds.prev_cursor,
      'next_cursor', bounds.next_cursor
    ) AS context
  FROM selected_assets selected
  CROSS JOIN bounds
  LEFT JOIN variants
    ON variants.asset_id = selected.id
  LEFT JOIN categories
    ON categories.asset_id = selected.id
  ORDER BY CASE selected.nav_position
    WHEN 'current' THEN 0
    WHEN 'prev' THEN 1
    WHEN 'next' THEN 2
    ELSE 3
  END;
$$;

GRANT EXECUTE ON FUNCTION public.list_visitor_picture_assets(uuid, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.list_visitor_picture_assets(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_visitor_picture_assets(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_visitor_picture_asset_navigation(uuid, uuid, text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_visitor_picture_asset_navigation(uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visitor_picture_asset_navigation(uuid, uuid, text, integer) TO service_role;
