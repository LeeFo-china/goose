import type { BackfillSubjectType } from "./plan";
import {
  buildSubjectBackfillPlan,
  shouldCreatePendingTask,
} from "./plan";
import {
  createRuntimeRows,
  listExistingInstances,
  listLegacySubjects,
  loadWorkflowBindings,
} from "./data";
import { summarizeResults, writeBackfillReport } from "./report";
import {
  SUBJECT_WORKFLOW_KEY,
  type BackfillResult,
  type CliOptions,
  type WorkflowBinding,
} from "./types";

async function backfillSubjectType(input: {
  tenantId: string;
  subjectType: BackfillSubjectType;
  binding: WorkflowBinding | null;
  apply: boolean;
}) {
  const rows = await listLegacySubjects(input.subjectType, input.tenantId);
  const workflowKey = SUBJECT_WORKFLOW_KEY[input.subjectType];

  if (!input.binding) {
    return rows.map<BackfillResult>((row) => ({
      subject_type: input.subjectType,
      subject_id: row.id,
      legacy_status: row.status,
      legacy_step: row.legacy_step,
      workflow_key: workflowKey,
      node_key: null,
      action: "skip",
      reason: "active_workflow_definition_missing",
      instance_id: "",
      task_created: false,
    }));
  }

  const existingBySubjectId = await listExistingInstances({
    tenantId: input.tenantId,
    definitionId: input.binding.definition.id,
    subjectType: input.subjectType,
    subjectIds: rows.map((row) => row.id),
  });
  const results: BackfillResult[] = [];

  for (const row of rows) {
    const existingInstances = existingBySubjectId.get(row.id) || [];
    const plan = buildSubjectBackfillPlan({
      subjectType: input.subjectType,
      subjectId: row.id,
      legacyStatus: row.status,
      legacyStep: row.legacy_step,
      snapshot: input.binding.version.snapshot,
      hasRunningInstance: existingInstances.some((item) => item.status === "running"),
      hasExistingInstance: existingInstances.length > 0,
    });

    if (plan.action === "skip") {
      results.push({
        subject_type: input.subjectType,
        subject_id: row.id,
        legacy_status: row.status,
        legacy_step: row.legacy_step,
        workflow_key: workflowKey,
        node_key: plan.nodeKey ?? null,
        action: "skip",
        reason: plan.reason,
        instance_id: existingInstances[0]?.id || "",
        task_created: false,
      });
      continue;
    }

    if (!input.apply) {
      results.push({
        subject_type: input.subjectType,
        subject_id: row.id,
        legacy_status: row.status,
        legacy_step: row.legacy_step,
        workflow_key: workflowKey,
        node_key: plan.nodeKey,
        action: "dry_run_create",
        reason: "",
        instance_id: "",
        task_created: shouldCreatePendingTask(plan.instanceStatus, plan.node),
      });
      continue;
    }

    try {
      const created = await createRuntimeRows({
        row,
        binding: input.binding,
        node: plan.node,
        nodeKey: plan.nodeKey,
        instanceStatus: plan.instanceStatus,
      });
      results.push({
        subject_type: input.subjectType,
        subject_id: row.id,
        legacy_status: row.status,
        legacy_step: row.legacy_step,
        workflow_key: workflowKey,
        node_key: plan.nodeKey,
        action: "create",
        reason: "",
        instance_id: created.instanceId,
        task_created: created.taskCreated,
      });
    } catch (error) {
      results.push({
        subject_type: input.subjectType,
        subject_id: row.id,
        legacy_status: row.status,
        legacy_step: row.legacy_step,
        workflow_key: workflowKey,
        node_key: plan.nodeKey,
        action: "failed",
        reason: error instanceof Error ? error.message : String(error),
        instance_id: "",
        task_created: false,
      });
    }
  }

  return results;
}

export async function backfillWorkflowRuntimeFromStateMachine(
  options: CliOptions,
) {
  const bindings = await loadWorkflowBindings(options.tenantId);
  const allResults: BackfillResult[] = [];

  for (const subjectType of Object.keys(SUBJECT_WORKFLOW_KEY) as BackfillSubjectType[]) {
    const results = await backfillSubjectType({
      tenantId: options.tenantId,
      subjectType,
      binding: bindings.get(subjectType) ?? null,
      apply: options.apply,
    });
    allResults.push(...results);
  }

  const outputPath = await writeBackfillReport({
    tenantId: options.tenantId,
    apply: options.apply,
    reportPath: options.reportPath,
    results: allResults,
  });

  return {
    apply: options.apply,
    scanned: allResults.length,
    summary: summarizeResults(allResults),
    outputPath,
  };
}
