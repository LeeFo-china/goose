import type { CliOptions } from "./types";

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    input: "",
    limit: 10,
    outDir: "reports/storage-migration-upload",
    apply: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
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

  if (!options.input) {
    throw new Error("请传 --input <dry-run-items.csv>");
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit 必须是大于 0 的数字");
  }

  return options;
}
