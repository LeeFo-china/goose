import { Errors } from "@/errors/error-factory";
import {
  departmentRepository,
  type DepartmentTemplateRow,
  type LegacyDepartmentRow,
  type TenantDepartmentRow,
} from "@/repositories/departments";
import type {
  CreateDepartmentInput,
  UpdateDepartmentInput,
} from "@/schema/departments";

type DepartmentListInput = {
  page: number;
  pageSize: number;
  keyword?: string;
  code?: string;
  enabled?: boolean;
};

class DepartmentService {
  private normalizeTemplate(value: TenantDepartmentRow["department_templates"]) {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  }

  private serializeTenantDepartment(row: TenantDepartmentRow) {
    const template = this.normalizeTemplate(row.department_templates);

    return {
      id: row.legacy_department_id,
      tenant_department_id: row.id,
      code: row.code,
      name: row.alias_name,
      template_name: template?.default_name ?? row.alias_name,
      enabled: row.enabled,
      sort: row.sort,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private async findRequiredTemplate(code: string) {
    const template = await departmentRepository.findTemplateByCode(code);
    if (!template) {
      throw Errors.badRequest("部门模板不存在或已停用");
    }

    return template;
  }

  private async findRequiredTemplates(codes: string[]) {
    const templates = await departmentRepository.listTemplatesByCodes(codes);
    const templateMap = new Map(templates.map((template) => [template.code, template]));
    const missingCode = codes.find((code) => !templateMap.has(code));
    if (missingCode) {
      throw Errors.badRequest(`部门模板不存在或已停用：${missingCode}`);
    }

    return templateMap;
  }

  private async ensureLegacyDepartment(input: {
    tenantId: string;
    code: string;
    name: string;
  }) {
    const existing = await departmentRepository.findLegacyDepartment(input);
    if (existing) {
      return existing;
    }

    return departmentRepository.createLegacyDepartment(input);
  }

  private async ensureLegacyDepartments(input: {
    tenantId: string;
    departments: Array<{ code: string; name: string }>;
  }) {
    const codes = Array.from(new Set(input.departments.map((department) => department.code)));
    const existingDepartments = await departmentRepository.listLegacyDepartments({
      tenantId: input.tenantId,
      codes,
    });
    const departmentMap = new Map(existingDepartments.map((department) => [
      department.code,
      department,
    ]));
    const missingRows = input.departments.filter((department) =>
      !departmentMap.has(department.code)
    );
    const inserted = await departmentRepository.createLegacyDepartments({
      tenantId: input.tenantId,
      departments: missingRows,
    });
    for (const department of inserted) {
      departmentMap.set(department.code, department);
    }

    return departmentMap;
  }

  async list(input: {
    tenantId: string;
    query: DepartmentListInput;
  }) {
    const { list, total } = await departmentRepository.listTenantDepartments({
      ...input.query,
      tenantId: input.tenantId,
    });

    return {
      list: list.map((row) => this.serializeTenantDepartment(row)),
      pagination: {
        page: input.query.page,
        pageSize: input.query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / input.query.pageSize) : 0,
      },
    };
  }

  async getByLegacyId(input: {
    tenantId: string;
    id: string;
  }) {
    const row = await departmentRepository.findTenantDepartmentByLegacyId({
      tenantId: input.tenantId,
      legacyDepartmentId: input.id,
    });
    if (!row) {
      throw Errors.badRequest("部门不存在");
    }

    return this.serializeTenantDepartment(row);
  }

  async create(input: {
    tenantId: string;
    payload: CreateDepartmentInput;
  }) {
    const template = await this.findRequiredTemplate(input.payload.code);
    const aliasName = input.payload.name || template.default_name;
    const legacyDepartment = await this.ensureLegacyDepartment({
      tenantId: input.tenantId,
      code: template.code,
      name: aliasName,
    });

    const department = await departmentRepository.upsertTenantDepartment({
      tenantId: input.tenantId,
      template,
      department: legacyDepartment,
      aliasName,
      enabled: input.payload.enabled ?? true,
      sort: input.payload.sort ?? template.sort ?? 0,
    });

    if (!department) {
      throw Errors.badRequest("部门启用失败");
    }

    return this.serializeTenantDepartment(department);
  }

  async enableBatch(input: {
    tenantId: string;
    departments: CreateDepartmentInput[];
  }) {
    const departmentMap = new Map(input.departments.map((department) => [
      department.code,
      department,
    ]));
    const departments = Array.from(departmentMap.values());
    const codes = departments.map((department) => department.code);
    const templateMap = await this.findRequiredTemplates(codes);
    const legacyDepartmentMap = await this.ensureLegacyDepartments({
      tenantId: input.tenantId,
      departments: departments.map((department) => ({
        code: department.code,
        name: department.name || templateMap.get(department.code)?.default_name || department.code,
      })),
    });

    const rows = departments.map((department) => {
      const template = templateMap.get(department.code) as DepartmentTemplateRow | undefined;
      const legacyDepartment = legacyDepartmentMap.get(department.code) as LegacyDepartmentRow | undefined;
      if (!template || !legacyDepartment) {
        throw Errors.badRequest(`部门启用失败：${department.code}`);
      }
      return {
        template,
        department: legacyDepartment,
        aliasName: department.name || template.default_name,
        enabled: department.enabled ?? true,
        sort: department.sort ?? template.sort ?? 0,
      };
    });

    const syncedDepartments = await departmentRepository.upsertTenantDepartments({
      tenantId: input.tenantId,
      departments: rows,
    });

    return {
      list: syncedDepartments.map((department) =>
        this.serializeTenantDepartment(department)
      ),
    };
  }

  async update(input: {
    tenantId: string;
    id: string;
    payload: UpdateDepartmentInput;
  }) {
    const current = await departmentRepository.findTenantDepartmentForUpdate({
      tenantId: input.tenantId,
      legacyDepartmentId: input.id,
    });
    if (!current?.legacy_department_id) {
      throw Errors.badRequest("部门不存在或更新失败");
    }

    const nextAliasName = input.payload.name ?? current.alias_name;
    const legacyDepartment = await this.ensureLegacyDepartment({
      tenantId: input.tenantId,
      code: current.code,
      name: nextAliasName,
    });

    const row = await departmentRepository.updateTenantDepartment({
      id: current.id,
      payload: {
        alias_name: nextAliasName,
        enabled: input.payload.enabled ?? current.enabled,
        sort: input.payload.sort ?? current.sort,
        legacy_department_id: legacyDepartment.id,
      },
    });

    if (!row) {
      throw Errors.badRequest("部门不存在或更新失败");
    }

    return this.serializeTenantDepartment(row);
  }
}

export const departmentService = new DepartmentService();
