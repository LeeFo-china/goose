import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { platformFileStorageService } from "@/services/files/platform-file-storage";
import { COS, DEFAULT_COS_REGION, systemSettingsService, trimSlashes } from "@/services/files/platform-file-storage/legacy/shared";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
import { SupabaseDB } from "@/utils/supabase";

type VariantName = "thumb" | "large";

type CliOptions = {
  apply: boolean;
  limit: number | null;
  variants: VariantName[];
};

type AssetRow = {
  id: string;
  title: string;
  status: string;
  deleted_at: string | null;
};

type VariantRow = {
  id: string;
  asset_id: string;
  variant: string;
  file_object_id: string;
  object_key: string;
  width: number | null;
  height: number | null;
  file_size: number;
  mime_type: string;
};

type Candidate = {
  asset: AssetRow;
  source: VariantRow;
  missing_variants: VariantName[];
};

type CandidateBatch = {
  total_candidate_asset_count: number;
  selected_candidate_asset_count: number;
  limit: number | null;
  remaining_after_batch: number;
};

type GeneratedVariant = {
  variant: VariantName;
  buffer: Buffer;
  width: number;
  height: number;
  sizeBytes: number;
  checksum: string;
};

const databaseUrl = process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DB_DIRECT_URL;

if (!databaseUrl) {
  console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
  process.exit(1);
}

const sql = new Bun.SQL(databaseUrl);

const VARIANT_CONFIG: Record<VariantName, {
  maxSize: number;
  quality: number;
}> = {
  thumb: { maxSize: 320, quality: 78 },
  large: { maxSize: 1600, quality: 86 },
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    limit: null,
    variants: ["thumb", "large"],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--apply") options.apply = true;
    if (arg === "--dry-run") options.apply = false;
    if (arg === "--limit") {
      const parsed = Number(argv[index + 1]);
      options.limit = Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
      index += 1;
    }
    if (arg === "--variants") {
      options.variants = parseVariants(argv[index + 1] || "");
      index += 1;
    }
  }

  return options;
}

function parseVariants(value: string): VariantName[] {
  const variants = value
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is VariantName => item === "thumb" || item === "large");
  if (variants.length === 0) throw new Error("--variants 仅支持 thumb,large");
  return Array.from(new Set(variants));
}

async function listCandidates(options: CliOptions) {
  const db = SupabaseDB.getAdminClient();
  const [{ data: assets, error: assetError }, { data: variants, error: variantError }] = await Promise.all([
    db.from("picture_assets")
      .select("id,title,status,deleted_at")
      .is("deleted_at", null)
      .neq("status", "deleted")
      .order("created_at", { ascending: true }),
    db.from("picture_asset_variants")
      .select("id,asset_id,variant,file_object_id,object_key,width,height,file_size,mime_type"),
  ]);
  if (assetError) throw assetError;
  if (variantError) throw variantError;

  const variantsByAsset = groupVariants((variants || []) as VariantRow[]);
  const candidates: Candidate[] = [];
  for (const asset of (assets || []) as AssetRow[]) {
    const assetVariants = variantsByAsset.get(asset.id) || [];
    const existing = new Set(assetVariants.map((item) => item.variant));
    const missing = options.variants.filter((variant) => !existing.has(variant));
    if (missing.length === 0) continue;
    const source = pickSourceVariant(assetVariants);
    if (!source) continue;
    candidates.push({ asset, source, missing_variants: missing });
  }

  const selectedCandidates = options.limit ? candidates.slice(0, options.limit) : candidates;
  return {
    candidates: selectedCandidates,
    batch: {
      total_candidate_asset_count: candidates.length,
      selected_candidate_asset_count: selectedCandidates.length,
      limit: options.limit,
      remaining_after_batch: Math.max(candidates.length - selectedCandidates.length, 0),
    },
  };
}

function groupVariants(variants: VariantRow[]) {
  const result = new Map<string, VariantRow[]>();
  for (const variant of variants) {
    result.set(variant.asset_id, [...(result.get(variant.asset_id) || []), variant]);
  }
  return result;
}

function pickSourceVariant(variants: VariantRow[]) {
  return variants.find((item) => item.variant === "original") ||
    variants.find((item) => item.variant === "cover") ||
    variants[0] ||
    null;
}

async function assertMagickAvailable() {
  const proc = Bun.spawn(["magick", "-version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error("缺少 ImageMagick: 请先安装 magick 后再执行图片变体补齐");
  }
}

async function downloadSource(source: VariantRow) {
  const cosBuffer = await downloadSourceFromCos(source.object_key);
  if (cosBuffer) return cosBuffer;

  const url = resolveStoredFileUrl(source.object_key);
  if (!url) throw new Error(`无法生成源图访问地址：${source.object_key}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载源图失败：${response.status} ${source.object_key}`);
  return Buffer.from(await response.arrayBuffer());
}

async function downloadSourceFromCos(objectKey: string) {
  const [secretId, secretKey, bucket, region] = await Promise.all([
    systemSettingsService.getSecretString("TENCENT_COS_SECRET_ID"),
    systemSettingsService.getSecretString("TENCENT_COS_SECRET_KEY"),
    systemSettingsService.getString("PLATFORM_COS_BUCKET"),
    systemSettingsService.getString("PLATFORM_COS_REGION", DEFAULT_COS_REGION),
  ]);

  if (!secretId || !secretKey || !bucket || !region) return null;
  const cos = new COS({ SecretId: secretId, SecretKey: secretKey });
  return new Promise<Buffer>((resolve, reject) => {
    cos.getObject({
      Bucket: bucket,
      Region: region,
      Key: trimSlashes(objectKey),
    }, (error: unknown, data: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      const body = typeof data === "object" && data
        ? (data as { Body?: Buffer | Uint8Array | string }).Body
        : null;
      if (!body) {
        reject(new Error(`COS 对象内容为空：${objectKey}`));
        return;
      }
      if (Buffer.isBuffer(body)) {
        resolve(body);
        return;
      }
      resolve(Buffer.from(body));
    });
  }).catch(() => null);
}

async function generateVariant(input: {
  sourceBuffer: Buffer;
  tempDir: string;
  variant: VariantName;
}) {
  const sourcePath = join(input.tempDir, "source");
  const outputPath = join(input.tempDir, `${input.variant}.webp`);
  await writeFile(sourcePath, input.sourceBuffer);
  const config = VARIANT_CONFIG[input.variant];
  await runMagick([
    sourcePath,
    "-auto-orient",
    "-resize",
    `${config.maxSize}x${config.maxSize}>`,
    "-quality",
    String(config.quality),
    outputPath,
  ]);
  const dimensions = await identifyDimensions(outputPath);
  const buffer = Buffer.from(await Bun.file(outputPath).arrayBuffer());
  return {
    variant: input.variant,
    buffer,
    width: dimensions.width,
    height: dimensions.height,
    sizeBytes: buffer.length,
    checksum: createHash("sha256").update(buffer).digest("hex"),
  } satisfies GeneratedVariant;
}

async function runMagick(args: string[]) {
  const proc = Bun.spawn(["magick", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) throw new Error(stderr.trim() || "生成图片变体失败");
}

async function identifyDimensions(filePath: string) {
  const proc = Bun.spawn(["magick", "identify", "-format", "%w %h", filePath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) throw new Error(stderr.trim() || "读取图片尺寸失败");
  const [width, height] = stdout.trim().split(/\s+/).map(Number);
  if (!width || !height) throw new Error("读取图片尺寸失败");
  return { width, height };
}

async function uploadGeneratedVariant(asset: AssetRow, generated: GeneratedVariant) {
  const uploaded = await platformFileStorageService.uploadImage({
    buffer: generated.buffer,
    filename: `${asset.id}-${generated.variant}.webp`,
    mimetype: "image/webp",
    scene: "picture_library",
  });
  if (!uploaded.file_id || !uploaded.object_key) {
    throw new Error(`上传 ${generated.variant} 变体失败：${asset.title}`);
  }

  await sql`
    update public.platform_file_objects
    set
      width = ${generated.width},
      height = ${generated.height},
      checksum = ${generated.checksum}
    where id = ${uploaded.file_id}
  `;

  await sql`
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
      ${asset.id},
      ${generated.variant},
      ${uploaded.file_id},
      ${uploaded.object_key},
      ${generated.width},
      ${generated.height},
      ${generated.sizeBytes},
      'image/webp'
    )
    on conflict (asset_id, variant) do update
    set
      file_object_id = excluded.file_object_id,
      object_key = excluded.object_key,
      width = excluded.width,
      height = excluded.height,
      file_size = excluded.file_size,
      mime_type = excluded.mime_type
  `;

  return {
    variant: generated.variant,
    file_id: uploaded.file_id,
    object_key: uploaded.object_key,
    width: generated.width,
    height: generated.height,
    file_size: generated.sizeBytes,
  };
}

async function applyCandidate(candidate: Candidate) {
  const tempDir = await mkdtemp(join(tmpdir(), "gooes-picture-variants-"));
  try {
    const sourceBuffer = await downloadSource(candidate.source);
    const uploaded = [];
    for (const variant of candidate.missing_variants) {
      const generated = await generateVariant({ sourceBuffer, tempDir, variant });
      uploaded.push(await uploadGeneratedVariant(candidate.asset, generated));
    }
    return {
      asset_id: candidate.asset.id,
      title: candidate.asset.title,
      source_variant: candidate.source.variant,
      uploaded,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function buildDryRunReport(candidates: Candidate[], batch: CandidateBatch) {
  return {
    mode: "dry-run",
    candidate_asset_count: candidates.length,
    batch,
    missing_variant_count: candidates.reduce(
      (sum, item) => sum + item.missing_variants.length,
      0,
    ),
    candidates: candidates.map((candidate) => ({
      asset_id: candidate.asset.id,
      title: candidate.asset.title,
      source_variant: candidate.source.variant,
      missing_variants: candidate.missing_variants,
    })),
  };
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  const { candidates, batch } = await listCandidates(options);
  if (!options.apply) {
    console.log(JSON.stringify(buildDryRunReport(candidates, batch), null, 2));
    return;
  }

  await assertMagickAvailable();
  const result = {
    mode: "apply",
    candidate_asset_count: candidates.length,
    batch,
    uploaded_variant_count: 0,
    repaired: [] as Awaited<ReturnType<typeof applyCandidate>>[],
    failed: [] as Array<{ asset_id: string; title: string; reason: string }>,
  };

  for (const candidate of candidates) {
    try {
      const repaired = await applyCandidate(candidate);
      result.uploaded_variant_count += repaired.uploaded.length;
      result.repaired.push(repaired);
    } catch (error) {
      result.failed.push({
        asset_id: candidate.asset.id,
        title: candidate.asset.title,
        reason: error instanceof Error ? error.message : "图片变体补齐失败",
      });
    }
  }

  console.log(JSON.stringify(result, null, 2));
  if (result.failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "图片变体补齐失败");
  process.exit(1);
}).finally(async () => {
  await sql.close();
});
