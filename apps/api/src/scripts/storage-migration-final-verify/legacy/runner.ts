import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { refreshPlatformCosPublicBaseUrlCache } from "@/services/files/file-url-resolver";
import { parseArgs } from "./cli";
import { readItems, toCsv } from "./csv";
import { summarize } from "./summary";
import type { MigrationItem, VerifyResult } from "./types";
import { objectKeyOf, verifyOne } from "./verifier";

export async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const outputDir = join(options.outDir, stamp);
  await refreshPlatformCosPublicBaseUrlCache();

  const byObjectKey = new Map<string, MigrationItem>();
  for (const inputPath of options.inputs) {
    const items = readItems(await readFile(inputPath, "utf8"));
    for (const item of items) {
      if (!["uploaded", "already_exists"].includes(item.migrated_status)) {
        continue;
      }

      const objectKey = objectKeyOf(item);
      if (!objectKey) continue;
      byObjectKey.set(objectKey, item);
    }
  }

  const sourceItems = Array.from(byObjectKey.values()).slice(0, options.limit);
  const results: VerifyResult[] = [];

  for (const [index, item] of sourceItems.entries()) {
    results.push(await verifyOne(item));
    if ((index + 1) % 10 === 0 || index + 1 === sourceItems.length) {
      console.log(`progress ${index + 1}/${sourceItems.length}`);
    }
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summarize(results, startedAt), null, 2)}\n`,
  );
  await writeFile(join(outputDir, "final-verify-items.csv"), `${toCsv(results)}\n`);

  const summary = summarize(results, startedAt);
  console.log(`final verify report: ${outputDir}`);
  console.log(`passed=${summary.passed}, failed=${summary.failed}`);
}
