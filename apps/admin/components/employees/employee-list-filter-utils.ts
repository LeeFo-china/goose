export type EmployeeListHrefInput = {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
  tenantDepartmentId?: string;
  postId?: string;
  roleId?: string;
};

export function buildEmployeesHref(input: EmployeeListHrefInput) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.pageSize && input.pageSize > 0) {
    params.set("pageSize", String(input.pageSize));
  }
  if (input.status) params.set("status", input.status);
  if (input.keyword) params.set("keyword", input.keyword);
  if (input.tenantDepartmentId) {
    params.set("tenant_department_id", input.tenantDepartmentId);
  }
  if (input.postId) params.set("post_id", input.postId);
  if (input.roleId) params.set("role_id", input.roleId);

  const query = params.toString();
  return query ? `/employees?${query}` : "/employees";
}
