import { Errors } from "@/errors/error-factory";
import type {
  VisitorPictureAssetRecord,
  VisitorPictureAssetRow,
  VisitorPictureCategoryRow,
  VisitorPictureVariantRow,
} from "@/repositories/visitor-picture-library";
import type { VisitorPictureAssetListQuery } from "@/schema/visitor-picture-library";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";

const LIST_VARIANTS = ["thumb", "cover", "original", "large"] as const;

type VisitorPictureAssetCategoryListRow = {
  asset_id: string;
  picture_assets: VisitorPictureAssetRow | VisitorPictureAssetRow[] | null;
};

type CountRow = {
  count: number | string | bigint;
};

type VisitorPictureAssetCategoryRelationRow = {
  asset_id: string;
  id: string;
  name: string;
  slug: string;
  description: string | null;
  cover_asset_id: string | null;
  sort_order: number;
};

export async function listVisitorPictureAssetsFast(query: VisitorPictureAssetListQuery) {
  const directSql = getDirectPostgresSql();
  if (directSql) {
    try {
      return await listAssetsDirectFast(query, directSql);
    } catch {
      // Continue to the PostgREST path below.
    }
  }

  return query.category_id
    ? listCategoryAssetsFast(query)
    : listAllAssetsFast(query);
}

async function listAssetsDirectFast(
  query: VisitorPictureAssetListQuery,
  sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>,
) {
  return query.category_id
    ? listCategoryAssetsDirectFast(query, sql)
    : listAllAssetsDirectFast(query, sql);
}

async function listAllAssetsDirectFast(
  query: VisitorPictureAssetListQuery,
  sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>,
) {
  const offset = (query.page - 1) * query.pageSize;
  const [rows, countRows] = await Promise.all([
    sql<VisitorPictureAssetRow[]>`
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
        created_at,
        updated_at
      FROM public.picture_assets
      WHERE status = 'published'
        AND deleted_at IS NULL
      ORDER BY sort_order ASC, created_at DESC, id DESC
      OFFSET ${offset}
      LIMIT ${query.pageSize}
    `,
    sql<CountRow[]>`
      SELECT count(*) AS count
      FROM public.picture_assets
      WHERE status = 'published'
        AND deleted_at IS NULL
    `,
  ]);

  const assets = await attachRelationsDirect(rows, sql);
  return toAssetPage(assets, query, Number(countRows[0]?.count ?? assets.length));
}

async function listCategoryAssetsDirectFast(
  query: VisitorPictureAssetListQuery,
  sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>,
) {
  const offset = (query.page - 1) * query.pageSize;
  const [rows, countRows] = await Promise.all([
    sql<VisitorPictureAssetRow[]>`
      SELECT
        pa.id,
        pa.title,
        pa.description,
        pa.width,
        pa.height,
        pa.like_count,
        pa.favorite_count,
        pa.comment_count,
        pa.share_count,
        pa.sort_order,
        pa.created_at,
        pa.updated_at
      FROM public.picture_asset_categories pac
      JOIN public.picture_assets pa
        ON pa.id = pac.asset_id
      JOIN public.picture_categories pc
        ON pc.id = pac.category_id
      WHERE pac.category_id = ${query.category_id}::uuid
        AND pa.status = 'published'
        AND pa.deleted_at IS NULL
        AND pc.status = 'active'
      ORDER BY pac.sort_order ASC, pac.created_at ASC, pac.asset_id ASC
      OFFSET ${offset}
      LIMIT ${query.pageSize}
    `,
    sql<CountRow[]>`
      SELECT count(*) AS count
      FROM public.picture_asset_categories pac
      JOIN public.picture_assets pa
        ON pa.id = pac.asset_id
      JOIN public.picture_categories pc
        ON pc.id = pac.category_id
      WHERE pac.category_id = ${query.category_id}::uuid
        AND pa.status = 'published'
        AND pa.deleted_at IS NULL
        AND pc.status = 'active'
    `,
  ]);

  const assets = await attachRelationsDirect(rows, sql);
  return toAssetPage(assets, query, Number(countRows[0]?.count ?? assets.length));
}

async function listAllAssetsFast(query: VisitorPictureAssetListQuery) {
  const offset = (query.page - 1) * query.pageSize;
  const { data, error, count } = await SupabaseDB.getAdminClient()
    .from("picture_assets")
    .select(
      "id,title,description,width,height,like_count,favorite_count,comment_count,share_count,sort_order,created_at,updated_at",
      { count: "exact" },
    )
    .eq("status", "published")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + query.pageSize - 1);
  if (error) throw Errors.dbError("查询图片列表失败", error);

  const assets = await attachRelationsSupabase((data || []) as VisitorPictureAssetRow[]);
  return toAssetPage(assets, query, count ?? assets.length);
}

async function listCategoryAssetsFast(query: VisitorPictureAssetListQuery) {
  const offset = (query.page - 1) * query.pageSize;
  const { data, error, count } = await SupabaseDB.getAdminClient()
    .from("picture_asset_categories")
    .select(
      "asset_id, picture_assets!inner(id,title,description,width,height,like_count,favorite_count,comment_count,share_count,sort_order,created_at,updated_at)",
      { count: "exact" },
    )
    .eq("category_id", query.category_id)
    .eq("picture_assets.status", "published")
    .is("picture_assets.deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("asset_id", { ascending: true })
    .range(offset, offset + query.pageSize - 1);
  if (error) throw Errors.dbError("查询图片列表失败", error);

  const assets = ((data || []) as unknown as VisitorPictureAssetCategoryListRow[])
    .map((item) => firstRelation(item.picture_assets))
    .filter((asset): asset is VisitorPictureAssetRow => Boolean(asset));
  const records = await attachRelationsSupabase(assets);
  return toAssetPage(records, query, count ?? records.length);
}

async function attachRelationsDirect(
  assets: VisitorPictureAssetRow[],
  sql: NonNullable<ReturnType<typeof getDirectPostgresSql>>,
) {
  if (assets.length === 0) return [];
  const ids = assets.map((item) => item.id);
  const [variants, categories] = await Promise.all([
    sql<VisitorPictureVariantRow[]>`
      SELECT asset_id, variant, object_key, width, height, file_size, mime_type
      FROM public.picture_asset_variants
      WHERE asset_id IN ${sql(ids)}
        AND variant IN ${sql([...LIST_VARIANTS])}
    `,
    sql<VisitorPictureAssetCategoryRelationRow[]>`
      SELECT
        pac.asset_id,
        pc.id,
        pc.name,
        pc.slug,
        pc.description,
        pc.cover_asset_id,
        pc.sort_order
      FROM public.picture_asset_categories pac
      JOIN public.picture_categories pc
        ON pc.id = pac.category_id
      WHERE pac.asset_id IN ${sql(ids)}
        AND pc.status = 'active'
      ORDER BY pac.asset_id ASC, pac.sort_order ASC, pac.created_at ASC
    `,
  ]);

  return assets.map((asset) => ({
    ...asset,
    variants: variants.filter((item) => item.asset_id === asset.id),
    categories: categories
      .filter((item) => item.asset_id === asset.id)
      .map((item) => toCategoryRow(item)),
  }));
}

async function attachRelationsSupabase(assets: VisitorPictureAssetRow[]) {
  if (assets.length === 0) return [];
  const ids = assets.map((item) => item.id);
  const [variants, categories] = await Promise.all([
    findVariants(ids),
    findCategoriesByAssetIds(ids),
  ]);
  return assets.map((asset) => ({
    ...asset,
    variants: variants.filter((item) => item.asset_id === asset.id),
    categories: categories
      .filter((item) => item.asset_id === asset.id)
      .map((item) => item.category),
  }));
}

async function findVariants(assetIds: string[]) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("picture_asset_variants")
    .select("asset_id,variant,object_key,width,height,file_size,mime_type")
    .in("asset_id", assetIds)
    .in("variant", [...LIST_VARIANTS]);
  if (error) throw Errors.dbError("查询图片规格失败", error);
  return (data || []) as VisitorPictureVariantRow[];
}

async function findCategoriesByAssetIds(assetIds: string[]) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("picture_asset_categories")
    .select("asset_id,sort_order,created_at, picture_categories(id,name,slug,description,cover_asset_id,sort_order)")
    .in("asset_id", assetIds)
    .order("asset_id", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw Errors.dbError("查询图片分类失败", error);
  return ((data || []) as unknown as Array<{
    asset_id: string;
    sort_order: number;
    created_at: string;
    picture_categories: VisitorPictureCategoryRow | VisitorPictureCategoryRow[] | null;
  }>)
    .map((item) => ({
      asset_id: item.asset_id,
      category: firstRelation(item.picture_categories),
    }))
    .filter((item): item is { asset_id: string; category: VisitorPictureCategoryRow } => Boolean(item.category));
}

function toAssetPage(
  list: VisitorPictureAssetRecord[],
  query: VisitorPictureAssetListQuery,
  total: number,
) {
  return {
    list,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

function toCategoryRow(item: VisitorPictureAssetCategoryRelationRow): VisitorPictureCategoryRow {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug,
    description: item.description,
    cover_asset_id: item.cover_asset_id,
    sort_order: item.sort_order,
  };
}

function firstRelation<TValue>(value: TValue | TValue[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}
