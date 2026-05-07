import { z } from "zod";
import {
  PROJECT_MEMBER_ROLE_CODE_VALUES,
} from "@gooes/domain";
import { POST_CODE_PATTERN } from "@/schema/post";

export const ProjectMemberRolePostRuleParamsSchema = z.object({
  role_code: z.enum(PROJECT_MEMBER_ROLE_CODE_VALUES, {
    message: "无效的项目成员角色",
  }),
});

export const UpdateProjectMemberRolePostRuleSchema = z.object({
  post_codes: z
    .array(
      z
        .string()
        .trim()
        .regex(POST_CODE_PATTERN, "无效的岗位编码"),
    )
    .min(1, "至少选择一个岗位")
    .max(100, "岗位数量不能超过 100 个")
    .transform((values) => Array.from(new Set(values))),
});

export type UpdateProjectMemberRolePostRuleInput = z.infer<
  typeof UpdateProjectMemberRolePostRuleSchema
>;
