import type { EmployeeStatus } from "@gooes/domain";

export type EmployeeMutationRecord = {
  id: string;
  name: string | null;
  phone: string | null;
  status: EmployeeStatus | string | null;
  tenant_department_id?: string | null;
  department_name?: string | null;
  department_code?: string | null;
  post_id: string | null;
  avatar: string | null;
  roles?: EmployeeRoleSummary[];
};

export type EmployeeRoleSummary = {
  id: string;
  code: string;
  name: string;
  status: string;
};

export type EmployeeDepartmentOption = {
  id: string;
  tenant_department_id?: string | null;
  code: string;
  name: string;
  selected_post_codes?: string[];
};

export type EmployeePostOption = {
  id: string;
  code: string;
  name: string;
  status: number | null;
  sort: number | null;
};

export type { EmployeeStatus };
