import { Errors } from "@/errors/error-factory";
import type {
  AssignEmployeeRolesInput,
  CreatePermissionInput,
  CreateRoleInput,
  EmployeePermissionOverrideInput,
  PermissionListQueryType,
  RolePermissionAssignInput,
  RoleListQueryType,
  UpdatePermissionInput,
  UpdateRoleInput,
} from "@/schema/permissions";
import { SupabaseDB } from "@/utils/supabase";

export type RoleRecord = {
  id: string;
  tenant_id?: string | null;
  code: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PermissionRecord = {
  id: string;
  code: string;
  name: string;
  module: string;
  resource: string;
  action: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PermissionListQueryWithVisibility = PermissionListQueryType & {
  includePlatformPermissions?: boolean;
  includeTenantRestrictedPermissions?: boolean;
};

export type RolePermissionRecord = PermissionRecord & {
  access_scope: string;
};

export type EmployeePermissionContextRecord = {
  employee: {
    id: string;
    user_id: string | null;
    tenant_id: string | null;
    status: string | null;
    admin_auth_version?: number | null;
    tenant_department_id: string | null;
    post_id: string | null;
    name: string | null;
    phone: string | null;
    avatar: string | null;
    tenant_department:
      | {
        id: string | null;
        alias_name: string | null;
        code: string | null;
      }
      | Array<{
        id: string | null;
        alias_name: string | null;
        code: string | null;
      }>
      | null;
    post:
      | { name: string | null }
      | Array<{ name: string | null }>
      | null;
    tenant:
      | {
        id: string | null;
        name: string | null;
        slug: string | null;
        status: string | null;
      }
      | Array<{
        id: string | null;
        name: string | null;
        slug: string | null;
        status: string | null;
      }>
      | null;
  } | null;
  roles: RoleRecord[];
  rolePermissions: Array<{
    code: string;
    scope: string;
  }>;
  overrides: Array<{
    permission_id: string;
    permission_code: string;
    permission_name: string | null;
    code: string;
    effect: string;
    access_scope: string | null;
    scope: string | null;
    reason: string | null;
    created_at: string;
    updated_at: string;
  }>;
};

export type RoleWithPermissionsRecord = RoleRecord & {
  role_permissions?: Array<{
    access_scope: string;
    permission: { code: string; status?: string | null } | null;
  }> | null;
};

export type EmployeePermissionContextRpcRow = {
  employee: EmployeePermissionContextRecord["employee"];
  roles: RoleRecord[] | null;
  role_permissions: EmployeePermissionContextRecord["rolePermissions"] | null;
  overrides: EmployeePermissionContextRecord["overrides"] | null;
};

export { Errors };

export type {
  AssignEmployeeRolesInput,
  CreatePermissionInput,
  CreateRoleInput,
  EmployeePermissionOverrideInput,
  PermissionListQueryType,
  RolePermissionAssignInput,
  RoleListQueryType,
  UpdatePermissionInput,
  UpdateRoleInput,
};
