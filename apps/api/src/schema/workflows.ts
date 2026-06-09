import {
  WORKFLOW_BUSINESS_KIND_VALUES,
  WORKFLOW_CATEGORY_VALUES,
  WORKFLOW_DEFINITION_STATUS_VALUES,
  WORKFLOW_EDGE_CONDITION_OPERATOR_VALUES,
  WORKFLOW_NODE_TYPE_VALUES,
} from "@gooes/domain";
import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized === "" || normalized === "undefined" || normalized === "null") {
        return undefined;
      }
      return normalized;
    }
    return value;
  }, schema.optional());
}

export const WorkflowCategorySchema = z.enum(WORKFLOW_CATEGORY_VALUES, {
  message: "无效的流程分类",
});

export const WorkflowDefinitionStatusSchema = z.enum(
  WORKFLOW_DEFINITION_STATUS_VALUES,
  { message: "无效的流程状态" },
);

export const WorkflowNodeTypeSchema = z.enum(WORKFLOW_NODE_TYPE_VALUES, {
  message: "无效的节点类型",
});

export const WorkflowBusinessKindSchema = z.enum(WORKFLOW_BUSINESS_KIND_VALUES, {
  message: "无效的业务节点类型",
});

export const WorkflowEdgeConditionOperatorSchema = z.enum(
  WORKFLOW_EDGE_CONDITION_OPERATOR_VALUES,
  { message: "无效的条件操作符" },
);

export const WorkflowListQuerySchema = PaginationQuerySchema.extend({
  status: optionalQueryValue(WorkflowDefinitionStatusSchema),
  category: optionalQueryValue(WorkflowCategorySchema),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
});

export const WorkflowDefinitionCreateSchema = z.object({
  workflow_key: z.string().trim().min(1, "流程编码不能为空").max(100, "流程编码过长"),
  name: z.string().trim().min(1, "流程名称不能为空").max(100, "流程名称过长"),
  description: z.string().trim().max(500, "流程说明过长").nullable().optional(),
  category: WorkflowCategorySchema,
});

export const WorkflowDefinitionUpdateSchema = z.object({
  name: z.string().trim().min(1, "流程名称不能为空").max(100, "流程名称过长").optional(),
  description: z.string().trim().max(500, "流程说明过长").nullable().optional(),
  status: WorkflowDefinitionStatusSchema.optional(),
});

export const WorkflowNodePositionSchema = z.object({
  x: z.coerce.number().finite("节点 X 坐标无效").default(0),
  y: z.coerce.number().finite("节点 Y 坐标无效").default(0),
});

const BaseNodeConfigSchema = z.object({
  required_permissions: z.array(z.string().trim().min(1)).max(20).default([]),
  timeout_hours: z.coerce.number().int().min(1).max(720).nullable().optional(),
  rollback_target_key: z.string().trim().max(100).nullable().optional(),
}).strict();

const ApprovalNodeConfigSchema = BaseNodeConfigSchema.extend({
  assignee_rule: z.enum(["employee", "department", "role"], {
    message: "无效的审批人规则",
  }).default("role"),
  assignee_id: z.string().trim().max(100).nullable().optional(),
  amount_threshold: z.coerce.number().nonnegative("金额阈值不能为负数").nullable().optional(),
  approve_mode: z.enum(["any", "all"], { message: "无效的审批方式" }).default("any"),
  reject_target_key: z.string().trim().max(100).nullable().optional(),
}).strict();

const ProcedureNodeConfigSchema = BaseNodeConfigSchema.extend({
  stage_key: z.string().trim().min(1, "所属施工阶段不能为空").max(100, "施工阶段编码过长"),
  work_instructions: z.string().trim().max(1000, "作业说明过长").nullable().optional(),
  require_log: z.boolean().default(false),
  min_image_count: z.coerce.number().int().min(0).max(20).default(0),
  trigger_acceptance: z.boolean().default(false),
  customer_visible: z.boolean().default(false),
}).strict();

const NotificationNodeConfigSchema = BaseNodeConfigSchema.extend({
  channels: z.array(z.enum(["mini_program", "sms", "todo"])).min(1, "至少选择一个通知渠道").max(3),
  recipient_rule: z.enum(["owner", "assignee", "customer", "role"], {
    message: "无效的通知对象",
  }),
  template: z.string().trim().min(1, "通知模板不能为空").max(500, "通知模板过长"),
}).strict();

export const WorkflowNodeConfigSchema = z.union([
  BaseNodeConfigSchema,
  ApprovalNodeConfigSchema,
  ProcedureNodeConfigSchema,
  NotificationNodeConfigSchema,
]);

export const WorkflowNodeInputSchema = z.object({
  id: z.uuid("无效的节点 ID").optional(),
  node_key: z.string().trim().min(1, "节点编码不能为空").max(100, "节点编码过长"),
  node_type: WorkflowNodeTypeSchema,
  business_kind: WorkflowBusinessKindSchema.nullable().optional(),
  title: z.string().trim().min(1, "节点标题不能为空").max(100, "节点标题过长"),
  description: z.string().trim().max(500, "节点说明过长").nullable().optional(),
  position: WorkflowNodePositionSchema.default({ x: 0, y: 0 }),
  config: WorkflowNodeConfigSchema.prefault({}),
  sort_order: z.coerce.number().int().min(0).max(100000).default(100),
});

export const WorkflowEdgeConditionSchema = z.object({
  operator: WorkflowEdgeConditionOperatorSchema.default("always"),
  field: z.string().trim().max(100).nullable().optional(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).nullable().optional(),
});

export const WorkflowEdgeInputSchema = z.object({
  id: z.uuid("无效的连线 ID").optional(),
  source_node_key: z.string().trim().min(1, "来源节点不能为空").max(100),
  target_node_key: z.string().trim().min(1, "目标节点不能为空").max(100),
  label: z.string().trim().max(100, "连线标签过长").nullable().optional(),
  condition: WorkflowEdgeConditionSchema.default({ operator: "always" }),
  priority: z.coerce.number().int().min(0).max(100000).default(100),
});

export const WorkflowGraphSaveSchema = z.object({
  nodes: z.array(WorkflowNodeInputSchema).max(200, "节点数量不能超过 200"),
  edges: z.array(WorkflowEdgeInputSchema).max(400, "连线数量不能超过 400"),
});

export const WorkflowTemplateCreateSchema = z.object({
  template_key: z.enum(["sales_main", "construction_main", "procedure_standard", "expense_approval"], {
    message: "无效的流程模板",
  }),
  name: z.string().trim().min(1, "流程名称不能为空").max(100, "流程名称过长").optional(),
});

export const WorkflowSimulationSchema = z.object({
  context: z.record(z.string(), z.unknown()).default({}),
});

export type WorkflowListQuery = z.infer<typeof WorkflowListQuerySchema>;
export type WorkflowDefinitionCreateInput = z.infer<typeof WorkflowDefinitionCreateSchema>;
export type WorkflowDefinitionUpdateInput = z.infer<typeof WorkflowDefinitionUpdateSchema>;
export type WorkflowGraphSaveInput = z.infer<typeof WorkflowGraphSaveSchema>;
export type WorkflowTemplateCreateInput = z.infer<typeof WorkflowTemplateCreateSchema>;
export type WorkflowSimulationInput = z.infer<typeof WorkflowSimulationSchema>;
