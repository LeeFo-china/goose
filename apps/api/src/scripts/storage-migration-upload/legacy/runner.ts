import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import COS from "cos-nodejs-sdk-v5";
import { refreshPlatformCosPublicBaseUrlCache } from "@/services/files/file-url-resolver";
import { parseArgs } from "./cli";
import { getCosConfig } from "./cos-config";
import { readDryRunItems, toCsv } from "./csv";
import { migrateOne } from "./migration";
import { summarize } from "./summary";
import type { MigrationResult } from "./types";

export async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const outputDir = join(options.outDir, stamp);
  const dryRunItems = readDryRunItems(await readFile(options.input, "utf8"))
    .filter((item) => item.status === "migratable")
    .slice(0, options.limit);
  const config = await getCosConfig();
  await refreshPlatformCosPublicBaseUrlCache();
  const cos = new COS({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
  });
  const results: MigrationResult[] = [];

  for (const [index, item] of dryRunItems.entries()) {
    try {
      results.push(await migrateOne({
        item,
        config,
        cos,
        apply: options.apply,
      }));
    } catch (error) {
      results.push({
        ...item,
        migrated_status: "failed",
        file_id: "",
        provider: "tencent_cos",
        bucket: config.bucket,
        region: config.region,
        object_key: item.target_object_key,
        public_url: "",
        mime_type: "",
        size_bytes: "",
        checksum: "",
        access_url_http_status: "",
        migrated_reason: error instanceof Error ? error.message : "unknown_error",
      });
    }

    const lastResult = results[results.length - 1] as MigrationResult;
    console.log(
      `progress ${index + 1}/${dryRunItems.length} ${lastResult.migrated_status} ${lastResult.source_table}.${lastResult.source_id}`,
    );
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summarize(results, startedAt, options.apply), null, 2)}\n`,
  );
  await writeFile(join(outputDir, "migration-items.csv"), `${toCsv(results)}\n`);

  const summary = summarize(results, startedAt, options.apply);
  console.log(`migration report: ${outputDir}`);
  console.log(`uploaded=${summary.uploaded}, planned=${summary.planned}, failed=${summary.failed}, already_exists=${summary.already_exists}`);
}
