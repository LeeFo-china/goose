import { z } from "zod";
import {
  EMPLOYEE_ROLE_VALUES,
  EMPLOYEE_STATUS_VALUES,
} from "@gooes/domain";
<<<<<<< HEAD

const optionalNullableDateTime = (message: string) =>
  z.preprocess((value) => {
    if (value == null) {
      return null;
    }

    if (typeof value === "string" && value.trim() === "") {
      return null;
    }

    return value;
  }, z.iso.datetime({
    message,
    offset: true,
  }).nullable().optional());
=======
>>>>>>> refactor/project-create

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
  // 职位 ID：关联外键，校验 UUID
  post_id: z.string().uuid("无效的职位 ID").nullable().optional(),
  // ✅ 修正为对象传参
  avatar: z.url({ message: "头像地址格式不正确" }).nullable(),

  // 新建员工时允许不传；传空字符串时按 null 处理
  last_login_time: optionalNullableDateTime(
    "登录时间必须是有效的 ISO 8601 格式",
  ),

  // 角色：建议使用枚举，防止乱填
  role: z
    .enum(EMPLOYEE_ROLE_VALUES, {
      message: "请选择有效的员工角色",
    })
    .default("employee"),

  // 状态
<<<<<<< HEAD
  status: z.enum(EMPLOYEE_STATUS_VALUES, {
    message: "请选择有效的员工状态",
  }).default("active"),
=======
  status: z.enum(EMPLOYEE_STATUS_VALUES).default("active"),
>>>>>>> refactor/project-create

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
