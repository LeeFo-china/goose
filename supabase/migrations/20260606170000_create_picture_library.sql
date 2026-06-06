CREATE TABLE IF NOT EXISTS public.picture_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NULL REFERENCES public.picture_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text NULL,
  cover_asset_id uuid NULL,
  sort_order integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT picture_categories_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT picture_categories_slug_not_blank CHECK (btrim(slug) <> ''),
  CONSTRAINT picture_categories_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_picture_categories_slug
ON public.picture_categories(slug);

CREATE INDEX IF NOT EXISTS idx_picture_categories_parent_sort
ON public.picture_categories(parent_id, status, sort_order, name);

CREATE TABLE IF NOT EXISTS public.picture_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NULL,
  source text NOT NULL DEFAULT 'admin_upload',
  original_filename text NULL,
  checksum text NULL,
  dominant_color text NULL,
  width integer NULL,
  height integer NULL,
  status text NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 100,
  like_count integer NOT NULL DEFAULT 0,
  favorite_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  share_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT picture_assets_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT picture_assets_source_check CHECK (source IN ('server_import', 'admin_upload')),
  CONSTRAINT picture_assets_status_check CHECK (status IN ('draft', 'published', 'hidden', 'deleted')),
  CONSTRAINT picture_assets_dimensions_check CHECK (
    (width IS NULL OR width > 0)
    AND (height IS NULL OR height > 0)
  ),
  CONSTRAINT picture_assets_counts_check CHECK (
    like_count >= 0
    AND favorite_count >= 0
    AND comment_count >= 0
    AND share_count >= 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_picture_assets_checksum_active
ON public.picture_assets(checksum)
WHERE checksum IS NOT NULL AND status <> 'deleted' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_picture_assets_status_sort
ON public.picture_assets(status, sort_order, created_at DESC)
WHERE deleted_at IS NULL;

ALTER TABLE public.picture_categories
DROP CONSTRAINT IF EXISTS picture_categories_cover_asset_id_fkey;

ALTER TABLE public.picture_categories
ADD CONSTRAINT picture_categories_cover_asset_id_fkey
FOREIGN KEY (cover_asset_id)
REFERENCES public.picture_assets(id)
ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.picture_asset_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.picture_assets(id) ON DELETE CASCADE,
  variant text NOT NULL,
  file_object_id uuid NOT NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  object_key text NOT NULL,
  width integer NULL,
  height integer NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT picture_asset_variants_variant_check CHECK (variant IN ('thumb', 'cover', 'large', 'original')),
  CONSTRAINT picture_asset_variants_object_key_not_blank CHECK (btrim(object_key) <> ''),
  CONSTRAINT picture_asset_variants_mime_type_not_blank CHECK (btrim(mime_type) <> ''),
  CONSTRAINT picture_asset_variants_file_size_check CHECK (file_size >= 0),
  CONSTRAINT picture_asset_variants_dimensions_check CHECK (
    (width IS NULL OR width > 0)
    AND (height IS NULL OR height > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_picture_asset_variants_asset_variant
ON public.picture_asset_variants(asset_id, variant);

CREATE INDEX IF NOT EXISTS idx_picture_asset_variants_file_object
ON public.picture_asset_variants(file_object_id);

CREATE TABLE IF NOT EXISTS public.picture_asset_categories (
  asset_id uuid NOT NULL REFERENCES public.picture_assets(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.picture_categories(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_picture_asset_categories_category_sort
ON public.picture_asset_categories(category_id, sort_order, created_at DESC);

CREATE TABLE IF NOT EXISTS public.picture_asset_likes (
  asset_id uuid NOT NULL REFERENCES public.picture_assets(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, visitor_id),
  CONSTRAINT picture_asset_likes_visitor_not_blank CHECK (btrim(visitor_id) <> '')
);

CREATE TABLE IF NOT EXISTS public.picture_asset_favorites (
  asset_id uuid NOT NULL REFERENCES public.picture_assets(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, visitor_id),
  CONSTRAINT picture_asset_favorites_visitor_not_blank CHECK (btrim(visitor_id) <> '')
);

CREATE TABLE IF NOT EXISTS public.picture_asset_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.picture_assets(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  CONSTRAINT picture_asset_comments_visitor_not_blank CHECK (btrim(visitor_id) <> ''),
  CONSTRAINT picture_asset_comments_content_not_blank CHECK (btrim(content) <> ''),
  CONSTRAINT picture_asset_comments_status_check CHECK (status IN ('pending', 'visible', 'hidden', 'rejected', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_picture_asset_comments_asset_status_created
ON public.picture_asset_comments(asset_id, status, created_at DESC)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.picture_asset_comment_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.picture_asset_comments(id) ON DELETE CASCADE,
  file_object_id uuid NOT NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'visible',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT picture_asset_comment_images_status_check CHECK (status IN ('visible', 'hidden', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_picture_asset_comment_images_comment_sort
ON public.picture_asset_comment_images(comment_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.picture_asset_share_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.picture_assets(id) ON DELETE CASCADE,
  visitor_id text NULL,
  channel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT picture_asset_share_events_channel_check CHECK (channel IN ('wechat_session', 'wechat_timeline', 'poster'))
);

CREATE INDEX IF NOT EXISTS idx_picture_asset_share_events_asset_created
ON public.picture_asset_share_events(asset_id, created_at DESC);

DROP TRIGGER IF EXISTS tr_picture_categories_updated_at ON public.picture_categories;
CREATE TRIGGER tr_picture_categories_updated_at
BEFORE UPDATE ON public.picture_categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_picture_assets_updated_at ON public.picture_assets;
CREATE TRIGGER tr_picture_assets_updated_at
BEFORE UPDATE ON public.picture_assets
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_picture_asset_comments_updated_at ON public.picture_asset_comments;
CREATE TRIGGER tr_picture_asset_comments_updated_at
BEFORE UPDATE ON public.picture_asset_comments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.picture_categories IS '图片资料库分类，第一版用于装修风格分类';
COMMENT ON TABLE public.picture_assets IS '图片资料库图片资产元数据';
COMMENT ON TABLE public.picture_asset_variants IS '图片资料库图片多规格变体';
COMMENT ON TABLE public.picture_asset_categories IS '图片与分类多对多关系';
COMMENT ON TABLE public.picture_asset_comments IS 'visitor 图片资料库评论';
