import {
  createDefinition,
  findDefinitionByKey,
  findDefinitionById,
  getDefinitionById,
  listDefinitions,
  updateActiveVersion,
  updateDefinition,
} from "./workflows/definitions";
import {
  getDraftGraph,
  getGraph,
  replaceDraftGraph,
} from "./workflows/graphs";
import {
  createVersion,
  getLatestVersion,
  getNextVersionNumber,
  getVersionById,
  listVersions,
  publishDefinition,
  updateVersionStatus,
} from "./workflows/versions";
import {
  archiveRuntimeInstance,
  cancelRuntimeInstance,
  completeRuntimeNode,
  findLatestRunningRuntimeInstance,
  getRuntimeInstanceById,
  listCompletedRuntimeProcedureNodes,
  listRunningInstanceCountsByVersion,
  listRuntimeInstanceNodesByInstanceIds,
  listRuntimeInstanceNodes,
  listRuntimeInstances,
  rebuildRuntimeInstance,
  startRuntimeInstance,
} from "./workflows/runtime";

export * from "./workflows/types";

class WorkflowRepository {
  listDefinitions = listDefinitions;
  getDefinitionById = getDefinitionById;
  findDefinitionById = findDefinitionById;
  createDefinition = createDefinition;
  findDefinitionByKey = findDefinitionByKey;
  updateDefinition = updateDefinition;
  getDraftGraph = getDraftGraph;
  getGraph = getGraph;
  replaceDraftGraph = replaceDraftGraph;
  getLatestVersion = getLatestVersion;
  getVersionById = getVersionById;
  listVersions = listVersions;
  getNextVersionNumber = getNextVersionNumber;
  createVersion = createVersion;
  publishDefinition = publishDefinition;
  updateVersionStatus = updateVersionStatus;
  updateActiveVersion = updateActiveVersion;
  listRuntimeInstances = listRuntimeInstances;
  getRuntimeInstanceById = getRuntimeInstanceById;
  findLatestRunningRuntimeInstance = findLatestRunningRuntimeInstance;
  listCompletedRuntimeProcedureNodes = listCompletedRuntimeProcedureNodes;
  listRunningInstanceCountsByVersion = listRunningInstanceCountsByVersion;
  listRuntimeInstanceNodes = listRuntimeInstanceNodes;
  listRuntimeInstanceNodesByInstanceIds = listRuntimeInstanceNodesByInstanceIds;
  startRuntimeInstance = startRuntimeInstance;
  completeRuntimeNode = completeRuntimeNode;
  cancelRuntimeInstance = cancelRuntimeInstance;
  archiveRuntimeInstance = archiveRuntimeInstance;
  rebuildRuntimeInstance = rebuildRuntimeInstance;
}

export const workflowRepository = new WorkflowRepository();
