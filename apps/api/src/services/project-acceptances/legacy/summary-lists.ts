import { Errors } from "@/errors/error-factory";
import { projectAcceptanceRepository } from "@/repositories/project-acceptances";
import type {
  ProjectAcceptanceRow,
} from "@/repositories/project-acceptances";
import type {
  ProjectAcceptanceStatus,
  ProjectLogStageCode,
} from "@gooes/domain";
import {
  measureProjectAcceptanceTiming,
  type ProjectAcceptanceTimingSteps,
} from "./timing";

export async function loadCustomerAcceptanceSummaries(this: any,
    authUserId: string,
    query: {
      project_id: string;
      page: number;
      pageSize: number;
      status?: ProjectAcceptanceStatus;
      stage_code?: ProjectLogStageCode;
    },
    scope?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
    options?: { timing?: ProjectAcceptanceTimingSteps },
  ) {
    const timing = options?.timing;
    let customerId = scope?.customerId ?? null;
    let tenantId = scope?.tenantId ?? null;

    if (!tenantId || !customerId) {
      const customer = await measureProjectAcceptanceTiming(
        timing,
        "customer_lookup_ms",
        () => this.getCustomerByAuthUserOrScope(authUserId, scope),
      );
      if (!customer) throw Errors.forbidden();
      this.assertCustomerTenantAvailable(customer);
      customerId = customer.id;
      tenantId = customer.tenant_id;
    }

    const { list, projectFound } = await measureProjectAcceptanceTiming(
      timing,
      "acceptance_list_query_ms",
      () => projectAcceptanceRepository.listCustomerProjectAcceptanceSummaries({
        tenantId: tenantId!,
        customerId: customerId!,
        projectId: query.project_id,
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        stageCode: query.stage_code,
      }),
    );

    if (!projectFound) {
      throw Errors.notFound("项目不存在");
    }

    return {
      list: list.map((row: ProjectAcceptanceRow) =>
        this.buildSummaryDetail(row, null)
      ),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 0,
      },
    };
  }
