CREATE OR REPLACE FUNCTION public.picture_asset_set_like(
  p_asset_id uuid,
  p_visitor_id text,
  p_liked boolean
)
RETURNS TABLE (
  asset_id uuid,
  liked boolean,
  like_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
  v_count integer := 0;
BEGIN
  IF p_visitor_id IS NULL OR btrim(p_visitor_id) = '' THEN
    RAISE EXCEPTION '缺少 visitor_id' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.picture_assets pa
    WHERE pa.id = p_asset_id
      AND pa.status = 'published'
      AND pa.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION '图片不存在或未发布' USING ERRCODE = 'P0002';
  END IF;

  IF p_liked THEN
    INSERT INTO public.picture_asset_likes(asset_id, visitor_id)
    VALUES (p_asset_id, p_visitor_id)
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      UPDATE public.picture_assets pa
      SET like_count = pa.like_count + 1
      WHERE pa.id = p_asset_id
      RETURNING pa.like_count INTO v_count;
    ELSE
      SELECT pa.like_count INTO v_count
      FROM public.picture_assets pa
      WHERE pa.id = p_asset_id;
    END IF;
  ELSE
    DELETE FROM public.picture_asset_likes pal
    WHERE pal.asset_id = p_asset_id
      AND pal.visitor_id = p_visitor_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      UPDATE public.picture_assets pa
      SET like_count = greatest(pa.like_count - 1, 0)
      WHERE pa.id = p_asset_id
      RETURNING pa.like_count INTO v_count;
    ELSE
      SELECT pa.like_count INTO v_count
      FROM public.picture_assets pa
      WHERE pa.id = p_asset_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p_asset_id,
    EXISTS (
      SELECT 1
      FROM public.picture_asset_likes pal
      WHERE pal.asset_id = p_asset_id
        AND pal.visitor_id = p_visitor_id
    ),
    v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.picture_asset_set_favorite(
  p_asset_id uuid,
  p_visitor_id text,
  p_favorited boolean
)
RETURNS TABLE (
  asset_id uuid,
  favorited boolean,
  favorite_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer := 0;
  v_count integer := 0;
BEGIN
  IF p_visitor_id IS NULL OR btrim(p_visitor_id) = '' THEN
    RAISE EXCEPTION '缺少 visitor_id' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.picture_assets pa
    WHERE pa.id = p_asset_id
      AND pa.status = 'published'
      AND pa.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION '图片不存在或未发布' USING ERRCODE = 'P0002';
  END IF;

  IF p_favorited THEN
    INSERT INTO public.picture_asset_favorites(asset_id, visitor_id)
    VALUES (p_asset_id, p_visitor_id)
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      UPDATE public.picture_assets pa
      SET favorite_count = pa.favorite_count + 1
      WHERE pa.id = p_asset_id
      RETURNING pa.favorite_count INTO v_count;
    ELSE
      SELECT pa.favorite_count INTO v_count
      FROM public.picture_assets pa
      WHERE pa.id = p_asset_id;
    END IF;
  ELSE
    DELETE FROM public.picture_asset_favorites paf
    WHERE paf.asset_id = p_asset_id
      AND paf.visitor_id = p_visitor_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      UPDATE public.picture_assets pa
      SET favorite_count = greatest(pa.favorite_count - 1, 0)
      WHERE pa.id = p_asset_id
      RETURNING pa.favorite_count INTO v_count;
    ELSE
      SELECT pa.favorite_count INTO v_count
      FROM public.picture_assets pa
      WHERE pa.id = p_asset_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p_asset_id,
    EXISTS (
      SELECT 1
      FROM public.picture_asset_favorites paf
      WHERE paf.asset_id = p_asset_id
        AND paf.visitor_id = p_visitor_id
    ),
    v_count;
END;
$$;
