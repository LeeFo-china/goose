import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type ProjectLogStageEvidenceRow = {
  id: string;
  stage_code: string | null;
  images: unknown;
  created_at: string | null;
};

class ProjectLogEvidenceRepository {
  async listStageLogEvidence(input: {
    projectId: string;
    tenantId: string;
    stageCode: string;
    limit?: number;
  }) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, stage_code, images, created_at")
      .eq("project_id", input.projectId)
      .eq("tenant_id", input.tenantId)
      .eq("stage_code", input.stageCode)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw Errors.dbError("查询项目施工日志凭证失败", error);
    }

    return (data || []) as ProjectLogStageEvidenceRow[];
  }
}

export const projectLogEvidenceRepository = new ProjectLogEvidenceRepository();
