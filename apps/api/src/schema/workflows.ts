import {
  PAYMENT_TYPE_VALUES,
  WORKFLOW_BUSINESS_KIND_VALUES,
  WORKFLOW_CATEGORY_VALUES,
  WORKFLOW_DEFINITION_STATUS_VALUES,
  WORKFLOW_EDGE_CONDITION_OPERATOR_VALUES,
  WORKFLOW_INSTANCE_STATUS_VALUES,
  WORKFLOW_NODE_TYPE_VALUES,
  WORKFLOW_SUBJECT_TYPE_VALUES,
  PROJECT_CONSTRUCTION_STAGE_CODE_VALUES,
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

function textField(message: string) {
  return z.string({ error: message }).trim();
}

function numericField(message: string) {
  return z.coerce.number({ error: message });
}

function booleanField(message: string) {
  return z.boolean({ error: message });
}

export const WorkflowCategorySchema = z.enum(WORKFLOW_CATEGORY_VALUES, {
  message: "无效的流程分类",
});

export const WorkflowDefinitionStatusSchema = z.enum(
  WORKFLOW_DEFINITION_STATUS_VALUES,
  { message: "无效的流程状态" },
);

export const WorkflowInstanceStatusSchema = z.enum(
  WORKFLOW_INSTANCE_STATUS_VALUES,
  { message: "无效的流程实例状态" },
);

export const WorkflowSubjectTypeSchema = z.enum(
  WORKFLOW_SUBJECT_TYPE_VALUES,
  { message: "无效的流程对象类型" },
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
  keyword: optionalQueryValue(textField("关键词格式无效").max(100, "关键词过长")),
});

export const WorkflowDefinitionIdParamsSchema = z.object({
  id: z.uuid("无效的流程 ID"),
});

export const WorkflowGraphQuerySchema = z.object({
  version_id: optionalQueryValue(z.uuid("无效的流程版本 ID")),
});

export const WorkflowRuntimeInstanceIdParamsSchema = z.object({
  id: z.uuid("无效的流程 ID"),
  instanceId: z.uuid("无效的流程实例 ID"),
});

export const WorkflowDefinitionCreateSchema = z.object({
  workflow_key: optionalQueryValue(
    textField("流程编码格式无效").max(100, "流程编码过长"),
  ),
  name: textField("流程名称不能为空").min(1, "流程名称不能为空").max(100, "流程名称过长"),
  description: textField("流程说明格式无效").max(500, "流程说明过长").nullable().optional(),
  category: WorkflowCategorySchema,
});

export const WorkflowDefinitionUpdateSchema = z.object({
  name: textField("流程名称不能为空").min(1, "流程名称不能为空").max(100, "流程名称过长").optional(),
  description: textField("流程说明格式无效").max(500, "流程说明过长").nullable().optional(),
  status: WorkflowDefinitionStatusSchema.optional(),
});

export const WorkflowNodePositionSchema = z.object({
  x: numericField("节点 X 坐标必须为数字").finite("节点 X 坐标无效").default(0),
  y: numericField("节点 Y 坐标必须为数字").finite("节点 Y 坐标无效").default(0),
});

const BaseNodeConfigSchema = z.strictObject({
  required_permissions: z.array(
    textField("权限编码格式无效").min(1, "权限编码不能为空"),
    { error: "权限列表格式无效" },
  ).max(20, "权限数量不能超过 20").default([]),
  timeout_hours: numericField("超时时长必须为数字").int("超时时长必须为整数")
    .min(1, "超时时长必须大于 0")
    .max(720, "超时时长不能超过 720 小时")
    .nullable()
    .optional(),
  rollback_target_key: textField("回退目标节点格式无效").max(100, "回退目标节点编码过长").nullable().optional(),
  branch_node_position: WorkflowNodePositionSchema.nullable().optional(),
}, { error: "节点配置包含不支持的字段" });

const WORKFLOW_PAYMENT_COLLECTION_TYPE_VALUES = [
  "deposit",
  "stage_1",
  "stage_2",
  "stage_3",
  "add_on",
] as const satisfies ReadonlyArray<(typeof PAYMENT_TYPE_VALUES)[number]>;

const ApprovalNodeConfigSchema = BaseNodeConfigSchema.extend({
  assignee_rule: z.enum(["employee", "department", "role"], {
    message: "无效的审批人规则",
  }).default("role"),
  assignee_id: textField("审批人 ID 格式无效").max(100, "审批人 ID 过长").nullable().optional(),
  amount_threshold: numericField("金额阈值必须为数字").nonnegative("金额阈值不能为负数").nullable().optional(),
  approve_mode: z.enum(["any", "all"], { message: "无效的审批方式" }).default("any"),
  reject_target_key: textField("驳回目标节点格式无效").max(100, "驳回目标节点编码过长").nullable().optional(),
});

const ProcedureNodeConfigSchema = BaseNodeConfigSchema.extend({
  stage_key: z.enum(PROJECT_CONSTRUCTION_STAGE_CODE_VALUES, {
    message: "工序类型必须是拆改、水电、瓦工、木工、油工或安装",
  }),
  work_instructions: textField("作业说明格式无效").max(1000, "作业说明过长").nullable().optional(),
  require_log: booleanField("是否要求日志格式无效").default(false),
  min_image_count: numericField("最少图片数量必须为数字")
    .int("最少图片数量必须为整数")
    .min(0, "最少图片数量不能为负数")
    .max(20, "最少图片数量不能超过 20")
    .default(0),
  trigger_acceptance: booleanField("是否触发验收格式无效").default(false),
  customer_visible: booleanField("是否客户可见格式无效").default(false),
});

const PaymentCollectionNodeConfigSchema = BaseNodeConfigSchema.extend({
  finance_type: z.enum(["payment_collection"], {
    message: "无效的财务节点类型",
  }).optional(),
  payment_type: z.enum(WORKFLOW_PAYMENT_COLLECTION_TYPE_VALUES, {
    message: "请选择有效的收款类型",
  }).default("deposit"),
  requirement_mode: z.enum(["any_confirmed", "signed_amount_percentage"], {
    message: "请选择有效的收款放行规则",
  }).default("any_confirmed"),
  required_percentage: numericField("签约金额比例必须为数字")
    .positive("签约金额比例必须大于 0")
    .max(100, "签约金额比例不能超过 100")
    .nullable()
    .optional(),
  min_amount: numericField("最低收款金额必须为数字")
    .nonnegative("最低收款金额不能为负数")
    .nullable()
    .optional(),
  block_message: textField("阻塞提示格式无效")
    .max(200, "阻塞提示不能超过 200 字")
    .nullable()
    .optional(),
  finance_reviewer_employee_id: z.uuid("无效的财务审核人 ID").nullable().optional(),
});

const NotificationNodeConfigSchema = BaseNodeConfigSchema.extend({
  channels: z.array(
    z.enum(["mini_program", "sms", "todo"], { message: "无效的通知渠道" }),
    { error: "通知渠道格式无效" },
  ).min(1, "至少选择一个通知渠道").max(3, "通知渠道不能超过 3 个"),
  recipient_rule: z.enum(["owner", "assignee", "customer", "role"], {
    message: "无效的通知对象",
  }),
  template: textField("通知模板不能为空").min(1, "通知模板不能为空").max(500, "通知模板过长"),
});

export const WorkflowNodeConfigSchema = z.union([
  BaseNodeConfigSchema,
  ApprovalNodeConfigSchema,
  ProcedureNodeConfigSchema,
  PaymentCollectionNodeConfigSchema,
  NotificationNodeConfigSchema,
], { error: "无效的节点配置" });

export const WorkflowNodeInputSchema = z.object({
  id: z.uuid("无效的节点 ID").optional(),
  node_key: textField("节点编码不能为空").min(1, "节点编码不能为空").max(100, "节点编码过长"),
  node_type: WorkflowNodeTypeSchema,
  business_kind: WorkflowBusinessKindSchema.nullable().optional(),
  title: textField("节点标题不能为空").min(1, "节点标题不能为空").max(100, "节点标题过长"),
  description: textField("节点说明格式无效").max(500, "节点说明过长").nullable().optional(),
  position: WorkflowNodePositionSchema.default({ x: 0, y: 0 }),
  config: WorkflowNodeConfigSchema.prefault({}),
  sort_order: numericField("节点排序必须为数字")
    .int("节点排序必须为整数")
    .min(0, "节点排序不能为负数")
    .max(100000, "节点排序不能超过 100000")
    .default(100),
});

export const WorkflowEdgeConditionSchema = z.object({
  operator: WorkflowEdgeConditionOperatorSchema.default("always"),
  field: textField("条件字段格式无效").max(100, "条件字段过长").nullable().optional(),
  value: z.union([
    z.string({ error: "条件值格式无效" }),
    z.number({ error: "条件值格式无效" }),
    z.boolean({ error: "条件值格式无效" }),
    z.array(z.string({ error: "条件值格式无效" }), { error: "条件值格式无效" }),
  ], { error: "条件值格式无效" }).nullable().optional(),
});

export const WorkflowEdgeInputSchema = z.object({
  id: z.uuid("无效的连线 ID").optional(),
  source_node_key: textField("来源节点不能为空").min(1, "来源节点不能为空").max(100, "来源节点编码过长"),
  target_node_key: textField("目标节点不能为空").min(1, "目标节点不能为空").max(100, "目标节点编码过长"),
  label: textField("连线标签格式无效").max(100, "连线标签过长").nullable().optional(),
  condition: WorkflowEdgeConditionSchema.default({ operator: "always" }),
  priority: numericField("连线优先级必须为数字")
    .int("连线优先级必须为整数")
    .min(0, "连线优先级不能为负数")
    .max(100000, "连线优先级不能超过 100000")
    .default(100),
});

export const WorkflowGraphSaveSchema = z.object({
  nodes: z.array(WorkflowNodeInputSchema, { error: "节点列表格式无效" }).max(200, "节点数量不能超过 200"),
  edges: z.array(WorkflowEdgeInputSchema, { error: "连线列表格式无效" }).max(400, "连线数量不能超过 400"),
});

export const WorkflowTemplateCreateSchema = z.object({
  template_key: z.enum(["customer_main", "sales_main", "construction_main", "procedure_standard", "expense_approval"], {
    message: "无效的流程模板",
  }),
  name: textField("流程名称不能为空").min(1, "流程名称不能为空").max(100, "流程名称过长").optional(),
});

export const WorkflowSimulationSchema = z.object({
  context: z.object({}, { error: "上下文必须是对象" }).catchall(z.unknown()).default({}),
});

export const WorkflowRuntimeInstanceListQuerySchema = PaginationQuerySchema.extend({
  status: optionalQueryValue(WorkflowInstanceStatusSchema),
  subject_type: optionalQueryValue(WorkflowSubjectTypeSchema),
  subject_id: optionalQueryValue(textField("流程对象 ID 格式无效").max(200, "流程对象 ID 过长")),
});

export const WorkflowRuntimeInstanceStartSchema = z.object({
  subject_type: WorkflowSubjectTypeSchema.default("manual"),
  subject_id: textField("流程对象 ID 不能为空").min(1, "流程对象 ID 不能为空").max(200, "流程对象 ID 过长"),
  context: z.object({}, { error: "上下文必须是对象" }).catchall(z.unknown()).default({}),
});

export const WorkflowRuntimeCompleteNodeSchema = z.object({
  node_key: textField("节点编码不能为空").min(1, "节点编码不能为空").max(100, "节点编码过长"),
  action: textField("操作不能为空").min(1, "操作不能为空").max(100, "操作过长").default("complete"),
  output: z.object({}, { error: "节点输出必须是对象" }).catchall(z.unknown()).default({}),
});

export type WorkflowListQuery = z.infer<typeof WorkflowListQuerySchema>;
export type WorkflowDefinitionCreateInput = z.infer<typeof WorkflowDefinitionCreateSchema>;
export type WorkflowDefinitionUpdateInput = z.infer<typeof WorkflowDefinitionUpdateSchema>;
export type WorkflowGraphSaveInput = z.infer<typeof WorkflowGraphSaveSchema>;
export type WorkflowTemplateCreateInput = z.infer<typeof WorkflowTemplateCreateSchema>;
export type WorkflowSimulationInput = z.infer<typeof WorkflowSimulationSchema>;
export type WorkflowRuntimeInstanceListQuery = z.infer<typeof WorkflowRuntimeInstanceListQuerySchema>;
export type WorkflowRuntimeInstanceStartInput = z.infer<typeof WorkflowRuntimeInstanceStartSchema>;
export type WorkflowRuntimeCompleteNodeInput = z.infer<typeof WorkflowRuntimeCompleteNodeSchema>;
