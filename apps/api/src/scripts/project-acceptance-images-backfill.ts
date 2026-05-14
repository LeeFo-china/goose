import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SupabaseDB } from "@/utils/supabase";

type CliOptions = {
  input: string;
  limit: number;
  outDir: string;
  apply: boolean;
};

type MigrationItem = {
  tenant_id: string;
  source_table: string;
  source_id: string;
  source_field: string;
  array_index: string;
  legacy_value: string;
  object_key: string;
  target_object_key: string;
  migrated_status: string;
};

type BackfillResult = MigrationItem & {
  backfill_status: string;
  old_value: string;
  new_value: string;
  reason: string;
};

type BackfillGroup = {
  tenant_id: string;
  source_table: string;
  source_id: string;
  items: MigrationItem[];
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    input: "",
    limit: 10,
    outDir: "reports/project-acceptance-images-backfill",
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--input") {
      options.input = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      options.limit = Number(argv[index + 1] || options.limit);
      index += 1;
      continue;
    }
    if (arg === "--out") {
      options.outDir = argv[index + 1] || options.outDir;
      index += 1;
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
    }
  }

  if (!options.input) throw new Error("请传 --input <migration-items.csv>");
  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit 必须是大于 0 的数字");
  }

  return options;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        value += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === "\"") {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(value);
      value = "";
      continue;
    }
    if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }
    if (char !== "\r") value += char;
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function readItems(text: string) {
  const rows = parseCsv(text);
  const headers = rows.shift() || [];
  return rows
    .filter((row) => row.some((value) => value.trim()))
    .map((row) => Object.fromEntries(
      headers.map((header, index) => [header, row[index] || ""]),
    ) as MigrationItem);
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(items: BackfillResult[]) {
  const headers = [
    "tenant_id",
    "source_table",
    "source_id",
    "source_field",
    "array_index",
    "legacy_value",
    "object_key",
    "backfill_status",
    "old_value",
    "new_value",
    "reason",
  ] as const;

  return [
    headers.join(","),
    ...items.map((item) => headers.map((header) => csvEscape(item[header])).join(",")),
  ].join("\n");
}

function normalizeArray(value: unknown) {
  if (!Array.isArray(value)) return [] as unknown[];
  return [...value];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: unknown) {
  return isRecord(value)
    ? JSON.parse(JSON.stringify(value)) as Record<string, unknown>
    : {};
}

function objectKeyOf(item: MigrationItem) {
  return item.object_key || item.target_object_key;
}

function baseResult(item: MigrationItem): BackfillResult {
  return {
    ...item,
    object_key: objectKeyOf(item),
    backfill_status: "failed",
    old_value: "",
    new_value: "",
    reason: "",
  };
}

function applyArrayReplacement(input: {
  item: MigrationItem;
  values: unknown[];
  nextValues: unknown[];
}) {
  const { item, values, nextValues } = input;
  const result = baseResult(item);
  const index = Number(item.array_index);
  const objectKey = objectKeyOf(item);

  if (!Number.isInteger(index) || index < 0 || index >= values.length) {
    return { result: { ...result, old_value: JSON.stringify(values), reason: "array_index_out_of_range" }, ok: false };
  }
  if (values[index] !== item.legacy_value) {
    return { result: { ...result, old_value: JSON.stringify(values), reason: "legacy_value_mismatch" }, ok: false };
  }
  if (!objectKey) {
    return { result: { ...result, old_value: JSON.stringify(values), reason: "missing_object_key" }, ok: false };
  }

  nextValues[index] = objectKey;
  return { result, ok: true };
}

async function backfillItemsGroup(group: BackfillGroup, apply: boolean) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_items")
    .select("id,tenant_id,images,rectification_images")
    .eq("id", group.source_id)
    .maybeSingle();

  if (error) return group.items.map((item) => ({ ...baseResult(item), reason: error.message }));
  if (!data) return group.items.map((item) => ({ ...baseResult(item), reason: "project_acceptance_item_not_found" }));
  if (group.tenant_id && data.tenant_id !== group.tenant_id) {
    return group.items.map((item) => ({ ...baseResult(item), reason: "tenant_mismatch" }));
  }

  const images = normalizeArray(data.images);
  const rectificationImages = normalizeArray(data.rectification_images);
  const nextImages = [...images];
  const nextRectificationImages = [...rectificationImages];
  const results: BackfillResult[] = [];
  let hasFailure = false;

  for (const item of group.items) {
    const target = item.source_field === "rectification_images"
      ? { values: rectificationImages, nextValues: nextRectificationImages }
      : item.source_field === "images"
      ? { values: images, nextValues: nextImages }
      : null;

    if (!target) {
      hasFailure = true;
      results.push({ ...baseResult(item), reason: "unsupported_source_field" });
      continue;
    }

    const applied = applyArrayReplacement({ item, ...target });
    if (!applied.ok) hasFailure = true;
    results.push(applied.result);
  }

  if (hasFailure) {
    return results.map((item) =>
      item.reason
        ? item
        : { ...item, reason: "group_has_failed_items" }
    );
  }

  if (apply) {
    const updateResult = await SupabaseDB.getAdminClient()
      .from("project_acceptance_items")
      .update({
        images: nextImages,
        rectification_images: nextRectificationImages,
      })
      .eq("id", group.source_id);

    if (updateResult.error) {
      return results.map((item) => ({ ...item, reason: updateResult.error.message }));
    }
  }

  return results.map((item) => ({
    ...item,
    backfill_status: apply ? "updated" : "planned",
    old_value: JSON.stringify({
      images,
      rectification_images: rectificationImages,
    }),
    new_value: JSON.stringify({
      images: nextImages,
      rectification_images: nextRectificationImages,
    }),
  }));
}

function replaceMetadataValue(input: {
  item: MigrationItem;
  metadata: Record<string, unknown>;
  nextMetadata: Record<string, unknown>;
}) {
  const { item, metadata, nextMetadata } = input;
  const result = baseResult(item);
  const index = Number(item.array_index);
  const objectKey = objectKeyOf(item);
  const field = item.source_field;

  if (!Number.isInteger(index) || index < 0) {
    return { result: { ...result, old_value: JSON.stringify(metadata), reason: "array_index_out_of_range" }, ok: false };
  }
  if (!objectKey) {
    return { result: { ...result, old_value: JSON.stringify(metadata), reason: "missing_object_key" }, ok: false };
  }

  if (field === "metadata.images" || field === "metadata.referenced_image_paths") {
    const key = field.replace("metadata.", "");
    const values = normalizeArray(metadata[key]);
    const nextValues = normalizeArray(nextMetadata[key]);
    if (index >= values.length) {
      return { result: { ...result, old_value: JSON.stringify(values), reason: "array_index_out_of_range" }, ok: false };
    }
    if (values[index] !== item.legacy_value) {
      return { result: { ...result, old_value: JSON.stringify(values), reason: "legacy_value_mismatch" }, ok: false };
    }
    nextValues[index] = objectKey;
    nextMetadata[key] = nextValues;
    return { result, ok: true };
  }

  if (field.startsWith("metadata.referenced_images.")) {
    const leaf = field.replace("metadata.referenced_images.", "");
    const values = normalizeArray(metadata.referenced_images);
    const nextValues = normalizeArray(nextMetadata.referenced_images);
    if (index >= values.length || !isRecord(values[index]) || !isRecord(nextValues[index])) {
      return { result: { ...result, old_value: JSON.stringify(values), reason: "array_index_out_of_range" }, ok: false };
    }
    const oldItem = values[index] as Record<string, unknown>;
    const nextItem = nextValues[index] as Record<string, unknown>;
    if (oldItem[leaf] !== item.legacy_value) {
      return { result: { ...result, old_value: JSON.stringify(oldItem), reason: "legacy_value_mismatch" }, ok: false };
    }
    nextItem[leaf] = objectKey;
    nextMetadata.referenced_images = nextValues;
    return { result, ok: true };
  }

  return { result: { ...result, reason: "unsupported_source_field" }, ok: false };
}

async function backfillActionsGroup(group: BackfillGroup, apply: boolean) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_acceptance_actions")
    .select("id,tenant_id,metadata")
    .eq("id", group.source_id)
    .maybeSingle();

  if (error) return group.items.map((item) => ({ ...baseResult(item), reason: error.message }));
  if (!data) return group.items.map((item) => ({ ...baseResult(item), reason: "project_acceptance_action_not_found" }));
  if (group.tenant_id && data.tenant_id !== group.tenant_id) {
    return group.items.map((item) => ({ ...baseResult(item), reason: "tenant_mismatch" }));
  }

  const metadata = cloneRecord(data.metadata);
  const nextMetadata = cloneRecord(data.metadata);
  const results: BackfillResult[] = [];
  let hasFailure = false;

  for (const item of group.items) {
    const applied = replaceMetadataValue({ item, metadata, nextMetadata });
    if (!applied.ok) hasFailure = true;
    results.push(applied.result);
  }

  if (hasFailure) {
    return results.map((item) =>
      item.reason
        ? item
        : { ...item, reason: "group_has_failed_items" }
    );
  }

  if (apply) {
    const updateResult = await SupabaseDB.getAdminClient()
      .from("project_acceptance_actions")
      .update({ metadata: nextMetadata })
      .eq("id", group.source_id);

    if (updateResult.error) {
      return results.map((item) => ({ ...item, reason: updateResult.error.message }));
    }
  }

  return results.map((item) => ({
    ...item,
    backfill_status: apply ? "updated" : "planned",
    old_value: JSON.stringify(metadata),
    new_value: JSON.stringify(nextMetadata),
  }));
}

function groupItems(items: MigrationItem[]) {
  const map = new Map<string, BackfillGroup>();
  for (const item of items) {
    const key = `${item.tenant_id}:${item.source_table}:${item.source_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        tenant_id: item.tenant_id,
        source_table: item.source_table,
        source_id: item.source_id,
        items: [item],
      });
    }
  }

  return Array.from(map.values());
}

function summarize(items: BackfillResult[], startedAt: string, apply: boolean) {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.backfill_status, (counts.get(item.backfill_status) || 0) + 1);
  }

  return {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    apply,
    total_items: items.length,
    planned: counts.get("planned") || 0,
    updated: counts.get("updated") || 0,
    failed: counts.get("failed") || 0,
    status_counts: Object.fromEntries(counts.entries()),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const outputDir = join(options.outDir, stamp);
  const items = readItems(await readFile(options.input, "utf8"))
    .filter((item) => item.source_table.startsWith("project_acceptance"))
    .filter((item) => ["uploaded", "already_exists"].includes(item.migrated_status))
    .slice(0, options.limit);
  const results: BackfillResult[] = [];

  for (const group of groupItems(items)) {
    if (group.source_table === "project_acceptance_items") {
      results.push(...await backfillItemsGroup(group, options.apply));
    } else if (group.source_table === "project_acceptance_actions") {
      results.push(...await backfillActionsGroup(group, options.apply));
    } else {
      results.push(...group.items.map((item) => ({
        ...baseResult(item),
        reason: "unsupported_source_table",
      })));
    }
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summarize(results, startedAt, options.apply), null, 2)}\n`,
  );
  await writeFile(join(outputDir, "backfill-items.csv"), `${toCsv(results)}\n`);

  const summary = summarize(results, startedAt, options.apply);
  console.log(`backfill report: ${outputDir}`);
  console.log(`planned=${summary.planned}, updated=${summary.updated}, failed=${summary.failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
