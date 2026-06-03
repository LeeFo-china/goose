import { Errors } from "@/errors/error-factory";
import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { SupabaseDB } from "@/utils/supabase";

export type WechatCustomerBootstrapVerification = {
  oauth_matched: boolean;
  customer_membership_matched: boolean;
  employee_membership_matched: boolean;
  employee_user_matched: boolean;
  customer_context?: unknown;
  user_profile?: unknown;
  home_projects?: unknown;
};

class CustomerBootstrapAuthRepository {
  private directSqlUnavailable = false;

  private async verifyViaDirectSql(input: {
    userId: string;
    openid: string;
    tenantId?: string | null;
    customerId?: string | null;
    employeeId?: string | null;
    page: number;
    pageSize: number;
  }) {
    const directSql = getDirectPostgresSql();
    if (!directSql) throw new Error("direct postgres is not configured");
    const rows = await directSql`
      SELECT *
      FROM public.verify_wechat_customer_bootstrap(
        ${input.userId}::uuid,
        ${input.openid}::text,
        ${input.tenantId ?? null}::uuid,
        ${input.customerId ?? null}::uuid,
        ${input.employeeId ?? null}::uuid,
        ${input.page}::integer,
        ${input.pageSize}::integer,
        ${2}::integer
      )
    `;
    return this.ensureRecord(rows as WechatCustomerBootstrapVerification[]);
  }

  private async verifyViaSupabaseRpc(input: {
    userId: string;
    openid: string;
    tenantId?: string | null;
    customerId?: string | null;
    employeeId?: string | null;
    page: number;
    pageSize: number;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "verify_wechat_customer_bootstrap",
      {
        p_user_id: input.userId,
        p_openid: input.openid,
        p_tenant_id: input.tenantId ?? null,
        p_customer_id: input.customerId ?? null,
        p_employee_id: input.employeeId ?? null,
        p_page: input.page,
        p_page_size: input.pageSize,
        p_recent_logs_per_project: 2,
      },
    );
    if (error) throw Errors.dbError("校验客户首页微信身份失败", error);

    return this.ensureRecord((data || []) as WechatCustomerBootstrapVerification[]);
  }

  private ensureRecord(rows: WechatCustomerBootstrapVerification[]) {
    const [record] = rows;
    if (record) return record;
    throw Errors.dbError("校验客户首页微信身份失败", {
      message: "verify_wechat_customer_bootstrap returned no rows",
    });
  }

  async verifyWechatCustomerBootstrap(input: {
    userId: string;
    openid: string;
    tenantId?: string | null;
    customerId?: string | null;
    employeeId?: string | null;
    page: number;
    pageSize: number;
  }) {
    if (getDirectPostgresSql() && !this.directSqlUnavailable) {
      try {
        return await this.verifyViaDirectSql(input);
      } catch {
        this.directSqlUnavailable = true;
      }
    }

    return this.verifyViaSupabaseRpc(input);
  }
}

export const customerBootstrapAuthRepository =
  new CustomerBootstrapAuthRepository();
