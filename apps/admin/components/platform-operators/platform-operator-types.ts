import type { EmployeeStatus } from "@gooes/domain";

export type PlatformOperatorRole = {
  id: string;
  code: string;
  name: string | null;
  description?: string | null;
  status: string | null;
};

export type PlatformOperator = {
  id: string;
  name: string | null;
  phone: string | null;
  phone_masked?: string | null;
  full_phone?: string | null;
  status: EmployeeStatus | string | null;
  last_login_time: string | null;
  created_at: string | null;
  updated_at: string | null;
  version: number | null;
  admin_auth_version: number | null;
  roles: PlatformOperatorRole[];
};

export type PlatformRoleOption = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  status: string | null;
  version?: number | null;
  permission_count?: number;
  employee_count?: number;
  is_protected?: boolean;
};

export type PageData<RecordType> = {
  list: RecordType[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
