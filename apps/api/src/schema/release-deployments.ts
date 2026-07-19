import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";

export const ReleaseEnvironmentSchema = z.enum(["dev", "production"]);

export const ReleaseServiceSchema = z.enum([
  "api",
  "admin",
  "social-video-worker",
  "cos-reconcile-worker",
  "billing-reconcile-worker",
  "all",
]);

export const ReleaseRefTypeSchema = z.enum(["branch", "tag", "commit"]);
export const ReleaseOperationSchema = z.enum(["release", "rollback"]);
export const ReleaseMigrationModeSchema = z.enum(["plan", "apply"]);

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
  const productionConfirmText = "确认构建生产候选";

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

  if (value.environment === "production" && value.confirm_text !== productionConfirmText) {
    ctx.addIssue({
      code: "custom",
      path: ["confirm_text"],
      message: `构建生产候选需要输入：${productionConfirmText}`,
    });
  }
});

export const ReleaseProductionCandidateParamsSchema = z.object({
  runId: z.string().trim().regex(/^\d+$/, "GitHub Run ID 必须是数字"),
});

export const ReleaseProductionCandidateDeploySchema = z.object({
  services: z.array(ReleaseServiceSchema.exclude(["all"])).min(1, "请选择部署服务").max(5),
  confirm_text: z.literal("确认部署生产环境", {
    error: "部署生产候选需要输入：确认部署生产环境",
  }),
  reason: z.string().trim().max(200, "部署原因不能超过 200 个字符").optional(),
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

export const ReleaseRunFailureSummaryParamsSchema = z.object({
  runId: z.string().trim().regex(/^\d+$/, "GitHub Run ID 必须是数字"),
});

export const ReleaseSuccessfulRefListQuerySchema = PaginationQuerySchema.extend({
  environment: ReleaseEnvironmentSchema.optional(),
  keyword: z.string().trim().max(120, "关键词不能超过 120 个字符").optional(),
});

export const ReleaseRefListQuerySchema = z.object({
  type: ReleaseRefTypeSchema,
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
  base_ref: z.string().trim().max(120, "基础分支不能超过 120 个字符").optional(),
});

export const ReleaseProductionMigrationDispatchSchema = z.object({
  mode: ReleaseMigrationModeSchema.default("plan"),
  ref_type: ReleaseRefTypeSchema.default("branch"),
  ref: z.string().trim().min(1, "版本不能为空").max(120, "版本不能超过 120 个字符"),
  reason: z.string().trim().max(200, "迁移原因不能超过 200 个字符").optional(),
  confirm_text: z.string().trim().max(40, "确认文本不能超过 40 个字符").optional(),
}).superRefine((value, ctx) => {
  if (value.ref_type === "commit") {
    ctx.addIssue({
      code: "custom",
      path: ["ref_type"],
      message: "GitHub Actions 数据库迁移不能直接使用 Commit SHA，请选择分支或 Tag",
    });
  }

  if (value.mode === "apply" && value.confirm_text !== "确认迁移生产数据库") {
    ctx.addIssue({
      code: "custom",
      path: ["confirm_text"],
      message: "执行生产数据库迁移需要输入：确认迁移生产数据库",
    });
  }
});

export const ReleaseProductionMigrationPrecheckDispatchSchema = z.object({
  ref_type: ReleaseRefTypeSchema.default("branch"),
  ref: z.string().trim().min(1, "版本不能为空").max(120, "版本不能超过 120 个字符"),
  reason: z.string().trim().max(200, "迁移原因不能超过 200 个字符").optional(),
}).superRefine((value, ctx) => {
  if (value.ref_type === "commit") {
    ctx.addIssue({
      code: "custom",
      path: ["ref_type"],
      message: "GitHub Actions 数据库迁移不能直接使用 Commit SHA，请选择分支或 Tag",
    });
  }
});

export type ReleaseEnvironment = z.infer<typeof ReleaseEnvironmentSchema>;
export type ReleaseService = z.infer<typeof ReleaseServiceSchema>;
export type ReleaseRefType = z.infer<typeof ReleaseRefTypeSchema>;
export type ReleaseOperation = z.infer<typeof ReleaseOperationSchema>;
export type ReleaseMigrationMode = z.infer<typeof ReleaseMigrationModeSchema>;
export type ReleaseDispatchInput = z.infer<typeof ReleaseDispatchSchema>;
export type ReleaseProductionCandidateParams = z.infer<typeof ReleaseProductionCandidateParamsSchema>;
export type ReleaseProductionCandidateDeployInput = z.infer<typeof ReleaseProductionCandidateDeploySchema>;
export type ReleaseCreateTagInput = z.infer<typeof ReleaseCreateTagSchema>;
export type ReleaseCreateRollbackTagInput = z.infer<typeof ReleaseCreateRollbackTagSchema>;
export type ReleaseRunListQuery = z.infer<typeof ReleaseRunListQuerySchema>;
export type ReleaseRunFailureSummaryParams = z.infer<typeof ReleaseRunFailureSummaryParamsSchema>;
export type ReleaseSuccessfulRefListQuery = z.infer<typeof ReleaseSuccessfulRefListQuerySchema>;
export type ReleaseRefListQuery = z.infer<typeof ReleaseRefListQuerySchema>;
export type ReleaseProductionMigrationDispatchInput = z.infer<typeof ReleaseProductionMigrationDispatchSchema>;
export type ReleaseProductionMigrationPrecheckDispatchInput = z.infer<typeof ReleaseProductionMigrationPrecheckDispatchSchema>;
export type ReleaseProductionMigrationPrecheckParams = z.infer<typeof ReleaseProductionCandidateParamsSchema>;
