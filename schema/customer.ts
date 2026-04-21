import { z } from "zod";
import {
  CUSTOMER_SOURCE_VALUES,
  CUSTOMER_STATUS_VALUES,
} from "@gooes/domain";
import { PaginationQuerySchema } from "./request";

export const CustomerSchema = z.object({
  // id 通常是数据库自动生成的 UUID 或数字，这里假设是 UUID 字符串
  id: z.uuid("无效的 ID 格式").optional(),

  // name 允许为 null，且最少 1 个字符
  name: z.string().min(1, "名称不能为空").nullable().optional(),

  // phone 加入了中国大陆手机号正则校验
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, "手机号格式不正确")
    .nullable()
    .optional(),

  // owner_id 通常关联用户表的 UUID
  owner_id: z.string().uuid("无效的所有者 ID").nullable().optional(),

  // source 和 status 建议使用枚举（Enum）或者简单的字符串
  source: z.enum(CUSTOMER_SOURCE_VALUES, {
    message: "无效的客户来源",
  }).nullable().optional(),
  status: z.enum(CUSTOMER_STATUS_VALUES, {
    message: "无效的客户状态",
  }).nullable().optional(),

  // created_at 是 ISO 时间字符串格式
  created_at: z.iso.datetime().nullable().optional(),
});

// 导出类型供 TypeScript 使用

export const CreateCustomerSchema = CustomerSchema.extend({
  name: z.string().min(1, "创建时必须填写姓名"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "创建时必须填写正确的手机号"),
});

export const UpdateCustomerSchema = CustomerSchema.partial();

export type CustomerSchemaType = z.infer<typeof CustomerSchema>;
export type CreateCustomerSchemaType = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerSchemaType = z.infer<typeof UpdateCustomerSchema>;

export const CustomerListQuerySchema = PaginationQuerySchema.extend({
  status: z.enum(CUSTOMER_STATUS_VALUES, {
    message: "无效的客户状态",
  }).nullable().optional(),
  keyword: z.string().trim().optional(),
});

export type CustomerListQueryType = z.infer<typeof CustomerListQuerySchema>;

export const FollowUpSchema = z.object({
  // 主键 ID 通常由数据库生成，所以设为可选
  id: z.string().uuid().optional(),

  // 跟进内容：必填，且至少 2 个字，避免空话
  content: z.string().min(2, { message: "跟进内容不能为空" }),

  // 关联 ID：通常必填，但在某些特定草稿状态下可能为 null
  customer_id: z.string().uuid().nullable().optional(),
  employee_id: z.string().uuid().nullable().optional(),

  // 时间字段：
  // .nullable() 允许为 null
  // .optional() 允许在 Insert 对象中不传该 key
  next_follow_at: z.iso.datetime().nullable().optional(),
  created_at: z.string().datetime().nullable().optional(),
});

const FollowUpInsertSchema = FollowUpSchema.omit({
  id: true,
  created_at: true,
});
// 导出类型推导
export type FollowUpInsert = z.infer<typeof FollowUpInsertSchema>;
