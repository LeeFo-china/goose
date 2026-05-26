export type EmployeePersonalizationScope =
  | "employee"
  | "department_post"
  | "post"
  | "department"
  | "role"
  | "tenant_default";

export type EmployeePersonalizationStatus = "draft" | "active" | "disabled";

export type EmployeePersonalizationRule = {
  id: string;
  scene: string;
  scope: EmployeePersonalizationScope;
  employee_id: string | null;
  tenant_department_id: string | null;
  post_id: string | null;
  role_code: string | null;
  priority: number;
  content_json: Record<string, unknown>;
  status: EmployeePersonalizationStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmployeePersonalizationOption = {
  id: string;
  name: string | null;
  code?: string | null;
  status?: string | null;
  tenant_department_id?: string | null;
  post_id?: string | null;
};

export type EmployeePersonalizationOptions = {
  employees: EmployeePersonalizationOption[];
  departments: EmployeePersonalizationOption[];
  posts: EmployeePersonalizationOption[];
  roles: Array<{
    id: string;
    code: string;
    name: string | null;
  }>;
};

export type EmployeePersonalizationListData = {
  list: EmployeePersonalizationRule[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  options: EmployeePersonalizationOptions;
};

export const EMPLOYEE_PERSONALIZATION_SCOPE_LABELS: Record<
  EmployeePersonalizationScope,
  string
> = {
  employee: "员工",
  department_post: "部门+岗位",
  post: "岗位",
  department: "部门",
  role: "角色",
  tenant_default: "租户默认",
};

export const EMPLOYEE_PERSONALIZATION_STATUS_LABELS: Record<
  EmployeePersonalizationStatus,
  string
> = {
  draft: "草稿",
  active: "启用",
  disabled: "停用",
};
