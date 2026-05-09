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
    return expenseRequestCategoryRepository.list(query, tenantId);
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

    return record;
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
    return expenseRequestCategoryRepository.create({
      ...normalized,
      tenant_id: tenantId,
    });
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

    return expenseRequestCategoryRepository.update(id, normalized, tenantId);
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

    return expenseRequestCategoryRepository.updateStatus(id, input.status, tenantId);
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
