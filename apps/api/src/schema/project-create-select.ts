import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";
import {
  PROJECT_CREATE_EMPLOYEE_SCENE_VALUES,
  PROJECT_MEMBER_ROLE_CODE_VALUES,
} from "@gooes/domain";

export const ProjectCreateSelectEmployeeSceneSchema = z.enum(
  PROJECT_CREATE_EMPLOYEE_SCENE_VALUES,
  {
    message: "无效的员工筛选场景",
  },
);

export const ProjectCreateSelectCustomerQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().optional(),
});

export const ProjectCreateSelectPropertyQuerySchema = PaginationQuerySchema.extend({
  customer_id: z.uuid("请选择有效的客户"),
  keyword: z.string().trim().optional(),
});

export const ProjectCreateSelectEmployeeQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().optional(),
  scene: ProjectCreateSelectEmployeeSceneSchema,
});

export const ProjectCreateConstructionWorkflowQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().optional(),
});

export const ProjectMemberCandidateQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().optional(),
  role_code: z.enum(PROJECT_MEMBER_ROLE_CODE_VALUES, {
    message: "无效的项目成员角色",
  }).optional(),
});

export type ProjectCreateSelectCustomerQueryType = z.infer<
  typeof ProjectCreateSelectCustomerQuerySchema
>;
export type ProjectCreateSelectPropertyQueryType = z.infer<
  typeof ProjectCreateSelectPropertyQuerySchema
>;
export type ProjectCreateSelectEmployeeQueryType = z.infer<
  typeof ProjectCreateSelectEmployeeQuerySchema
>;
export type ProjectCreateConstructionWorkflowQueryType = z.infer<
  typeof ProjectCreateConstructionWorkflowQuerySchema
>;
export type ProjectMemberCandidateQueryType = z.infer<
  typeof ProjectMemberCandidateQuerySchema
>;
export type ProjectCreateSelectEmployeeScene = z.infer<
  typeof ProjectCreateSelectEmployeeSceneSchema
>;
