import {
  ProjectOperationalRiskRpcPageSchema,
  type ProjectOperationalRiskRpcPage,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type { ProjectOperationalRiskListQuery } from "@/schema/project-health";
import { SupabaseDB } from "@/utils/supabase/index";

type ProjectOperationalRiskPageInput = {
  tenantId: string;
  query: ProjectOperationalRiskListQuery;
};

export type ProjectOperationalRiskPageResult = {
  page: ProjectOperationalRiskRpcPage;
  rpcMs: number;
};

export class ProjectOperationalRiskRepository {
  async listPage(
    input: ProjectOperationalRiskPageInput,
  ): Promise<ProjectOperationalRiskPageResult> {
    const startedAt = Date.now();
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "get_project_operational_risk_page",
      {
        p_tenant_id: input.tenantId,
        p_page: input.query.page,
        p_page_size: Math.min(input.query.pageSize, 100),
        p_risk_type: input.query.risk_type ?? null,
        p_severity: input.query.severity ?? null,
        p_keyword: input.query.keyword ?? null,
        p_timezone_name: "Asia/Shanghai",
      },
    );
    const rpcMs = Date.now() - startedAt;

    if (error) {
      throw Errors.dbError("查询项目运营风险失败");
    }

    const parsed = ProjectOperationalRiskRpcPageSchema.safeParse(data);
    if (!parsed.success) {
      throw Errors.dbError("项目运营风险聚合返回结构异常");
    }

    return { page: parsed.data, rpcMs };
  }
}

export const projectOperationalRiskRepository =
  new ProjectOperationalRiskRepository();
