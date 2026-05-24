import { z } from "zod";
import {
  CUSTOMER_ORIGIN_VALUES,
  CUSTOMER_SOURCE_VALUES,
  CUSTOMER_STATUS_ACTION_VALUES,
  CUSTOMER_STATUS_VALUES,
} from "@gooes/domain";
import { PaginationQuerySchema } from "./request";

function optionalQueryValue<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (value == null) {
      return undefined;
    }

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
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized === "" ? null : normalized;
  }

  return value;
}

export const CustomerEmbeddedPropertySchema = z.preprocess((value) => {
  if (value == null) {
    return null;
  }

  return value;
}, z.object({
  community: z.preprocess(
    normalizeOptionalText,
    z.string().max(100, "名称过长").nullable().optional(),
  ),
  building_info: z.preprocess(
    normalizeOptionalText,
    z.string().max(200, "楼栋门牌过长").nullable().optional(),
  ),
  area: z.number().positive("面积必须大于0").nullable().or(z.literal(0)).optional(),
  layout: z.preprocess(
    normalizeOptionalText,
    z.string().max(100, "户型过长").nullable().optional(),
  ),
}).superRefine((input, ctx) => {
  const hasCommunity = Boolean(input.community);
  const hasOtherFields = Boolean(
    input.building_info ||
      input.layout ||
      input.area !== undefined && input.area !== null,
  );

  if (!hasCommunity && hasOtherFields) {
    ctx.addIssue({
      code: "custom",
      path: ["community"],
      message: "小区名称不能为空",
    });
  }
}).nullable());

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

  // avatar 保存平台存储 object key、历史 URL 或兼容路径
  avatar: z.preprocess(
    normalizeOptionalText,
    z.string().max(1000, "头像路径过长").nullable().optional(),
  ),

  // source 和 status 建议使用枚举（Enum）或者简单的字符串
  source: z.enum(CUSTOMER_SOURCE_VALUES, {
    message: "无效的客户来源",
  }).nullable().optional(),
  status: z.enum(CUSTOMER_STATUS_VALUES, {
    message: "无效的客户状态",
  }).nullable().optional(),
  douyin_screenshot_images: z.unknown().optional(),

  // created_at 是 ISO 时间字符串格式
  created_at: z.iso.datetime().nullable().optional(),
});

// 导出类型供 TypeScript 使用

export const CreateCustomerSchema = CustomerSchema.extend({
  name: z.string().min(1, "创建时必须填写姓名"),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "创建时必须填写正确的手机号"),
  property: CustomerEmbeddedPropertySchema.optional(),
});

export const UpdateCustomerSchema = CustomerSchema.partial().extend({
  property: CustomerEmbeddedPropertySchema.optional(),
});

export const CustomerStatusTransitionSchema = z.object({
  action: z.enum(CUSTOMER_STATUS_ACTION_VALUES, {
    message: "无效的客户状态动作",
  }),
  reason: z.preprocess(
    normalizeOptionalText,
    z.string().max(500, "状态变更原因过长").nullable().optional(),
  ),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const CustomerStatusTransitionListQuerySchema = PaginationQuerySchema;

export type CustomerSchemaType = z.infer<typeof CustomerSchema>;
export type CreateCustomerSchemaType = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerSchemaType = z.infer<typeof UpdateCustomerSchema>;
export type CustomerStatusTransitionInput = z.infer<
  typeof CustomerStatusTransitionSchema
>;
export type CustomerStatusTransitionListQuery = z.infer<
  typeof CustomerStatusTransitionListQuerySchema
>;

export const CustomerListQuerySchema = PaginationQuerySchema.extend({
  status: optionalQueryValue(z.enum(CUSTOMER_STATUS_VALUES, {
    message: "无效的客户状态",
  })),
  source: optionalQueryValue(z.enum(CUSTOMER_SOURCE_VALUES, {
    message: "无效的客户来源",
  })),
  customer_origin: optionalQueryValue(z.enum(CUSTOMER_ORIGIN_VALUES, {
    message: "无效的客户创建渠道",
  })),
  keyword: optionalQueryValue(z.string().trim().max(100, "关键词过长")),
  follow: optionalQueryValue(z.enum(["due", "overdue"], {
    message: "无效的跟进筛选",
  })),
  work_scope: optionalQueryValue(z.enum(["all", "today"], {
    message: "work_scope must be one of: all, today",
  })),
  mode: optionalQueryValue(z.enum(["home", "compact"], {
    message: "mode must be one of: home, compact",
  })),
});

export type CustomerListQueryType = z.infer<typeof CustomerListQuerySchema>;

export const BatchAssignCustomerOwnerModeSchema = z.enum(
  ["only_unassigned", "overwrite"],
  {
    message: "无效的批量分配模式",
  },
);

export const BatchAssignCustomerOwnerSchema = z.object({
  customer_ids: z
    .array(z.uuid("无效的客户 ID"))
    .min(1, "至少选择 1 条客户")
    .max(100, "单次最多分配 100 条客户"),
  owner_id: z.uuid("无效的目标负责人 ID"),
  mode: BatchAssignCustomerOwnerModeSchema,
}).superRefine((value, ctx) => {
  const uniqueIds = new Set(value.customer_ids);
  if (uniqueIds.size !== value.customer_ids.length) {
    ctx.addIssue({
      code: "custom",
      path: ["customer_ids"],
      message: "客户 ID 不能重复",
    });
  }
});

export type BatchAssignCustomerOwnerInput = z.infer<
  typeof BatchAssignCustomerOwnerSchema
>;

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
