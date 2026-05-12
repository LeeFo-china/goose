import { z } from "zod";
import { PROJECT_CAMERA_VENDOR_VALUES } from "@/schema/project-cameras";

const QueryBooleanSchema = z.preprocess((value) => {
  if (value === true || value === "true" || value === "1") return true;
  if (
    value === false ||
    value === "false" ||
    value === "0" ||
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return false;
  }

  return value;
}, z.boolean());

export const TenantDeviceStatusValues = ["online", "offline", "unknown"] as const;

export const TenantDeviceListQuerySchema = z.object({
  vendor: z.enum(PROJECT_CAMERA_VENDOR_VALUES, {
    message: "无效的设备厂商",
  }).optional(),
  status: z.enum(TenantDeviceStatusValues, {
    message: "无效的设备状态",
  }).optional(),
  keyword: z.string().trim().max(100, "关键词过长").optional(),
  only_unbound: QueryBooleanSchema.default(false),
  page: z.coerce.number().int("页码必须是整数").min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce
    .number()
    .int("每页数量必须是整数")
    .min(1, "每页数量必须大于 0")
    .max(100, "每页最多 100 条")
    .default(20),
});

export const PlatformTenantDeviceListQuerySchema = TenantDeviceListQuerySchema.extend({
  tenant_id: z.uuid("无效的租户 ID").optional(),
});

export const PlatformTencentDeviceListQuerySchema = z.object({
  status: z.enum(TenantDeviceStatusValues, {
    message: "无效的设备状态",
  }).optional(),
  keyword: z.string().trim().max(100, "关键词过长").optional(),
  page: z.coerce.number().int("页码必须是整数").min(1, "页码必须大于 0").default(1),
  pageSize: z.coerce
    .number()
    .int("每页数量必须是整数")
    .min(1, "每页数量必须大于 0")
    .max(100, "每页最多 100 条")
    .default(20),
});

export const TenantDeviceParamsSchema = z.object({
  id: z.uuid("无效的设备资产 ID"),
});

export const CreateTenantDeviceSchema = z.object({
  vendor: z.enum(PROJECT_CAMERA_VENDOR_VALUES, {
    message: "无效的设备厂商",
  }),
  vendor_device_serial: z.string().trim().min(1, "设备 ID 不能为空").max(160, "设备 ID 过长"),
  vendor_device_code: z.string().trim().max(100, "设备编码过长").nullable().optional(),
  vendor_device_name: z.string().trim().max(100, "设备名称过长").nullable().optional(),
  vendor_channel_id: z.string().trim().max(160, "通道 ID 过长").nullable().optional(),
  vendor_channel_code: z.string().trim().max(100, "通道编码过长").nullable().optional(),
  vendor_channel_name: z.string().trim().max(100, "通道名称过长").nullable().optional(),
  device_type: z.string().trim().max(50, "设备类型过长").nullable().optional(),
  source_project_id: z.uuid("无效的来源项目 ID"),
  status: z.enum(TenantDeviceStatusValues, {
    message: "无效的设备状态",
  }).default("unknown"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const UpdateTenantDeviceSchema = z.object({
  vendor_device_name: z.string().trim().max(100, "设备名称过长").nullable().optional(),
  vendor_channel_name: z.string().trim().max(100, "通道名称过长").nullable().optional(),
  device_type: z.string().trim().max(50, "设备类型过长").nullable().optional(),
  status: z.enum(TenantDeviceStatusValues, {
    message: "无效的设备状态",
  }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "请至少提供一个要更新的字段",
});

export type TenantDeviceListQueryInput = z.infer<typeof TenantDeviceListQuerySchema>;
export type PlatformTenantDeviceListQueryInput = z.infer<typeof PlatformTenantDeviceListQuerySchema>;
export type PlatformTencentDeviceListQueryInput = z.infer<typeof PlatformTencentDeviceListQuerySchema>;
export type CreateTenantDeviceInput = z.infer<typeof CreateTenantDeviceSchema>;
export type UpdateTenantDeviceInput = z.infer<typeof UpdateTenantDeviceSchema>;
export type TenantDeviceStatus = (typeof TenantDeviceStatusValues)[number];
