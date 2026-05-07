export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DepartmentRecord = {
  id: string;
  code: string | null;
  name: string;
  created_at: string | null;
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

export type ProjectMemberRolePostRuleRecord = {
  id: string;
  role_code: string;
  post_code: string;
  enabled: boolean;
  sort: number;
  created_at: string | null;
  updated_at: string | null;
};

export type ProjectMemberRolePostRuleRole = {
  role_code: string;
  role_name: string;
  sort_order: number;
  category: "core" | "extended";
  selected_post_codes: string[];
  rules: ProjectMemberRolePostRuleRecord[];
};

export type ProjectMemberRolePostOption = {
  id: string;
  code: string;
  name: string;
  sort: number | null;
};

export type ProjectMemberRolePostRuleConfig = {
  roles: ProjectMemberRolePostRuleRole[];
  post_options: ProjectMemberRolePostOption[];
};
