import {
  requireTenantId,
  serializeExpenseRequest,
  resolveItems,
  ensureCurrentEmployee,
  getLatestExpenseRequest,
  assertEmployeeExists,
  assertProjectExists,
  assertCanLinkProject,
} from './legacy/base';
import {
  assertCanReadExpenseRequest,
  canAccessByVisibility,
  getVisibilityForPermission,
  assertCanOperateExpenseRequest,
  getProcessPermissionForQuery,
  mergeScope,
  buildCandidateScopeMap,
  scopeCoversApplicant,
} from './legacy/access';
import {
  getStepConfig,
  getApplicantEmployee,
  assertCandidateForStep,
  getApprovalRound,
  hasRecentApprovalAction,
  hasApprovalAction,
  appendApprovalOnce,
} from './legacy/approval-chain';
import {
  getProjectStatusName,
  buildProjectCandidateAddress,
  serializeProjectCandidate,
  filterProjectCandidatesByKeyword,
  getApprovalTemplate,
  listApprovalCandidates,
  listProjectCandidates,
} from './legacy/candidates';
import {
  createExpenseRequest,
  updateExpenseRequest,
  submitExpenseRequest,
} from './legacy/drafts';
import {
  approveExpenseRequest,
  rejectExpenseRequest,
  cancelExpenseRequest,
} from './legacy/workflow';
import {
  payExpenseRequest,
} from './legacy/payment';
import {
  getExpenseRequestById,
  listExpenseRequests,
  getStatsSummary,
} from './legacy/queries';

class ExpenseRequestService {
  private requireTenantId = requireTenantId;
  private serializeExpenseRequest = serializeExpenseRequest;
  private resolveItems = resolveItems;
  private ensureCurrentEmployee = ensureCurrentEmployee;
  private getLatestExpenseRequest = getLatestExpenseRequest;
  private assertEmployeeExists = assertEmployeeExists;
  private assertProjectExists = assertProjectExists;
  private assertCanLinkProject = assertCanLinkProject;
  private assertCanReadExpenseRequest = assertCanReadExpenseRequest;
  private canAccessByVisibility = canAccessByVisibility;
  private getVisibilityForPermission = getVisibilityForPermission;
  private assertCanOperateExpenseRequest = assertCanOperateExpenseRequest;
  private getProcessPermissionForQuery = getProcessPermissionForQuery;
  private mergeScope = mergeScope;
  private buildCandidateScopeMap = buildCandidateScopeMap;
  private scopeCoversApplicant = scopeCoversApplicant;
  private getStepConfig = getStepConfig;
  private getApplicantEmployee = getApplicantEmployee;
  private assertCandidateForStep = assertCandidateForStep;
  private getApprovalRound = getApprovalRound;
  private hasRecentApprovalAction = hasRecentApprovalAction;
  private hasApprovalAction = hasApprovalAction;
  private appendApprovalOnce = appendApprovalOnce;
  private getProjectStatusName = getProjectStatusName;
  private buildProjectCandidateAddress = buildProjectCandidateAddress;
  private serializeProjectCandidate = serializeProjectCandidate;
  private filterProjectCandidatesByKeyword = filterProjectCandidatesByKeyword;
  getApprovalTemplate = getApprovalTemplate;
  listApprovalCandidates = listApprovalCandidates;
  listProjectCandidates = listProjectCandidates;
  createExpenseRequest = createExpenseRequest;
  updateExpenseRequest = updateExpenseRequest;
  submitExpenseRequest = submitExpenseRequest;
  approveExpenseRequest = approveExpenseRequest;
  rejectExpenseRequest = rejectExpenseRequest;
  cancelExpenseRequest = cancelExpenseRequest;
  payExpenseRequest = payExpenseRequest;
  getExpenseRequestById = getExpenseRequestById;
  listExpenseRequests = listExpenseRequests;
  getStatsSummary = getStatsSummary;
}

export const expenseRequestService = new ExpenseRequestService();
