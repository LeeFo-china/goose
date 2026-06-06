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
    FROM public.picture_assets
    WHERE id = p_asset_id
      AND status = 'published'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION '图片不存在或未发布' USING ERRCODE = 'P0002';
  END IF;

  IF p_liked THEN
    INSERT INTO public.picture_asset_likes(asset_id, visitor_id)
    VALUES (p_asset_id, p_visitor_id)
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      UPDATE public.picture_assets
      SET like_count = like_count + 1
      WHERE id = p_asset_id
      RETURNING picture_assets.like_count INTO v_count;
    ELSE
      SELECT picture_assets.like_count INTO v_count
      FROM public.picture_assets
      WHERE id = p_asset_id;
    END IF;
  ELSE
    DELETE FROM public.picture_asset_likes
    WHERE picture_asset_likes.asset_id = p_asset_id
      AND picture_asset_likes.visitor_id = p_visitor_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      UPDATE public.picture_assets
      SET like_count = greatest(like_count - 1, 0)
      WHERE id = p_asset_id
      RETURNING picture_assets.like_count INTO v_count;
    ELSE
      SELECT picture_assets.like_count INTO v_count
      FROM public.picture_assets
      WHERE id = p_asset_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p_asset_id,
    EXISTS (
      SELECT 1
      FROM public.picture_asset_likes
      WHERE picture_asset_likes.asset_id = p_asset_id
        AND picture_asset_likes.visitor_id = p_visitor_id
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
    FROM public.picture_assets
    WHERE id = p_asset_id
      AND status = 'published'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION '图片不存在或未发布' USING ERRCODE = 'P0002';
  END IF;

  IF p_favorited THEN
    INSERT INTO public.picture_asset_favorites(asset_id, visitor_id)
    VALUES (p_asset_id, p_visitor_id)
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      UPDATE public.picture_assets
      SET favorite_count = favorite_count + 1
      WHERE id = p_asset_id
      RETURNING picture_assets.favorite_count INTO v_count;
    ELSE
      SELECT picture_assets.favorite_count INTO v_count
      FROM public.picture_assets
      WHERE id = p_asset_id;
    END IF;
  ELSE
    DELETE FROM public.picture_asset_favorites
    WHERE picture_asset_favorites.asset_id = p_asset_id
      AND picture_asset_favorites.visitor_id = p_visitor_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      UPDATE public.picture_assets
      SET favorite_count = greatest(favorite_count - 1, 0)
      WHERE id = p_asset_id
      RETURNING picture_assets.favorite_count INTO v_count;
    ELSE
      SELECT picture_assets.favorite_count INTO v_count
      FROM public.picture_assets
      WHERE id = p_asset_id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p_asset_id,
    EXISTS (
      SELECT 1
      FROM public.picture_asset_favorites
      WHERE picture_asset_favorites.asset_id = p_asset_id
        AND picture_asset_favorites.visitor_id = p_visitor_id
    ),
    v_count;
END;
$$;

COMMENT ON FUNCTION public.picture_asset_set_like(uuid, text, boolean)
IS '图片资料库 visitor 点赞/取消点赞，保证重复操作幂等并原子维护计数。';

COMMENT ON FUNCTION public.picture_asset_set_favorite(uuid, text, boolean)
IS '图片资料库 visitor 收藏/取消收藏，保证重复操作幂等并原子维护计数。';
