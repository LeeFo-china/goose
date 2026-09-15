import { Errors } from "@/errors/error-factory";
import { douyinSourceStatsRepository, type DouyinSourceStatsRepository } from
  "@/repositories/douyin-source-stats";
import type { TenantDouyinSourceStatsQuery } from
  "@/schema/tenant-douyin-source-stats";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

type Dependencies = {
  readonly repository: Pick<DouyinSourceStatsRepository, "load">;
  readonly accessPolicy: Pick<typeof accessPolicyService,
    "assertTenantContext" | "assertPermission">;
};

export class TenantDouyinSourceStatsService {
  constructor(private readonly dependencies: Dependencies = {
    repository: douyinSourceStatsRepository,
    accessPolicy: accessPolicyService,
  }) {}

  async getStats(auth: AuthContext, query: TenantDouyinSourceStatsQuery) {
    const tenantId = this.dependencies.accessPolicy.assertTenantContext(auth);
    const scope = this.dependencies.accessPolicy.assertPermission(
      auth, "douyin_miniapp.read",
    );
    if (scope !== "all") throw Errors.forbidden();
    return await this.dependencies.repository.load({ tenantId, ...query });
  }
}

export const tenantDouyinSourceStatsService = new TenantDouyinSourceStatsService();
