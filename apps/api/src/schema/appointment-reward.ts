import { z } from "zod";

export const CustomerAppointmentRewardProjectIdParamsSchema = z.object({
  projectId: z.uuid("无效的项目ID"),
});

export const CustomerAppointmentRewardSubmitSchema = z.object({
  appointment_name: z.string().trim().min(1, "预约联系人不能为空").max(50, "预约联系人过长"),
  appointment_phone: z.string().trim().min(1, "预约联系电话不能为空").max(30, "预约联系电话过长"),
  appointment_time: z.iso.datetime({ offset: true, local: true }),
});

export const EmployeeAppointmentRewardArriveSchema = z.object({
  remark: z.string().trim().max(200, "备注过长").nullable().optional(),
});

export const EmployeeAppointmentRewardClaimSchema = z.object({
  channel: z.enum(["store", "wechat", "phone"], {
    message: "无效的领奖渠道",
  }).default("store"),
  remark: z.string().trim().max(200, "备注过长").nullable().optional(),
});

export type CustomerAppointmentRewardProjectIdParams = z.infer<
  typeof CustomerAppointmentRewardProjectIdParamsSchema
>;
export type CustomerAppointmentRewardSubmitInput = z.infer<
  typeof CustomerAppointmentRewardSubmitSchema
>;
export type EmployeeAppointmentRewardArriveInput = z.infer<
  typeof EmployeeAppointmentRewardArriveSchema
>;
export type EmployeeAppointmentRewardClaimInput = z.infer<
  typeof EmployeeAppointmentRewardClaimSchema
>;
