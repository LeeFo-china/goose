import { Errors } from "@/errors/error-factory";
import { departmentPostRuleRepository } from "@/repositories/department-post-rules";
import type {
  DepartmentCode,
  EmployeePostCode,
} from "@gooes/domain";

class DepartmentPostRuleService {
  private requireTenantId(tenantId?: string | null) {
    if (!tenantId) {
      throw Errors.business(
        403,
        "组织架构必须在租户上下文中操作",
        "TENANT_CONTEXT_REQUIRED",
      );
    }

    return tenantId;
  }

  async getConfig(tenantId?: string | null) {
    const scopedTenantId = this.requireTenantId(tenantId);
    const [departments, posts, rules] = await Promise.all([
      departmentPostRuleRepository.listDepartments(scopedTenantId),
      departmentPostRuleRepository.listPostOptions(scopedTenantId),
      departmentPostRuleRepository.listRules(scopedTenantId),
    ]);

    return {
      departments: departments.map((department) => {
        const departmentRules = rules.filter(
          (rule) =>
            rule.tenant_department_id === department.tenant_department_id ||
            (!rule.tenant_department_id && rule.department_code === department.code),
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

  async updateDepartmentPostAlias(input: {
    departmentCode: DepartmentCode;
    postCode: string;
    aliasName: string | null;
    tenantId?: string | null;
  }) {
    const scopedTenantId = this.requireTenantId(input.tenantId);
    const [department, existingPostCodes] = await Promise.all([
      departmentPostRuleRepository.findDepartmentByCode({
        tenantId: scopedTenantId,
        departmentCode: input.departmentCode,
      }),
      departmentPostRuleRepository.listExistingPostCodes({
        tenantId: scopedTenantId,
        postCodes: [input.postCode],
      }),
    ]);

    if (!department?.tenant_department_id) {
      throw Errors.badRequest("部门不存在或未启用");
    }

    if (existingPostCodes.length === 0) {
      throw Errors.badRequest("岗位不存在");
    }

    const updated = await departmentPostRuleRepository.updateDepartmentPostRuleAlias({
      tenantDepartmentId: department.tenant_department_id,
      departmentCode: input.departmentCode,
      postCode: input.postCode as EmployeePostCode,
      aliasName: input.aliasName,
      tenantId: scopedTenantId,
    });

    if (!updated) {
      throw Errors.badRequest("该部门暂未关联该岗位");
    }

    return {
      department_code: input.departmentCode,
      tenant_department_id: department.tenant_department_id,
      post_code: input.postCode,
      alias_name: input.aliasName,
      config: await this.getConfig(scopedTenantId),
    };
  }

  async updateDepartmentPostCodes(
    departmentCode: DepartmentCode,
    postCodes: string[],
    tenantId?: string | null,
  ) {
    const scopedTenantId = this.requireTenantId(tenantId);
    const uniquePostCodes = Array.from(new Set(postCodes));
    const [department, existingPostCodes] = await Promise.all([
      departmentPostRuleRepository.findDepartmentByCode({
        tenantId: scopedTenantId,
        departmentCode,
      }),
      departmentPostRuleRepository.listExistingPostCodes({
        tenantId: scopedTenantId,
        postCodes: uniquePostCodes,
      }),
    ]);
    const postCodeSet = new Set(existingPostCodes);
    const invalidPostCodes = uniquePostCodes.filter(
      (postCode) => !postCodeSet.has(postCode as EmployeePostCode),
    );

    if (invalidPostCodes.length > 0) {
      throw Errors.badRequest(`岗位编码不存在：${invalidPostCodes.join(", ")}`);
    }

    if (!department?.tenant_department_id) {
      throw Errors.badRequest("部门不存在或未启用");
    }

    await departmentPostRuleRepository.replaceDepartmentRules({
      tenantDepartmentId: department.tenant_department_id,
      departmentCode,
      postCodes: uniquePostCodes as EmployeePostCode[],
      tenantId: scopedTenantId,
    });

    return {
      department_code: departmentCode,
      tenant_department_id: department.tenant_department_id,
      selected_post_codes: uniquePostCodes,
      config: await this.getConfig(scopedTenantId),
    };
  }

  async enablePostForDepartment(input: {
    departmentId: string;
    postCode: string;
    tenantId?: string | null;
  }) {
    const scopedTenantId = this.requireTenantId(input.tenantId);
    const department = await departmentPostRuleRepository.findDepartmentById({
      departmentId: input.departmentId,
      tenantId: scopedTenantId,
    });

    if (!department?.code || !department.tenant_department_id) {
      throw Errors.badRequest("请先选择有效部门");
    }

    await departmentPostRuleRepository.enableDepartmentPostRule({
      tenantDepartmentId: department.tenant_department_id,
      departmentCode: department.code,
      postCode: input.postCode as EmployeePostCode,
      tenantId: scopedTenantId,
    });

    return department;
  }

  async assertDepartmentExists(input: {
    departmentId: string;
    tenantId?: string | null;
  }) {
    const scopedTenantId = this.requireTenantId(input.tenantId);
    const department = await departmentPostRuleRepository.findDepartmentById({
      departmentId: input.departmentId,
      tenantId: scopedTenantId,
    });

    if (!department?.code) {
      throw Errors.badRequest("请先选择有效部门");
    }

    return department;
  }

  async assertEmployeeDepartmentPostAllowed(input: {
    departmentId: string | null | undefined;
    postId: string | null | undefined;
    tenantId?: string | null;
  }) {
    if (!input.departmentId || !input.postId) return;
    const tenantId = this.requireTenantId(input.tenantId);

    const { department, post } =
      await departmentPostRuleRepository.findDepartmentAndPostByIds({
        departmentId: input.departmentId,
        postId: input.postId,
        tenantId,
      });

    if (!department?.code || !department.tenant_department_id) {
      throw Errors.badRequest("部门不存在或缺少部门编码");
    }

    if (!post?.code) {
      throw Errors.badRequest("岗位不存在或缺少岗位编码");
    }

    const rule = await departmentPostRuleRepository.findEnabledRule({
      tenantDepartmentId: department.tenant_department_id,
      departmentCode: department.code,
      postCode: post.code,
      tenantId,
    });

    if (!rule) {
      throw Errors.badRequest(`岗位「${post.name}」不能归属部门「${department.name}」`);
    }
  }
}

export const departmentPostRuleService = new DepartmentPostRuleService();
