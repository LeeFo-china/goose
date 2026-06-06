import { createHash } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { normalizeProvider } from "@/services/files/platform-file-storage/legacy/shared";
import { platformFileStorageService } from "@/services/files/platform-file-storage";
import { systemSettingsService } from "@/services/system-settings";

type CliOptions = {
  source: string;
  apply: boolean;
  limit: number | null;
};

type ImageCandidate = {
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

type ExistingAssetRow = {
  id: string;
};

type IdRow = {
  id: string;
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

const DEFAULT_SOURCE = "/Users/leefo/Public/work/goose-server/picture";
const IMAGE_EXTENSIONS = new Set([".webp", ".jpg", ".jpeg", ".png"]);
const PLANNED_GENERATED_VARIANTS = ["thumb", "large"] as const;
const databaseUrl = process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DB_DIRECT_URL;

if (!databaseUrl) {
  console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
  process.exit(1);
}

const db = new Bun.SQL(databaseUrl);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    source: process.env.PICTURE_LIBRARY_IMPORT_SOURCE || DEFAULT_SOURCE,
    apply: false,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--source") {
      options.source = argv[index + 1] || options.source;
      index += 1;
    } else if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === "--limit") {
      const limit = Number(argv[index + 1]);
      options.limit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : null;
      index += 1;
    }
  }

  return options;
}

function categorySlug(name: string) {
  const hash = createHash("sha1").update(name).digest("hex").slice(0, 10);
  return `style-${hash}`;
}

function titleFromFilename(filename: string) {
  return filename
    .replace(extname(filename), "")
    .replace(/^\d+_?/, "")
    .replace(/_/g, " ")
    .trim() || filename;
}

function mimeTypeOf(filename: string) {
  const extension = extname(filename).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "image/webp";
}

function byteAt(buffer: Buffer, offset: number) {
  return buffer[offset] ?? 0;
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return byteAt(buffer, offset) |
    (byteAt(buffer, offset + 1) << 8) |
    (byteAt(buffer, offset + 2) << 16);
}

function readWebpDimensions(buffer: Buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (chunkType === "VP8X" && dataOffset + 10 <= buffer.length) {
      return {
        width: readUInt24LE(buffer, dataOffset + 4) + 1,
        height: readUInt24LE(buffer, dataOffset + 7) + 1,
      };
    }
    if (chunkType === "VP8L" && dataOffset + 5 <= buffer.length) {
      const b1 = byteAt(buffer, dataOffset + 1);
      const b2 = byteAt(buffer, dataOffset + 2);
      const b3 = byteAt(buffer, dataOffset + 3);
      const b4 = byteAt(buffer, dataOffset + 4);
      return {
        width: 1 + (((b2 & 0x3f) << 8) | b1),
        height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)),
      };
    }
    if (chunkType === "VP8 " && dataOffset + 10 <= buffer.length) {
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  return null;
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || byteAt(buffer, 0) !== 0xff || byteAt(buffer, 1) !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (byteAt(buffer, offset) !== 0xff) return null;
    const marker = byteAt(buffer, offset + 1);
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readDimensions(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/webp") return readWebpDimensions(buffer);
  if (mimeType === "image/png") return readPngDimensions(buffer);
  if (mimeType === "image/jpeg") return readJpegDimensions(buffer);
  return null;
}

async function scanSource(source: string, limit: number | null) {
  const root = resolve(source);
  const categoryEntries = await readdir(root, { withFileTypes: true });
  const candidates: ImageCandidate[] = [];

  for (const categoryEntry of categoryEntries.filter((item) => item.isDirectory())) {
    const categoryName = categoryEntry.name;
    const categoryDir = join(root, categoryName);
    const files = await readdir(categoryDir, { withFileTypes: true });
    let sortOrder = 100;

    for (const file of files.filter((item) => item.isFile())) {
      const extension = extname(file.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) continue;
      if (limit && candidates.length >= limit) return candidates;

      const filePath = join(categoryDir, file.name);
      const buffer = Buffer.from(await Bun.file(filePath).arrayBuffer());
      const mimeType = mimeTypeOf(file.name);
      const dimensions = readDimensions(buffer, mimeType);
      candidates.push({
        filePath,
        filename: file.name,
        categoryName,
        categorySlug: categorySlug(categoryName),
        title: titleFromFilename(file.name),
        sortOrder,
        mimeType,
        sizeBytes: buffer.length,
        checksum: createHash("sha256").update(buffer).digest("hex"),
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      });
      sortOrder += 10;
    }
  }

  return candidates;
}

async function findAssetByChecksum(checksum: string) {
  const rows = await db<ExistingAssetRow[]>`
    select id
    from public.picture_assets
    where checksum = ${checksum}
      and deleted_at is null
      and status <> 'deleted'
    limit 1
  `;
  return rows[0] ?? null;
}

async function ensureCategory(candidate: ImageCandidate) {
  const rows = await db<IdRow[]>`
    insert into public.picture_categories (name, slug, sort_order, status)
    values (${candidate.categoryName}, ${candidate.categorySlug}, 100, 'active')
    on conflict (slug) do update set
      name = excluded.name,
      updated_at = now()
    returning id
  `;
  return rows[0]?.id;
}

async function insertAsset(candidate: ImageCandidate) {
  const rows = await db<IdRow[]>`
    insert into public.picture_assets (
      title,
      source,
      original_filename,
      checksum,
      width,
      height,
      status,
      sort_order
    )
    values (
      ${candidate.title},
      'server_import',
      ${candidate.filename},
      ${candidate.checksum},
      ${candidate.width},
      ${candidate.height},
      'published',
      ${candidate.sortOrder}
    )
    returning id
  `;
  return rows[0]?.id;
}

async function attachCategory(assetId: string, categoryId: string, sortOrder: number) {
  await db`
    insert into public.picture_asset_categories (asset_id, category_id, sort_order)
    values (${assetId}, ${categoryId}, ${sortOrder})
    on conflict (asset_id, category_id) do update set
      sort_order = excluded.sort_order
  `;
}

async function insertCoverVariant(input: {
  assetId: string;
  fileObjectId: string;
  objectKey: string;
  candidate: ImageCandidate;
}) {
  await db`
    insert into public.picture_asset_variants (
      asset_id,
      variant,
      file_object_id,
      object_key,
      width,
      height,
      file_size,
      mime_type
    )
    values (
      ${input.assetId},
      'cover',
      ${input.fileObjectId},
      ${input.objectKey},
      ${input.candidate.width},
      ${input.candidate.height},
      ${input.candidate.sizeBytes},
      ${input.candidate.mimeType}
    )
    on conflict (asset_id, variant) do nothing
  `;
}

async function assertCosProvider() {
  const configured = await systemSettingsService.getString("PLATFORM_FILE_STORAGE_PROVIDER", "");
  const provider = normalizeProvider(configured);
  if (provider !== "tencent_cos") {
    throw new Error("图片资料库导入必须使用 tencent_cos，请先配置平台 COS 存储");
  }
}

async function importCandidate(candidate: ImageCandidate) {
  const categoryId = await ensureCategory(candidate);
  if (!categoryId) throw new Error(`创建分类失败：${candidate.categoryName}`);

  const existingAsset = await findAssetByChecksum(candidate.checksum);
  if (existingAsset) {
    await attachCategory(existingAsset.id, categoryId, candidate.sortOrder);
    return { status: "existing" as const, assetId: existingAsset.id };
  }

  const buffer = Buffer.from(await Bun.file(candidate.filePath).arrayBuffer());
  const uploaded = await platformFileStorageService.uploadImage({
    buffer,
    filename: candidate.filename,
    mimetype: candidate.mimeType,
    scene: "picture_library",
  });
  if (!uploaded.file_id || !uploaded.object_key) {
    throw new Error(`图片上传结果缺少文件索引：${candidate.filePath}`);
  }

  const assetId = await insertAsset(candidate);
  if (!assetId) throw new Error(`创建图片资产失败：${candidate.filePath}`);
  await insertCoverVariant({
    assetId,
    fileObjectId: uploaded.file_id,
    objectKey: uploaded.object_key,
    candidate,
  });
  await attachCategory(assetId, categoryId, candidate.sortOrder);
  return { status: "created" as const, assetId };
}

async function buildDryRunReport(candidates: ImageCandidate[]) {
  const rows = await buildImportPlanRows(candidates);
  const existingCount = rows.filter((item) => item.exists).length;
  const pendingRows = rows.filter((item) => !item.exists);
  const categories = new Set(rows.map((item) => item.category_name));
  const duplicateChecksumCount = rows.length - new Set(rows.map((item) => item.checksum)).size;
  const missingDimensionsCount = rows.filter((item) => !item.width || !item.height).length;
  const pendingUploadCount = pendingRows.length;
  const plannedVariantUploadCount = pendingUploadCount * PLANNED_GENERATED_VARIANTS.length;
  return {
    mode: "dry-run",
    source_count: candidates.length,
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

async function buildImportPlanRows(candidates: ImageCandidate[]) {
  if (candidates.length === 0) return [];
  const checksums = Array.from(new Set(candidates.map((item) => item.checksum)));
  const existingRows = await db<Array<{ checksum: string }>>`
    select checksum
    from public.picture_assets
    where checksum in ${db(checksums)}
      and deleted_at is null
      and status <> 'deleted'
  `;
  const existingChecksums = new Set(existingRows.map((item) => item.checksum));
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

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  const candidates = await scanSource(options.source, options.limit);

  if (!options.apply) {
    console.log(JSON.stringify(await buildDryRunReport(candidates), null, 2));
    return;
  }

  await assertCosProvider();
  const result = {
    mode: "apply",
    source_count: candidates.length,
    created_count: 0,
    existing_count: 0,
    failed: [] as Array<{ file: string; reason: string }>,
  };

  for (const candidate of candidates) {
    try {
      const imported = await importCandidate(candidate);
      if (imported.status === "created") result.created_count += 1;
      if (imported.status === "existing") result.existing_count += 1;
    } catch (error) {
      result.failed.push({
        file: candidate.filePath,
        reason: error instanceof Error ? error.message : "导入失败",
      });
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "图片资料库导入失败");
    process.exit(1);
  })
  .finally(async () => {
    await db.close();
  });
