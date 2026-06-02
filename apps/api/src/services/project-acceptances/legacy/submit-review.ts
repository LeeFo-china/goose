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

export function validateSubmitItems(this: any, input: {
    beforeItems: ProjectAcceptanceItemRow[];
    afterItems: ProjectAcceptanceItemRow[];
    isResubmit: boolean;
    actionLevelRectification: ProjectAcceptanceActionRow | null;
  }) {
    const beforeFailIds = new Set(
      input.beforeItems
        .filter((item) => item.result === "fail")
        .map((item) => item.id),
    );
    const beforeFailedItems = input.beforeItems.filter((item) =>
      beforeFailIds.has(item.id)
    );

    const failedItems: ProjectAcceptanceItemRow[] = [];

    for (const item of input.afterItems) {
      if (item.required && !item.result) {
        throw Errors.badRequest(`验收项「${item.title}」必须填写结果`);
      }

      if (item.result === "not_applicable") {
        if (!item.allow_not_applicable) {
          throw Errors.badRequest(`验收项「${item.title}」不允许选择不适用`);
        }
        if (!item.remark?.trim()) {
          throw Errors.badRequest(`验收项「${item.title}」选择不适用时必须填写说明`);
        }
      }

      const images = this.normalizeImageArray(item.images);
      if (item.photo_required && images.length < Math.max(1, item.photo_min_count)) {
        throw Errors.badRequest(`验收项「${item.title}」必须上传现场照片`);
      }

      if (images.length > item.photo_max_count) {
        throw Errors.badRequest(`验收项「${item.title}」图片数量超过上限`);
      }

      if (input.isResubmit && beforeFailIds.has(item.id)) {
        if (item.result !== "pass" && item.result !== "not_applicable") {
          throw Errors.badRequest(`整改项「${item.title}」必须重新验证通过`);
        }
        if (!input.actionLevelRectification) {
          if (!item.rectification_remark?.trim()) {
            throw Errors.badRequest(`整改项「${item.title}」必须填写整改说明`);
          }
          const rectificationImages = this.normalizeImageArray(
            item.rectification_images,
          );
          if (item.photo_required && rectificationImages.length === 0) {
            throw Errors.badRequest(`整改项「${item.title}」必须上传整改后照片`);
          }
        }
      }

      if (item.result === "fail") {
        failedItems.push(item);
      }
    }

    if (input.isResubmit) {
      if (!input.actionLevelRectification && beforeFailedItems.length === 0) {
        throw Errors.badRequest("请先提交整改说明");
      }

      if (input.actionLevelRectification) {
        const rectificationMetadata = this.normalizeActionMetadata(
          input.actionLevelRectification.metadata,
        );
        const requiresPhoto = beforeFailedItems.some((item) => item.photo_required);
        if (requiresPhoto && rectificationMetadata.images.length === 0) {
          throw Errors.badRequest("整改项存在需拍照项，必须上传整改后照片");
        }
      }
    }

    return failedItems;
  }

export async function submitAcceptance(this: any, 
    authContext: AuthContext,
    id: string,
    input: SubmitProjectAcceptanceInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    let row = await this.getRequiredAcceptance(id, tenantId);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "submit",
    });
    await this.assertCanSubmit(authContext, row);

    const beforeItems = await projectAcceptanceRepository.listItems(
      row.id,
      row.tenant_id,
    );
    const actions = await projectAcceptanceRepository.listActions(
      row.id,
      row.tenant_id,
    );
    const latestReturnActionIndex = this.getLatestReturnActionIndex(actions);
    const actionLevelRectification = this.getLatestEmployeeRectifyActionAfter(
      actions,
      latestReturnActionIndex,
    );
    row = await this.applyUpdate(row, input);
    const afterItems = await projectAcceptanceRepository.listItems(
      row.id,
      row.tenant_id,
    );

    const failedItems = this.validateSubmitItems({
      beforeItems,
      afterItems,
      isResubmit: row.status === "rejected",
      actionLevelRectification,
    });

    if (failedItems.length > 0) {
      const reason = `存在 ${failedItems.length} 个未通过验收项：${
        failedItems.map((item: ProjectAcceptanceItemRow) => item.title).join("、")
      }`;
      const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
        status: "rejected",
        submitted_at: new Date().toISOString(),
        rejected_at: new Date().toISOString(),
        reject_reason: reason,
        reject_source: null,
      }, row.tenant_id);

      await this.recordAction({
        row: nextRow,
        action: "submit",
        fromStatus: row.status,
        toStatus: "rejected",
        operatorType: "employee",
        operatorId: authContext.employeeId,
        comment: reason,
      });

      this.invalidateAcceptanceRelatedCaches(nextRow.project_id);
      return this.buildDetail(nextRow);
    }

    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "submitted",
      submitted_at: new Date().toISOString(),
      rejected_at: null,
      reject_reason: null,
      reject_source: null,
    }, row.tenant_id);

    await this.recordAction({
      row: nextRow,
      action: "submit",
      fromStatus: row.status,
      toStatus: "submitted",
      operatorType: "employee",
      operatorId: authContext.employeeId,
      comment: input.summary,
    });
    this.invalidateAcceptanceRelatedCaches(nextRow.project_id);

    return this.buildDetail(nextRow);
  }

export async function approveAcceptance(this: any, 
    authContext: AuthContext,
    id: string,
    input: ApproveProjectAcceptanceInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const row = await this.getRequiredAcceptance(id, tenantId);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "leader_approve",
    });
    this.assertCanReview(authContext, row);

    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "leader_approved",
      reviewed_at: new Date().toISOString(),
    }, row.tenant_id);

    await this.recordAction({
      row: nextRow,
      action: "leader_approve",
      fromStatus: row.status,
      toStatus: "leader_approved",
      operatorType: "employee",
      operatorId: authContext.employeeId,
      comment: input.comment,
    });

    try {
      await this.notifyCustomerForAcceptanceInternal({
        row: nextRow,
        createdBy: authContext.employeeId,
        force: false,
      });
    } catch {
      // 短信是客户触达能力，不能阻断领导复核主流程。
    }

    this.invalidateAcceptanceRelatedCaches(nextRow.project_id);
    return this.buildDetail(nextRow);
  }

export async function notifyCustomerForAcceptance(this: any, 
    authContext: AuthContext,
    id: string,
    input: NotifyProjectAcceptanceCustomerInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const row = await this.getRequiredAcceptance(id, tenantId);
    this.assertCanReview(authContext, row);

    return this.notifyCustomerForAcceptanceInternal({
      row,
      createdBy: authContext.employeeId,
      force: input.force,
    });
  }

export async function rejectAcceptance(this: any, 
    authContext: AuthContext,
    id: string,
    input: RejectProjectAcceptanceInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const row = await this.getRequiredAcceptance(id, tenantId);
    projectAcceptanceWorkflowService.assertTransition({
      currentStatus: row.status,
      action: "leader_reject",
    });
    this.assertCanReject(authContext, row);

    const nextRow = await projectAcceptanceRepository.updateAcceptance(row.id, {
      status: "rejected",
      rejected_at: new Date().toISOString(),
      reject_reason: input.comment,
      reject_source: "leader",
    }, row.tenant_id);

    await this.recordAction({
      row: nextRow,
      action: "leader_reject",
      fromStatus: row.status,
      toStatus: "rejected",
      operatorType: "employee",
      operatorId: authContext.employeeId,
      comment: input.comment,
    });

    this.invalidateAcceptanceRelatedCaches(nextRow.project_id);
    return this.buildDetail(nextRow);
  }
