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
import { projectWorkflowProgressService } from "@/services/project-workflow-progress";
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

export async function assertCanRead(this: any, authContext: AuthContext, row: ProjectAcceptanceRow) {
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      row.project_id,
      "project_acceptance.read",
    );
    if (!hasAccess) throw Errors.forbidden();
  }

export function assertCurrentEmployee(this: any, authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

export async function assertCanCreate(this: any, 
    authContext: AuthContext,
    projectId: string,
  ) {
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      projectId,
      "project_acceptance.create",
    );
    if (!hasAccess) throw Errors.forbidden();
  }

export async function assertCanCreateFinalAcceptance(this: any, 
    authContext: AuthContext,
    projectId: string,
  ) {
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      projectId,
      "project_acceptance.create",
    );
    if (!hasAccess) {
      throw Errors.business(
        403,
        "暂无竣工验收操作权限",
        ErrorCodes.FINAL_ACCEPTANCE_PERMISSION_DENIED,
      );
    }
  }

export async function canManageAcceptance(this: any, 
    authContext: AuthContext,
    row: ProjectAcceptanceRow,
  ) {
    if (!accessPolicyService.hasPermission(authContext, "project_acceptance.manage")) {
      return false;
    }

    return accessPolicyService.canAccessProject(
      authContext,
      row.project_id,
      "project_acceptance.manage",
    );
  }

export async function assertCanUpdateOwn(this: any, authContext: AuthContext, row: ProjectAcceptanceRow) {
    if (await this.canManageAcceptance(authContext, row)) {
      return;
    }

    const employeeId = this.assertCurrentEmployee(authContext);

    accessPolicyService.assertPermission(authContext, "project_acceptance.update_own");
    if (row.initiator_id !== employeeId) {
      throw Errors.forbidden();
    }
  }

export async function assertCanSubmit(this: any, authContext: AuthContext, row: ProjectAcceptanceRow) {
    if (await this.canManageAcceptance(authContext, row)) {
      return;
    }

    const employeeId = this.assertCurrentEmployee(authContext);
    const scope = accessPolicyService.assertPermission(
      authContext,
      "project_acceptance.submit",
    );
    if (scope === "all") {
      return;
    }

    if (row.initiator_id !== employeeId) {
      throw Errors.forbidden();
    }
  }

export function assertCanReview(this: any, authContext: AuthContext, row: ProjectAcceptanceRow) {
    const employeeId = this.assertCurrentEmployee(authContext);
    const scope = accessPolicyService.assertPermission(
      authContext,
      "project_acceptance.review",
    );

    if (scope === "all") {
      return;
    }

    if (row.reviewer_id && row.reviewer_id === employeeId) {
      return;
    }

    throw Errors.forbidden();
  }

export function assertCanReject(this: any, authContext: AuthContext, row: ProjectAcceptanceRow) {
    const employeeId = this.assertCurrentEmployee(authContext);
    const scope = accessPolicyService.assertPermission(
      authContext,
      "project_acceptance.reject",
    );

    if (scope === "all") {
      return;
    }

    if (row.reviewer_id && row.reviewer_id === employeeId) {
      return;
    }

    throw Errors.forbidden();
  }

export function assertCanManage(this: any, authContext: AuthContext) {
    accessPolicyService.assertPermission(authContext, "project_acceptance.manage");
  }

export async function resolveTemplate(this: any, input: CreateProjectAcceptanceInput) {
    const acceptanceType = input.acceptance_type ?? "stage";
    const template = input.template_id
      ? await projectAcceptanceRepository.getTemplateById(input.template_id)
      : await projectAcceptanceRepository.getActiveTemplate({
        stageCode: input.stage_code,
        acceptanceType,
      });

    if (!template) {
      if (acceptanceType === "final") {
        throw Errors.business(
          400,
          "暂无可用竣工验收模板",
          ErrorCodes.FINAL_ACCEPTANCE_TEMPLATE_MISSING,
        );
      }
      throw Errors.badRequest("验收模板不存在");
    }

    if (template.status !== "active") {
      throw Errors.badRequest("验收模板未启用");
    }

    if (template.acceptance_type !== acceptanceType) {
      throw Errors.badRequest("验收模板类型不匹配");
    }

    if (template.stage_code !== input.stage_code) {
      throw Errors.badRequest("验收模板与工序不匹配");
    }

    const items = await projectAcceptanceRepository.listTemplateItems(template.id);
    if (items.length === 0) {
      if (acceptanceType === "final") {
        throw Errors.business(
          400,
          "暂无可用竣工验收模板",
          ErrorCodes.FINAL_ACCEPTANCE_TEMPLATE_MISSING,
        );
      }
      throw Errors.badRequest("验收模板没有可用标准项");
    }

    return { template, items };
  }

export async function assertCanCreateFinalAcceptanceForProject(this: any, 
    project: ProjectAcceptanceProjectRow,
  ) {
    const workflowProgress = project.tenant_id
      ? await projectWorkflowProgressService.getProjectProgress({
        tenantId: project.tenant_id,
        projectId: project.id,
      })
      : null;

    if (!isWorkflowFinalAcceptanceCurrent(workflowProgress)) {
      throw Errors.business(
        400,
        "当前 workflow 未到竣工验收节点",
        ErrorCodes.FINAL_ACCEPTANCE_STAGE_INCOMPLETE,
      );
    }

    const stages = await constructionStageStatusService
      .listProjectConstructionStagesForProject({
        projectId: project.id,
        tenantId: project.tenant_id,
        canReadAcceptance: true,
        canCreateAcceptance: false,
      });

    if (!stages.required_completed) {
      throw Errors.business(
        400,
        "施工阶段未全部完成",
        ErrorCodes.FINAL_ACCEPTANCE_STAGE_INCOMPLETE,
        { missing_required_stages: stages.missing_required_stages },
      );
    }
  }

function isWorkflowFinalAcceptanceCurrent(
  workflowProgress: Awaited<
    ReturnType<typeof projectWorkflowProgressService.getProjectProgress>
  > | null,
) {
  return workflowProgress?.source === "workflow_runtime" &&
    (workflowProgress.current_node_key === "final_acceptance" ||
      workflowProgress.current_business_kind === "final_acceptance");
}

export async function resolveReviewer(this: any, 
    project: ProjectAcceptanceProjectRow,
    inputReviewerId?: string | null,
  ) {
    if (inputReviewerId) {
      const [reviewer] = await projectAcceptanceRepository.listEmployees([
        inputReviewerId,
      ]);
      if (!reviewer || reviewer.tenant_id !== project.tenant_id) {
        throw Errors.badRequest("复核人不存在或不属于当前租户");
      }
      return inputReviewerId;
    }

    return await projectAcceptanceRepository.findPrimaryConstructionManager(project.id);
  }
