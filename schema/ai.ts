import { z } from "zod";

export const DecorationQaHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant"], {
    message: "历史消息角色无效",
  }),
  content: z.string().trim().min(1, "历史消息内容不能为空"),
});

export const DecorationQaRequestSchema = z.object({
  question: z.string().trim().min(1, "问题不能为空").max(500, "问题内容过长"),
  history: z.array(DecorationQaHistoryItemSchema).max(20, "历史对话不能超过 20 条"),
});

export type DecorationQaRequestInput = z.infer<typeof DecorationQaRequestSchema>;
