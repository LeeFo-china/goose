import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import type {
  ApproveProjectAcceptanceInput,
  CancelProjectAcceptanceInput,
  CreateProjectAcceptanceInput,
  CustomerProjectAcceptanceOpenTicketQuery,
  CustomerConfirmProjectAcceptanceInput,
  CustomerDisputeProjectAcceptanceInput,
  NotifyProjectAcceptanceCustomerInput,
  ProjectAcceptanceListQuery,
  ProjectAcceptanceTemplateListQuery,
  RejectProjectAcceptanceInput,
  RectifyProjectAcceptanceInput,
  SubmitProjectAcceptanceInput,
  UpdateProjectAcceptanceTemplateInput,
  UpdateProjectAcceptanceInput,
  VerifyProjectAcceptanceOpenTicketInput,
} from "@/schema/project-acceptances";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { projectAcceptanceRepository } from "@/repositories/project-acceptances";
import {
  projectAcceptanceOpenTicketRepository,
  type ProjectAcceptanceOpenTicketRow,
} from "@/repositories/project-acceptance-open-tickets";
import { systemSettingsService } from "@/services/system-settings";
import { sendSmsTemplate } from "@/services/sms";
import { userIdentityService } from "@/services/user-identities";
import { wechatOpenLinkService } from "@/services/wechat-open-link";
import { projectStatusService } from "@/services/project-status";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import { projectSer } from "@/services/projects";
import type {
  ProjectAcceptanceActionRow,
  ProjectAcceptanceCustomerRow,
  ProjectAcceptanceEmployeeRow,
  ProjectAcceptanceItemRow,
  ProjectAcceptanceProjectRow,
  ProjectAcceptanceRow,
  ProjectAcceptanceTemplateItemRow,
  ProjectAcceptanceTemplateItemWriteRow,
  ProjectAcceptanceTemplateRow,
  ProjectAcceptanceTemplateSectionRow,
  ProjectAcceptanceTemplateSectionWriteRow,
} from "@/repositories/project-acceptances";
import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  PROJECT_ACCEPTANCE_STAGE_LABELS,
  PROJECT_LOG_STAGE_CONFIG,
  isProjectLogStageCode,
  type ProjectAcceptanceAction,
  type ProjectAcceptanceStatus,
  type ProjectAcceptanceType,
  type ProjectLogStageCode,
} from "@gooes/domain";
import { resolveStoredFileUrl } from "@/services/files/file-url-resolver";
const OPEN_ACCEPTANCE_STATUSES: ProjectAcceptanceStatus[] = [
  "draft",
  "submitted",
  "leader_approved",
  "rejected",
];
const CUSTOMER_ACCEPTANCE_LIST_CACHE_TTL_MS = 10_000;
const MAX_CUSTOMER_ACCEPTANCE_LIST_CACHE_SIZE = 2_000;

type AcceptanceImageSource = "acceptance_item" | "rectification_item";

type AcceptanceImageItem = {
  id?: string;
  acceptance_id?: string;
  item_id?: string;
  item_title?: string | null;
  path: string;
  url: string;
  thumb_url: string;
  source?: AcceptanceImageSource;
  created_at?: string | null;
};

type ActionMetadata = {
  images: string[];
  image_items: AcceptanceImageItem[];
  referenced_action_id: string | null;
  referenced_item_ids: string[];
  referenced_image_ids: string[];
  referenced_image_paths: string[];
  referenced_images: AcceptanceImageItem[];
};

type AcceptanceDetailItem = ProjectAcceptanceItemRow & {
  images: string[];
  image_items: AcceptanceImageItem[];
  rectification_images: string[];
  rectification_image_items: AcceptanceImageItem[];
};

type AcceptanceDetailSection = {
  id: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  items: AcceptanceDetailItem[];
};

type AcceptanceProgress = {
  total: number;
  checked: number;
  passed: number;
  failed: number;
  not_applicable: number;
  required_incomplete: number;
};

type AcceptanceDetail = ProjectAcceptanceRow & {
  stage_label: string | null;
  status_label: string;
  customer_status_label: string;
  has_customer_dispute: boolean;
  sections: AcceptanceDetailSection[];
  progress: AcceptanceProgress;
  failed_count: number;
  required_incomplete_count: number;
  can_submit: boolean;
  blocked_reason: string | null;
  items: AcceptanceDetailItem[];
  actions: Array<ProjectAcceptanceActionRow & {
    operator: ProjectAcceptanceEmployeeRow | ProjectAcceptanceCustomerRow | null;
    images: string[];
    image_items: AcceptanceImageItem[];
    referenced_action_id: string | null;
    referenced_item_ids: string[];
    referenced_image_ids: string[];
    referenced_image_paths: string[];
    referenced_images: AcceptanceImageItem[];
  }>;
  project: ProjectAcceptanceProjectRow | null;
  initiator: ProjectAcceptanceEmployeeRow | null;
  reviewer: ProjectAcceptanceEmployeeRow | null;
  customer: ProjectAcceptanceCustomerRow | null;
  latest_customer_notification: {
    id: string;
    status: string;
    send_status: string | null;
    send_error: string | null;
    phone: string;
    link_type: string | null;
    sent_at: string | null;
    expire_at: string;
    used_at: string | null;
    created_at: string;
  } | null;
};

type CreateAcceptanceResponseMode = "summary" | "detail";

type AcceptanceCreateSummary = Pick<
  ProjectAcceptanceRow,
  "id" | "project_id" | "acceptance_type" | "stage_code" | "status" | "created_at"
> & {
  stage_label: string | null;
};

type CustomerAcceptanceListResult = {
  list: AcceptanceDetail[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

class ProjectAcceptanceWorkflowService {
  assertTransition(input: {
    currentStatus: ProjectAcceptanceStatus;
    action: ProjectAcceptanceAction;
  }) {
    const allowed: Record<ProjectAcceptanceStatus, ProjectAcceptanceAction[]> = {
      draft: ["update", "submit", "cancel"],
      rejected: ["update", "submit", "employee_rectify", "cancel"],
      submitted: ["leader_approve", "leader_reject", "cancel"],
      leader_approved: ["customer_confirm", "customer_dispute", "cancel"],
      customer_confirmed: [],
      cancelled: [],
    };

    if (!allowed[input.currentStatus].includes(input.action)) {
      throw Errors.badRequest("当前验收状态不允许该操作");
    }
  }
}

const projectAcceptanceWorkflowService = new ProjectAcceptanceWorkflowService();

import {
  requireTenantId,
  getCachedCustomerAcceptanceList,
  setCachedCustomerAcceptanceList,
  clearCustomerAcceptanceListCache,
  invalidateAcceptanceRelatedCaches,
  customerAcceptanceListCacheKey,
  listCustomerProfilesByMembership,
  getCustomerByAuthUserId,
  getCustomerByAuthUserOrScope,
  getStatusLabel,
} from "./legacy/base";
import {
  normalizeImageArray,
  normalizeImageItems,
  buildAcceptanceImageId,
  normalizeAcceptanceImageItems,
  normalizeActionMetadata,
  normalizeImageReferenceSnapshot,
  buildImageReferenceCatalog,
  resolveReferencedImages,
  getImagePublicUrl,
} from "./legacy/image-metadata";
import {
  getStageLabel,
  isRecord,
  getStringField,
  getNumberField,
  getSnapshotSections,
  buildAcceptanceSections,
  buildAcceptanceProgress,
  getSubmitBlockReason,
  buildDetailFromParts,
  buildDetail,
} from "./legacy/detail-sections";
import {
  getCommonTenantId,
  groupBy,
  buildDetails,
  getRequiredAcceptance,
} from "./legacy/detail-bulk";
import {
  assertCanRead,
  assertCurrentEmployee,
  assertCanCreate,
  assertCanCreateFinalAcceptance,
  canManageAcceptance,
  assertCanUpdateOwn,
  assertCanSubmit,
  assertCanReview,
  assertCanReject,
  assertCanManage,
  resolveTemplate,
  assertCanCreateFinalAcceptanceForProject,
  resolveReviewer,
} from "./legacy/permissions";
import {
  recordAction,
  maskPhone,
  createTicketValue,
  getAcceptanceSmsExpireHours,
  getAcceptanceSmsLink,
  getAcceptanceCustomer,
  sendAcceptanceCustomerSms,
  notifyCustomerForAcceptanceInternal,
  verifyOpenTicketRow,
} from "./legacy/notifications";
import {
  listTemplates,
  getTemplate,
  updateTemplate,
  buildTemplateDetail,
  buildTemplateSections,
} from "./legacy/templates";
import {
  listAcceptances,
  getAcceptance,
  listCustomerAcceptances,
  loadCustomerAcceptances,
  getCustomerAcceptance,
  getCustomerAcceptanceByAuthOrTicket,
  verifyOpenTicket,
} from "./legacy/lists";
import {
  resolveCustomerActor,
  normalizeCustomerTenant,
  assertCustomerTenantAvailable,
  assertTenantAvailableById,
} from "./legacy/customer-auth";
import {
  createAcceptance,
  buildCreateSummary,
  applyUpdate,
  getLatestReturnActionIndex,
  getLatestEmployeeRectifyActionAfter,
  updateAcceptance,
  deleteDraftAcceptance,
} from "./legacy/create-update";
import {
  validateSubmitItems,
  submitAcceptance,
  approveAcceptance,
  notifyCustomerForAcceptance,
  rejectAcceptance,
} from "./legacy/submit-review";
import {
  customerConfirmAcceptance,
  customerDisputeAcceptance,
  rectifyAcceptance,
  cancelAcceptance,
} from "./legacy/customer-actions";

class ProjectAcceptanceService {

  private customerAcceptanceListCache = new Map<string, {
    expiresAt: number;
    value: CustomerAcceptanceListResult;
  }>();
  private customerAcceptanceListInFlight = new Map<string, Promise<CustomerAcceptanceListResult>>();

  private requireTenantId = requireTenantId;
  private getCachedCustomerAcceptanceList = getCachedCustomerAcceptanceList;
  private setCachedCustomerAcceptanceList = setCachedCustomerAcceptanceList;
  private clearCustomerAcceptanceListCache = clearCustomerAcceptanceListCache;
  private invalidateAcceptanceRelatedCaches = invalidateAcceptanceRelatedCaches;
  private customerAcceptanceListCacheKey = customerAcceptanceListCacheKey;
  private listCustomerProfilesByMembership = listCustomerProfilesByMembership;
  private getCustomerByAuthUserId = getCustomerByAuthUserId;
  private getCustomerByAuthUserOrScope = getCustomerByAuthUserOrScope;
  private getStatusLabel = getStatusLabel;
  private normalizeImageArray = normalizeImageArray;
  private normalizeImageItems = normalizeImageItems;
  private buildAcceptanceImageId = buildAcceptanceImageId;
  private normalizeAcceptanceImageItems = normalizeAcceptanceImageItems;
  private normalizeActionMetadata = normalizeActionMetadata;
  private normalizeImageReferenceSnapshot = normalizeImageReferenceSnapshot;
  private buildImageReferenceCatalog = buildImageReferenceCatalog;
  private resolveReferencedImages = resolveReferencedImages;
  private getImagePublicUrl = getImagePublicUrl;
  private getStageLabel = getStageLabel;
  private isRecord = isRecord;
  private getStringField = getStringField;
  private getNumberField = getNumberField;
  private getSnapshotSections = getSnapshotSections;
  private buildAcceptanceSections = buildAcceptanceSections;
  private buildAcceptanceProgress = buildAcceptanceProgress;
  private getSubmitBlockReason = getSubmitBlockReason;
  private buildDetailFromParts = buildDetailFromParts;
  private buildDetail = buildDetail;
  private getCommonTenantId = getCommonTenantId;
  private groupBy = groupBy;
  private buildDetails = buildDetails;
  private getRequiredAcceptance = getRequiredAcceptance;
  private assertCanRead = assertCanRead;
  private assertCurrentEmployee = assertCurrentEmployee;
  private assertCanCreate = assertCanCreate;
  private assertCanCreateFinalAcceptance = assertCanCreateFinalAcceptance;
  private canManageAcceptance = canManageAcceptance;
  private assertCanUpdateOwn = assertCanUpdateOwn;
  private assertCanSubmit = assertCanSubmit;
  private assertCanReview = assertCanReview;
  private assertCanReject = assertCanReject;
  private assertCanManage = assertCanManage;
  private resolveTemplate = resolveTemplate;
  private assertCanCreateFinalAcceptanceForProject = assertCanCreateFinalAcceptanceForProject;
  private resolveReviewer = resolveReviewer;
  private recordAction = recordAction;
  private maskPhone = maskPhone;
  private createTicketValue = createTicketValue;
  private getAcceptanceSmsExpireHours = getAcceptanceSmsExpireHours;
  private getAcceptanceSmsLink = getAcceptanceSmsLink;
  private getAcceptanceCustomer = getAcceptanceCustomer;
  private sendAcceptanceCustomerSms = sendAcceptanceCustomerSms;
  private notifyCustomerForAcceptanceInternal = notifyCustomerForAcceptanceInternal;
  private verifyOpenTicketRow = verifyOpenTicketRow;
  listTemplates = listTemplates;
  getTemplate = getTemplate;
  updateTemplate = updateTemplate;
  private buildTemplateDetail = buildTemplateDetail;
  private buildTemplateSections = buildTemplateSections;
  listAcceptances = listAcceptances;
  getAcceptance = getAcceptance;
  listCustomerAcceptances = listCustomerAcceptances;
  private loadCustomerAcceptances = loadCustomerAcceptances;
  getCustomerAcceptance = getCustomerAcceptance;
  getCustomerAcceptanceByAuthOrTicket = getCustomerAcceptanceByAuthOrTicket;
  verifyOpenTicket = verifyOpenTicket;
  private resolveCustomerActor = resolveCustomerActor;
  private normalizeCustomerTenant = normalizeCustomerTenant;
  private assertCustomerTenantAvailable = assertCustomerTenantAvailable;
  private assertTenantAvailableById = assertTenantAvailableById;
  createAcceptance = createAcceptance;
  private buildCreateSummary = buildCreateSummary;
  private applyUpdate = applyUpdate;
  private getLatestReturnActionIndex = getLatestReturnActionIndex;
  private getLatestEmployeeRectifyActionAfter = getLatestEmployeeRectifyActionAfter;
  updateAcceptance = updateAcceptance;
  deleteDraftAcceptance = deleteDraftAcceptance;
  private validateSubmitItems = validateSubmitItems;
  submitAcceptance = submitAcceptance;
  approveAcceptance = approveAcceptance;
  notifyCustomerForAcceptance = notifyCustomerForAcceptance;
  rejectAcceptance = rejectAcceptance;
  customerConfirmAcceptance = customerConfirmAcceptance;
  customerDisputeAcceptance = customerDisputeAcceptance;
  rectifyAcceptance = rectifyAcceptance;
  cancelAcceptance = cancelAcceptance;
}

export const projectAcceptanceService = new ProjectAcceptanceService();
