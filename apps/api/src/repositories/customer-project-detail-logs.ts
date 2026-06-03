import { Errors } from "@/errors/error-factory";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";
import type { CustomerSelfServiceProjectLogRow } from "./customer-self-service";

export type CustomerProjectDetailLogRow = CustomerSelfServiceProjectLogRow & {
  employee_name: string | null;
  employee_avatar: string | null;
  comment_count: number | string | null;
  rating_count: number | string | null;
  rating_sum: number | string | null;
  my_rating: number | string | null;
};

class CustomerProjectDetailLogsRepository {
  private directSqlUnavailable = false;

  private async listLogsViaDirectSql(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
    pageSize: number;
  }) {
    const directSql = getDirectPostgresSql();
    if (!directSql) throw new Error("direct postgres is not configured");
    const rows = await directSql`
      SELECT *
      FROM public.list_customer_project_detail_logs(
        ${input.tenantId}::uuid,
        ${input.customerId}::uuid,
        ${input.projectId}::uuid,
        ${input.pageSize}::integer
      )
    `;
    return rows as CustomerProjectDetailLogRow[];
  }

  private async listLogsViaSupabaseRpc(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
    pageSize: number;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "list_customer_project_detail_logs",
      {
        p_tenant_id: input.tenantId,
        p_customer_id: input.customerId,
        p_project_id: input.projectId,
        p_page_size: input.pageSize,
      },
    );
    if (error) throw Errors.dbError("查询客户项目日志摘要失败", error);
    return (data || []) as CustomerProjectDetailLogRow[];
  }

  async listLogs(input: {
    tenantId: string;
    customerId: string;
    projectId: string;
    pageSize: number;
  }) {
    if (getDirectPostgresSql() && !this.directSqlUnavailable) {
      try {
        return await this.listLogsViaDirectSql(input);
      } catch {
        this.directSqlUnavailable = true;
      }
    }

    return this.listLogsViaSupabaseRpc(input);
  }
}

export const customerProjectDetailLogsRepository =
  new CustomerProjectDetailLogsRepository();
