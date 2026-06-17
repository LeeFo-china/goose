import { dirname, join, resolve } from "node:path";
import type { BackfillSubjectType, CliOptions } from "./types";

const BACKFILL_SUBJECT_TYPES = [
  "customer",
  "project",
  "expense_request",
] as const satisfies readonly BackfillSubjectType[];

function parseSubjectType(value: string): BackfillSubjectType {
  if (BACKFILL_SUBJECT_TYPES.includes(value as BackfillSubjectType)) {
    return value as BackfillSubjectType;
  }

  throw new Error(`无效的 subject type: ${value}`);
}

function projectRoot() {
  return resolve(dirname(import.meta.path), "../../../../..");
}

function defaultReportPath() {
  const date = new Date().toISOString().slice(0, 10);
  return join(
    projectRoot(),
    "docs/state_machine_migrate/audit",
    `${date}-backfill-report.md`,
  );
}

export function parseBackfillArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    tenantId: "",
    apply: false,
    reportPath: defaultReportPath(),
  };
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;

    if (arg === "--tenant-id") {
      options.tenantId = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--apply") {
      options.apply = true;
      continue;
    }

    if (arg === "--report") {
      options.reportPath = argv[index + 1] || options.reportPath;
      index += 1;
      continue;
    }

    if (arg === "--subject-type") {
      options.subjectType = parseSubjectType(argv[index + 1] || "");
      index += 1;
    }
  }

  if (!options.tenantId) {
    throw new Error("请传 --tenant-id <uuid>");
  }
  if (options.apply === dryRun) {
    throw new Error("请且只请传 --dry-run 或 --apply");
  }

  return options;
}
