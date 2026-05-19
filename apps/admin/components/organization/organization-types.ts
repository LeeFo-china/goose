export const ORGANIZATION_PAGE_SIZE_OPTIONS = [5, 10, 15, 20] as const;

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DepartmentRecord = {
  id: string;
  tenant_department_id?: string | null;
  code: string | null;
  name: string;
  template_name?: string | null;
  enabled?: boolean | null;
  sort?: number | null;
  created_at: string | null;
  updated_at?: string | null;
};

export type PostRecord = {
  id: string;
  code: string;
  name: string;
  base_salary: number | null;
  salary_type: string | null;
  sort: number | null;
  status: number | null;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DepartmentPostRuleRecord = {
  id: string;
  department_code: string;
  post_code: string;
  alias_name?: string | null;
  enabled: boolean;
  sort: number;
  created_at: string | null;
  updated_at: string | null;
};

export type DepartmentPostRuleDepartment = {
  id: string;
  tenant_department_id?: string | null;
  code: string;
  name: string;
  selected_post_codes: string[];
  rules: DepartmentPostRuleRecord[];
};

export type DepartmentPostRulePostOption = {
  id: string;
  code: string;
  name: string;
  sort: number | null;
  status: number | null;
};

export type DepartmentPostRuleConfig = {
  departments: DepartmentPostRuleDepartment[];
  post_options: DepartmentPostRulePostOption[];
};
