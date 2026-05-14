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
  old_images: string;
  new_images: string;
  reason: string;
};

type BackfillGroup = {
  tenant_id: string;
  source_id: string;
  items: MigrationItem[];
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    input: "",
    limit: 10,
    outDir: "reports/project-logs-image-backfill",
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
    "source_id",
    "source_field",
    "array_index",
    "legacy_value",
    "object_key",
    "backfill_status",
    "old_images",
    "new_images",
    "reason",
  ] as const;

  return [
    headers.join(","),
    ...items.map((item) => headers.map((header) => csvEscape(item[header])).join(",")),
  ].join("\n");
}

function normalizeImages(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createBaseResult(item: MigrationItem): BackfillResult {
  const base: BackfillResult = {
    ...item,
    object_key: item.object_key || item.target_object_key,
    backfill_status: "failed",
    old_images: "",
    new_images: "",
    reason: "",
  };

  return base;
}

async function backfillGroup(group: BackfillGroup, apply: boolean): Promise<BackfillResult[]> {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("project_logs")
    .select("id,tenant_id,images")
    .eq("id", group.source_id)
    .maybeSingle();

  if (error) {
    return group.items.map((item) => ({ ...createBaseResult(item), reason: error.message }));
  }
  if (!data) {
    return group.items.map((item) => ({
      ...createBaseResult(item),
      reason: "project_log_not_found",
    }));
  }
  if (group.tenant_id && data.tenant_id !== group.tenant_id) {
    return group.items.map((item) => ({
      ...createBaseResult(item),
      reason: "tenant_mismatch",
    }));
  }

  const images = normalizeImages(data.images);
  const nextImages = [...images];
  const results: BackfillResult[] = [];
  let hasFailure = false;

  for (const item of group.items) {
    const objectKey = item.object_key || item.target_object_key;
    const base = createBaseResult(item);
    const index = Number(item.array_index);
    if (!Number.isInteger(index) || index < 0 || index >= images.length) {
      hasFailure = true;
      results.push({
        ...base,
        old_images: JSON.stringify(images),
        reason: "array_index_out_of_range",
      });
      continue;
    }

    if (images[index] !== item.legacy_value) {
      hasFailure = true;
      results.push({
        ...base,
        old_images: JSON.stringify(images),
        reason: "legacy_value_mismatch",
      });
      continue;
    }

    if (!objectKey) {
      hasFailure = true;
      results.push({
        ...base,
        old_images: JSON.stringify(images),
        reason: "missing_object_key",
      });
      continue;
    }

    nextImages[index] = objectKey;
    results.push(base);
  }

  if (hasFailure) {
    return results.map((item) =>
      item.reason
        ? item
        : {
          ...item,
          old_images: JSON.stringify(images),
          new_images: JSON.stringify(nextImages),
          reason: "group_has_failed_items",
        }
    );
  }

  if (apply) {
    const updateResult = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .update({ images: nextImages })
      .eq("id", group.source_id);

    if (updateResult.error) {
      return results.map((item) => ({
        ...item,
        old_images: JSON.stringify(images),
        new_images: JSON.stringify(nextImages),
        reason: updateResult.error.message,
      }));
    }
  }

  return results.map((item) => ({
    ...item,
    backfill_status: apply ? "updated" : "planned",
    old_images: JSON.stringify(images),
    new_images: JSON.stringify(nextImages),
  }));
}

function groupItems(items: MigrationItem[]) {
  const map = new Map<string, BackfillGroup>();
  for (const item of items) {
    const key = `${item.tenant_id}:${item.source_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      map.set(key, {
        tenant_id: item.tenant_id,
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
    .filter((item) => item.source_table === "project_logs")
    .filter((item) => ["uploaded", "already_exists"].includes(item.migrated_status))
    .slice(0, options.limit);
  const results: BackfillResult[] = [];

  for (const group of groupItems(items)) {
    results.push(...await backfillGroup(group, options.apply));
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
