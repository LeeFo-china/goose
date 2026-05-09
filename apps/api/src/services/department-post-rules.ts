import { Errors } from "@/errors/error-factory";
import { departmentPostRuleRepository } from "@/repositories/department-post-rules";
import type {
  DepartmentCode,
  EmployeePostCode,
} from "@gooes/domain";

class DepartmentPostRuleService {
  async getConfig(tenantId?: string | null) {
    const [departments, posts, rules] = await Promise.all([
      departmentPostRuleRepository.listDepartments(tenantId),
      departmentPostRuleRepository.listPostOptions(tenantId),
      departmentPostRuleRepository.listRules(tenantId),
    ]);

    return {
      departments: departments.map((department) => {
        const departmentRules = rules.filter(
          (rule) => rule.department_code === department.code,
        );
        return {
          ...department,
          selected_post_codes: departmentRules
            .filter((rule) => rule.enabled)
            .sort((a, b) => a.sort - b.sort)
            .map((rule) => rule.post_code),
          rules: departmentRules,
        };
      }),
      post_options: posts,
    };
  }

  async updateDepartmentPostCodes(
    departmentCode: DepartmentCode,
    postCodes: string[],
    tenantId?: string | null,
  ) {
    const uniquePostCodes = Array.from(new Set(postCodes));
    const postOptions = await departmentPostRuleRepository.listPostOptions(tenantId);
    const postCodeSet = new Set(postOptions.map((item) => item.code));
    const invalidPostCodes = uniquePostCodes.filter(
      (postCode) => !postCodeSet.has(postCode as EmployeePostCode),
    );

    if (invalidPostCodes.length > 0) {
      throw Errors.badRequest(`岗位编码不存在：${invalidPostCodes.join(", ")}`);
    }

    await departmentPostRuleRepository.replaceDepartmentRules({
      departmentCode,
      postCodes: uniquePostCodes as EmployeePostCode[],
      tenantId,
    });

    return this.getConfig(tenantId);
  }

  async assertEmployeeDepartmentPostAllowed(input: {
    departmentId: string | null | undefined;
    postId: string | null | undefined;
    tenantId?: string | null;
  }) {
    if (!input.departmentId || !input.postId) return;

    const { department, post } =
      await departmentPostRuleRepository.findDepartmentAndPostByIds({
        departmentId: input.departmentId,
        postId: input.postId,
        tenantId: input.tenantId,
      });

    if (!department?.code) {
      throw Errors.badRequest("部门不存在或缺少部门编码");
    }

    if (!post?.code) {
      throw Errors.badRequest("岗位不存在或缺少岗位编码");
    }

    const rule = await departmentPostRuleRepository.findEnabledRule({
      departmentCode: department.code,
      postCode: post.code,
      tenantId: input.tenantId,
    });

    if (!rule) {
      throw Errors.badRequest(`岗位「${post.name}」不能归属部门「${department.name}」`);
    }
  }
}

export const departmentPostRuleService = new DepartmentPostRuleService();
