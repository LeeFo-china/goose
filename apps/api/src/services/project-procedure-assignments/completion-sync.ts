import {
  isProjectConstructionStageCode,
  type ProjectLogStageCode,
} from "@gooes/domain";
import {
  projectProcedureAssignmentRepository,
} from "@/repositories/project-procedure-assignments";

type ProjectProcedureAssignmentRepositoryLike = Pick<
  typeof projectProcedureAssignmentRepository,
  "findActiveByProjectStage" | "markAssignmentCompleted"
>;

class ProjectProcedureAssignmentCompletionSyncService {
  constructor(
    private readonly repository: ProjectProcedureAssignmentRepositoryLike =
      projectProcedureAssignmentRepository,
  ) {}

  async markProcedureCompletedByStage(input: {
    tenantId: string;
    projectId: string;
    stageCode: ProjectLogStageCode;
    operatorEmployeeId: string | null;
  }) {
    if (!isProjectConstructionStageCode(input.stageCode)) {
      return null;
    }

    const active = await this.repository.findActiveByProjectStage({
      tenantId: input.tenantId,
      projectId: input.projectId,
      stageCode: input.stageCode,
    });
    if (!active) return null;

    return this.repository.markAssignmentCompleted({
      tenantId: input.tenantId,
      assignmentId: active.id,
      operatorEmployeeId: input.operatorEmployeeId,
    });
  }
}

export const projectProcedureAssignmentCompletionSyncService =
  new ProjectProcedureAssignmentCompletionSyncService();
