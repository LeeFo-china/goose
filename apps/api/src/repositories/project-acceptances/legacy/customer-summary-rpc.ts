import { Errors } from "./shared";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { executeCancellableSqlQuery } from "@/utils/cancellable-sql-query";
import type { ProjectAcceptanceRow, ProjectAcceptanceStatus, ProjectLogStageCode } from "./shared";

type CustomerAcceptanceSummaryRpcRow = ProjectAcceptanceRow & {
  project_valid: boolean;
  id: string | null;
};

export async function listCustomerProjectAcceptanceSummaries(this: any, input: {
  tenantId: string;
  customerId: string;
  projectId: string;
  page: number;
  pageSize: number;
  status?: ProjectAcceptanceStatus;
  stageCode?: ProjectLogStageCode;
  signal?: AbortSignal;
}) {
  const directSql = this.getDirectSql() as ReturnType<typeof getDirectPostgresSql>;
  if (directSql && !this.customerAcceptanceSummaryDirectSqlUnavailable) {
    try {
      const query = directSql`
        SELECT *
        FROM public.list_customer_project_acceptance_summaries(
          ${input.tenantId}::uuid,
          ${input.customerId}::uuid,
          ${input.projectId}::uuid,
          ${input.page}::integer,
          ${input.pageSize}::integer,
          ${input.status ?? null}::text,
          ${input.stageCode ?? null}::text
        )
      `;
      const rows = await executeCancellableSqlQuery(query, input.signal);
      return buildCustomerAcceptanceSummaryResult(
        rows as CustomerAcceptanceSummaryRpcRow[],
      );
    } catch {
      input.signal?.throwIfAborted();
      this.customerAcceptanceSummaryDirectSqlUnavailable = true;
    }
  }

  const request = this.getAdminClient().rpc(
    "list_customer_project_acceptance_summaries",
    {
      p_tenant_id: input.tenantId,
      p_customer_id: input.customerId,
      p_project_id: input.projectId,
      p_page: input.page,
      p_page_size: input.pageSize,
      p_status: input.status ?? null,
      p_stage_code: input.stageCode ?? null,
    },
  );
  const { data, error } = await (input.signal
    ? request.abortSignal(input.signal)
    : request);

  if (error) throw Errors.dbError("查询客户项目验收摘要失败", error);
  return buildCustomerAcceptanceSummaryResult(
    (data || []) as CustomerAcceptanceSummaryRpcRow[],
  );
}

function buildCustomerAcceptanceSummaryResult(
  rows: CustomerAcceptanceSummaryRpcRow[],
) {
  return {
    projectFound: rows.length > 0,
    list: rows.filter((row) => row.id).map((row) => row as ProjectAcceptanceRow),
  };
}
