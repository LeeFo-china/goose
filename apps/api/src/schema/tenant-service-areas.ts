import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

const optionalText = (max: number, message: string) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string" && value.trim() === "") return undefined;
    return value;
  }, z.string().trim().max(max, message).optional());

const optionalCoordinate = (min: number, max: number, message: string) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return value;
  }, z.coerce.number(message).min(min, message).max(max, message).optional());

export const TenantServiceAreaStatusSchema = z.enum(["active", "inactive"]);

export const TenantServiceAreaIdParamsSchema = z.object({
  id: z.uuid("无效的服务区域 ID"),
});

export const TenantServiceAreaListQuerySchema = PaginationQuerySchema.extend({
  tenant_id: z.uuid("无效的租户 ID").optional(),
  status: TenantServiceAreaStatusSchema.optional(),
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
});

export const CreateTenantServiceAreaSchema = z.object({
  tenant_id: z.uuid("请选择租户"),
  province: optionalText(40, "省份不能超过 40 个字符"),
  city: z.string().trim().min(1, "城市不能为空").max(40, "城市不能超过 40 个字符"),
  district: optionalText(40, "区县不能超过 40 个字符"),
  adcode: optionalText(20, "行政区划代码不能超过 20 个字符"),
  center_latitude: optionalCoordinate(-90, 90, "纬度必须在 -90 到 90 之间"),
  center_longitude: optionalCoordinate(-180, 180, "经度必须在 -180 到 180 之间"),
  service_radius_km: z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return value;
  }, z.coerce.number("服务半径必须是数字").positive("服务半径必须大于 0").max(9999, "服务半径过大").optional()),
  priority: z.coerce.number("优先级必须是数字").int("优先级必须是整数").min(0).max(10000).default(100),
  status: TenantServiceAreaStatusSchema.default("active"),
});

export const UpdateTenantServiceAreaSchema = CreateTenantServiceAreaSchema.omit({
  tenant_id: true,
}).partial().refine((value) => Object.keys(value).length > 0, {
  message: "至少需要提交一个更新字段",
});

export const LocationBootstrapSchema = z.object({
  source: z.enum(["gps", "manual_city", "manual_address"]).default("gps"),
  latitude: optionalCoordinate(-90, 90, "纬度必须在 -90 到 90 之间"),
  longitude: optionalCoordinate(-180, 180, "经度必须在 -180 到 180 之间"),
  accuracy: z.preprocess((value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return value;
  }, z.coerce.number("定位精度必须是数字").min(0).optional()),
  province: optionalText(40, "省份不能超过 40 个字符"),
  city: optionalText(40, "城市不能超过 40 个字符"),
  district: optionalText(40, "区县不能超过 40 个字符"),
  adcode: optionalText(20, "行政区划代码不能超过 20 个字符"),
}).refine((value) => Boolean(value.city || value.adcode || (value.latitude != null && value.longitude != null)), {
  message: "需要提供城市、行政区划代码或经纬度",
});

export const LocationBootstrapConfirmSchema = z.object({
  context_id: z.uuid("无效的定位上下文 ID"),
  tenant_id: z.uuid("请选择装修公司"),
});

export type TenantServiceAreaStatus = z.infer<typeof TenantServiceAreaStatusSchema>;
export type TenantServiceAreaListQuery = z.infer<typeof TenantServiceAreaListQuerySchema>;
export type CreateTenantServiceAreaInput = z.infer<typeof CreateTenantServiceAreaSchema>;
export type UpdateTenantServiceAreaInput = z.infer<typeof UpdateTenantServiceAreaSchema>;
export type LocationBootstrapInput = z.infer<typeof LocationBootstrapSchema>;
export type LocationBootstrapConfirmInput = z.infer<typeof LocationBootstrapConfirmSchema>;
