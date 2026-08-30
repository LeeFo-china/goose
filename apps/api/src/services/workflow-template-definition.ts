import type {
  WorkflowGraphSaveInput,
  WorkflowTemplateCreateInput,
} from "@/schema/workflows";
import type {
  WorkflowCategory,
  WorkflowSubjectType,
} from "@gooes/domain";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type WorkflowTemplateDefinition = DeepReadonly<{
  workflow_key: string;
  subject_type: WorkflowSubjectType;
  name: string;
  description: string;
  category: WorkflowCategory;
  graph: WorkflowGraphSaveInput;
}>;

export const WORKFLOW_TEMPLATE_SUBJECT_TYPES = {
  customer_main: "customer",
  sales_main: "customer",
  project_signing: "project",
  construction_main: "project",
  procedure_standard: "procedure",
  expense_approval: "expense_request",
  supplier_purchase_batch_approval: "supplier_purchase_batch",
} as const satisfies Readonly<Record<
  WorkflowTemplateCreateInput["template_key"],
  WorkflowSubjectType
>>;

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

export function freezeWorkflowTemplate<T extends WorkflowTemplateDefinition>(
  template: T,
): T {
  return deepFreeze(template);
}

export function cloneWorkflowTemplateGraph(
  graph: WorkflowTemplateDefinition["graph"],
): WorkflowGraphSaveInput {
  return cloneMutable(graph);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) deepFreeze(nestedValue);
    Object.freeze(value);
  }
  return value;
}

function cloneMutable<T>(value: T): DeepMutable<T> {
  if (Array.isArray(value)) {
    return value.map((item) => cloneMutable(item)) as DeepMutable<T>;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        cloneMutable(nestedValue),
      ]),
    ) as DeepMutable<T>;
  }
  return value as DeepMutable<T>;
}
