import {
  customerProjectCampaignSummaryCacheKey,
  customerAppointmentRewardCampaignCacheKey,
  customerProjectScopeCacheKey,
  getCachedCustomerProjectCampaignSummary,
  getHotCacheEntry,
  getHotCacheValue,
  setCachedCustomerProjectCampaignSummary,
  setHotCacheValue,
  hasCachedCustomerAppointmentRewardCampaignMiss,
  setCachedCustomerAppointmentRewardCampaignMiss,
  buildCampaignSummary,
  getImagePublicUrl,
  listCustomerProfilesByMembership,
  getCustomerByAuthUserId,
  loadCustomerByAuthUserId,
  getCustomerById,
  getWechatAccessToken,
  getUserProfileByAuthUserId,
} from './legacy/base';
import {
  ensureCampaignRewardMetadata,
  getVoucherExpiresAt,
  getRewardClaimVoucherStatus,
  isCampaignRewardClaimable,
  buildRewardClaimVoucherPayload,
  ensureCampaignRewardClaimVoucher,
  serializeRecentHelpers,
  getRecentHelpers,
  ensureCampaignPhase2Metadata,
  buildEffectiveConfig,
  parseShareAssistConfigPayload,
  parseAppointmentRewardConfigPayload,
  buildNormalizedMarketingCampaignConfigPayload,
  normalizeMarketingCampaignTemplateEnabled,
  buildMarketingCampaignTemplateSnapshot,
  parseMarketingCampaignTemplateSnapshot,
  buildMarketingCampaignTemplateConfigPayload,
  buildEffectiveConfigFromMarketingCampaign,
} from './legacy/reward-config';
import {
  getConfigBlockReason,
  getMarketingCampaignBlockReason,
  throwConfigBlocked,
  getProjectConfig,
  isProjectInMarketingCampaignScope,
  getMatchingMarketingCampaign,
  loadMatchingMarketingCampaign,
  buildAppointmentRewardSummary,
  getEffectiveProjectConfig,
  getEffectiveShareCampaignConfig,
} from './legacy/config-access';
import {
  isCampaignOwnerViewer,
  buildViewerAssistInfo,
  buildAssistBlockedError,
  getOwnedProjectLogContext,
  getOwnedProject,
  loadOwnedProject,
  getOwnedProjectById,
  getOwnedCampaignById,
  getProjectLogById,
  getRecentImageProjectLog,
} from './legacy/owned-context';
import {
  loadRecentImageProjectLog,
  requestAiCopies,
  ensureShareCampaign,
  getCampaignByToken,
  resolveShareCampaignForOwnedLog,
  resolveOptionalShareCampaignForOwnedLog,
  buildCampaignPublicDetail,
} from './legacy/share-campaign-core';
import {
  generateShareCopies,
  getShareCard,
  getShareCampaignQrcodeBuffer,
  getRewardClaimVoucherQrcodeBuffer,
  getAppointmentRewardClaimVoucherQrcodeBuffer,
} from './legacy/public-actions';
import {
  getOrCreateShareCampaign,
  getShareCampaignDetail,
  openShareCampaign,
  assistShareCampaign,
} from './legacy/public-campaigns';
import {
  createShareRecord,
  loadCustomerProjectCampaignSummary,
  getCustomerProjectCampaignSummary,
  getCustomerCampaignDetail,
  listCustomerCampaignHelpers,
} from './legacy/customer-campaigns';
import {
  getOrCreateCustomerAppointmentRewardCampaign,
  loadCustomerAppointmentRewardCampaign,
  getCustomerAppointmentRewardCampaign,
  submitCustomerAppointmentRewardCampaign,
} from './legacy/customer-appointments';
import {
  getEmployeeProjectCampaignConfig,
  saveEmployeeProjectCampaignConfig,
  updateEmployeeProjectCampaignConfigStatus,
  listEmployeeShareCampaigns,
  getScopeProjectMap,
  getProjectTenantId,
  loadProjectTenantId,
  assertMarketingScopeProjectsAccessible,
  campaignVisibleToEmployee,
  getMarketingCampaignOrThrow,
  buildAppointmentRewardVoucherPayload,
  ensureAppointmentRewardMetadata,
} from './legacy/employee-config';
import {
  getMarketingCampaignTemplateOrThrow,
  resolveMarketingCampaignCreateInput,
  buildMarketingCampaignScopeRows,
  listMarketingCampaigns,
  listMarketingCampaignTemplates,
  getMarketingCampaignTemplateDetail,
  createMarketingCampaignTemplate,
  updateMarketingCampaignTemplate,
  updateMarketingCampaignTemplateStatus,
} from './legacy/marketing-campaigns';
import {
  getMarketingCampaignDetail,
  createMarketingCampaign,
  updateMarketingCampaign,
  updateMarketingCampaignStatus,
} from './legacy/marketing-campaign-details';
import {
  listMarketingCampaignInstances,
  getEmployeeAppointmentRewardCampaignDetail,
  confirmEmployeeAppointmentRewardArrive,
  claimEmployeeAppointmentReward,
} from './legacy/employee-rewards';
import {
  getEmployeeShareCampaignDetail,
  listEmployeeShareCampaignHelpers,
  updateEmployeeShareCampaignStatus,
  getEmployeeShareCampaignStatsSummary,
  getCampaignMetaForEmployeeClaim,
  getVoucherMetaForEmployeeClaim,
  getEmployeeVoucherDetail,
  claimCampaignReward,
  claimCampaignRewardByVoucher,
} from './legacy/employee-shares';
import type { CustomerProjectLogRow, CustomerRow } from './legacy/shared';

class CustomerProjectLogShareService {
  private customerByAuthUserCache = new Map<string, {
    expiresAt: number;
    value: CustomerRow;
  }>();
  private customerByAuthUserInFlight = new Map<string, Promise<CustomerRow>>();
  private ownedProjectCache = new Map<string, {
    expiresAt: number;
    value: Awaited<ReturnType<any>>;
  }>();
  private ownedProjectInFlight = new Map<
    string,
    Promise<Awaited<ReturnType<any>>>
  >();
  private projectTenantCache = new Map<string, {
    expiresAt: number;
    value: string | null;
  }>();
  private projectTenantInFlight = new Map<string, Promise<string | null>>();
  private matchingMarketingCampaignCache = new Map<string, {
    expiresAt: number;
    value: Awaited<ReturnType<any>>;
  }>();
  private matchingMarketingCampaignInFlight = new Map<
    string,
    Promise<Awaited<ReturnType<any>>>
  >();
  private recentImageProjectLogCache = new Map<string, {
    expiresAt: number;
    value: CustomerProjectLogRow | null;
  }>();
  private recentImageProjectLogInFlight = new Map<string, Promise<CustomerProjectLogRow | null>>();
  private customerProjectCampaignSummaryCache = new Map<string, {
    expiresAt: number;
    value: Awaited<ReturnType<any>>;
  }>();
  private customerProjectCampaignSummaryInFlight = new Map<
    string,
    Promise<Awaited<ReturnType<any>>>
  >();
  private customerAppointmentRewardCampaignMissCache = new Map<string, { expiresAt: number }>();
  private customerAppointmentRewardCampaignInFlight = new Map<
    string,
    Promise<Awaited<ReturnType<any>>>
  >();

  private customerProjectCampaignSummaryCacheKey = customerProjectCampaignSummaryCacheKey;
  private customerAppointmentRewardCampaignCacheKey = customerAppointmentRewardCampaignCacheKey;
  private customerProjectScopeCacheKey = customerProjectScopeCacheKey;
  private getHotCacheValue = getHotCacheValue;
  private getHotCacheEntry = getHotCacheEntry;
  private setHotCacheValue = setHotCacheValue;
  private getCachedCustomerProjectCampaignSummary = getCachedCustomerProjectCampaignSummary;
  private setCachedCustomerProjectCampaignSummary = setCachedCustomerProjectCampaignSummary;
  private hasCachedCustomerAppointmentRewardCampaignMiss = hasCachedCustomerAppointmentRewardCampaignMiss;
  private setCachedCustomerAppointmentRewardCampaignMiss = setCachedCustomerAppointmentRewardCampaignMiss;
  private buildCampaignSummary = buildCampaignSummary;
  private getImagePublicUrl = getImagePublicUrl;
  private listCustomerProfilesByMembership = listCustomerProfilesByMembership;
  private getCustomerByAuthUserId = getCustomerByAuthUserId;
  private loadCustomerByAuthUserId = loadCustomerByAuthUserId;
  private getCustomerById = getCustomerById;
  private getWechatAccessToken = getWechatAccessToken;
  private getUserProfileByAuthUserId = getUserProfileByAuthUserId;
  private ensureCampaignRewardMetadata = ensureCampaignRewardMetadata;
  private getVoucherExpiresAt = getVoucherExpiresAt;
  private getRewardClaimVoucherStatus = getRewardClaimVoucherStatus;
  private isCampaignRewardClaimable = isCampaignRewardClaimable;
  private buildRewardClaimVoucherPayload = buildRewardClaimVoucherPayload;
  private ensureCampaignRewardClaimVoucher = ensureCampaignRewardClaimVoucher;
  private serializeRecentHelpers = serializeRecentHelpers;
  private getRecentHelpers = getRecentHelpers;
  private ensureCampaignPhase2Metadata = ensureCampaignPhase2Metadata;
  private buildEffectiveConfig = buildEffectiveConfig;
  private parseShareAssistConfigPayload = parseShareAssistConfigPayload;
  private parseAppointmentRewardConfigPayload = parseAppointmentRewardConfigPayload;
  private buildNormalizedMarketingCampaignConfigPayload = buildNormalizedMarketingCampaignConfigPayload;
  private normalizeMarketingCampaignTemplateEnabled = normalizeMarketingCampaignTemplateEnabled;
  private buildMarketingCampaignTemplateSnapshot = buildMarketingCampaignTemplateSnapshot;
  private parseMarketingCampaignTemplateSnapshot = parseMarketingCampaignTemplateSnapshot;
  private buildMarketingCampaignTemplateConfigPayload = buildMarketingCampaignTemplateConfigPayload;
  private buildEffectiveConfigFromMarketingCampaign = buildEffectiveConfigFromMarketingCampaign;
  private getConfigBlockReason = getConfigBlockReason;
  private getMarketingCampaignBlockReason = getMarketingCampaignBlockReason;
  private throwConfigBlocked = throwConfigBlocked;
  private getProjectConfig = getProjectConfig;
  private isProjectInMarketingCampaignScope = isProjectInMarketingCampaignScope;
  private getMatchingMarketingCampaign = getMatchingMarketingCampaign;
  private loadMatchingMarketingCampaign = loadMatchingMarketingCampaign;
  private buildAppointmentRewardSummary = buildAppointmentRewardSummary;
  private getEffectiveProjectConfig = getEffectiveProjectConfig;
  private getEffectiveShareCampaignConfig = getEffectiveShareCampaignConfig;
  private isCampaignOwnerViewer = isCampaignOwnerViewer;
  private buildViewerAssistInfo = buildViewerAssistInfo;
  private buildAssistBlockedError = buildAssistBlockedError;
  private getOwnedProjectLogContext = getOwnedProjectLogContext;
  private getOwnedProject = getOwnedProject;
  private loadOwnedProject = loadOwnedProject;
  private getOwnedProjectById = getOwnedProjectById;
  private getOwnedCampaignById = getOwnedCampaignById;
  private getProjectLogById = getProjectLogById;
  private getRecentImageProjectLog = getRecentImageProjectLog;
  private loadRecentImageProjectLog = loadRecentImageProjectLog;
  private requestAiCopies = requestAiCopies;
  private ensureShareCampaign = ensureShareCampaign;
  private getCampaignByToken = getCampaignByToken;
  private resolveShareCampaignForOwnedLog = resolveShareCampaignForOwnedLog;
  private resolveOptionalShareCampaignForOwnedLog = resolveOptionalShareCampaignForOwnedLog;
  private buildCampaignPublicDetail = buildCampaignPublicDetail;
  generateShareCopies = generateShareCopies;
  getShareCard = getShareCard;
  getShareCampaignQrcodeBuffer = getShareCampaignQrcodeBuffer;
  getRewardClaimVoucherQrcodeBuffer = getRewardClaimVoucherQrcodeBuffer;
  getAppointmentRewardClaimVoucherQrcodeBuffer = getAppointmentRewardClaimVoucherQrcodeBuffer;
  getOrCreateShareCampaign = getOrCreateShareCampaign;
  getShareCampaignDetail = getShareCampaignDetail;
  openShareCampaign = openShareCampaign;
  assistShareCampaign = assistShareCampaign;
  createShareRecord = createShareRecord;
  private loadCustomerProjectCampaignSummary = loadCustomerProjectCampaignSummary;
  getCustomerProjectCampaignSummary = getCustomerProjectCampaignSummary;
  getCustomerCampaignDetail = getCustomerCampaignDetail;
  listCustomerCampaignHelpers = listCustomerCampaignHelpers;
  getOrCreateCustomerAppointmentRewardCampaign = getOrCreateCustomerAppointmentRewardCampaign;
  private loadCustomerAppointmentRewardCampaign = loadCustomerAppointmentRewardCampaign;
  getCustomerAppointmentRewardCampaign = getCustomerAppointmentRewardCampaign;
  submitCustomerAppointmentRewardCampaign = submitCustomerAppointmentRewardCampaign;
  getEmployeeProjectCampaignConfig = getEmployeeProjectCampaignConfig;
  saveEmployeeProjectCampaignConfig = saveEmployeeProjectCampaignConfig;
  updateEmployeeProjectCampaignConfigStatus = updateEmployeeProjectCampaignConfigStatus;
  listEmployeeShareCampaigns = listEmployeeShareCampaigns;
  private getScopeProjectMap = getScopeProjectMap;
  private getProjectTenantId = getProjectTenantId;
  private loadProjectTenantId = loadProjectTenantId;
  private assertMarketingScopeProjectsAccessible = assertMarketingScopeProjectsAccessible;
  private campaignVisibleToEmployee = campaignVisibleToEmployee;
  private getMarketingCampaignOrThrow = getMarketingCampaignOrThrow;
  private buildAppointmentRewardVoucherPayload = buildAppointmentRewardVoucherPayload;
  private ensureAppointmentRewardMetadata = ensureAppointmentRewardMetadata;
  private getMarketingCampaignTemplateOrThrow = getMarketingCampaignTemplateOrThrow;
  private resolveMarketingCampaignCreateInput = resolveMarketingCampaignCreateInput;
  private buildMarketingCampaignScopeRows = buildMarketingCampaignScopeRows;
  listMarketingCampaigns = listMarketingCampaigns;
  listMarketingCampaignTemplates = listMarketingCampaignTemplates;
  getMarketingCampaignTemplateDetail = getMarketingCampaignTemplateDetail;
  createMarketingCampaignTemplate = createMarketingCampaignTemplate;
  updateMarketingCampaignTemplate = updateMarketingCampaignTemplate;
  updateMarketingCampaignTemplateStatus = updateMarketingCampaignTemplateStatus;
  getMarketingCampaignDetail = getMarketingCampaignDetail;
  createMarketingCampaign = createMarketingCampaign;
  updateMarketingCampaign = updateMarketingCampaign;
  updateMarketingCampaignStatus = updateMarketingCampaignStatus;
  listMarketingCampaignInstances = listMarketingCampaignInstances;
  getEmployeeAppointmentRewardCampaignDetail = getEmployeeAppointmentRewardCampaignDetail;
  confirmEmployeeAppointmentRewardArrive = confirmEmployeeAppointmentRewardArrive;
  claimEmployeeAppointmentReward = claimEmployeeAppointmentReward;
  getEmployeeShareCampaignDetail = getEmployeeShareCampaignDetail;
  listEmployeeShareCampaignHelpers = listEmployeeShareCampaignHelpers;
  updateEmployeeShareCampaignStatus = updateEmployeeShareCampaignStatus;
  getEmployeeShareCampaignStatsSummary = getEmployeeShareCampaignStatsSummary;
  getCampaignMetaForEmployeeClaim = getCampaignMetaForEmployeeClaim;
  getVoucherMetaForEmployeeClaim = getVoucherMetaForEmployeeClaim;
  getEmployeeVoucherDetail = getEmployeeVoucherDetail;
  claimCampaignReward = claimCampaignReward;
  claimCampaignRewardByVoucher = claimCampaignRewardByVoucher;
}

export const customerProjectLogShareService = new CustomerProjectLogShareService();
