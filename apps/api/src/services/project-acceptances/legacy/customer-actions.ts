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
import { assertProjectWorkflowStageMutationAllowed } from "@/services/project-workflow-mutation-guards";
import { projectAcceptanceWorkflowRuntimeService } from "@/services/project-acceptance-workflow-runtime";
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
  isProjectConstructionStageCode,
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

export async function customerConfirmAcceptance(this: any, 
    authUserId: string | null | undefined,
    id: string,
    input: CustomerConfirmProjectAcceptanceInput,
    scope?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    const row = await this.getRequiredAcceptance(id);
    const customer = await this.resolveCustomerActor({
      authUserId,
      tenantId: scope?.tenantId,
      customerId: scope?.customerId,
      row,
      ticket: input.ticket,
      projectId: input.project_id,
    });
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "customer_confirm",
    });
    if (isProjectLogStageCode(row.stage_code)) {
      const tenantId = row.tenant_id ?? scope?.tenantId ?? null;
      if (!tenantId) {
        throw Errors.business(
          409,
          "流程运行态不可用，不能确认验收",
          ErrorCodes.WORKFLOW_PROGRESS_CONFLICT,
          { acceptance_id: row.id, project_id: row.project_id },
        );
      }
      await assertProjectWorkflowStageMutationAllowed({
        tenantId,
        projectId: row.project_id,
        stageCode: row.stage_code,
        mutation: "customer_confirm_acceptance",
      });
    }

    const now = new Date().toISOString();
    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "customer_confirmed",
      customer_confirmed_at: now,
      completed_at: now,
    }, row.tenant_id);

    await this.recordAction({
      row: nextRow,
      action: "customer_confirm",
      fromStatus: row.status,
      toStatus: "customer_confirmed",
      operatorType: "customer",
      operatorId: customer.id,
      comment: input.comment,
    });

    if (isProjectConstructionStageCode(row.stage_code)) {
      const tenantId = nextRow.tenant_id ?? row.tenant_id ?? scope?.tenantId ?? null;
      if (!tenantId) {
        throw Errors.business(
          409,
          "流程运行态不可用，不能推进验收流程",
          ErrorCodes.WORKFLOW_PROGRESS_CONFLICT,
          { acceptance_id: nextRow.id, project_id: nextRow.project_id },
        );
      }
      const runtimeMetadata = await projectAcceptanceWorkflowRuntimeService
        .syncCustomerConfirmAcceptance({
          tenantId,
          projectId: nextRow.project_id,
          acceptanceId: nextRow.id,
          stageCode: row.stage_code,
          customerId: customer.id,
          comment: input.comment,
        });
      if (runtimeMetadata.status !== "advanced") {
        throw Errors.business(
          409,
          "验收已确认，但流程运行态推进失败",
          ErrorCodes.WORKFLOW_PROGRESS_CONFLICT,
          {
            acceptance_id: nextRow.id,
            project_id: nextRow.project_id,
            stage_code: row.stage_code,
            workflow_runtime: runtimeMetadata,
          },
        );
      }
    }

    this.invalidateAcceptanceRelatedCaches(nextRow.project_id);
    return this.buildDetail(nextRow);
  }

export async function customerDisputeAcceptance(this: any, 
    authUserId: string | null | undefined,
    id: string,
    input: CustomerDisputeProjectAcceptanceInput,
    scope?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    const row = await this.getRequiredAcceptance(id);
    const customer = await this.resolveCustomerActor({
      authUserId,
      tenantId: scope?.tenantId,
      customerId: scope?.customerId,
      row,
      ticket: input.ticket,
      projectId: input.project_id,
    });
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "customer_dispute",
    });

    const items = await projectAcceptanceRepository.listItems(row.id, row.tenant_id);
    const imageReferenceCatalog = this.buildImageReferenceCatalog(row.id, items);
    const referencedImages = this.resolveReferencedImages({
      ids: input.referenced_image_ids,
      paths: input.referenced_image_paths,
      catalog: imageReferenceCatalog,
    });
    const supplementalImages = input.images || [];
    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "rejected",
      rejected_at: new Date().toISOString(),
      reject_reason: input.comment,
      reject_source: "customer",
    }, row.tenant_id);

    await this.recordAction({
      row: nextRow,
      action: "customer_dispute",
      fromStatus: row.status,
      toStatus: "rejected",
      operatorType: "customer",
      operatorId: customer.id,
      comment: input.comment,
      metadata: {
        images: supplementalImages,
        image_items: this.normalizeImageItems(supplementalImages),
        referenced_image_ids: referencedImages
          .map((item: AcceptanceImageItem) => item.id)
          .filter((item: string | undefined): item is string => Boolean(item)),
        referenced_image_paths: referencedImages.map((item: AcceptanceImageItem) =>
          item.path || item.url
        ),
        referenced_images: referencedImages,
      },
    });

    this.invalidateAcceptanceRelatedCaches(nextRow.project_id);
    return this.buildDetail(nextRow);
  }

export async function rectifyAcceptance(this: any, 
    authContext: AuthContext,
    id: string,
    input: RectifyProjectAcceptanceInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const row = await this.getRequiredAcceptance(id, tenantId);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "employee_rectify",
    });
    await this.assertCanSubmit(authContext, row);

    const [items, actions] = await Promise.all([
      projectAcceptanceRepository.listItems(row.id, row.tenant_id),
      projectAcceptanceRepository.listActions(row.id, row.tenant_id),
    ]);
    const latestReturnActionIndex = this.getLatestReturnActionIndex(actions);
    const latestReturnAction = latestReturnActionIndex >= 0
      ? actions[latestReturnActionIndex] ?? null
      : null;

    if (input.referenced_action_id) {
      const referencedAction = actions.find((item) =>
        item.id === input.referenced_action_id
      );
      if (
        !referencedAction ||
        (referencedAction.action !== "leader_reject" &&
          referencedAction.action !== "customer_dispute")
      ) {
        throw Errors.badRequest("关联的驳回或疑问记录不存在");
      }
    }

    const itemIds = new Set(items.map((item: ProjectAcceptanceItemRow) => item.id));
    const invalidReferencedItemId = input.referenced_item_ids.find((item) =>
      !itemIds.has(item)
    );
    if (invalidReferencedItemId) {
      throw Errors.badRequest("关联的验收项不属于当前验收单");
    }

    const failedItems = items.filter((item) => item.result === "fail");
    const requiresPhoto = failedItems.some((item) => item.photo_required);
    if (requiresPhoto && input.images.length === 0) {
      throw Errors.badRequest("整改项存在需拍照项，必须上传整改后照片");
    }

    const imageReferenceCatalog = this.buildImageReferenceCatalog(row.id, items);
    const referencedImages = this.resolveReferencedImages({
      ids: input.referenced_image_ids,
      paths: input.referenced_image_paths,
      catalog: imageReferenceCatalog,
    });
    await this.recordAction({
      row,
      action: "employee_rectify",
      fromStatus: row.status,
      toStatus: row.status,
      operatorType: "employee",
      operatorId: authContext.employeeId,
      comment: input.comment,
      metadata: {
        images: input.images,
        image_items: this.normalizeImageItems(input.images),
        referenced_action_id: input.referenced_action_id ??
          latestReturnAction?.id ??
          null,
        referenced_item_ids: input.referenced_item_ids,
        referenced_image_ids: referencedImages
          .map((item: AcceptanceImageItem) => item.id)
          .filter((item: string | undefined): item is string => Boolean(item)),
        referenced_image_paths: referencedImages.map((item: AcceptanceImageItem) =>
          item.path || item.url
        ),
        referenced_images: referencedImages,
      },
    });

    this.invalidateAcceptanceRelatedCaches(row.project_id);
    return this.buildDetail(row);
  }

export async function cancelAcceptance(this: any, 
    authContext: AuthContext,
    id: string,
    input: CancelProjectAcceptanceInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const row = await this.getRequiredAcceptance(id, tenantId);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "cancel",
    });
    this.assertCanManage(authContext);

    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "cancelled",
    }, row.tenant_id);

    await this.recordAction({
      row: nextRow,
      action: "cancel",
      fromStatus: row.status,
      toStatus: "cancelled",
      operatorType: "employee",
      operatorId: authContext.employeeId,
      comment: input.comment,
    });

    this.invalidateAcceptanceRelatedCaches(nextRow.project_id);
    return this.buildDetail(nextRow);
  }
