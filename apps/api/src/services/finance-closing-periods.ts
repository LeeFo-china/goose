import { Errors } from "@/errors/error-factory";
import {
  financeClosingPeriodRepository,
  type FinanceClosingPeriodRow,
} from "@/repositories/finance-closing-periods";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  financeMonthlyOverviewService,
  type FinanceMonthlyOverview,
} from "@/services/finance-monthly-overview";

type FinanceClosingPeriodServiceDependencies = {
  repository: Pick<
    typeof financeClosingPeriodRepository,
    "list" | "findByMonth" | "findById" | "upsertDraft" | "close" | "reopen"
  >;
  monthlyOverviewService: Pick<
    typeof financeMonthlyOverviewService,
    "getMonthlyOverview"
  >;
  accessPolicyService: Pick<
    typeof accessPolicyService,
    "assertTenantContext" | "hasPermission"
  >;
};

export type FinanceClosingPeriodListQuery = {
  month?: string;
  page: number;
  pageSize: number;
};

export type CreateFinanceClosingDraftInput = {
  month: string;
  notes?: string;
};

export type CloseFinanceClosingPeriodInput = {
  notes?: string;
};

export type ReopenFinanceClosingPeriodInput = {
  reason: string;
};

export class FinanceClosingPeriodService {
  constructor(
    private readonly dependencies: FinanceClosingPeriodServiceDependencies = {
      repository: financeClosingPeriodRepository,
      monthlyOverviewService: financeMonthlyOverviewService,
      accessPolicyService,
    },
  ) {}

  async listPeriods(
    authContext: AuthContext,
    query: FinanceClosingPeriodListQuery,
  ) {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanReadClosing(authContext);

    return this.dependencies.repository.list({
      tenantId,
      month: query.month,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async createDraftSnapshot(
    authContext: AuthContext,
    input: CreateFinanceClosingDraftInput,
  ): Promise<FinanceClosingPeriodRow> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanManageClosing(authContext);

    const month = assertMonth(input.month);
    const existing = await this.dependencies.repository.findByMonth({
      tenantId,
      periodMonth: month,
    });
    if (existing?.status === "closed") {
      throw Errors.business(409, "该月份已结账，请先反结账后再生成草稿", "FINANCE_PERIOD_CLOSED");
    }

    const overview = await this.dependencies.monthlyOverviewService
      .getMonthlyOverview(authContext, { month });

    return this.dependencies.repository.upsertDraft({
      tenantId,
      periodMonth: month,
      snapshotJson: buildSnapshot(overview),
      notes: normalizeOptionalText(input.notes),
    });
  }

  async closePeriod(
    authContext: AuthContext,
    id: string,
    input: CloseFinanceClosingPeriodInput,
  ): Promise<FinanceClosingPeriodRow> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanManageClosing(authContext);

    const period = await this.getTenantPeriod(tenantId, id);
    if (period.status === "closed") {
      throw Errors.business(409, "该月份已完成结账", "FINANCE_PERIOD_ALREADY_CLOSED");
    }

    const overview = await this.dependencies.monthlyOverviewService
      .getMonthlyOverview(authContext, { month: period.period_month });

    return this.dependencies.repository.close({
      tenantId,
      id,
      closedByEmployeeId: authContext.employeeId ?? null,
      snapshotJson: buildSnapshot(overview),
      notes: normalizeOptionalText(input.notes),
    });
  }

  async reopenPeriod(
    authContext: AuthContext,
    id: string,
    input: ReopenFinanceClosingPeriodInput,
  ): Promise<FinanceClosingPeriodRow> {
    const tenantId = this.dependencies.accessPolicyService
      .assertTenantContext(authContext);
    this.assertCanManageClosing(authContext);

    const reason = normalizeRequiredText(input.reason, "请填写反结账原因");
    const period = await this.getTenantPeriod(tenantId, id);
    if (period.status !== "closed") {
      throw Errors.business(409, "只有已结账月份才能反结账", "FINANCE_PERIOD_NOT_CLOSED");
    }

    return this.dependencies.repository.reopen({
      tenantId,
      id,
      reopenedByEmployeeId: authContext.employeeId ?? null,
      reason,
    });
  }

  private async getTenantPeriod(tenantId: string, id: string) {
    const period = await this.dependencies.repository.findById({ tenantId, id });
    if (!period) {
      throw Errors.notFound("结账期间不存在");
    }
    return period;
  }

  private assertCanReadClosing(authContext: AuthContext) {
    const allowed = [
      "finance.closing.read",
      "finance.closing.manage",
      "finance.reports.read",
      "finance.view",
    ].some((permission) =>
      this.dependencies.accessPolicyService.hasPermission(
        authContext,
        permission,
      )
    );
    if (!allowed) throw Errors.forbidden();
  }

  private assertCanManageClosing(authContext: AuthContext) {
    if (
      !this.dependencies.accessPolicyService.hasPermission(
        authContext,
        "finance.closing.manage",
      )
    ) {
      throw Errors.forbidden();
    }
  }
}

function buildSnapshot(overview: FinanceMonthlyOverview) {
  return {
    scope: overview.scope,
    summary: overview.summary,
  };
}

function assertMonth(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw Errors.badRequest("月份格式必须为 YYYY-MM");
  }
  return value;
}

function normalizeOptionalText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

function normalizeRequiredText(value: string, message: string) {
  const normalized = value.trim();
  if (!normalized) throw Errors.badRequest(message);
  if (normalized.length > 500) throw Errors.badRequest("内容不能超过 500 个字符");
  return normalized;
}

export const financeClosingPeriodService =
  new FinanceClosingPeriodService();
