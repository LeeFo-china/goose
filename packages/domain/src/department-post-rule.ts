import type { DepartmentCode } from './department';
import type { EmployeePostCode } from './post';

export interface DepartmentPostRuleRecord {
  id: string;
  department_code: DepartmentCode;
  post_code: EmployeePostCode;
  enabled: boolean;
  sort: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface DepartmentPostRuleDepartment {
  id: string;
  code: DepartmentCode;
  name: string;
  selected_post_codes: EmployeePostCode[];
  rules: DepartmentPostRuleRecord[];
}

export interface DepartmentPostRulePostOption {
  id: string;
  code: EmployeePostCode;
  name: string;
  sort: number | null;
  status: number | null;
}

export interface DepartmentPostRuleConfig {
  departments: DepartmentPostRuleDepartment[];
  post_options: DepartmentPostRulePostOption[];
}
