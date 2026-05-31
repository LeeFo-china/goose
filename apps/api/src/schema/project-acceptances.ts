import { z } from "zod";
import {
  PROJECT_ACCEPTANCE_TYPE_VALUES,
  PROJECT_ACCEPTANCE_ITEM_RESULT_VALUES,
  PROJECT_ACCEPTANCE_STATUS_VALUES,
  PROJECT_LOG_STAGE_CODE_VALUES,
} from "@gooes/domain";
import { PaginationQuerySchema } from "@/schema/request";

const ImageListSchema = z.array(z.string().trim().min(1, "图片路径不能为空"))
  .max(9, "最多上传9张图片")
  .default([]);

const ReferencedImageListSchema = z.array(
  z.string().trim().min(1, "引用图片不能为空"),
)
  .max(9, "最多引用9张图片")
  .default([]);

export const ProjectAcceptanceListQuerySchema = PaginationQuerySchema.extend({
  project_id: z.uuid("无效的项目ID").optional(),
  acceptance_type: z.enum(PROJECT_ACCEPTANCE_TYPE_VALUES, {
    message: "无效的验收类型",
  }).optional(),
  status: z.enum(PROJECT_ACCEPTANCE_STATUS_VALUES, {
    message: "无效的验收状态",
  }).optional(),
  stage_code: z.enum(PROJECT_LOG_STAGE_CODE_VALUES, {
    message: "无效的施工阶段",
  }).optional(),
  reviewer_id: z.uuid("无效的复核人ID").optional(),
  customer_id: z.uuid("无效的客户ID").optional(),
});

export const ProjectAcceptanceTemplateListQuerySchema = z.object({
  acceptance_type: z.enum(PROJECT_ACCEPTANCE_TYPE_VALUES, {
    message: "无效的验收类型",
  }).optional(),
  stage_code: z.enum(PROJECT_LOG_STAGE_CODE_VALUES, {
    message: "无效的施工阶段",
  }).optional(),
  status: z.preprocess((value) => {
    if (value === "enabled") return "active";
    if (value === "disabled") return "inactive";
    return value;
  }, z.enum(["active", "inactive"]).optional()),
});

const ProjectAcceptanceTemplateItemUpdateSchema = z.object({
  id: z.uuid("无效的模板项 ID").optional(),
  category: z.string().trim().max(100, "分类不能超过100个字符").nullable()
    .optional(),
  title: z.string().trim().min(1, "检查项标题不能为空").max(
    200,
    "检查项标题不能超过200个字符",
  ),
  standard: z.string().trim().min(1, "验收标准不能为空").max(
    1000,
    "验收标准不能超过1000个字符",
  ),
  required: z.boolean().default(true),
  allow_not_applicable: z.boolean().default(false),
  photo_required: z.boolean().default(false),
  photo_min_count: z.coerce.number().int().min(0).max(9).default(0),
  photo_max_count: z.coerce.number().int().min(1).max(9).default(9),
  remark_required_on_fail: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).default(0),
}).superRefine((value, ctx) => {
  if (value.photo_min_count > value.photo_max_count) {
    ctx.addIssue({
      code: "custom",
      message: "最少照片数不能大于最多照片数",
      path: ["photo_min_count"],
    });
  }
});

const ProjectAcceptanceTemplateSectionUpdateSchema = z.object({
  id: z.uuid("无效的模板分组 ID").optional(),
  title: z.string().trim().min(1, "分组名称不能为空").max(
    100,
    "分组名称不能超过100个字符",
  ),
  description: z.string().trim().max(500, "分组说明不能超过500个字符")
    .nullable()
    .optional(),
  sort_order: z.coerce.number().int().min(0).default(0),
  items: z.array(ProjectAcceptanceTemplateItemUpdateSchema)
    .min(1, "每个分组至少需要一个检查项")
    .max(80, "单个分组最多80个检查项"),
});

export const UpdateProjectAcceptanceTemplateSchema = z.object({
  name: z.string().trim().min(1, "模板名称不能为空").max(
    100,
    "模板名称不能超过100个字符",
  ),
  description: z.string().trim().max(1000, "模板说明不能超过1000个字符")
    .nullable()
    .optional(),
  status: z.enum(["active", "inactive"]).optional(),
  sections: z.array(ProjectAcceptanceTemplateSectionUpdateSchema)
    .min(1, "至少需要一个模板分组")
    .max(20, "最多20个模板分组"),
});

export const ProjectAcceptanceCreateQuerySchema = z.object({
  response: z.enum(["summary", "detail"], {
    message: "response must be one of: summary, detail",
  }).optional().default("summary"),
});

export const CreateProjectAcceptanceSchema = z.object({
  project_id: z.uuid("请选择有效的项目"),
  acceptance_type: z.enum(PROJECT_ACCEPTANCE_TYPE_VALUES, {
    message: "无效的验收类型",
  }).optional().default("stage"),
  stage_code: z.enum(PROJECT_LOG_STAGE_CODE_VALUES, {
    message: "无效的施工阶段",
  }),
  template_id: z.uuid("无效的验收模板ID").optional(),
  reviewer_id: z.uuid("无效的复核人ID").nullable().optional(),
  summary: z.string().trim().max(1000, "验收说明不能超过1000个字符")
    .nullable()
    .optional(),
});

export const ProjectAcceptanceItemPatchSchema = z.object({
  id: z.uuid("无效的验收项ID"),
  result: z.enum(PROJECT_ACCEPTANCE_ITEM_RESULT_VALUES, {
    message: "无效的验收结果",
  }).nullable().optional(),
  remark: z.string().trim().max(1000, "备注不能超过1000个字符").nullable()
    .optional(),
  images: ImageListSchema.optional(),
  rectification_remark: z.string().trim()
    .max(1000, "整改说明不能超过1000个字符")
    .nullable()
    .optional(),
  rectification_images: ImageListSchema.optional(),
});

export const UpdateProjectAcceptanceSchema = z.object({
  summary: z.string().trim().max(1000, "验收说明不能超过1000个字符")
    .nullable()
    .optional(),
  reviewer_id: z.uuid("无效的复核人ID").nullable().optional(),
  items: z.array(ProjectAcceptanceItemPatchSchema).optional(),
});

export const SubmitProjectAcceptanceSchema = UpdateProjectAcceptanceSchema;

export const ApproveProjectAcceptanceSchema = z.object({
  comment: z.string().trim().max(1000, "复核说明不能超过1000个字符")
    .nullable()
    .optional(),
});

export const RejectProjectAcceptanceSchema = z.object({
  comment: z.string().trim().min(1, "驳回原因不能为空").max(
    1000,
    "驳回原因不能超过1000个字符",
  ),
});

export const CustomerConfirmProjectAcceptanceSchema = z.object({
  comment: z.string().trim().max(1000, "确认说明不能超过1000个字符")
    .nullable()
    .optional(),
  ticket: z.string().trim().min(16, "访问票据无效").optional(),
  project_id: z.uuid("无效的项目 ID").optional(),
});

export const CustomerDisputeProjectAcceptanceSchema = z.object({
  comment: z.string().trim().min(1, "疑问说明不能为空").max(
    1000,
    "疑问说明不能超过1000个字符",
  ),
  images: ImageListSchema.optional(),
  referenced_image_ids: ReferencedImageListSchema.optional(),
  referenced_image_paths: ReferencedImageListSchema.optional(),
  ticket: z.string().trim().min(16, "访问票据无效").optional(),
  project_id: z.uuid("无效的项目 ID").optional(),
});

export const RectifyProjectAcceptanceSchema = z.object({
  comment: z.string().trim().min(1, "整改说明不能为空").max(
    500,
    "整改说明不能超过500个字符",
  ),
  images: ImageListSchema.optional().default([]),
  referenced_action_id: z.uuid("无效的关联操作 ID").nullable().optional(),
  referenced_item_ids: z.array(z.uuid("无效的验收项 ID")).max(
    50,
    "最多关联50个验收项",
  ).optional().default([]),
  referenced_image_ids: ReferencedImageListSchema.optional().default([]),
  referenced_image_paths: ReferencedImageListSchema.optional().default([]),
});

export const CancelProjectAcceptanceSchema = z.object({
  comment: z.string().trim().max(1000, "作废说明不能超过1000个字符")
    .nullable()
    .optional(),
});

export const NotifyProjectAcceptanceCustomerSchema = z.object({
  scene: z.enum(["customer_review"]).default("customer_review"),
  force: z.boolean().default(false),
});

export const VerifyProjectAcceptanceOpenTicketSchema = z.object({
  ticket: z.string().trim().min(16, "访问票据无效"),
  acceptance_id: z.uuid("无效的验收单 ID"),
  project_id: z.uuid("无效的项目 ID"),
});

export const CustomerProjectAcceptanceOpenTicketQuerySchema = z.object({
  ticket: z.string().trim().min(16, "访问票据无效").optional(),
  project_id: z.uuid("无效的项目 ID").optional(),
});

export type ProjectAcceptanceListQuery = z.infer<
  typeof ProjectAcceptanceListQuerySchema
>;
export type ProjectAcceptanceTemplateListQuery = z.infer<
  typeof ProjectAcceptanceTemplateListQuerySchema
>;
export type UpdateProjectAcceptanceTemplateInput = z.infer<
  typeof UpdateProjectAcceptanceTemplateSchema
>;
export type ProjectAcceptanceCreateQuery = z.infer<
  typeof ProjectAcceptanceCreateQuerySchema
>;
export type CreateProjectAcceptanceInput = z.infer<
  typeof CreateProjectAcceptanceSchema
>;
export type UpdateProjectAcceptanceInput = z.infer<
  typeof UpdateProjectAcceptanceSchema
>;
export type SubmitProjectAcceptanceInput = z.infer<
  typeof SubmitProjectAcceptanceSchema
>;
export type ApproveProjectAcceptanceInput = z.infer<
  typeof ApproveProjectAcceptanceSchema
>;
export type RejectProjectAcceptanceInput = z.infer<
  typeof RejectProjectAcceptanceSchema
>;
export type CustomerConfirmProjectAcceptanceInput = z.infer<
  typeof CustomerConfirmProjectAcceptanceSchema
>;
export type CustomerDisputeProjectAcceptanceInput = z.infer<
  typeof CustomerDisputeProjectAcceptanceSchema
>;
export type RectifyProjectAcceptanceInput = z.infer<
  typeof RectifyProjectAcceptanceSchema
>;
export type CancelProjectAcceptanceInput = z.infer<
  typeof CancelProjectAcceptanceSchema
>;
export type NotifyProjectAcceptanceCustomerInput = z.infer<
  typeof NotifyProjectAcceptanceCustomerSchema
>;
export type VerifyProjectAcceptanceOpenTicketInput = z.infer<
  typeof VerifyProjectAcceptanceOpenTicketSchema
>;
export type CustomerProjectAcceptanceOpenTicketQuery = z.infer<
  typeof CustomerProjectAcceptanceOpenTicketQuerySchema
>;
