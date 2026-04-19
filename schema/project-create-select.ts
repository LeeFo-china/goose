import { z } from "zod";
import { PaginationQuerySchema } from "@/schema/request";
import { PROJECT_CREATE_EMPLOYEE_SCENE_VALUES } from "@gooes/domain";

export const ProjectCreateSelectEmployeeSceneSchema = z.enum(
  PROJECT_CREATE_EMPLOYEE_SCENE_VALUES,
  {
    message: "无效的员工筛选场景",
  },
);

export const ProjectCreateSelectCustomerQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().optional(),
});

export const ProjectCreateSelectEmployeeQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().optional(),
  scene: ProjectCreateSelectEmployeeSceneSchema,
});

export type ProjectCreateSelectCustomerQueryType = z.infer<
  typeof ProjectCreateSelectCustomerQuerySchema
>;
export type ProjectCreateSelectEmployeeQueryType = z.infer<
  typeof ProjectCreateSelectEmployeeQuerySchema
>;
export type ProjectCreateSelectEmployeeScene = z.infer<
  typeof ProjectCreateSelectEmployeeSceneSchema
>;
