import { z } from "zod";
import {
  PROPERTY_LOCATION_SOURCE_VALUES,
  PROPERTY_LOCATION_STATUS_VALUES,
} from "@gooes/domain";
import { PaginationQuerySchema } from "./request";

const nullableText = (max: number, message: string) =>
  z.string().trim().max(max, message).nullable();

/**
 * Property (房产/工地地址) 校验 Schema
 */
export const PropertySchema = z.object({
  // UUID 通常由后端生成，但在前端更新或校验时需要符合格式
  id: z.string().uuid("无效的房产 ID 格式"),

  // 关联客户 ID，允许为空
  customer_id: z.string().uuid("无效的客户 ID 格式").nullable(),

  // 小区/社区名称：必填，不能为空字符串
  community: z.string().min(1, "小区名称不能为空").max(100, "名称过长"),

  // 楼栋信息：如“12栋1单元1203”，允许为空
  building_info: z.string().nullable(),

  // 面积：装饰行业面积通常为正数
  area: z.number().positive("面积必须大于0").nullable().or(z.literal(0)), // 兼容可能存在的 0

  // 户型：如“三室两厅”，允许为空
  layout: z.string().nullable(),

  // 经纬度：地理坐标标准范围校验
  latitude: z.number().min(-90).max(90, "纬度范围不合法").nullable(),
  longitude: z.number().min(-180).max(180, "经度范围不合法").nullable(),

  province: nullableText(50, "省份不能超过 50 个字符"),
  city: nullableText(50, "城市不能超过 50 个字符"),
  district: nullableText(50, "区县不能超过 50 个字符"),
  adcode: nullableText(20, "行政区划代码不能超过 20 个字符"),
  location_status: z.enum(PROPERTY_LOCATION_STATUS_VALUES).default("pending"),
  location_source: z.enum(PROPERTY_LOCATION_SOURCE_VALUES).nullable(),
  location_confidence: z.number().min(0).max(1).nullable(),
  location_confirmed_at: z.iso.datetime().nullable(),

  // 创建时间：ISO 字符串格式
  created_at: z.string().datetime().nullable(),
});

// 导出类型
export type PropertySchemaType = z.infer<typeof PropertySchema>;

// 创建房产时的校验：忽略 id 和 created_at
export const CreatePropertySchema = PropertySchema.omit({
  id: true,
  created_at: true,
});
export type CreatePropertyInput = z.infer<typeof CreatePropertySchema>;

// 更新房产时的校验：所有字段设为可选，但 id 必须存在
export const UpdatePropertySchema = PropertySchema.partial().extend({
  id: z.uuid(),
});
export type UpdatePropertyInput = z.infer<typeof UpdatePropertySchema>;

export const PropertyListQuerySchema = PaginationQuerySchema.extend({
  customer_id: z.uuid("无效的客户 ID 格式").optional(),
});

export type PropertyListQuery = z.infer<typeof PropertyListQuerySchema>;

export const CustomerPropertyParamsSchema = z.object({
  customerId: z.uuid("无效的客户 ID 格式"),
});

export const CustomerPropertyDetailParamsSchema = z.object({
  customerId: z.uuid("无效的客户 ID 格式"),
  propertyId: z.uuid("无效的房产 ID 格式"),
});

export const CreateCustomerPropertySchema = CreatePropertySchema.omit({
  customer_id: true,
  location_status: true,
  location_source: true,
  location_confidence: true,
  location_confirmed_at: true,
}).extend({
  set_as_primary: z.boolean().default(false),
});

export const UpdateCustomerPropertySchema = CreatePropertySchema.omit({
  customer_id: true,
  location_status: true,
  location_source: true,
  location_confidence: true,
  location_confirmed_at: true,
}).partial();

export type CreateCustomerPropertyInput = z.infer<
  typeof CreateCustomerPropertySchema
>;
export type UpdateCustomerPropertyInput = z.infer<
  typeof UpdateCustomerPropertySchema
>;
