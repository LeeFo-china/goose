ALTER TABLE public.picture_asset_variants
DROP CONSTRAINT IF EXISTS picture_asset_variants_variant_check;

ALTER TABLE public.picture_asset_variants
ADD CONSTRAINT picture_asset_variants_variant_check
CHECK (variant IN ('thumb', 'cover', 'large', 'original', 'detail'));

