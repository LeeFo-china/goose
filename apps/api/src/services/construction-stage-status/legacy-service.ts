import {
  assertCanCreateAcceptance,
  assertCanCreateProjectLog,
  assertProjectReadyForAcceptance,
} from "./legacy/assertions";
import {
  buildProjectConstructionStagesFromRows,
  listProjectConstructionStages,
  listProjectConstructionStagesForProject,
} from "./legacy/lists";

class ConstructionStageStatusService {
  listProjectConstructionStages = listProjectConstructionStages;
  listProjectConstructionStagesForProject = listProjectConstructionStagesForProject;
  buildProjectConstructionStagesFromRows = buildProjectConstructionStagesFromRows;
  assertCanCreateProjectLog = assertCanCreateProjectLog;
  assertCanCreateAcceptance = assertCanCreateAcceptance;
  assertProjectReadyForAcceptance = assertProjectReadyForAcceptance;
}

export const constructionStageStatusService =
  new ConstructionStageStatusService();
