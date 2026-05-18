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
export const ReleaseOperationSchema = z.enum(["release", "rollback"]);

export const ReleaseDispatchSchema = z.object({
  environment: ReleaseEnvironmentSchema,
  service: ReleaseServiceSchema,
  services: z.array(ReleaseServiceSchema).min(1, "请选择发布服务").max(5, "发布服务不能超过 5 个").optional(),
  ref_type: ReleaseRefTypeSchema.default("branch"),
  ref: z.string().trim().min(1, "版本不能为空").max(120, "版本不能超过 120 个字符"),
  operation: ReleaseOperationSchema.default("release"),
  reason: z.string().trim().max(200, "发布原因不能超过 200 个字符").optional(),
  confirm_text: z.string().trim().max(40, "确认文本不能超过 40 个字符").optional(),
}).superRefine((value, ctx) => {
  const selectedServices = value.services?.length ? value.services : [value.service];
  const productionConfirmText = value.operation === "rollback" ? "确认回滚生产" : "确认发布生产";

  if (selectedServices.includes("all") && selectedServices.length > 1) {
    ctx.addIssue({
      code: "custom",
      path: ["services"],
      message: "选择全部服务时不能再选择其他服务",
    });
  }

  if (value.environment === "dev" && selectedServices.includes("all")) {
    ctx.addIssue({
      code: "custom",
      path: ["services"],
      message: "开发环境暂不支持 all，请选择单个服务",
    });
  }

  if (value.environment === "production" && value.ref_type === "branch") {
    ctx.addIssue({
      code: "custom",
      path: ["ref_type"],
      message: "生产发布不能直接选择分支，请先创建 Tag 后用 Tag 发布",
    });
  }

  if (value.ref_type === "commit") {
    ctx.addIssue({
      code: "custom",
      path: ["ref_type"],
      message: "GitHub Actions 发布不能直接使用 Commit SHA，请先创建 Tag 后用 Tag 发布",
    });
  }

  if (value.operation === "rollback" && value.environment !== "production") {
    ctx.addIssue({
      code: "custom",
      path: ["operation"],
      message: "回滚只支持生产环境",
    });
  }

  if (value.environment === "production" && value.confirm_text !== productionConfirmText) {
    ctx.addIssue({
      code: "custom",
      path: ["confirm_text"],
      message: `生产${value.operation === "rollback" ? "回滚" : "发布"}需要输入：${productionConfirmText}`,
    });
  }
});

export const ReleaseCreateTagSchema = z.object({
  tag: z.string()
    .trim()
    .regex(/^v\d{4}\.\d{2}\.\d{2}\.\d+$/, "Tag 格式必须为 vYYYY.MM.DD.N，例如 v2026.05.17.1"),
  source_ref: z.string().trim().min(1, "来源版本不能为空").max(120, "来源版本不能超过 120 个字符"),
  message: z.string().trim().min(1, "Tag 说明不能为空").max(200, "Tag 说明不能超过 200 个字符"),
});

export const ReleaseCreateRollbackTagSchema = z.object({
  source_ref: z.string().trim().min(1, "回滚来源版本不能为空").max(120, "回滚来源版本不能超过 120 个字符"),
  message: z.string().trim().max(200, "回滚说明不能超过 200 个字符").optional(),
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
export type ReleaseOperation = z.infer<typeof ReleaseOperationSchema>;
export type ReleaseDispatchInput = z.infer<typeof ReleaseDispatchSchema>;
export type ReleaseCreateTagInput = z.infer<typeof ReleaseCreateTagSchema>;
export type ReleaseCreateRollbackTagInput = z.infer<typeof ReleaseCreateRollbackTagSchema>;
export type ReleaseRunListQuery = z.infer<typeof ReleaseRunListQuerySchema>;
export type ReleaseSuccessfulRefListQuery = z.infer<typeof ReleaseSuccessfulRefListQuerySchema>;
export type ReleaseRefListQuery = z.infer<typeof ReleaseRefListQuerySchema>;
