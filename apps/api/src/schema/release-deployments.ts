import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const ReleaseEnvironmentSchema = z.enum(["dev", "production"]);

export const ReleaseServiceSchema = z.enum([
  "api",
  "admin",
  "social-video-worker",
  "cos-reconcile-worker",
  "all",
]);

export const ReleaseRefTypeSchema = z.enum(["branch", "tag", "commit"]);

export const ReleaseDispatchSchema = z.object({
  environment: ReleaseEnvironmentSchema,
  service: ReleaseServiceSchema,
  ref_type: ReleaseRefTypeSchema.default("branch"),
  ref: z.string().trim().min(1, "版本不能为空").max(120, "版本不能超过 120 个字符"),
  reason: z.string().trim().max(200, "发布原因不能超过 200 个字符").optional(),
  confirm_text: z.string().trim().max(40, "确认文本不能超过 40 个字符").optional(),
}).superRefine((value, ctx) => {
  if (value.environment === "dev" && value.service === "all") {
    ctx.addIssue({
      code: "custom",
      path: ["service"],
      message: "开发环境暂不支持 all，请选择单个服务",
    });
  }

  if (value.environment === "production" && value.ref_type === "branch") {
    ctx.addIssue({
      code: "custom",
      path: ["ref_type"],
      message: "生产发布不能直接选择分支，请选择 Tag 或 Commit SHA",
    });
  }

  if (value.environment === "production" && value.confirm_text !== "确认发布生产") {
    ctx.addIssue({
      code: "custom",
      path: ["confirm_text"],
      message: "生产发布需要输入：确认发布生产",
    });
  }
});

export const ReleaseRunListQuerySchema = PaginationQuerySchema.extend({
  environment: ReleaseEnvironmentSchema.optional(),
});

export const ReleaseSuccessfulRefListQuerySchema = PaginationQuerySchema.extend({
  environment: ReleaseEnvironmentSchema.optional(),
});

export const ReleaseRefListQuerySchema = z.object({
  type: ReleaseRefTypeSchema,
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
  base_ref: z.string().trim().max(120, "基础分支不能超过 120 个字符").optional(),
});

export type ReleaseEnvironment = z.infer<typeof ReleaseEnvironmentSchema>;
export type ReleaseService = z.infer<typeof ReleaseServiceSchema>;
export type ReleaseRefType = z.infer<typeof ReleaseRefTypeSchema>;
export type ReleaseDispatchInput = z.infer<typeof ReleaseDispatchSchema>;
export type ReleaseRunListQuery = z.infer<typeof ReleaseRunListQuerySchema>;
export type ReleaseSuccessfulRefListQuery = z.infer<typeof ReleaseSuccessfulRefListQuerySchema>;
export type ReleaseRefListQuery = z.infer<typeof ReleaseRefListQuerySchema>;
