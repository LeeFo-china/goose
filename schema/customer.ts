import { z } from "zod";

export const CustomerSchema = z.object({
  // id 通常是数据库自动生成的 UUID 或数字，这里假设是 UUID 字符串
  id: z.string().uuid("无效的 ID 格式").optional(),

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
  source: z.string().nullable().optional(),
  status: z.string().nullable().optional(),

  // created_at 是 ISO 时间字符串格式
  created_at: z.string().datetime().nullable().optional(),
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
