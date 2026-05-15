import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { platformFileStorageService } from "@/services/files/platform-file-storage";
import { SupabaseDB } from "@/utils/supabase";

type CliOptions = {
  limit: number;
  outDir: string;
  apply: boolean;
  tenantId?: string;
  since?: string;
};

type ProjectLogCommentRow = {
  id: string;
  tenant_id: string | null;
  log_id: string;
  author_type: string;
  author_id: string;
  images: unknown;
  created_at: string;
};

type ReconcileResult = {
  comment_id: string;
  tenant_id: string;
  log_id: string;
  image_index: number;
  object_key: string;
  status: "exists" | "reconciled" | "dry_run_missing" | "failed";
  file_id: string;
  reason: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    limit: 200,
    outDir: "reports/project-log-comment-cos-reconcile",
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
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
    if (arg === "--tenant-id") {
      options.tenantId = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--since") {
      options.since = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit 必须是大于 0 的数字");
  }

  return options;
}

function normalizeImages(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isProjectLogCommentCosObjectKey(value: string) {
  return (
    (value.startsWith("tenants/") || value.startsWith("public/")) &&
    value.includes("/project-log-comment/")
  );
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(items: ReconcileResult[]) {
  const headers = [
    "comment_id",
    "tenant_id",
    "log_id",
    "image_index",
    "object_key",
    "status",
    "file_id",
    "reason",
  ] as const;

  return [
    headers.join(","),
    ...items.map((item) => headers.map((header) => csvEscape(item[header])).join(",")),
  ].join("\n");
}

async function listComments(options: CliOptions) {
  let query = SupabaseDB.getAdminClient()
    .from("project_log_comments")
    .select("id,tenant_id,log_id,author_type,author_id,images,created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(options.limit);

  if (options.tenantId) {
    query = query.eq("tenant_id", options.tenantId);
  }

  if (options.since) {
    query = query.gte("created_at", options.since);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data || []) as ProjectLogCommentRow[];
}

async function getExistingFileObjectMap(objectKeys: string[]) {
  const map = new Map<string, { id: string }>();
  const uniqueKeys = Array.from(new Set(objectKeys));

  for (let index = 0; index < uniqueKeys.length; index += 100) {
    const batch = uniqueKeys.slice(index, index + 100);
    if (!batch.length) continue;

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("platform_file_objects")
      .select("id,object_key")
      .eq("provider", "tencent_cos")
      .eq("scene", "project_log_comment")
      .eq("status", "active")
      .is("deleted_at", null)
      .in("object_key", batch);

    if (error) {
      throw error;
    }

    for (const item of data || []) {
      map.set(String(item.object_key), { id: String(item.id) });
    }
  }

  return map;
}

async function reconcile(options: CliOptions) {
  const comments = await listComments(options);
  const candidates = comments.flatMap((comment) =>
    normalizeImages(comment.images)
      .map((objectKey, imageIndex) => ({
        comment,
        objectKey,
        imageIndex,
      }))
      .filter((item) => isProjectLogCommentCosObjectKey(item.objectKey))
  );
  const existingMap = await getExistingFileObjectMap(
    candidates.map((item) => item.objectKey),
  );
  const results: ReconcileResult[] = [];

  for (const item of candidates) {
    const existing = existingMap.get(item.objectKey);
    const base = {
      comment_id: item.comment.id,
      tenant_id: item.comment.tenant_id || "",
      log_id: item.comment.log_id,
      image_index: item.imageIndex,
      object_key: item.objectKey,
      file_id: existing?.id || "",
      reason: "",
    };

    if (existing) {
      results.push({
        ...base,
        status: "exists",
      });
      continue;
    }

    if (!options.apply) {
      results.push({
        ...base,
        status: "dry_run_missing",
        reason: "platform_file_object_missing",
      });
      continue;
    }

    try {
      const response = await platformFileStorageService.registerExistingCosObject({
        scene: "project_log_comment",
        tenantId: item.comment.tenant_id,
        objectKey: item.objectKey,
        ownerType: "project_log_comment",
        ownerId: item.comment.id,
        customerId: item.comment.author_type === "customer" ? item.comment.author_id : null,
        verifyHead: true,
        failIfMissing: true,
        metadata: {
          direct_upload_reconciled: true,
          reconcile_source: "project_log_comment_cos_reconcile",
          comment_id: item.comment.id,
          log_id: item.comment.log_id,
          image_index: item.imageIndex,
        },
      });
      existingMap.set(item.objectKey, { id: response.file_id || "" });
      results.push({
        ...base,
        status: "reconciled",
        file_id: response.file_id || "",
      });
    } catch (error) {
      results.push({
        ...base,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const results = await reconcile(options);
  await mkdir(options.outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = join(options.outDir, `${timestamp}.csv`);
  await writeFile(outputPath, `${toCsv(results)}\n`, "utf8");

  const summary = results.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({
    apply: options.apply,
    scanned: results.length,
    summary,
    outputPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
