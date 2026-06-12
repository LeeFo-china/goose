const COMMAND_FAILURE_DETAIL_MAX_LENGTH = 500;

export function formatCommandFailure(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error";
  const detail = pickCommandFailureDetail([
    readErrorField(error, "stderr"),
    readErrorField(error, "stdout"),
    error.message,
  ]);
  return truncateCommandFailureDetail(detail ?? error.name);
}

function readErrorField(error: Error, field: "stderr" | "stdout"): string {
  const value = (error as Error & Record<typeof field, unknown>)[field];
  return typeof value === "string" ? value.trim() : "";
}

function pickCommandFailureDetail(details: readonly string[]): string | null {
  const nonEmptyDetails = details.filter((value) => value.length > 0);
  for (const detail of nonEmptyDetails) {
    const errorLine = detail
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) =>
        /(?:^|\b)(?:error|failed|exception|syntaxerror|typeerror|permission denied|unauthorized)(?:\b|:)/i
          .test(line) &&
        !/^\d+\s+\|/.test(line) &&
        !/^command failed$/i.test(line)
      );
    if (errorLine) return errorLine;
  }
  return nonEmptyDetails[0] ?? null;
}

function truncateCommandFailureDetail(detail: string): string {
  const normalized = detail.replace(/\s+/g, " ").trim();
  if (normalized.length <= COMMAND_FAILURE_DETAIL_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, COMMAND_FAILURE_DETAIL_MAX_LENGTH)}...`;
}
