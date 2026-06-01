import type {
  DepartmentPostRuleConfig,
  DepartmentPostRuleDepartment,
  DepartmentPostRulePostOption,
  DepartmentRecord,
} from "@/components/organization/organization-types";

export type DepartmentPostSelectedState = Record<string, string[]>;

export function sortPostCodes(values: string[]) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

export function isPostCodeSelectionDirty(left: string[], right: string[]) {
  return JSON.stringify(sortPostCodes(left)) !== JSON.stringify(sortPostCodes(right));
}

export function getDepartmentSelectedPostCodes(
  department: DepartmentRecord,
  config: DepartmentPostRuleConfig,
) {
  const ruleDepartment = config.departments.find((item) =>
    (department.tenant_department_id &&
      item.tenant_department_id === department.tenant_department_id) ||
    (department.code && item.code === department.code)
  );

  return ruleDepartment?.selected_post_codes || [];
}

export function createDepartmentPostSelectedState(
  departments: DepartmentPostRuleDepartment[],
) {
  return departments.reduce<DepartmentPostSelectedState>((acc, department) => {
    acc[department.code] = department.selected_post_codes;
    return acc;
  }, {});
}

export function getPostSearchText(post: DepartmentPostRulePostOption) {
  return `${post.name} ${post.code}`.toLowerCase();
}

export function normalizePostName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
