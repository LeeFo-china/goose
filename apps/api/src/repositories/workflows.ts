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
  getRuntimeInstanceById,
  listCompletedRuntimeProcedureNodes,
  listRuntimeInstances,
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
  listCompletedRuntimeProcedureNodes = listCompletedRuntimeProcedureNodes;
  startRuntimeInstance = startRuntimeInstance;
  completeRuntimeNode = completeRuntimeNode;
  cancelRuntimeInstance = cancelRuntimeInstance;
}

export const workflowRepository = new WorkflowRepository();
