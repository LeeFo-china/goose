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
import {
  measureProjectAcceptanceTiming,
  type ProjectAcceptanceTimingSteps,
} from "./timing";
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

export async function listCustomerAcceptances(this: any, 
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
    options?: {
      responseMode?: "summary" | "detail";
      timing?: ProjectAcceptanceTimingSteps;
      signal?: AbortSignal;
    },
  ) {
    const responseMode = options?.responseMode ?? "detail";
    const cacheKey = this.customerAcceptanceListCacheKey(
      authUserId,
      query,
      scope,
      responseMode,
    );
    const cached = this.getCachedCustomerAcceptanceList(cacheKey);
    if (cached) {
      return cached;
    }

    const load = () => responseMode === "summary"
      ? this.loadCustomerAcceptanceSummaries(authUserId, query, scope, options)
      : this.loadCustomerAcceptances(authUserId, query, scope, options);
    if (options?.signal) {
      const result = await load();
      this.setCachedCustomerAcceptanceList(cacheKey, result);
      return result;
    }

    const inFlight = this.customerAcceptanceListInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const request = load()
      .then((result: CustomerAcceptanceListResult) => {
        this.setCachedCustomerAcceptanceList(cacheKey, result);
        return result;
      })
      .finally(() => {
        if (this.customerAcceptanceListInFlight.get(cacheKey) === request) {
          this.customerAcceptanceListInFlight.delete(cacheKey);
        }
      });
    this.customerAcceptanceListInFlight.set(cacheKey, request);
    return request;
  }

export async function loadCustomerAcceptances(this: any, 
    authUserId: string,
    query: {
      project_id: string;
      page: number;
      pageSize: number;
      status?: ProjectAcceptanceStatus;
      stage_code?: ProjectLogStageCode;
    },
    scope?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
    options?: { timing?: ProjectAcceptanceTimingSteps; signal?: AbortSignal },
  ): Promise<CustomerAcceptanceListResult> {
    const timing = options?.timing;
    const customerPromise = measureProjectAcceptanceTiming(
      timing,
      "customer_lookup_ms",
      () => this.getCustomerByAuthUserOrScope(authUserId, scope),
    );
    const projectPromise = scope?.tenantId
      ? measureProjectAcceptanceTiming(
        timing,
        "project_lookup_ms",
        () => projectAcceptanceRepository.getProject(query.project_id, scope.tenantId),
      )
      : null;
    const customer = await customerPromise;
    if (!customer) throw Errors.forbidden();
    this.assertCustomerTenantAvailable(customer);

    const project = projectPromise
      ? await projectPromise
      : await measureProjectAcceptanceTiming(
        timing,
        "project_lookup_ms",
        () => projectAcceptanceRepository.getProject(
          query.project_id,
          customer.tenant_id,
        ),
      );
    if (
      !project ||
      project.customer_id !== customer.id ||
      project.tenant_id !== customer.tenant_id
    ) {
      throw Errors.notFound("项目不存在");
    }

    const { list, total } = await measureProjectAcceptanceTiming(
      timing,
      "acceptance_list_query_ms",
      () => projectAcceptanceRepository.listAcceptances({
        ...query,
        customer_id: customer.id,
        tenantId: customer.tenant_id,
      }),
    );
    const details = await measureProjectAcceptanceTiming(
      timing,
      "detail_build_ms",
      () => this.buildDetails(list, {
        projects: [project],
        customers: [customer],
      }, { timing }),
    );

    return {
      list: details,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
    };
  }

export async function getCustomerAcceptance(this: any, 
    authUserId: string,
    id: string,
    scope?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    const customer = await this.getCustomerByAuthUserId(
      authUserId,
      scope,
    );
    if (!customer) throw Errors.forbidden();
    this.assertCustomerTenantAvailable(customer);

    const row = await this.getRequiredAcceptance(id, customer.tenant_id);
    if (row.customer_id !== customer.id || row.tenant_id !== customer.tenant_id) {
      throw Errors.notFound("项目验收单不存在");
    }

    return this.buildDetail(row);
  }

export async function getCustomerAcceptanceByAuthOrTicket(this: any, input: {
    authUserId?: string | null;
    tenantId?: string | null;
    customerId?: string | null;
    customer?: ProjectAcceptanceCustomerRow | null;
    id: string;
    ticketQuery?: CustomerProjectAcceptanceOpenTicketQuery;
  }, options?: {
    timing?: ProjectAcceptanceTimingSteps;
  }) {
    const timing = options?.timing;
    if (input.authUserId) {
      const customer = await measureProjectAcceptanceTiming(
        timing,
        "customer_lookup_ms",
        () => {
          if (
            input.customer &&
            (!input.tenantId || input.customer.tenant_id === input.tenantId) &&
            (!input.customerId || input.customer.id === input.customerId)
          ) {
            return Promise.resolve(input.customer);
          }

          return this.getCustomerByAuthUserOrScope(input.authUserId!, {
            tenantId: input.tenantId,
            customerId: input.customerId,
          });
        },
      );
      if (customer) this.assertCustomerTenantAvailable(customer);
      const [graph, tenantEmployees] = customer?.tenant_id
        ? await Promise.all([
          measureProjectAcceptanceTiming(
            timing,
            "acceptance_detail_graph_query_ms",
            () => projectAcceptanceRepository.getAcceptanceDetailGraph(
              input.id,
              customer.tenant_id,
            ),
          ),
          measureProjectAcceptanceTiming(
            timing,
            "tenant_employee_prefetch_ms",
            () => projectAcceptanceRepository.listEmployeesByTenant(
              customer.tenant_id!,
            ),
          ),
        ])
        : [null, [] as ProjectAcceptanceEmployeeRow[]];
      if (
        customer &&
        graph &&
        graph.customer_id === customer.id &&
        graph.tenant_id === customer.tenant_id
      ) {
        return this.buildDetailFromGraph(graph, {
          timing,
          employees: tenantEmployees,
          customers: [customer],
        });
      }
    }

    if (input.ticketQuery?.ticket && input.ticketQuery.project_id) {
      const result = await measureProjectAcceptanceTiming(
        timing,
        "ticket_verify_ms",
        () => this.verifyOpenTicketRow({
          ticket: input.ticketQuery!.ticket!,
          acceptance_id: input.id,
          project_id: input.ticketQuery!.project_id!,
        }),
      );
      if (result.valid) {
        return this.buildDetail(result.row, { timing });
      }

      throw Errors.business(403, "验收短信访问票据无效或已失效", "FORBIDDEN", {
        reason: result.reason,
      });
    }

    if (input.authUserId) {
      throw Errors.notFound("项目验收单不存在");
    }

    throw Errors.unauthorized("请先登录或提供有效访问票据");
  }

export async function verifyOpenTicket(this: any, input: VerifyProjectAcceptanceOpenTicketInput) {
    const result = await this.verifyOpenTicketRow(input);
    if (!result.valid) {
      return result;
    }

    return {
      valid: true,
      acceptance_id: result.ticket.acceptance_id,
      project_id: result.ticket.project_id,
      customer_id: result.ticket.customer_id,
      status: result.row.status,
      expires_at: result.ticket.expire_at,
    };
  }
