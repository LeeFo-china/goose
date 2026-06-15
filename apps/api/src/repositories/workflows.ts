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
  publishDefinition,
} from "./workflows/versions";
import {
  cancelRuntimeInstance,
  completeRuntimeNode,
  findLatestRunningRuntimeInstance,
  getRuntimeInstanceById,
  listCompletedRuntimeProcedureNodes,
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
  getNextVersionNumber = getNextVersionNumber;
  createVersion = createVersion;
  publishDefinition = publishDefinition;
  updateActiveVersion = updateActiveVersion;
  listRuntimeInstances = listRuntimeInstances;
  getRuntimeInstanceById = getRuntimeInstanceById;
  findLatestRunningRuntimeInstance = findLatestRunningRuntimeInstance;
  listCompletedRuntimeProcedureNodes = listCompletedRuntimeProcedureNodes;
  listRuntimeInstanceNodes = listRuntimeInstanceNodes;
  startRuntimeInstance = startRuntimeInstance;
  completeRuntimeNode = completeRuntimeNode;
  cancelRuntimeInstance = cancelRuntimeInstance;
  rebuildRuntimeInstance = rebuildRuntimeInstance;
}

export const workflowRepository = new WorkflowRepository();
