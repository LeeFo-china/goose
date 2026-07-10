import { getDirectPostgresSql } from "@/utils/postgres-direct";
import { executeCancellableSqlQuery } from "@/utils/cancellable-sql-query";

type CampaignType = "share_assist" | "appointment_reward";

type HasMatchRow = { has_match: boolean };

type RepositoryDependencies = {
  getDirectSql?: typeof getDirectPostgresSql;
};

export class CustomerCampaignBootstrapRepository {
  private directSqlUnavailable = false;
  private readonly getDirectSql: typeof getDirectPostgresSql;

  constructor(dependencies: RepositoryDependencies = {}) {
    this.getDirectSql = dependencies.getDirectSql ?? getDirectPostgresSql;
  }

  async hasMatchingMarketingCampaign(input: {
    tenantId: string | null;
    projectId: string;
    campaignType: CampaignType;
    signal?: AbortSignal;
  }) {
    input.signal?.throwIfAborted();
    if (!this.getDirectSql() || this.directSqlUnavailable) return null;

    try {
      const directSql = this.getDirectSql()!;
      const query = directSql`
        SELECT EXISTS (
          SELECT 1
          FROM public.marketing_campaigns AS campaign
          WHERE campaign.campaign_type = ${input.campaignType}
            AND campaign.enabled = true
            AND campaign.status = 'active'
            AND (
              ${input.tenantId ?? null}::uuid IS NULL
              OR campaign.tenant_id = ${input.tenantId ?? null}::uuid
            )
            AND (
              campaign.valid_from IS NULL
              OR campaign.valid_from <= now()
            )
            AND NOT (
              campaign.auto_close_on_expire = true
              AND campaign.valid_until IS NOT NULL
              AND campaign.valid_until < now()
            )
            AND (
              (
                campaign.target_scope_type = 'all_projects'
                AND NOT EXISTS (
                  SELECT 1
                  FROM public.marketing_campaign_project_scopes AS scope
                  WHERE scope.campaign_id = campaign.id
                    AND scope.project_id = ${input.projectId}::uuid
                    AND scope.scope_mode = 'exclude'
                )
              )
              OR (
                campaign.target_scope_type = 'project_list'
                AND EXISTS (
                  SELECT 1
                  FROM public.marketing_campaign_project_scopes AS scope
                  WHERE scope.campaign_id = campaign.id
                    AND scope.project_id = ${input.projectId}::uuid
                    AND scope.scope_mode = 'include'
                )
              )
            )
          LIMIT 1
        ) AS has_match
      `;
      const rows = await executeCancellableSqlQuery(query, input.signal);
      return Boolean((rows[0] as HasMatchRow | undefined)?.has_match);
    } catch {
      input.signal?.throwIfAborted();
      this.directSqlUnavailable = true;
      return null;
    }
  }

  async hasActiveLegacyShareConfig(projectId: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!this.getDirectSql() || this.directSqlUnavailable) return null;

    try {
      const directSql = this.getDirectSql()!;
      const query = directSql`
        SELECT EXISTS (
          SELECT 1
          FROM public.project_share_campaign_configs AS config
          WHERE config.project_id = ${projectId}::uuid
            AND config.enabled = true
            AND config.config_status = 'active'
            AND (
              config.valid_from IS NULL
              OR config.valid_from <= now()
            )
            AND NOT (
              config.auto_close_on_expire = true
              AND config.valid_until IS NOT NULL
              AND config.valid_until < now()
            )
          LIMIT 1
        ) AS has_match
      `;
      const rows = await executeCancellableSqlQuery(query, signal);
      return Boolean((rows[0] as HasMatchRow | undefined)?.has_match);
    } catch {
      signal?.throwIfAborted();
      this.directSqlUnavailable = true;
      return null;
    }
  }
}

export const customerCampaignBootstrapRepository =
  new CustomerCampaignBootstrapRepository();
