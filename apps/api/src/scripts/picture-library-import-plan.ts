export type PictureLibraryImportCandidate = {
  filePath: string;
  filename: string;
  categoryName: string;
  categorySlug: string;
  title: string;
  sortOrder: number;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
  width: number | null;
  height: number | null;
};

export type PictureLibraryImportBatch = {
  offset: number;
  limit: number | null;
  total_source_count: number;
  selected_source_count: number;
  next_offset: number | null;
  has_more: boolean;
};

type ImportPlanRow = {
  checksum: string;
  category_name: string;
  category_slug: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  exists: boolean;
};

const PLANNED_GENERATED_VARIANTS = ["thumb", "large"] as const;

export function buildPictureLibraryImportDryRunReport(input: {
  candidates: PictureLibraryImportCandidate[];
  existingChecksums: Set<string>;
  batch: PictureLibraryImportBatch;
}) {
  const rows = buildImportPlanRows(input.candidates, input.existingChecksums);
  const existingCount = rows.filter((item) => item.exists).length;
  const pendingRows = rows.filter((item) => !item.exists);
  const categories = new Set(rows.map((item) => item.category_name));
  const duplicateChecksumCount = rows.length - new Set(rows.map((item) => item.checksum)).size;
  const missingDimensionsCount = rows.filter((item) => !item.width || !item.height).length;
  const pendingUploadCount = pendingRows.length;
  const plannedVariantUploadCount = pendingUploadCount * PLANNED_GENERATED_VARIANTS.length;

  return {
    mode: "dry-run",
    source_count: input.candidates.length,
    batch: input.batch,
    category_count: categories.size,
    existing_asset_count: existingCount,
    pending_upload_count: pendingUploadCount,
    estimated_uploads: {
      cover_upload_count: pendingUploadCount,
      generated_variant_upload_count: plannedVariantUploadCount,
      total_file_upload_count: pendingUploadCount + plannedVariantUploadCount,
      generated_variants: PLANNED_GENERATED_VARIANTS,
      note: "导入 apply 只写入 cover，thumb/large 由 picture-library-variants-backfill 补齐。",
    },
    estimated_source_bytes: pendingRows.reduce((sum, item) => sum + item.size_bytes, 0),
    risk_summary: {
      duplicate_checksum_count: duplicateChecksumCount,
      missing_dimensions_count: missingDimensionsCount,
      post_import_variant_backfill_required: pendingUploadCount > 0,
    },
    category_breakdown: buildCategoryBreakdown(rows),
    categories: [...categories].sort((left, right) => left.localeCompare(right, "zh-CN")),
    recommended_steps: [
      "先执行 --dry-run 确认 pending_upload_count 与 estimated_uploads。",
      "执行 --apply 小批量导入并复跑健康检查。",
      "执行 api:picture-library-variants-backfill 补齐 thumb/large。",
      "执行 api:picture-library-health-check 确认 issue_total=0。",
    ],
  };
}

function buildImportPlanRows(
  candidates: PictureLibraryImportCandidate[],
  existingChecksums: Set<string>,
) {
  return candidates.map((candidate): ImportPlanRow => ({
    checksum: candidate.checksum,
    category_name: candidate.categoryName,
    category_slug: candidate.categorySlug,
    size_bytes: candidate.sizeBytes,
    width: candidate.width,
    height: candidate.height,
    exists: existingChecksums.has(candidate.checksum),
  }));
}

function buildCategoryBreakdown(rows: ImportPlanRow[]) {
  const result = new Map<string, {
    category_slug: string;
    source_count: number;
    existing_asset_count: number;
    pending_upload_count: number;
  }>();

  for (const row of rows) {
    const current = result.get(row.category_name) || {
      category_slug: row.category_slug,
      source_count: 0,
      existing_asset_count: 0,
      pending_upload_count: 0,
    };
    current.source_count += 1;
    if (row.exists) current.existing_asset_count += 1;
    if (!row.exists) current.pending_upload_count += 1;
    result.set(row.category_name, current);
  }

  return [...result.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "zh-CN"))
    .map(([categoryName, value]) => ({
      category_name: categoryName,
      ...value,
    }));
}
