import { Errors } from '@/errors/error-factory';
import type { PlatformServiceTrialAssigneeCandidatesQuery } from '@/schema/service-trials';
import { SupabaseDB } from '@/utils/supabase';

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  is: (...args: unknown[]) => QueryBuilder;
  in: (...args: unknown[]) => QueryBuilder;
  like: (...args: unknown[]) => QueryBuilder;
  or: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
  range: (...args: unknown[]) => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
  then: PromiseLike<QueryResult>['then'];
};

type AssigneeClient = {
  from: (table: 'employees' | 'employee_roles') => QueryBuilder;
};

type EmployeeRow = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
};

type RoleRow = {
  employee_id: string;
  role?: RoleRelation | RoleRelation[] | null;
};

type RoleRelation = {
  code: string;
  name: string | null;
};

export type PlatformServiceTrialAssigneeRoleRecord = {
  code: string;
  name: string | null;
};

export type PlatformServiceTrialAssigneeRecord = EmployeeRow & {
  roles: PlatformServiceTrialAssigneeRoleRecord[];
};

export type PlatformServiceTrialAssigneePage = {
  list: PlatformServiceTrialAssigneeRecord[];
  includedEmployee: PlatformServiceTrialAssigneeRecord | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const EMPLOYEE_SELECT = 'id,name,phone,status';
const CANDIDATE_SELECT =
  `${EMPLOYEE_SELECT},employee_roles!inner(`
  + 'role:roles!employee_roles_role_id_fkey!inner(id))';
const ROLE_SELECT =
  'employee_id,role:roles!employee_roles_role_id_fkey!inner(code,name)';
const PLATFORM_ROLE_CODE_PATTERN = 'platform_%';

export class PlatformServiceTrialAssigneesRepository {
  constructor(
    private readonly clientProvider: () => AssigneeClient = () =>
      SupabaseDB.getAdminClient() as unknown as AssigneeClient,
  ) {}

  async listCandidates(
    query: PlatformServiceTrialAssigneeCandidatesQuery,
  ): Promise<PlatformServiceTrialAssigneePage> {
    const offset = (query.page - 1) * query.pageSize;
    const to = offset + query.pageSize - 1;
    let request = this.from('employees')
      .select(CANDIDATE_SELECT, { count: 'exact' })
      .is('tenant_id', null)
      .eq('status', 'active')
      .is('employee_roles.role.tenant_id', null)
      .eq('employee_roles.role.status', 'active')
      .like('employee_roles.role.code', PLATFORM_ROLE_CODE_PATTERN)
      .order('name', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true });

    const keyword = escapeSearchKeyword(query.keyword);
    if (keyword) {
      request = request.or(
        `name.ilike.%${keyword}%,phone.ilike.%${keyword}%`,
      );
    }

    const { data, error, count } = await request.range(offset, to);
    if (error) throw Errors.dbError('查询平台跟进人候选失败');

    const employeeRows = ((data ?? []) as EmployeeRow[]).map(toEmployeeRow);
    const includedRow = await this.findIncludedEmployee(
      query.includeEmployeeId,
      employeeRows,
    );
    const roleEmployeeIds = [
      ...employeeRows.map((row) => row.id),
      ...(includedRow ? [includedRow.id] : []),
    ];
    const rolesByEmployeeId = await this.listRolesByEmployeeIds(roleEmployeeIds);
    const list = employeeRows.map((row) =>
      withRoles(row, rolesByEmployeeId)
    );

    return {
      list,
      includedEmployee: includedRow
        ? withRoles(includedRow, rolesByEmployeeId)
        : null,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / query.pageSize) : 0,
      },
    };
  }

  private from(table: 'employees' | 'employee_roles'): QueryBuilder {
    return this.clientProvider().from(table);
  }

  private async findIncludedEmployee(
    includeEmployeeId: string | undefined,
    pageRows: EmployeeRow[],
  ): Promise<EmployeeRow | null> {
    if (
      !includeEmployeeId
      || pageRows.some((row) => row.id === includeEmployeeId)
    ) {
      return null;
    }

    const { data, error } = await this.from('employees')
      .select(EMPLOYEE_SELECT)
      .eq('id', includeEmployeeId)
      .is('tenant_id', null)
      .maybeSingle();
    if (error) throw Errors.dbError('查询平台跟进人回显信息失败');

    return data ? toEmployeeRow(data as EmployeeRow) : null;
  }

  private async listRolesByEmployeeIds(
    employeeIds: string[],
  ): Promise<Map<string, PlatformServiceTrialAssigneeRoleRecord[]>> {
    if (employeeIds.length === 0) {
      return new Map<string, PlatformServiceTrialAssigneeRoleRecord[]>();
    }

    const { data, error } = await this.from('employee_roles')
      .select(ROLE_SELECT)
      .in('employee_id', employeeIds)
      .is('role.tenant_id', null)
      .eq('role.status', 'active')
      .like('role.code', PLATFORM_ROLE_CODE_PATTERN);
    if (error) throw Errors.dbError('查询平台跟进人角色失败');

    const rolesByEmployeeId =
      new Map<string, PlatformServiceTrialAssigneeRoleRecord[]>();
    for (const row of (data ?? []) as RoleRow[]) {
      const role = normalizeRole(row.role);
      if (!role) continue;
      const employeeRoles = rolesByEmployeeId.get(row.employee_id) ?? [];
      employeeRoles.push({ code: role.code, name: role.name });
      rolesByEmployeeId.set(row.employee_id, employeeRoles);
    }
    return rolesByEmployeeId;
  }
}

function escapeSearchKeyword(value: string | undefined): string {
  return value
    ?.trim()
    .replace(/\\/g, '\\\\')
    .replace(/[%_]/g, '\\$&')
    .replace(/[,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() ?? '';
}

function toEmployeeRow(row: EmployeeRow): EmployeeRow {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
  };
}

function normalizeRole(
  role: RoleRelation | RoleRelation[] | null | undefined,
): RoleRelation | null {
  return Array.isArray(role) ? role[0] ?? null : role ?? null;
}

function withRoles(
  row: EmployeeRow,
  rolesByEmployeeId: Map<string, PlatformServiceTrialAssigneeRoleRecord[]>,
): PlatformServiceTrialAssigneeRecord {
  return {
    ...row,
    roles: rolesByEmployeeId.get(row.id) ?? [],
  };
}

export const platformServiceTrialAssigneesRepository =
  new PlatformServiceTrialAssigneesRepository();
