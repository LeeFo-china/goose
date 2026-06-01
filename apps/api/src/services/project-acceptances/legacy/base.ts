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

export function requireTenantId(this: any, authContext: AuthContext) {
    return accessPolicyService.assertTenantContext(authContext);
  }

export function getCachedCustomerAcceptanceList(this: any, cacheKey: string) {
    const item = this.customerAcceptanceListCache.get(cacheKey);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      this.customerAcceptanceListCache.delete(cacheKey);
      return null;
    }

    return item.value;
  }

export function setCachedCustomerAcceptanceList(this: any, 
    cacheKey: string,
    value: CustomerAcceptanceListResult,
  ) {
    const now = Date.now();
    if (this.customerAcceptanceListCache.size >= MAX_CUSTOMER_ACCEPTANCE_LIST_CACHE_SIZE) {
      for (const [key, item] of this.customerAcceptanceListCache.entries()) {
        if (item.expiresAt <= now) {
          this.customerAcceptanceListCache.delete(key);
        }
      }

      if (this.customerAcceptanceListCache.size >= MAX_CUSTOMER_ACCEPTANCE_LIST_CACHE_SIZE) {
        this.customerAcceptanceListCache.clear();
      }
    }

    this.customerAcceptanceListCache.set(cacheKey, {
      expiresAt: now + CUSTOMER_ACCEPTANCE_LIST_CACHE_TTL_MS,
      value,
    });
  }

export function clearCustomerAcceptanceListCache(this: any) {
    this.customerAcceptanceListCache.clear();
    this.customerAcceptanceListInFlight.clear();
  }

export function invalidateAcceptanceRelatedCaches(this: any, projectId?: string | null) {
    this.clearCustomerAcceptanceListCache();
    if (projectId) {
      projectSer.invalidateEmployeeProjectBootstrapCache(projectId);
    }
  }

export function customerAcceptanceListCacheKey(this: any, 
    authUserId: string,
    query: {
      project_id: string;
      page: number;
      pageSize: number;
      acceptance_type?: ProjectAcceptanceType;
      status?: ProjectAcceptanceStatus;
      stage_code?: ProjectLogStageCode;
    },
    scope?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    return [
      authUserId,
      scope?.tenantId ?? "",
      scope?.customerId ?? "",
      query.project_id,
      query.page,
      query.pageSize,
      query.acceptance_type ?? "",
      query.status ?? "",
      query.stage_code ?? "",
    ].join(":");
  }

export async function listCustomerProfilesByMembership(this: any, 
    authUserId: string,
    scope?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    const memberships = (await userIdentityService.listActiveBusinessMemberships({
      userId: authUserId,
      identityType: "customer",
    })).filter((item) => (
      (!scope?.tenantId || item.tenant_id === scope.tenantId) &&
      (!scope?.customerId || item.identity_id === scope.customerId)
    ));

    const customerIds = Array.from(new Set(memberships.map((item) => item.identity_id)));
    if (customerIds.length === 0) {
      return [] as ProjectAcceptanceCustomerRow[];
    }

    const customers = await projectAcceptanceRepository.listCustomers(customerIds);
    const membershipTenantMap = new Map(
      memberships.map((item) => [item.identity_id, item.tenant_id]),
    );

    return customers.filter((customer) => {
      const membershipTenantId = membershipTenantMap.get(customer.id);
      return (
        customer.tenant_id &&
        customer.tenant_id === membershipTenantId &&
        (!scope?.tenantId || customer.tenant_id === scope.tenantId) &&
        (!scope?.customerId || customer.id === scope.customerId)
      );
    });
  }

export async function getCustomerByAuthUserId(this: any, 
    authUserId: string,
    scope?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    const customers = await this.listCustomerProfilesByMembership(authUserId, scope);
    if (customers.length > 1) {
      throw Errors.badRequest("当前账号绑定了多个客户档案，请先选择装修公司");
    }

    return customers[0] || null;
  }

export async function getCustomerByAuthUserOrScope(this: any, 
    authUserId: string,
    scope?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    if (scope?.tenantId && scope.customerId) {
      const [customer] = await projectAcceptanceRepository.listCustomers([
        scope.customerId,
      ]);
      if (customer?.tenant_id === scope.tenantId) {
        return customer;
      }

      return null;
    }

    return this.getCustomerByAuthUserId(authUserId, scope);
  }

export function getStatusLabel(this: any, status: ProjectAcceptanceStatus) {
    const labels: Record<ProjectAcceptanceStatus, string> = {
      draft: "草稿",
      submitted: "待领导复核",
      leader_approved: "待业主确认",
      customer_confirmed: "已完成",
      rejected: "需整改",
      cancelled: "已作废",
    };
    return labels[status] || status;
  }
