import { z } from "zod";
import {
  CUSTOMER_SERVICE_TICKET_ACTION_VALUES,
  CUSTOMER_SERVICE_TICKET_CATEGORY_VALUES,
  CUSTOMER_SERVICE_TICKET_PRIORITY_VALUES,
  CUSTOMER_SERVICE_TICKET_STATUS_VALUES,
} from "@gooes/domain";
import { PaginationQuerySchema } from "@/schema/request";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value === "string") {
      const normalized = value.trim();
      if (
        normalized === "" ||
        normalized === "undefined" ||
        normalized === "null"
      ) {
        return undefined;
      }
      return normalized;
    }

    return value;
  }, schema.optional());
}

function normalizeOptionalText(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized === "" ? null : normalized;
  }
  return value;
}

const ImagePathSchema = z.string()
  .trim()
  .min(1, "图片路径不能为空")
  .max(1000, "图片路径过长")
  .refine((value) => !value.includes(".."), "图片路径不合法")
  .refine((value) => !value.startsWith("/"), "图片路径不合法")
  .refine((value) => !value.includes("\\"), "图片路径不合法");

export const CreateCustomerServiceTicketSchema = z.object({
  project_id: z.preprocess(
    normalizeOptionalText,
    z.uuid("无效的项目 ID").nullable().optional(),
  ),
  category: z.enum(CUSTOMER_SERVICE_TICKET_CATEGORY_VALUES, {
    message: "无效的问题分类",
  }),
  title: z.preprocess(
    normalizeOptionalText,
    z.string().max(100, "标题不能超过100字").nullable().optional(),
  ),
  content: z.string().trim().min(1, "问题描述不能为空").max(1000, "问题描述不能超过1000字"),
  images: z.array(ImagePathSchema).max(9, "图片最多上传9张").optional().default([]),
});

export const CustomerServiceTicketListQuerySchema = PaginationQuerySchema.extend({
  status: optionalQueryValue(z.enum(CUSTOMER_SERVICE_TICKET_STATUS_VALUES, {
    message: "无效的问题状态",
  })),
  category: optionalQueryValue(z.enum(CUSTOMER_SERVICE_TICKET_CATEGORY_VALUES, {
    message: "无效的问题分类",
  })),
  priority: optionalQueryValue(z.enum(CUSTOMER_SERVICE_TICKET_PRIORITY_VALUES, {
    message: "无效的优先级",
  })),
  assigned_employee_id: optionalQueryValue(z.uuid("无效的负责人 ID")),
  customer_id: optionalQueryValue(z.uuid("无效的客户 ID")),
  project_id: optionalQueryValue(z.uuid("无效的项目 ID")),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
});

export const CustomerServiceTicketParamsSchema = z.object({
  id: z.uuid("无效的客服问题 ID"),
});

export const AssignCustomerServiceTicketSchema = z.object({
  assigned_employee_id: z.preprocess(
    normalizeOptionalText,
    z.uuid("无效的负责人 ID").nullable(),
  ),
});

export const CustomerServiceTicketActionSchema = z.object({
  action: z.enum(CUSTOMER_SERVICE_TICKET_ACTION_VALUES, {
    message: "无效的客服问题动作",
  }),
  content: z.preprocess(
    normalizeOptionalText,
    z.string().max(1000, "处理内容不能超过1000字").nullable().optional(),
  ),
  images: z.array(ImagePathSchema).max(9, "图片最多上传9张").optional().default([]),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type CreateCustomerServiceTicketInput = z.infer<
  typeof CreateCustomerServiceTicketSchema
>;
export type CustomerServiceTicketListQuery = z.infer<
  typeof CustomerServiceTicketListQuerySchema
>;
export type AssignCustomerServiceTicketInput = z.infer<
  typeof AssignCustomerServiceTicketSchema
>;
export type CustomerServiceTicketActionInput = z.infer<
  typeof CustomerServiceTicketActionSchema
>;
