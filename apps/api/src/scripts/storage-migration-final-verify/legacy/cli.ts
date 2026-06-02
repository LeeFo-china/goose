import type { CliOptions } from "./types";

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputs: [],
    limit: 100000,
    outDir: "reports/storage-migration-final-verify",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--input") {
      const value = argv[index + 1] || "";
      if (value) options.inputs.push(value);
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
    }
  }

  if (options.inputs.length === 0) {
    throw new Error("请至少传一个 --input <migration-items.csv>");
  }
  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit 必须是大于 0 的数字");
  }

  return options;
}
