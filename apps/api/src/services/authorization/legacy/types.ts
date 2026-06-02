export type EffectivePermission = {
  code: string;
  scope: "self" | "department" | "assigned" | "all";
};

export type AuthContextRole = {
  id: string;
  code: string;
  name: string | null;
  description: string | null;
  status: string | null;
};

export type AuthContext = {
  authUserId: string;
  employeeId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantSlug: string | null;
  tenantStatus: string | null;
  isPlatformAdmin: boolean;
  employeeName: string | null;
  employeeStatus: string | null;
  departmentId: string | null;
  tenantDepartmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  postId: string | null;
  postName: string | null;
  avatar: string | null;
  roleCodes: string[];
  roles: AuthContextRole[];
  permissions: EffectivePermission[];
};
