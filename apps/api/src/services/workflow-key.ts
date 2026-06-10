import { randomUUID } from "node:crypto";
import type { WorkflowCategory } from "@gooes/domain";
import { Errors } from "@/errors/error-factory";
import { workflowRepository } from "@/repositories/workflows";
import type { WorkflowDefinitionCreateInput } from "@/schema/workflows";

const MAX_WORKFLOW_KEY_LENGTH = 100;
const GENERATED_KEY_BASE_LENGTH = 72;

export function normalizeWorkflowKey(workflowKey: string) {
  return workflowKey.trim().toLowerCase();
}

export async function resolveWorkflowKey(
  tenantId: string,
  input: WorkflowDefinitionCreateInput,
) {
  if (input.workflow_key) {
    const workflowKey = normalizeWorkflowKey(input.workflow_key);
    const existing = await workflowRepository.findDefinitionByKey(
      tenantId,
      workflowKey,
    );
    if (existing) {
      throw Errors.business(409, "流程编码已存在", "WORKFLOW_KEY_EXISTS", {
        workflow_key: workflowKey,
        definition_id: existing.id,
      });
    }
    return workflowKey;
  }

  const base = buildWorkflowKeyBase({
    category: input.category,
    name: input.name,
  });

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const candidate = buildWorkflowKeyCandidate(base, attempt);
    const existing = await workflowRepository.findDefinitionByKey(
      tenantId,
      candidate,
    );
    if (!existing) return candidate;
  }

  throw Errors.business(409, "流程编码生成失败，请重试", "WORKFLOW_KEY_GENERATE_FAILED");
}

export function buildWorkflowKeyBase({
  category,
  name,
}: {
  category: WorkflowCategory;
  name: string;
}) {
  const nameSegment = toWorkflowKeySegment(name);
  return truncateWorkflowKey(
    [category, nameSegment || "custom"].join("_"),
    GENERATED_KEY_BASE_LENGTH,
  );
}

export function buildWorkflowKeyCandidate(base: string, attempt: number) {
  const suffix = [Date.now().toString(36), attempt, randomUUID().slice(0, 8)]
    .join("_");
  return [
    truncateWorkflowKey(base, MAX_WORKFLOW_KEY_LENGTH - suffix.length - 1),
    suffix,
  ].join("_");
}

function toWorkflowKeySegment(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function truncateWorkflowKey(value: string, maxLength: number) {
  return value.slice(0, maxLength).replace(/_+$/g, "") || "workflow";
}
