import { z } from "zod";
import { DEPARTMENT_CODE_VALUES } from "@gooes/domain";
import { POST_CODE_PATTERN } from "@/schema/post";

export const DepartmentPostRuleDepartmentParamsSchema = z.object({
  department_code: z.enum(DEPARTMENT_CODE_VALUES, {
    message: "无效的部门编码",
  }),
});

export const UpdateDepartmentPostRuleSchema = z.object({
  post_codes: z
    .array(
      z
        .string()
        .trim()
        .regex(POST_CODE_PATTERN, "无效的岗位编码"),
    )
    .max(500, "岗位数量不能超过 500 个")
    .transform((values) => Array.from(new Set(values))),
});

export type UpdateDepartmentPostRuleInput = z.infer<
  typeof UpdateDepartmentPostRuleSchema
>;
