import { getDirectPostgresSql } from "@/utils/postgres-direct";
import type {
  VisitorPictureAssetRecord,
  VisitorPictureAssetRow,
  VisitorPictureCategoryRow,
  VisitorPictureVariantRow,
} from "@/repositories/visitor-picture-library";

type CoverCategoryRelationRow = VisitorPictureCategoryRow & {
  asset_id: string;
};

export async function findCoverAssetsDirect(
  assetIds: string[],
  sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>,
): Promise<Map<string, VisitorPictureAssetRecord>> {
  const assets = await sql<VisitorPictureAssetRow[]>`
    SELECT
      id,
      title,
      description,
      width,
      height,
      like_count,
      favorite_count,
      comment_count,
      share_count,
      sort_order,
      created_at::text AS created_at,
      updated_at::text AS updated_at
    FROM public.picture_assets
    WHERE id IN ${sql(assetIds)}
      AND status = 'published'
      AND deleted_at IS NULL
  `;

  if (assets.length === 0) {
    return new Map<string, VisitorPictureAssetRecord>();
  }

  const ids = assets.map((asset) => asset.id);
  const variants = await sql<VisitorPictureVariantRow[]>`
    SELECT
      asset_id,
      variant,
      object_key,
      width,
      height,
      file_size,
      mime_type
    FROM public.picture_asset_variants
    WHERE asset_id IN ${sql(ids)}
  `;
  const categories = await sql<CoverCategoryRelationRow[]>`
    SELECT
      pac.asset_id,
      pc.id,
      pc.name,
      pc.slug,
      pc.description,
      pc.cover_asset_id,
      pc.sort_order
    FROM public.picture_asset_categories AS pac
    JOIN public.picture_categories AS pc
      ON pc.id = pac.category_id
    WHERE pac.asset_id IN ${sql(ids)}
    ORDER BY pac.asset_id ASC, pac.sort_order ASC, pac.created_at ASC
  `;

  return new Map(assets.map((asset) => [
    asset.id,
    {
      ...asset,
      variants: variants.filter((variant) => variant.asset_id === asset.id),
      categories: categories
        .filter((category) => category.asset_id === asset.id)
        .map(({ asset_id, ...category }) => category),
    },
  ]));
}
