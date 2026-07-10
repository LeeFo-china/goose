import { Errors } from "@/errors/error-factory";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";
import { executeCancellableSqlQuery } from "@/utils/cancellable-sql-query";
import type { CustomerSelfServiceProjectLogRow } from "./customer-self-service";

export type CustomerProjectDetailLogRow = CustomerSelfServiceProjectLogRow & {
  employee_name: string | null;
  employee_avatar: string | null;
  comment_count: number | string | null;
  rating_count: number | string | null;
  rating_sum: number | string | null;
  my_rating: number | string | null;
};

type RepositoryDependencies = {
  getDirectSql?: typeof getDirectPostgresSql;
  getAdminClient?: typeof SupabaseDB.getAdminClient;
};

type ListLogsInput = {
  tenantId: string;
  customerId: string;
  projectId: string;
  pageSize: number;
  signal?: AbortSignal;
};

export class CustomerProjectDetailLogsRepository {
  private directSqlUnavailable = false;
  private readonly getDirectSql: typeof getDirectPostgresSql;
  private readonly getAdminClient: typeof SupabaseDB.getAdminClient;

  constructor(dependencies: RepositoryDependencies = {}) {
    this.getDirectSql = dependencies.getDirectSql ?? getDirectPostgresSql;
    this.getAdminClient = dependencies.getAdminClient ?? (() => SupabaseDB.getAdminClient());
  }

  private async listLogsViaDirectSql(
    directSql: NonNullable<ReturnType<typeof getDirectPostgresSql>>,
    input: ListLogsInput,
  ) {
    const query = directSql`
      SELECT *
      FROM public.list_customer_project_detail_logs(
        ${input.tenantId}::uuid,
        ${input.customerId}::uuid,
        ${input.projectId}::uuid,
        ${input.pageSize}::integer
      )
    `;
    const rows = await executeCancellableSqlQuery(query, input.signal);
    return rows as CustomerProjectDetailLogRow[];
  }

  private async listLogsViaSupabaseRpc(input: ListLogsInput) {
    const request = this.getAdminClient().rpc(
      "list_customer_project_detail_logs",
      {
        p_tenant_id: input.tenantId,
        p_customer_id: input.customerId,
        p_project_id: input.projectId,
        p_page_size: input.pageSize,
      },
    );
    const { data, error } = await (input.signal
      ? request.abortSignal(input.signal)
      : request);
    if (error) throw Errors.dbError("查询客户项目日志摘要失败", error);
    return (data || []) as CustomerProjectDetailLogRow[];
  }

  async listLogs(input: ListLogsInput) {
    const directSql = this.getDirectSql();
    if (directSql && !this.directSqlUnavailable) {
      try {
        return await this.listLogsViaDirectSql(directSql, input);
      } catch {
        input.signal?.throwIfAborted();
        this.directSqlUnavailable = true;
      }
    }

    return this.listLogsViaSupabaseRpc(input);
  }
}

export const customerProjectDetailLogsRepository =
  new CustomerProjectDetailLogsRepository();
