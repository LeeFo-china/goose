import {
  getOptions,
  getLatestSuccessfulRefsByEnvironment,
  getRuntimeVersions,
} from "./legacy/runtime";
import {
  listRuns,
  getRunFailureSummary,
  hydrateRunServiceLabels,
  listSuccessfulRefs,
} from "./legacy/runs";
import {
  listRefs,
  listBranchRefs,
  listTagRefs,
  listCommitRefs,
  assertRefExists,
} from "./legacy/refs";
import {
  assertTagNotExists,
  generateNextReleaseTagName,
  resolveCommit,
  createTag,
  createRollbackTag,
} from "./legacy/tags";
import {
  listActiveRuns,
  assertWorkflowIdle,
  findRecentRun,
  dispatch,
} from "./legacy/dispatch";

class ReleaseDeploymentService {
  getOptions = getOptions;
  private getLatestSuccessfulRefsByEnvironment = getLatestSuccessfulRefsByEnvironment;
  getRuntimeVersions = getRuntimeVersions;
  listRuns = listRuns;
  getRunFailureSummary = getRunFailureSummary;
  private hydrateRunServiceLabels = hydrateRunServiceLabels;
  listSuccessfulRefs = listSuccessfulRefs;
  listRefs = listRefs;
  private listBranchRefs = listBranchRefs;
  private listTagRefs = listTagRefs;
  private listCommitRefs = listCommitRefs;
  private assertRefExists = assertRefExists;
  private assertTagNotExists = assertTagNotExists;
  private generateNextReleaseTagName = generateNextReleaseTagName;
  private resolveCommit = resolveCommit;
  createTag = createTag;
  createRollbackTag = createRollbackTag;
  private listActiveRuns = listActiveRuns;
  private assertWorkflowIdle = assertWorkflowIdle;
  private findRecentRun = findRecentRun;
  dispatch = dispatch;
}

export const releaseDeploymentService = new ReleaseDeploymentService();
