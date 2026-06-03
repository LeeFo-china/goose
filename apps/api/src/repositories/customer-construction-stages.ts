import { Errors } from "@/errors/error-factory";
import {
  type ProjectAcceptanceProjectRow,
  type ProjectAcceptanceRow,
} from "@/repositories/project-acceptances";
import type {
  ProjectLogLatestStageRow,
  ProjectLogStageSummaryRow,
} from "@/repositories/project-logs";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";

type CustomerConstructionStagesRpcRow = {
  project: ProjectAcceptanceProjectRow;
  acceptance_rows: ProjectAcceptanceRow[];
  log_rows: ProjectLogStageSummaryRow[];
  latest_log_rows: ProjectLogLatestStageRow[];
};

class CustomerConstructionStagesRepository {
  private directSqlUnavailable = false;

  private ensureRow(rows: CustomerConstructionStagesRpcRow[]) {
    return rows[0] ?? null;
  }

  private async getBootstrapViaDirectSql(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    const directSql = getDirectPostgresSql();
    if (!directSql) throw new Error("direct postgres is not configured");
    const rows = await directSql`
      SELECT *
      FROM public.get_customer_project_construction_stage_bootstrap(
        ${input.tenantId}::uuid,
        ${input.customerId}::uuid,
        ${input.projectId}::uuid
      )
    `;
    return this.ensureRow(rows as CustomerConstructionStagesRpcRow[]);
  }

  private async getBootstrapViaSupabaseRpc(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "get_customer_project_construction_stage_bootstrap",
      {
        p_tenant_id: input.tenantId,
        p_customer_id: input.customerId,
        p_project_id: input.projectId,
      },
    );

    if (error) throw Errors.dbError("查询客户项目施工阶段失败", error);
    return this.ensureRow((data || []) as CustomerConstructionStagesRpcRow[]);
  }

  async getBootstrap(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
  }) {
    if (getDirectPostgresSql() && !this.directSqlUnavailable) {
      try {
        return await this.getBootstrapViaDirectSql(input);
      } catch {
        this.directSqlUnavailable = true;
      }
    }

    return this.getBootstrapViaSupabaseRpc(input);
  }
}

export const customerConstructionStagesRepository =
  new CustomerConstructionStagesRepository();
