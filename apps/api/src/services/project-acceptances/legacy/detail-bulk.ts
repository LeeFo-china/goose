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

export function getCommonTenantId(this: any, rows: ProjectAcceptanceRow[]) {
    const tenantIds = Array.from(
      new Set(rows.map((item) => item.tenant_id).filter((item): item is string => Boolean(item))),
    );
    return tenantIds.length === 1 ? tenantIds[0] : null;
  }

export function groupBy<T>(this: any, rows: T[], getKey: (row: T) => string) {
    const result = new Map<string, T[]>();
    for (const row of rows) {
      const key = getKey(row);
      const list = result.get(key);
      if (list) {
        list.push(row);
      } else {
        result.set(key, [row]);
      }
    }
    return result;
  }

export async function buildDetails(this: any, 
    rows: ProjectAcceptanceRow[],
    known?: {
      projects?: ProjectAcceptanceProjectRow[];
      customers?: ProjectAcceptanceCustomerRow[];
    },
    options?: { timing?: ProjectAcceptanceTimingSteps },
  ): Promise<AcceptanceDetail[]> {
    if (rows.length === 0) return [];

    const acceptanceIds = rows.map((item) => item.id);
    const tenantId = this.getCommonTenantId(rows);
    const knownProjectMap = new Map(
      (known?.projects || []).map((item) => [item.id, item]),
    );
    const missingProjectIds = Array.from(
      new Set(rows.map((item) => item.project_id)),
    ).filter((projectId) => !knownProjectMap.has(projectId));
    const timing = options?.timing;
    const rowEmployeeIds = new Set<string>();
    for (const row of rows) {
      rowEmployeeIds.add(row.initiator_id);
      if (row.reviewer_id) rowEmployeeIds.add(row.reviewer_id);
    }
    const [items, actions, projects, latestNotifications, rowEmployees] = await Promise.all([
      measureProjectAcceptanceTiming(
        timing,
        "detail_items_query_ms",
        () => projectAcceptanceRepository.listItemsByAcceptanceIds(
          acceptanceIds,
          tenantId,
        ),
      ),
      measureProjectAcceptanceTiming(
        timing,
        "detail_actions_query_ms",
        () => projectAcceptanceRepository.listActionsByAcceptanceIds(
          acceptanceIds,
          tenantId,
        ),
      ),
      measureProjectAcceptanceTiming(
        timing,
        "detail_projects_query_ms",
        () => projectAcceptanceRepository.listProjectsByIds(
          missingProjectIds,
          tenantId,
        ),
      ),
      measureProjectAcceptanceTiming(
        timing,
        "detail_notifications_query_ms",
        () => projectAcceptanceOpenTicketRepository.listLatestByAcceptances(
          acceptanceIds,
          tenantId,
        ),
      ),
      measureProjectAcceptanceTiming(
        timing,
        "detail_row_employees_query_ms",
        () => projectAcceptanceRepository.listEmployees(Array.from(rowEmployeeIds)),
      ),
    ]);
    const actionEmployeeIds = new Set<string>();
    const customerMap = new Map(
      (known?.customers || []).map((item) => [item.id, item]),
    );
    const missingCustomerIds = new Set<string>();

    for (const row of rows) {
      if (row.customer_id && !customerMap.has(row.customer_id)) {
        missingCustomerIds.add(row.customer_id);
      }
    }

    for (const action of actions) {
      if (action.operator_type === "employee" && action.operator_id) {
        if (!rowEmployeeIds.has(action.operator_id)) {
          actionEmployeeIds.add(action.operator_id);
        }
      }
      if (
        action.operator_type === "customer" &&
        action.operator_id &&
        !customerMap.has(action.operator_id)
      ) {
        missingCustomerIds.add(action.operator_id);
      }
    }

    const [actionEmployees, customers] = await Promise.all([
      measureProjectAcceptanceTiming(
        timing,
        "detail_action_employees_query_ms",
        () => projectAcceptanceRepository.listEmployees(Array.from(actionEmployeeIds)),
      ),
      measureProjectAcceptanceTiming(
        timing,
        "detail_customers_query_ms",
        () => projectAcceptanceRepository.listCustomers(
          Array.from(missingCustomerIds),
        ),
      ),
    ]);
    const itemsByAcceptance = this.groupBy(items, (item: ProjectAcceptanceItemRow) => item.acceptance_id);
    const actionsByAcceptance = this.groupBy(actions, (item: ProjectAcceptanceActionRow) => item.acceptance_id);
    const projectMap = new Map([
      ...knownProjectMap,
      ...projects.map((item) => [item.id, item] as const),
    ]);
    const notificationMap = new Map(
      latestNotifications.map((item) => [item.acceptance_id, item]),
    );
    const employeeMap = new Map(
      [...rowEmployees, ...actionEmployees].map((item) => [item.id, item]),
    );
    for (const customer of customers) {
      customerMap.set(customer.id, customer);
    }

    return measureProjectAcceptanceTiming(timing, "detail_serialize_ms", () =>
      rows.map((row) =>
        this.buildDetailFromParts(row, {
          items: itemsByAcceptance.get(row.id) || [],
          actions: actionsByAcceptance.get(row.id) || [],
          project: projectMap.get(row.project_id) || null,
          employeeMap,
          customerMap,
          latestNotification: notificationMap.get(row.id) || null,
        })
      )
    );
  }

export async function getRequiredAcceptance(this: any, id: string, tenantId?: string | null) {
    const row = await projectAcceptanceRepository.getAcceptanceById(id, tenantId);
    if (!row) {
      throw Errors.badRequest("项目验收单不存在");
    }
    return row;
  }
