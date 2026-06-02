import {
  getBootstrap,
  loadProjectLogs,
  emptyStatusActions,
  buildStatusActionsFromProject,
} from "./legacy/orchestration";
import {
  buildLogsFromBundle,
  buildCommentAggregateMap,
  buildProjectLogEntry,
  buildProjectLogEntryBlockedReason,
  buildProjectLogEntryNextAction,
} from "./legacy/log-entry";
import {
  loadOptional,
  createEmptyTimings,
  measure,
  withTimeout,
  toPartialError,
} from "./legacy/timing";
import {
  buildPermissions,
  buildPermissionsFromKnownData,
  toPublicPermissions,
  canAccessKnownProjectByOptionalPermission,
  canAccessKnownProjectByPermission,
  canWriteKnownProjectLog,
  isKnownProjectInTenant,
  hasEmployeeProjectAccess,
  hasDepartmentMember,
  normalizeObject,
  getRelationId,
  completePermissionsByStages,
  canAccessProjectByOptionalPermission,
  canAccessProjectByPermission,
  canWriteProjectLog,
} from "./legacy/permissions";
import {
  buildNextAction,
  selectNextAcceptanceActionStage,
  getAcceptanceActionPriority,
  getAcceptanceActionLabel,
  buildAcceptanceNextActionTitle,
  buildAcceptanceNextActionDescription,
} from "./legacy/next-action";

export type { EmployeeProjectDetailBootstrapTimings } from "./legacy/shared";

class EmployeeProjectDetailBootstrapService {
  getBootstrap = getBootstrap;

  private buildLogsFromBundle = buildLogsFromBundle;
  private buildCommentAggregateMap = buildCommentAggregateMap;
  private buildProjectLogEntry = buildProjectLogEntry;
  private buildProjectLogEntryBlockedReason = buildProjectLogEntryBlockedReason;
  private buildProjectLogEntryNextAction = buildProjectLogEntryNextAction;
  private loadProjectLogs = loadProjectLogs;
  private loadOptional = loadOptional;
  private createEmptyTimings = createEmptyTimings;
  private measure = measure;
  private withTimeout = withTimeout;
  private toPartialError = toPartialError;
  private emptyStatusActions = emptyStatusActions;
  private buildStatusActionsFromProject = buildStatusActionsFromProject;
  private buildPermissions = buildPermissions;
  private buildPermissionsFromKnownData = buildPermissionsFromKnownData;
  private toPublicPermissions = toPublicPermissions;
  private canAccessKnownProjectByOptionalPermission = canAccessKnownProjectByOptionalPermission;
  private canAccessKnownProjectByPermission = canAccessKnownProjectByPermission;
  private canWriteKnownProjectLog = canWriteKnownProjectLog;
  private isKnownProjectInTenant = isKnownProjectInTenant;
  private hasEmployeeProjectAccess = hasEmployeeProjectAccess;
  private hasDepartmentMember = hasDepartmentMember;
  private normalizeObject = normalizeObject;
  private getRelationId = getRelationId;
  private completePermissionsByStages = completePermissionsByStages;
  private canAccessProjectByOptionalPermission = canAccessProjectByOptionalPermission;
  private canAccessProjectByPermission = canAccessProjectByPermission;
  private canWriteProjectLog = canWriteProjectLog;
  private buildNextAction = buildNextAction;
  private selectNextAcceptanceActionStage = selectNextAcceptanceActionStage;
  private getAcceptanceActionPriority = getAcceptanceActionPriority;
  private getAcceptanceActionLabel = getAcceptanceActionLabel;
  private buildAcceptanceNextActionTitle = buildAcceptanceNextActionTitle;
  private buildAcceptanceNextActionDescription = buildAcceptanceNextActionDescription;
}

export const employeeProjectDetailBootstrapService =
  new EmployeeProjectDetailBootstrapService();
