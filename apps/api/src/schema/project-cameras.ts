import { z } from "zod";

export const PROJECT_CAMERA_VENDOR_VALUES = [
  "ezviz",
  "tencent_iotvideo_industry",
] as const;

export const PROJECT_CAMERA_PLAY_PROTOCOL_VALUES = [
  "flv",
  "rtmp",
  "hls",
] as const;

const CameraCapabilitySchema = z.enum(["live", "ptz", "zoom", "talk", "playback"], {
  message: "无效的摄像头能力",
});

export const ProjectCameraParamsSchema = z.object({
  project_id: z.uuid("无效的项目 ID"),
});

export const ProjectCameraDetailParamsSchema = z.object({
  project_id: z.uuid("无效的项目 ID"),
  camera_id: z.uuid("无效的摄像头 ID"),
});

export const CreateProjectCameraSchema = z.object({
  name: z.string().trim().min(1, "摄像头名称不能为空").max(80, "摄像头名称过长"),
  position: z.string().trim().max(80, "摄像头位置过长").nullable().optional(),
  vendor: z.enum(PROJECT_CAMERA_VENDOR_VALUES, {
    message: "无效的摄像头厂商",
  }).default("ezviz"),
  vendor_device_serial: z.string().trim().min(1, "设备 ID 不能为空").max(120, "设备 ID 过长"),
  vendor_channel_id: z.string().trim().min(1, "通道 ID 不能为空").max(120, "通道 ID 过长").nullable().optional(),
  vendor_device_code: z.string().trim().max(80, "设备编码过长").nullable().optional(),
  vendor_channel_code: z.string().trim().max(80, "通道编码过长").nullable().optional(),
  channel_no: z.coerce.number().int("通道号必须是整数").min(1, "通道号必须大于 0").max(128, "通道号过大").default(1),
  can_view: z.boolean().default(true),
  can_control: z.boolean().default(false),
  capabilities: z.array(CameraCapabilitySchema).max(20, "摄像头能力过多").default(["live"]),
  cover_url: z.string().trim().url("封面地址格式不正确").nullable().optional(),
  sort_order: z.coerce.number().int("排序值必须是整数").min(0, "排序值不能小于 0").max(999999, "排序值过大").default(0),
  remark: z.string().trim().max(500, "备注过长").nullable().optional(),
  video_encrypted: z.boolean().default(false),
  play_protocol: z.enum(PROJECT_CAMERA_PLAY_PROTOCOL_VALUES, {
    message: "无效的播放协议",
  }).default("flv"),
}).superRefine((value, ctx) => {
  if (value.vendor === "tencent_iotvideo_industry" && !value.vendor_channel_id) {
    ctx.addIssue({
      code: "custom",
      path: ["vendor_channel_id"],
      message: "腾讯云摄像头必须填写通道 ID",
    });
  }
});

export const UpdateProjectCameraSchema = CreateProjectCameraSchema.pick({
  name: true,
  position: true,
  can_view: true,
  can_control: true,
  capabilities: true,
  cover_url: true,
  sort_order: true,
  remark: true,
  video_encrypted: true,
  play_protocol: true,
}).partial();

export const ProjectCameraPlayParamsBodySchema = z.object({
  stream: z.enum(["live"], {
    message: "暂只支持实时直播",
  }).default("live"),
}).default({ stream: "live" });

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

export const ProjectCameraEzvizDevicesQuerySchema = z.object({
  only_unbound: QueryBooleanSchema.default(false),
});

export const ProjectCameraTencentDevicesQuerySchema = z.object({
  only_unbound: QueryBooleanSchema.default(false),
  keyword: z.string().trim().max(100, "关键词过长").optional(),
});

export type CreateProjectCameraInput = z.infer<typeof CreateProjectCameraSchema>;
export type UpdateProjectCameraInput = z.infer<typeof UpdateProjectCameraSchema>;
export type ProjectCameraPlayParamsInput = z.infer<
  typeof ProjectCameraPlayParamsBodySchema
>;
export type ProjectCameraEzvizDevicesQueryInput = z.infer<
  typeof ProjectCameraEzvizDevicesQuerySchema
>;
export type ProjectCameraTencentDevicesQueryInput = z.infer<
  typeof ProjectCameraTencentDevicesQuerySchema
>;
export type ProjectCameraVendor = (typeof PROJECT_CAMERA_VENDOR_VALUES)[number];
export type ProjectCameraPlayProtocol =
  (typeof PROJECT_CAMERA_PLAY_PROTOCOL_VALUES)[number];
