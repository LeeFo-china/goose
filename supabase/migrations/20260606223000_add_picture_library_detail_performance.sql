CREATE INDEX IF NOT EXISTS idx_picture_asset_comments_visible_asset_created_id
ON public.picture_asset_comments(asset_id, created_at DESC, id DESC)
WHERE status = 'visible' AND deleted_at IS NULL;

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
      row_number() OVER (ORDER BY pa.sort_order ASC, pa.created_at DESC, pa.id DESC) AS row_number
    FROM public.picture_assets pa
    CROSS JOIN resolved_context rc
    WHERE pa.status = 'published'
      AND pa.deleted_at IS NULL
      AND (
        rc.category_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.picture_asset_categories pac
          JOIN public.picture_categories pc
            ON pc.id = pac.category_id
          WHERE pac.asset_id = pa.id
            AND pac.category_id = rc.category_id
            AND pc.status = 'active'
        )
      )
  ),
  current_position AS (
    SELECT oa.row_number
    FROM ordered_assets oa
    JOIN current_asset ca
      ON ca.id = oa.id
  ),
  nav_positions AS (
    SELECT 'current'::text AS position, cp.row_number
    FROM current_position cp
    UNION ALL
    SELECT 'prev'::text AS position, cp.row_number - 1
    FROM current_position cp
    WHERE p_direction IN ('prev', 'both')
      AND greatest(p_limit, 1) >= 1
      AND cp.row_number > 1
    UNION ALL
    SELECT 'next'::text AS position, cp.row_number + 1
    FROM current_position cp
    WHERE p_direction IN ('next', 'both')
      AND greatest(p_limit, 1) >= 1
  ),
  selected_assets AS (
    SELECT np.position, oa.*
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
    selected.position AS nav_position,
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
      'sort', 'sort_order asc, created_at desc, id desc',
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
  ORDER BY CASE selected.position
    WHEN 'current' THEN 0
    WHEN 'prev' THEN 1
    WHEN 'next' THEN 2
    ELSE 3
  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_visitor_picture_asset_navigation(uuid, uuid, text, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_visitor_picture_asset_navigation(uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_visitor_picture_asset_navigation(uuid, uuid, text, integer) TO service_role;
