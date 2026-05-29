import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  expenseRequestCategoryRepository,
  type ExpenseRequestCategoryRecord,
} from "@/repositories/expense-request-categories";
import type {
  CreateExpenseRequestCategoryInput,
  ExpenseRequestCategoryListQuery,
  ExpenseRequestCategoryStatusUpdateInput,
  UpdateExpenseRequestCategoryInput,
} from "@/schema/expense-request-categories";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

class ExpenseRequestCategoryService {
  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private serializeCategory(record: ExpenseRequestCategoryRecord) {
    const departmentCodes = this.normalizeStringArray(record.department_codes);
    const modeCodes = this.normalizeStringArray(record.mode_codes);
    const description = record.description ?? record.remark ?? null;

    return {
      ...record,
      description,
      enabled: record.status === "active",
      sort_order: record.sort,
      department_codes: departmentCodes,
      mode_codes: modeCodes,
      is_default: Boolean(record.is_default),
    };
  }

  private categoryMatchesFilters(
    record: ReturnType<ExpenseRequestCategoryService["serializeCategory"]>,
    query: ExpenseRequestCategoryListQuery,
  ) {
    if (
      query.mode &&
      record.mode_codes.length > 0 &&
      !record.mode_codes.includes(query.mode)
    ) {
      return false;
    }

    if (
      query.department_code &&
      record.department_codes.length > 0 &&
      !record.department_codes.includes(query.department_code)
    ) {
      return false;
    }

    return true;
  }

  private normalizeCode(code: string) {
    return code.trim().toLowerCase();
  }

  private normalizeName(name: string) {
    return name.trim();
  }

  private assertCanRead(authContext: AuthContext) {
    const allowed = [
      "expense_request.read",
      "expense_request.create",
      "expense_request.submit",
      "expense_request.approve_manager",
      "expense_request.approve_finance",
      "expense_request.pay",
    ].some((permissionCode) =>
      accessPolicyService.hasPermission(authContext, permissionCode)
    );

    if (!allowed) {
      throw Errors.forbidden();
    }
  }

  private assertCanManage(authContext: AuthContext) {
    accessPolicyService.assertPermission(authContext, "employee.permission_manage");
  }

  private async ensureCodeAndNameUnique(
    input: { code?: string; name?: string },
    tenantId?: string | null,
    currentId?: string,
  ) {
    if (input.code) {
      const existingByCode = await expenseRequestCategoryRepository.findByCode(
        input.code,
        tenantId,
      );
      if (existingByCode && existingByCode.id !== currentId) {
        throw Errors.business(
          400,
          "费用分类编码已存在",
          ErrorCodes.EXPENSE_CATEGORY_CODE_DUPLICATED,
        );
      }
    }

    if (input.name) {
      const existingByName = await expenseRequestCategoryRepository.findByName(
        input.name,
        tenantId,
      );
      if (existingByName && existingByName.id !== currentId) {
        throw Errors.business(
          400,
          "费用分类名称已存在",
          ErrorCodes.EXPENSE_CATEGORY_NAME_DUPLICATED,
        );
      }
    }
  }

  async listCategories(
    authContext: AuthContext,
    query: ExpenseRequestCategoryListQuery,
  ) {
    this.assertCanRead(authContext);
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const result = await expenseRequestCategoryRepository.list(query, tenantId);
    const list = result.list
      .map((item) => this.serializeCategory(item))
      .filter((item) => this.categoryMatchesFilters(item, query));
    const hasInMemoryFilters = Boolean(query.mode || query.department_code);
    const pagedList = hasInMemoryFilters
      ? list.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
      : list;
    const total = hasInMemoryFilters ? list.length : result.pagination.total;

    return {
      ...result,
      list: pagedList,
      pagination: {
        ...result.pagination,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
    };
  }

  async getCategoryById(authContext: AuthContext, id: string) {
    this.assertCanManage(authContext);
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const record = await expenseRequestCategoryRepository.findById(id, tenantId);
    if (!record) {
      throw Errors.business(
        404,
        "费用分类不存在",
        ErrorCodes.EXPENSE_CATEGORY_NOT_FOUND,
      );
    }

    return this.serializeCategory(record);
  }

  async createCategory(
    authContext: AuthContext,
    input: CreateExpenseRequestCategoryInput,
  ) {
    this.assertCanManage(authContext);
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const normalized = {
      ...input,
      code: this.normalizeCode(input.code),
      name: this.normalizeName(input.name),
    };
    await this.ensureCodeAndNameUnique(normalized, tenantId);
    const created = await expenseRequestCategoryRepository.create({
      ...normalized,
      tenant_id: tenantId,
    });
    return this.serializeCategory(created);
  }

  async updateCategory(
    authContext: AuthContext,
    id: string,
    input: UpdateExpenseRequestCategoryInput,
  ) {
    this.assertCanManage(authContext);
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const existing = await expenseRequestCategoryRepository.findById(id, tenantId);
    if (!existing) {
      throw Errors.business(
        404,
        "费用分类不存在",
        ErrorCodes.EXPENSE_CATEGORY_NOT_FOUND,
      );
    }

    const normalized = {
      ...input,
      ...(input.code !== undefined ? { code: this.normalizeCode(input.code) } : {}),
      ...(input.name !== undefined ? { name: this.normalizeName(input.name) } : {}),
    };
    await this.ensureCodeAndNameUnique(
      { code: normalized.code, name: normalized.name },
      tenantId,
      existing.id,
    );

    const updated = await expenseRequestCategoryRepository.update(
      id,
      normalized,
      tenantId,
    );
    return this.serializeCategory(updated);
  }

  async updateCategoryStatus(
    authContext: AuthContext,
    id: string,
    input: ExpenseRequestCategoryStatusUpdateInput,
  ) {
    this.assertCanManage(authContext);
    const tenantId = accessPolicyService.assertTenantId(authContext);
    const existing = await expenseRequestCategoryRepository.findById(id, tenantId);
    if (!existing) {
      throw Errors.business(
        404,
        "费用分类不存在",
        ErrorCodes.EXPENSE_CATEGORY_NOT_FOUND,
      );
    }

    const updated = await expenseRequestCategoryRepository.updateStatus(
      id,
      input.status,
      tenantId,
    );
    return this.serializeCategory(updated);
  }

  async resolveActiveCategoryByCode(
    code: string,
    tenantId?: string | null,
  ): Promise<ExpenseRequestCategoryRecord> {
    const normalizedCode = this.normalizeCode(code);
    const category = await expenseRequestCategoryRepository.findByCode(
      normalizedCode,
      tenantId,
    );

    if (!category) {
      throw Errors.business(
        400,
        "费用分类不存在",
        ErrorCodes.EXPENSE_CATEGORY_NOT_FOUND,
      );
    }

    if (category.status !== "active") {
      throw Errors.business(
        400,
        "费用分类已停用",
        ErrorCodes.EXPENSE_CATEGORY_DISABLED,
      );
    }

    return category;
  }
}

export const expenseRequestCategoryService = new ExpenseRequestCategoryService();
