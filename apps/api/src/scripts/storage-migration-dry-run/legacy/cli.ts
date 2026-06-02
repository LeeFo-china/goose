import type { CliOptions } from "./shared";

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    tenantId: null,
    allTenants: false,
    limit: 500,
    outDir: "reports/storage-migration",
    checkRemote: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--tenant-id") {
      options.tenantId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (arg === "--all-tenants") {
      options.allTenants = true;
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
    if (arg === "--check-remote") {
      options.checkRemote = true;
    }
  }

  if (!options.tenantId && !options.allTenants) {
    throw new Error("请传 --tenant-id <uuid> 或 --all-tenants");
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit 必须是大于 0 的数字");
  }

  return options;
}
