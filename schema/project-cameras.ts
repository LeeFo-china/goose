import { z } from "zod";

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
  vendor: z.literal("ezviz").default("ezviz"),
  vendor_device_serial: z.string().trim().min(1, "设备序列号不能为空").max(80, "设备序列号过长"),
  channel_no: z.coerce.number().int("通道号必须是整数").min(1, "通道号必须大于 0").max(128, "通道号过大").default(1),
  can_view: z.boolean().default(true),
  can_control: z.boolean().default(false),
  capabilities: z.array(CameraCapabilitySchema).max(20, "摄像头能力过多").default(["live"]),
  cover_url: z.string().trim().url("封面地址格式不正确").nullable().optional(),
  sort_order: z.coerce.number().int("排序值必须是整数").min(0, "排序值不能小于 0").max(999999, "排序值过大").default(0),
  remark: z.string().trim().max(500, "备注过长").nullable().optional(),
  video_encrypted: z.boolean().default(false),
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
}).partial();

export const ProjectCameraPlayParamsBodySchema = z.object({
  stream: z.enum(["live"], {
    message: "暂只支持实时直播",
  }).default("live"),
}).default({ stream: "live" });

export type CreateProjectCameraInput = z.infer<typeof CreateProjectCameraSchema>;
export type UpdateProjectCameraInput = z.infer<typeof UpdateProjectCameraSchema>;
export type ProjectCameraPlayParamsInput = z.infer<
  typeof ProjectCameraPlayParamsBodySchema
>;
