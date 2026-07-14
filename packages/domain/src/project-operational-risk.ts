import { z } from 'zod';

export const PROJECT_OPERATIONAL_RISK_TYPE_VALUES = [
  'workflow_task_overdue',
  'procedure_overdue',
  'missing_project_log',
  'acceptance_rework',
  'service_ticket',
] as const;

export const PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES = [
  'warning',
  'danger',
] as const;

export const PROJECT_OPERATIONAL_RISK_SOURCE_TYPE_VALUES = [
  'workflow_task',
  'procedure_assignment',
  'project_log_gap',
  'project_acceptance',
  'customer_service_ticket',
] as const;

export const EvidenceValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const ProjectOperationalRiskFactSchema = z.strictObject({
  risk_key: z.string().trim().min(1).max(200),
  risk_type: z.enum(PROJECT_OPERATIONAL_RISK_TYPE_VALUES),
  severity: z.enum(PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES),
  project_id: z.uuid(),
  project_name: z.string().trim().min(1).max(300),
  project_status: z.string().trim().min(1).max(100),
  source_type: z.enum(PROJECT_OPERATIONAL_RISK_SOURCE_TYPE_VALUES),
  source_id: z.uuid(),
  assignee_employee_id: z.uuid().nullable(),
  assignee_employee_name: z.string().trim().max(100).nullable(),
  occurred_at: z.iso.datetime({ offset: true }).nullable(),
  due_at: z.iso.datetime({ offset: true }).nullable(),
  overdue_days: z.number().int().nonnegative().nullable(),
  evidence: z.record(z.string(), EvidenceValueSchema),
});

export const ProjectOperationalRiskSummaryByTypeSchema = z.strictObject({
  workflow_task_overdue: z.number().int().nonnegative(),
  procedure_overdue: z.number().int().nonnegative(),
  missing_project_log: z.number().int().nonnegative(),
  acceptance_rework: z.number().int().nonnegative(),
  service_ticket: z.number().int().nonnegative(),
});

export const ProjectOperationalRiskRpcSummarySchema = z.strictObject({
  total: z.number().int().nonnegative(),
  danger: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
  info: z.number().int().nonnegative(),
  affected_projects: z.number().int().nonnegative(),
  by_type: ProjectOperationalRiskSummaryByTypeSchema,
});

export const ProjectOperationalRiskRpcDiagnosticsSchema = z.strictObject({
  workflow_tasks_missing_due_at: z.number().int().nonnegative(),
});

export const ProjectOperationalRiskRpcPaginationSchema = z.strictObject({
  page: z.number().int().min(1),
  page_size: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  total_pages: z.number().int().nonnegative(),
});

export const ProjectOperationalRiskRpcPageSchema = z.strictObject({
  generated_at: z.iso.datetime({ offset: true }),
  business_date: z.iso.date(),
  summary: ProjectOperationalRiskRpcSummarySchema,
  diagnostics: ProjectOperationalRiskRpcDiagnosticsSchema,
  items: z.array(ProjectOperationalRiskFactSchema),
  pagination: ProjectOperationalRiskRpcPaginationSchema,
});

export const ProjectOperationalRiskDisplayItemSchema =
  ProjectOperationalRiskFactSchema.extend({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(500),
    action: z.strictObject({
      label: z.string().trim().min(1).max(100),
      href: z.string().trim().min(1).max(500),
    }),
  });

export const ProjectOperationalRiskDisplayPageSchema =
  ProjectOperationalRiskRpcPageSchema.extend({
    items: z.array(ProjectOperationalRiskDisplayItemSchema),
  });

export const ProjectOperationalRiskAiSummarySchema = z.strictObject({
  overview: z.string().trim().max(800),
  priorities: z
    .array(
      z.strictObject({
        risk_key: z.string().trim().min(1).max(300),
        reason: z.string().trim().max(300),
        recommended_action: z.string().trim().max(300),
      }),
    )
    .max(5),
  cautions: z.array(z.string().trim()).max(5),
});

export type ProjectOperationalRiskType =
  (typeof PROJECT_OPERATIONAL_RISK_TYPE_VALUES)[number];
export type ProjectOperationalRiskSeverity =
  (typeof PROJECT_OPERATIONAL_RISK_SEVERITY_VALUES)[number];
export type ProjectOperationalRiskSourceType =
  (typeof PROJECT_OPERATIONAL_RISK_SOURCE_TYPE_VALUES)[number];
export type ProjectOperationalRiskFact = z.infer<
  typeof ProjectOperationalRiskFactSchema
>;
export type ProjectOperationalRiskRpcPage = z.infer<
  typeof ProjectOperationalRiskRpcPageSchema
>;
export type ProjectOperationalRiskDisplayItem = z.infer<
  typeof ProjectOperationalRiskDisplayItemSchema
>;
export type ProjectOperationalRiskDisplayPage = z.infer<
  typeof ProjectOperationalRiskDisplayPageSchema
>;
export type ProjectOperationalRiskAiSummary = z.infer<
  typeof ProjectOperationalRiskAiSummarySchema
>;
