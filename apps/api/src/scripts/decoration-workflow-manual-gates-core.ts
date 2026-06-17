import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

type CheckName =
  | "decoration_manual_gate_evidence"
  | "read_only_review_current"
  | "legacy_apply_confirmations"
  | "manual_restore_decision"
  | "orange_e2e_acceptance"
  | "closeout_rules_consistent";

type Check = {
  name: CheckName;
  ok: boolean;
  detail: string;
};

export type DecorationWorkflowManualGateCheckReport = {
  ok: boolean;
  generated_at: string;
  checks: Check[];
};

type Evidence = Record<string, unknown>;
type Problems = { missing: string[]; invalid: string[] };

const APPLY_GATES = [
  "project_signing_rebuild",
  "invalid_customer_cancellations",
] as const;

export async function buildDecorationWorkflowManualGateCheckReport(
  evidenceFile: string | null,
  generatedAt = new Date().toISOString(),
): Promise<DecorationWorkflowManualGateCheckReport> {
  if (!evidenceFile) {
    return report(generatedAt, [{
      name: "decoration_manual_gate_evidence",
      ok: false,
      detail: "missing --evidence-file",
    }]);
  }

  const loaded = await loadEvidence(evidenceFile);
  if (!loaded.ok) {
    return report(generatedAt, [{
      name: "decoration_manual_gate_evidence",
      ok: false,
      detail: loaded.detail,
    }]);
  }

  const problems = collectStructuralIssues(
    loaded.evidence,
    new Date(generatedAt),
  );
  if (problems.missing.length > 0 || problems.invalid.length > 0) {
    return report(generatedAt, [{
      name: "decoration_manual_gate_evidence",
      ok: false,
      detail: formatEvidenceProblems(evidenceFile, problems),
    }]);
  }

  const readOnly = summarizeReadOnlyReview(loaded.evidence);
  const legacyApply = summarizeLegacyApplyConfirmations(loaded.evidence);
  const manualRestore = summarizeManualRestoreDecision(loaded.evidence);
  const orange = summarizeOrangeE2eAcceptance(loaded.evidence);
  const closeout = summarizeCloseoutRules(loaded.evidence, {
    canRunLegacyApply: legacyApply.ok,
    canClosePrdWithoutFollowup:
      readOnly.ok && legacyApply.ok && manualRestore.ok && orange.ok &&
      manualRestoreHasNoFollowup(loaded.evidence),
  });
  const checks = [readOnly, legacyApply, manualRestore, orange, closeout];

  if (checks.every((check) => check.ok)) {
    checks.unshift({
      name: "decoration_manual_gate_evidence",
      ok: true,
      detail: `evidence_file=${evidenceFile}`,
    });
  }

  return report(generatedAt, checks);
}

async function loadEvidence(evidenceFile: string): Promise<
  | { ok: true; evidence: Evidence }
  | { ok: false; detail: string }
> {
  const absolutePath = resolve(findRepoRoot(), evidenceFile);
  let raw: string;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch {
    return {
      ok: false,
      detail: `evidence_file=${evidenceFile}; missing evidence file`,
    };
  }

  try {
    const parsed = JSON.parse(raw);
    return { ok: true, evidence: isRecord(parsed) ? parsed : {} };
  } catch {
    return {
      ok: false,
      detail: `evidence_file=${evidenceFile}; invalid JSON`,
    };
  }
}

function collectStructuralIssues(
  evidence: Evidence,
  referenceTime: Date,
): Problems {
  const problems: Problems = { missing: [], invalid: [] };
  validateDateTime(
    "latest_read_only_review.reviewed_at",
    get(evidence, "latest_read_only_review.reviewed_at"),
    problems,
    referenceTime,
  );
  validateEvidenceReference(
    "latest_read_only_review.evidence",
    get(evidence, "latest_read_only_review.evidence"),
    problems,
  );
  validateConfirmedGate(
    evidence,
    "legacy_instance_apply_gates.project_signing_rebuild",
    problems,
    referenceTime,
  );
  validateConfirmedGate(
    evidence,
    "legacy_instance_apply_gates.invalid_customer_cancellations",
    problems,
    referenceTime,
  );
  validateManualRestoreGate(evidence, problems, referenceTime);
  validateOrangeGate(evidence, problems, referenceTime);
  return problems;
}

function validateConfirmedGate(
  evidence: Evidence,
  prefix: string,
  problems: Problems,
  referenceTime: Date,
): void {
  if (get(evidence, `${prefix}.confirmed`) !== true) return;
  requireString(`${prefix}.confirmed_by`, get(evidence, `${prefix}.confirmed_by`), problems);
  validateDateTime(
    `${prefix}.confirmed_at`,
    get(evidence, `${prefix}.confirmed_at`),
    problems,
    referenceTime,
  );
  validateEvidenceReference(
    `${prefix}.evidence`,
    get(evidence, `${prefix}.evidence`),
    problems,
  );
}

function validateManualRestoreGate(
  evidence: Evidence,
  problems: Problems,
  referenceTime: Date,
): void {
  const prefix = "legacy_instance_apply_gates.manual_restore_project";
  if (get(evidence, `${prefix}.decision_confirmed`) !== true) return;
  requireString(`${prefix}.confirmed_by`, get(evidence, `${prefix}.confirmed_by`), problems);
  validateDateTime(
    `${prefix}.confirmed_at`,
    get(evidence, `${prefix}.confirmed_at`),
    problems,
    referenceTime,
  );
  validateEvidenceReference(`${prefix}.evidence`, get(evidence, `${prefix}.evidence`), problems);

  const selected = get(evidence, `${prefix}.selected_option`);
  const allowed = arrayOfStrings(get(evidence, `${prefix}.allowed_decision_options`));
  if (!isNonEmptyString(selected)) {
    problems.missing.push(`${prefix}.selected_option`);
  } else if (!allowed.includes(selected)) {
    problems.invalid.push(
      `${prefix}.selected_option: must be one of allowed_decision_options`,
    );
  }

  const followupRequired = get(evidence, `${prefix}.followup_required`);
  if (followupRequired === undefined) {
    problems.missing.push(`${prefix}.followup_required`);
  } else if (typeof followupRequired !== "boolean") {
    problems.invalid.push(`${prefix}.followup_required: must be a boolean`);
  }
}

function validateOrangeGate(
  evidence: Evidence,
  problems: Problems,
  referenceTime: Date,
): void {
  const prefix = "orange_e2e_acceptance_gate";
  if (get(evidence, `${prefix}.confirmed`) !== true) return;
  validateConfirmedGate(evidence, prefix, problems, referenceTime);
  for (const field of ["mini_program_version_or_commit", "tenant", "accounts"]) {
    requireString(`${prefix}.${field}`, get(evidence, `${prefix}.${field}`), problems);
  }
  if (arrayOfRecords(get(evidence, `${prefix}.required_scenarios`)).length === 0) {
    problems.missing.push(`${prefix}.required_scenarios`);
  }
}

function summarizeReadOnlyReview(evidence: Evidence): Check {
  const needsMigration = get(evidence, "latest_read_only_review.needs_migration");
  const unknownReview = get(evidence, "latest_read_only_review.unknown_review_required");
  const runningLegacy = get(
    evidence,
    "latest_read_only_review.running_instances_on_legacy_snapshots",
  );
  return {
    name: "read_only_review_current",
    ok: needsMigration === false && unknownReview === 0,
    detail:
      `needs_migration=${String(needsMigration)}; unknown_review_required=${String(unknownReview)}; running_instances_on_legacy_snapshots=${String(runningLegacy)}`,
  };
}

function summarizeLegacyApplyConfirmations(evidence: Evidence): Check {
  const failed = [
    summarizeProjectRebuildGate(evidence),
    summarizeInvalidCustomerCancelGate(evidence),
  ].filter((item) => !item.ok);
  if (failed.length > 0) {
    return {
      name: "legacy_apply_confirmations",
      ok: false,
      detail: `pending=${failed.map((item) => item.detail).join(", ")}`,
    };
  }
  return {
    name: "legacy_apply_confirmations",
    ok: true,
    detail: `confirmed=${APPLY_GATES.join(", ")}`,
  };
}

function summarizeProjectRebuildGate(evidence: Evidence): { ok: boolean; detail: string } {
  const prefix = "legacy_instance_apply_gates.project_signing_rebuild";
  if (get(evidence, `${prefix}.confirmed`) !== true) {
    return { ok: false, detail: "project_signing_rebuild" };
  }
  const projectId = get(evidence, `${prefix}.project_id`);
  const command = get(evidence, `${prefix}.apply_command`);
  const ok = get(evidence, `${prefix}.latest_dry_run_ok`) === true &&
    isNonEmptyString(projectId) &&
    isNonEmptyString(command) &&
    command.includes("--apply") &&
    command.includes(`--confirm-rebuild ${projectId}`);
  return { ok, detail: ok ? "project_signing_rebuild" : `${prefix}.apply_command` };
}

function summarizeInvalidCustomerCancelGate(evidence: Evidence): { ok: boolean; detail: string } {
  const prefix = "legacy_instance_apply_gates.invalid_customer_cancellations";
  if (get(evidence, `${prefix}.confirmed`) !== true) {
    return { ok: false, detail: "invalid_customer_cancellations" };
  }
  const items = arrayOfRecords(get(evidence, `${prefix}.items`));
  const ok = items.length > 0 && items.every((item) => {
    const instanceId = item.legacy_instance_id;
    const command = item.apply_command;
    return item.latest_dry_run_ok === true &&
      isNonEmptyString(instanceId) &&
      isNonEmptyString(command) &&
      command.includes("--apply") &&
      command.includes(`--confirm-cancel ${instanceId}`);
  });
  return { ok, detail: ok ? "invalid_customer_cancellations" : `${prefix}.items` };
}

function summarizeManualRestoreDecision(evidence: Evidence): Check {
  const prefix = "legacy_instance_apply_gates.manual_restore_project";
  if (get(evidence, `${prefix}.decision_confirmed`) !== true) {
    return {
      name: "manual_restore_decision",
      ok: false,
      detail: `pending=manual_restore_project; project_id=${String(get(evidence, `${prefix}.project_id`) ?? "unknown")}`,
    };
  }
  return {
    name: "manual_restore_decision",
    ok: true,
    detail: `selected_option=${String(get(evidence, `${prefix}.selected_option`))}; followup_required=${String(get(evidence, `${prefix}.followup_required`))}`,
  };
}

function manualRestoreHasNoFollowup(evidence: Evidence): boolean {
  const prefix = "legacy_instance_apply_gates.manual_restore_project";
  return get(evidence, `${prefix}.decision_confirmed`) === true &&
    get(evidence, `${prefix}.followup_required`) === false;
}

function summarizeOrangeE2eAcceptance(evidence: Evidence): Check {
  const scenarios = arrayOfRecords(
    get(evidence, "orange_e2e_acceptance_gate.required_scenarios"),
  );
  const pending = scenarios
    .filter((scenario) => scenario.status !== "passed")
    .map((scenario) => String(scenario.key));
  const confirmed = get(evidence, "orange_e2e_acceptance_gate.confirmed") === true;
  if (!confirmed || pending.length > 0) {
    return {
      name: "orange_e2e_acceptance",
      ok: false,
      detail: `pending=${pending.join(", ") || "orange_e2e_acceptance_gate"}`,
    };
  }
  return {
    name: "orange_e2e_acceptance",
    ok: true,
    detail: `passed=${scenarios.map((scenario) => String(scenario.key)).join(", ")}`,
  };
}

function summarizeCloseoutRules(
  evidence: Evidence,
  expected: { canRunLegacyApply: boolean; canClosePrdWithoutFollowup: boolean },
): Check {
  const canRun = get(evidence, "closeout_rules.can_run_legacy_apply");
  const canClose = get(evidence, "closeout_rules.can_close_prd_without_followup");
  return {
    name: "closeout_rules_consistent",
    ok: canRun === expected.canRunLegacyApply &&
      canClose === expected.canClosePrdWithoutFollowup,
    detail:
      `can_run_legacy_apply=${String(canRun)}; can_close_prd_without_followup=${String(canClose)}`,
  };
}

function requireString(field: string, value: unknown, problems: Problems): void {
  if (!isNonEmptyString(value)) problems.missing.push(field);
}

function validateDateTime(
  field: string,
  value: unknown,
  problems: Problems,
  referenceTime: Date,
): void {
  if (!isNonEmptyString(value)) {
    problems.missing.push(field);
    return;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    problems.invalid.push(`${field}: must be a parseable date-time`);
    return;
  }
  if (!Number.isNaN(referenceTime.getTime()) && date.getTime() > referenceTime.getTime()) {
    problems.invalid.push(`${field}: must not be in the future`);
  }
}

function validateEvidenceReference(
  field: string,
  value: unknown,
  problems: Problems,
): void {
  if (!isNonEmptyString(value)) {
    problems.missing.push(field);
    return;
  }
  const localPath = normalizeLocalEvidencePath(value);
  if (!localPath && !/^https?:\/\//.test(value)) {
    problems.invalid.push(
      `${field}: evidence must be an http(s) URL or docs/state_machine_migrate/ path`,
    );
    return;
  }
  if (localPath && !existsSync(resolve(findRepoRoot(), localPath))) {
    problems.invalid.push(`${field}: missing local evidence path ${localPath}`);
  }
}

function normalizeLocalEvidencePath(value: string): string | null {
  const hashIndex = value.indexOf("#");
  const path = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  return path.startsWith("docs/state_machine_migrate/") ? path : null;
}

function formatEvidenceProblems(evidenceFile: string, problems: Problems): string {
  const parts = [
    ...problems.missing.map((field) => `missing=${field}`),
    ...problems.invalid.map((issue) => `invalid=${issue}`),
  ];
  return `evidence_file=${evidenceFile}; ${parts.join(", ")}`;
}

function report(generatedAt: string, checks: Check[]): DecorationWorkflowManualGateCheckReport {
  return {
    ok: checks.every((check) => check.ok),
    generated_at: generatedAt,
    checks,
  };
}

function get(source: unknown, path: string): unknown {
  let current: unknown = source;
  for (const key of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

function arrayOfRecords(value: unknown): Evidence[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isNonEmptyString) : [];
}

function isRecord(value: unknown): value is Evidence {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}
