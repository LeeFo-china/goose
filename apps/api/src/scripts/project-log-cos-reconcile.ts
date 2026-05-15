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

type ProjectLogRow = {
  id: string;
  tenant_id: string | null;
  project_id: string;
  employee_id: string | null;
  images: unknown;
  created_at: string;
};

export type ProjectLogCosReconcileResult = {
  log_id: string;
  tenant_id: string;
  project_id: string;
  image_index: number;
  object_key: string;
  status: "exists" | "reconciled" | "dry_run_missing" | "failed";
  file_id: string;
  reason: string;
};

export function parseProjectLogCosReconcileArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    limit: 200,
    outDir: "reports/project-log-cos-reconcile",
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

function isProjectLogCosObjectKey(value: string) {
  return (
    (value.startsWith("tenants/") || value.startsWith("public/")) &&
    value.includes("/project-log/")
  );
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(items: ProjectLogCosReconcileResult[]) {
  const headers = [
    "log_id",
    "tenant_id",
    "project_id",
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

async function listProjectLogs(options: CliOptions) {
  let query = SupabaseDB.getAdminClient()
    .from("project_logs")
    .select("id,tenant_id,project_id,employee_id,images,created_at")
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

  return (data || []) as ProjectLogRow[];
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
      .eq("scene", "project_log")
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

export async function reconcileProjectLogCosObjects(options: CliOptions) {
  const logs = await listProjectLogs(options);
  const candidates = logs.flatMap((log) =>
    normalizeImages(log.images)
      .map((objectKey, imageIndex) => ({
        log,
        objectKey,
        imageIndex,
      }))
      .filter((item) => isProjectLogCosObjectKey(item.objectKey))
  );
  const existingMap = await getExistingFileObjectMap(
    candidates.map((item) => item.objectKey),
  );
  const results: ProjectLogCosReconcileResult[] = [];

  for (const item of candidates) {
    const existing = existingMap.get(item.objectKey);
    const base = {
      log_id: item.log.id,
      tenant_id: item.log.tenant_id || "",
      project_id: item.log.project_id,
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
        scene: "project_log",
        tenantId: item.log.tenant_id,
        projectId: item.log.project_id,
        objectKey: item.objectKey,
        ownerType: "project_log",
        ownerId: item.log.id,
        verifyHead: true,
        failIfMissing: true,
        metadata: {
          direct_upload_reconciled: true,
          reconcile_source: "project_log_cos_reconcile",
          log_id: item.log.id,
          project_id: item.log.project_id,
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

export function summarizeProjectLogCosReconcile(
  results: ProjectLogCosReconcileResult[],
) {
  return results.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
}

export async function writeProjectLogCosReconcileReport(
  results: ProjectLogCosReconcileResult[],
  outDir: string,
) {
  await mkdir(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = join(outDir, `${timestamp}.csv`);
  await writeFile(outputPath, `${toCsv(results)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const options = parseProjectLogCosReconcileArgs(process.argv.slice(2));
  const results = await reconcileProjectLogCosObjects(options);
  const outputPath = await writeProjectLogCosReconcileReport(
    results,
    options.outDir,
  );
  const summary = summarizeProjectLogCosReconcile(results);
  console.log(JSON.stringify({
    apply: options.apply,
    scanned: results.length,
    summary,
    outputPath,
  }, null, 2));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
