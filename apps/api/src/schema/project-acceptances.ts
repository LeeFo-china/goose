import { z } from "zod";
import {
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
  stage_code: z.enum(PROJECT_LOG_STAGE_CODE_VALUES, {
    message: "无效的施工阶段",
  }).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const CreateProjectAcceptanceSchema = z.object({
  project_id: z.uuid("请选择有效的项目"),
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
