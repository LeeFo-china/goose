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

export async function createAcceptance(this: any, 
    authContext: AuthContext,
    input: CreateProjectAcceptanceInput,
    options: {
      response?: CreateAcceptanceResponseMode;
    } = {},
  ) {
    const employeeId = this.assertCurrentEmployee(authContext);
    const tenantId = this.requireTenantId(authContext);
    const acceptanceType = input.acceptance_type ?? "stage";
    if (acceptanceType === "final") {
      await this.assertCanCreateFinalAcceptance(authContext, input.project_id);
    } else {
      await this.assertCanCreate(authContext, input.project_id);
    }

    const project = await projectAcceptanceRepository.getProject(
      input.project_id,
      tenantId,
    );
    if (!project) {
      throw Errors.badRequest("项目不存在");
    }
    if (acceptanceType === "final") {
      if (input.stage_code !== PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE) {
        throw Errors.badRequest("竣工验收必须使用 completion 阶段");
      }
      await this.assertCanCreateFinalAcceptanceForProject(project);
    } else {
      projectStatusService.assertCanCreateProjectAcceptance(project);
      await constructionStageStatusService.assertCanCreateAcceptance({
        project,
        stageCode: input.stage_code,
      });
    }

    const open = await projectAcceptanceRepository.hasOpenAcceptance(
      input.project_id,
      input.stage_code,
      tenantId,
      acceptanceType,
    );
    if (open) {
      if (acceptanceType === "final") {
        throw Errors.business(
          409,
          "已有竣工验收单待处理",
          ErrorCodes.FINAL_ACCEPTANCE_ALREADY_EXISTS,
          { acceptance_id: open.id, status: open.status },
        );
      }
      throw Errors.badRequest("该工序已有进行中的验收单，请处理完成后再发起");
    }

    const { template, items } = await this.resolveTemplate(input);
    const reviewerId = await this.resolveReviewer(project, input.reviewer_id);

    const title = acceptanceType === "final"
      ? "竣工交付验收"
      : PROJECT_ACCEPTANCE_STAGE_LABELS[input.stage_code] || template.name;
    const templateSnapshot = acceptanceType === "final"
      ? await this.buildTemplateDetail(template)
      : null;
    const row = await projectAcceptanceRepository.createAcceptance({
      tenant_id: project.tenant_id,
      project_id: input.project_id,
      acceptance_type: acceptanceType,
      stage_code: input.stage_code,
      template_id: template.id,
      template_version: template.version,
      template_snapshot: templateSnapshot,
      title,
      status: "draft",
      initiator_id: employeeId,
      reviewer_id: reviewerId,
      customer_id: project.customer_id,
      summary: input.summary ?? null,
    });

    await projectAcceptanceRepository.createItems(
      items.map((item: ProjectAcceptanceTemplateItemRow) => ({
        acceptance_id: row.id,
        tenant_id: row.tenant_id,
        template_item_id: item.id,
        section_id: item.section_id,
        category: item.category,
        title: item.title,
        standard: item.standard,
        required: item.required,
        allow_not_applicable: item.allow_not_applicable,
        photo_required: item.photo_required,
        photo_min_count: item.photo_min_count,
        photo_max_count: item.photo_max_count,
        remark_required_on_fail: item.remark_required_on_fail,
        result: null,
        remark: null,
        rectification_remark: null,
        rectification_images: [],
        images: [],
        sort_order: item.sort_order,
      })),
    );

    await this.recordAction({
      row,
      action: "create",
      fromStatus: null,
      toStatus: "draft",
      operatorType: "employee",
      operatorId: employeeId,
    });
    this.invalidateAcceptanceRelatedCaches(row.project_id);

    if (options.response === "detail") {
      return this.buildDetail(row);
    }

    return this.buildCreateSummary(row);
  }

export function buildCreateSummary(this: any, row: ProjectAcceptanceRow): AcceptanceCreateSummary {
    return {
      id: row.id,
      project_id: row.project_id,
      acceptance_type: row.acceptance_type,
      stage_code: row.stage_code,
      stage_label: this.getStageLabel(row.stage_code),
      status: row.status,
      created_at: row.created_at,
    };
  }

export async function applyUpdate(this: any, 
    row: ProjectAcceptanceRow,
    input: UpdateProjectAcceptanceInput,
  ) {
    let nextRow = row;
    const patch: Record<string, unknown> = {};
    if (input.summary !== undefined) patch.summary = input.summary;
    if (input.reviewer_id !== undefined) {
      if (input.reviewer_id) {
        const [reviewer] = await projectAcceptanceRepository.listEmployees([
          input.reviewer_id,
        ]);
        if (!reviewer || reviewer.tenant_id !== row.tenant_id) {
          throw Errors.badRequest("复核人不存在或不属于当前租户");
        }
      }
      patch.reviewer_id = input.reviewer_id;
    }

    if (Object.keys(patch).length > 0) {
      nextRow = await projectAcceptanceRepository.updateAcceptance(
        row.id,
        patch,
        row.tenant_id,
      );
    }

    if (input.items) {
      for (const item of input.items) {
        await projectAcceptanceRepository.updateItem(row.id, item.id, {
          ...(item.result !== undefined ? { result: item.result } : {}),
          ...(item.remark !== undefined ? { remark: item.remark } : {}),
          ...(item.images !== undefined ? { images: item.images } : {}),
          ...(item.rectification_remark !== undefined
            ? { rectification_remark: item.rectification_remark }
            : {}),
          ...(item.rectification_images !== undefined
            ? { rectification_images: item.rectification_images }
            : {}),
        }, row.tenant_id);
      }
    }

    return nextRow;
  }

export function getLatestReturnActionIndex(this: any, actions: ProjectAcceptanceActionRow[]) {
    for (let index = actions.length - 1; index >= 0; index -= 1) {
      const action = actions[index];
      if (!action) continue;
      if (action.action === "leader_reject" || action.action === "customer_dispute") {
        return index;
      }
    }

    return -1;
  }

export function getLatestEmployeeRectifyActionAfter(this: any, 
    actions: ProjectAcceptanceActionRow[],
    returnActionIndex: number,
  ) {
    const lowerBoundIndex = Math.max(returnActionIndex, -1);
    for (let index = actions.length - 1; index > lowerBoundIndex; index -= 1) {
      const action = actions[index];
      if (action?.action === "employee_rectify") {
        return action;
      }
    }

    return null;
  }

export async function updateAcceptance(this: any, 
    authContext: AuthContext,
    id: string,
    input: UpdateProjectAcceptanceInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const row = await this.getRequiredAcceptance(id, tenantId);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "update",
    });
    await this.assertCanUpdateOwn(authContext, row);

    const nextRow = await this.applyUpdate(row, input);
    await this.recordAction({
      row: nextRow,
      action: "update",
      fromStatus: row.status,
      toStatus: nextRow.status,
      operatorType: "employee",
      operatorId: authContext.employeeId,
    });
    this.invalidateAcceptanceRelatedCaches(nextRow.project_id);

    return this.buildDetail(nextRow);
  }

export async function deleteDraftAcceptance(this: any, authContext: AuthContext, id: string) {
    const tenantId = this.requireTenantId(authContext);
    const row = await this.getRequiredAcceptance(id, tenantId);
    if (row.status !== "draft") {
      throw Errors.business(
        400,
        "只有草稿状态的验收单可以删除",
        "ACCEPTANCE_NOT_DRAFT",
        { status: row.status },
      );
    }

    await this.assertCanUpdateOwn(authContext, row);
    await projectAcceptanceRepository.deleteAcceptance(row.id, row.tenant_id);
    this.invalidateAcceptanceRelatedCaches(row.project_id);

    return {
      id: row.id,
      deleted: true,
    };
  }
