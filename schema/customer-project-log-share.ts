import { z } from "zod";

export const CustomerProjectLogShareParamsSchema = z.object({
  projectId: z.uuid("无效的项目ID"),
  logId: z.uuid("无效的日志ID"),
});

export const CustomerProjectLogShareStyleSchema = z.enum(
  ["warm", "concise", "life"],
  {
    message: "无效的分享文案风格",
  },
);

export const CustomerProjectLogShareLengthSchema = z.enum(
  ["short", "medium"],
  {
    message: "无效的分享文案长度",
  },
);

export const GenerateCustomerProjectLogShareCopySchema = z.object({
  style: CustomerProjectLogShareStyleSchema.default("warm"),
  length: CustomerProjectLogShareLengthSchema.default("short"),
});

export const CustomerProjectLogShareRecordActionSchema = z.enum(
  ["generate_copy", "copy_text", "save_image"],
  {
    message: "无效的分享记录动作",
  },
);

export const CreateCustomerProjectLogShareRecordSchema = z.object({
  copy_id: z.string().trim().max(100, "文案 ID 过长").nullable().optional(),
  copy_text: z.string().trim().max(500, "文案内容过长").nullable().optional(),
  action: CustomerProjectLogShareRecordActionSchema,
});

export type CustomerProjectLogShareParams = z.infer<
  typeof CustomerProjectLogShareParamsSchema
>;
export type GenerateCustomerProjectLogShareCopyInput = z.infer<
  typeof GenerateCustomerProjectLogShareCopySchema
>;
export type CreateCustomerProjectLogShareRecordInput = z.infer<
  typeof CreateCustomerProjectLogShareRecordSchema
>;
