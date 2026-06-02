import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "./cli";
import { toCsv, toReportCsv } from "./csv";
import { scanSource, summarize } from "./scan";
import { sources } from "./sources";
import type { ReportItem } from "./shared";

export async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const outputDir = join(options.outDir, stamp);
  const items: ReportItem[] = [];

  for (const source of sources) {
    if (items.length >= options.limit) {
      break;
    }

    const sourceItems = await scanSource(source, options, options.limit - items.length);
    items.push(...sourceItems);
  }

  const failures = items.filter((item) =>
    ["invalid", "download_failed"].includes(item.status)
  );
  const tenants = Array.from(new Set(items.map((item) => item.tenant_id || "public")))
    .sort()
    .map((tenantId) => ({
      tenant_id: tenantId === "public" ? null : tenantId,
      total_values: items.filter((item) => (item.tenant_id || "public") === tenantId).length,
      migratable: items.filter((item) =>
        (item.tenant_id || "public") === tenantId && item.status === "migratable"
      ).length,
    }));

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "summary.json"),
    `${JSON.stringify(summarize(items, startedAt), null, 2)}\n`,
  );
  await writeFile(join(outputDir, "items.csv"), `${toReportCsv(items)}\n`);
  await writeFile(join(outputDir, "failures.csv"), `${toReportCsv(failures)}\n`);
  await writeFile(
    join(outputDir, "tenants.csv"),
    `${toCsv(tenants, ["tenant_id", "total_values", "migratable"])}\n`,
  );

  console.log(`dry-run report: ${outputDir}`);
  console.log(
    `total=${items.length}, migratable=${items.filter((item) => item.status === "migratable").length}`,
  );
}
