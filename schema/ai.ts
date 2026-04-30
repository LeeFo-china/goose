import { z } from "zod";
import { AI_MESSAGE_ROLE_VALUES } from "@gooes/domain";

export const DecorationQaHistoryItemSchema = z.object({
  role: z.enum(AI_MESSAGE_ROLE_VALUES, {
    message: "历史消息角色无效",
  }),
  content: z.string().trim().min(1, "历史消息内容不能为空"),
});

export const DecorationQaRequestSchema = z.object({
  question: z.string().trim().min(1, "问题不能为空").max(500, "问题内容过长"),
  history: z.array(DecorationQaHistoryItemSchema).max(20, "历史对话不能超过 20 条"),
});

export const DecorationQaStreamContextSchema = z.object({
  role: z.enum(["visitor", "customer", "employee"], {
    message: "上下文身份无效",
  }).default("visitor"),
  project_id: z.string().uuid("无效的项目ID").optional(),
}).optional();

export const DecorationQaStreamRequestSchema = z.object({
  question: z.string().trim().min(1, "问题不能为空").max(500, "问题内容过长"),
  conversation_id: z.string().trim().max(100, "会话 ID 过长").nullable().optional(),
  context: DecorationQaStreamContextSchema,
});

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean({ message: "refresh 必须是布尔值" }).default(false));

export const DecorationQaSuggestionQuerySchema = z.object({
  scene: z.enum(["visitor", "customer", "employee"], {
    message: "推荐问题场景无效",
  }).default("visitor"),
  project_id: z.string().uuid("无效的项目ID").optional(),
  refresh: booleanQuerySchema,
});

export type DecorationQaRequestInput = z.infer<typeof DecorationQaRequestSchema>;
export type DecorationQaStreamRequestInput =
  z.infer<typeof DecorationQaStreamRequestSchema>;
export type DecorationQaSuggestionQueryInput = z.infer<
  typeof DecorationQaSuggestionQuerySchema
>;
