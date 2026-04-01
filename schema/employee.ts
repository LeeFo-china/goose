import { z } from "zod";

/**
 * 基础员工 Schema
 * 对应数据库中的基本字段类型
 */
export const EmployeeBaseSchema = z.object({
  // ID 通常由数据库生成，校验 UUID 格式
  id: z.string().uuid("无效的员工 ID").optional(),

  // 姓名：必须填，至少 2 个字符
  name: z
    .string()
    .trim()
    .min(1, "员工姓名不能为空") // 拦截空字符串 ""
    .min(2, "姓名至少需要 2 个字符"),

  // 手机号：使用正则校验中国大陆手机号
  phone: z
    .string()
    .trim()
    .min(1, "手机号是必填项")
    .regex(/^1[3-9]\d{9}$/, "手机号格式不正确")
    .nullable(),

  // 部门 ID：关联外键，校验 UUID
  department_id: z.string().uuid("无效的部门 ID").nullable().optional(),
  // ✅ 修正为对象传参
  avatar: z.url({ message: "头像地址格式不正确" }).nullable(),

  // ✅ 修正为对象传参，并建议开启 offset 以适配 Supabase 的时区字符串
  last_login_time: z.iso
    .datetime({
      message: "登录时间必须是有效的 ISO 8601 格式",
      offset: true, // 允许 +08:00 这种时区偏移格式
    })
    .nullable(),

  // 角色：建议使用枚举，防止乱填
  role: z
    .enum(["admin", "manager", "staff", "intern"], {
      message: "请选择有效的员工角色",
    })
    .default("staff"),

  // 状态
  status: z.enum(["active", "inactive", "suspended"]).default("active"),

  // 创建时间：只读，通常不从前端传入
  created_at: z.string().datetime().nullable().optional(),
});

/**
 * 创建员工时的校验 (POST)
 * 继承基础 Schema，确保必要字段存在
 */
export const CreateEmployeeSchema = EmployeeBaseSchema.omit({
  id: true,
  created_at: true,
});

/**
 * 更新员工时的校验 (PATCH)
 * 所有字段变为可选，但如果传了，必须符合格式
 */
export const UpdateEmployeeSchema = CreateEmployeeSchema.partial();

// 导出类型供 TypeScript 使用
export type EmployeeType = z.infer<typeof EmployeeBaseSchema>;
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
