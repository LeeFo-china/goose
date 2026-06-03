import { getDirectPostgresSql } from "@/utils/postgres-direct";

export type CustomerServiceConfig = {
  enabled: boolean;
  phone: string | null;
  working_hours: string | null;
  notice: string | null;
};

type ConfigRow = {
  key: string;
  value_text: string | null;
};

class CustomerServiceConfigRepository {
  private directSqlUnavailable = false;

  async getConfig(tenantId: string | null | undefined) {
    if (!getDirectPostgresSql() || this.directSqlUnavailable) return null;

    try {
      const directSql = getDirectPostgresSql()!;
      const rows = await directSql`
        SELECT DISTINCT ON (setting.key)
          setting.key,
          setting.value_text
        FROM public.system_settings AS setting
        WHERE setting.key IN (
          'CUSTOMER_SERVICE_ENABLED',
          'CUSTOMER_SERVICE_PHONE',
          'CUSTOMER_SERVICE_WORKING_HOURS',
          'CUSTOMER_SERVICE_NOTICE'
        )
          AND setting.status = 'active'
          AND (
            setting.tenant_id IS NULL
            OR setting.tenant_id = ${tenantId ?? null}::uuid
          )
        ORDER BY setting.key, setting.tenant_id NULLS LAST
      `;
      return this.buildConfig(rows as ConfigRow[]);
    } catch {
      this.directSqlUnavailable = true;
      return null;
    }
  }

  private buildConfig(rows: ConfigRow[]): CustomerServiceConfig {
    const values = new Map(rows.map((row) => [row.key, row.value_text ?? ""]));
    return {
      enabled: values.get("CUSTOMER_SERVICE_ENABLED")?.toLowerCase() === "true",
      phone: values.get("CUSTOMER_SERVICE_PHONE") || null,
      working_hours: values.get("CUSTOMER_SERVICE_WORKING_HOURS") || null,
      notice: values.get("CUSTOMER_SERVICE_NOTICE") || null,
    };
  }
}

export const customerServiceConfigRepository =
  new CustomerServiceConfigRepository();
