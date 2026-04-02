import { z } from "zod";

export const WechatSchema = z.object({});

// 导出类型供 TypeScript 使用

export const UpdateWechatSchema = WechatSchema.partial();

export type WechatSchemaType = z.infer<typeof WechatSchema>;
export const CreateWechatSchema = z.object({});
export type UpdateWechatSchemaType = z.infer<typeof UpdateWechatSchema>;
