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

export function getStageLabel(this: any, stageCode: string | null | undefined) {
    if (!isProjectLogStageCode(stageCode)) {
      return null;
    }

    return PROJECT_ACCEPTANCE_STAGE_LABELS[stageCode] ||
      PROJECT_LOG_STAGE_CONFIG[stageCode].label;
  }

export function isRecord(this: any, value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

export function getStringField(this: any, value: Record<string, unknown>, key: string) {
    const field = value[key];
    return typeof field === "string" ? field : null;
  }

export function getNumberField(this: any, value: Record<string, unknown>, key: string) {
    const field = value[key];
    return typeof field === "number" && Number.isFinite(field) ? field : 0;
  }

export function getSnapshotSections(this: any, row: ProjectAcceptanceRow) {
    if (row.acceptance_type !== "final" || !this.isRecord(row.template_snapshot)) {
      return [] as Array<Omit<AcceptanceDetailSection, "items">>;
    }

    const templateSnapshot = row.template_snapshot as Record<string, unknown>;
    const sections = templateSnapshot.sections;
    if (!Array.isArray(sections)) {
      return [];
    }

    return sections
      .filter((section): section is Record<string, unknown> =>
        this.isRecord(section)
      )
      .map((section, index) => ({
        id: this.getStringField(section, "id") ?? `snapshot-section-${index + 1}`,
        title: this.getStringField(section, "title") ?? `分组 ${index + 1}`,
        description: this.getStringField(section, "description"),
        sort_order: this.getNumberField(section, "sort_order"),
      }))
      .sort((left, right) => left.sort_order - right.sort_order);
  }

export function buildAcceptanceSections(this: any, 
    row: ProjectAcceptanceRow,
    items: AcceptanceDetailItem[],
  ): AcceptanceDetailSection[] {
    const sectionSnapshots = this.getSnapshotSections(row) as Array<
      Omit<AcceptanceDetailSection, "items">
    >;
    const sections: AcceptanceDetailSection[] = sectionSnapshots.map((section) => ({
      ...section,
      items: [] as AcceptanceDetailItem[],
    }));
    const sectionMap = new Map<string | null, AcceptanceDetailSection>(
      sections.map((section) => [section.id, section]),
    );
    const fallbackItems: AcceptanceDetailItem[] = [];

    for (const item of items) {
      const sectionId = item.section_id || null;
      if (sectionId && sectionMap.has(sectionId)) {
        sectionMap.get(sectionId)?.items.push(item);
      } else {
        fallbackItems.push(item);
      }
    }

    for (const section of sections) {
      section.items.sort((left, right) =>
        Number(left.sort_order || 0) - Number(right.sort_order || 0)
      );
    }

    if (fallbackItems.length > 0) {
      sections.push({
        id: null,
        title: row.acceptance_type === "final" ? "其他验收项" : "验收项",
        description: null,
        sort_order: Number.MAX_SAFE_INTEGER,
        items: fallbackItems.sort((left, right) =>
          Number(left.sort_order || 0) - Number(right.sort_order || 0)
        ),
      });
    }

    return sections.filter((section) => section.items.length > 0);
  }

export function buildAcceptanceProgress(this: any, 
    items: AcceptanceDetailItem[],
  ): AcceptanceProgress {
    return items.reduce<AcceptanceProgress>(
      (progress, item) => {
        progress.total += 1;
        if (item.result) progress.checked += 1;
        if (item.result === "pass") progress.passed += 1;
        if (item.result === "fail") progress.failed += 1;
        if (item.result === "not_applicable") progress.not_applicable += 1;
        if (item.required && !item.result) progress.required_incomplete += 1;
        return progress;
      },
      {
        total: 0,
        checked: 0,
        passed: 0,
        failed: 0,
        not_applicable: 0,
        required_incomplete: 0,
      },
    );
  }

export function getSubmitBlockReason(this: any, 
    row: ProjectAcceptanceRow,
    items: AcceptanceDetailItem[],
    progress: AcceptanceProgress,
  ) {
    if (row.status !== "draft" && row.status !== "rejected") {
      return "当前状态不允许提交";
    }

    if (progress.required_incomplete > 0) {
      return `还有 ${progress.required_incomplete} 个必填检查项未完成`;
    }

    for (const item of items) {
      if (
        item.result === "not_applicable" &&
        (!item.allow_not_applicable || !item.remark?.trim())
      ) {
        return `验收项「${item.title}」不适用说明未完成`;
      }

      if (item.result === "fail" && item.remark_required_on_fail && !item.remark?.trim()) {
        return `验收项「${item.title}」未通过时必须填写备注`;
      }

      if (
        item.photo_required &&
        item.images.length < Math.max(1, item.photo_min_count)
      ) {
        return `验收项「${item.title}」必须上传现场照片`;
      }

      if (item.images.length > item.photo_max_count) {
        return `验收项「${item.title}」图片数量超过上限`;
      }
    }

    return null;
  }

export function buildDetailFromParts(this: any, 
    row: ProjectAcceptanceRow,
    input: {
      items: ProjectAcceptanceItemRow[];
      actions: ProjectAcceptanceActionRow[];
      project: ProjectAcceptanceProjectRow | null;
      employeeMap: Map<string, ProjectAcceptanceEmployeeRow>;
      customerMap: Map<string, ProjectAcceptanceCustomerRow>;
      latestNotification: ProjectAcceptanceOpenTicketRow | null;
    },
  ): AcceptanceDetail {
    const hasCustomerDispute = input.actions.some((item) =>
      item.action === "customer_dispute"
    );
    const customerStatusLabel = row.status === "leader_approved" && hasCustomerDispute
      ? "整改完成，待你确认"
      : this.getStatusLabel(row.status);
    const detailItems: AcceptanceDetailItem[] = input.items.map((item) => ({
      ...item,
      images: this.normalizeImageArray(item.images),
      image_items: this.normalizeAcceptanceImageItems({
        acceptanceId: row.id,
        itemId: item.id,
        itemTitle: item.title,
        source: "acceptance_item",
        value: item.images,
      }),
      rectification_images: this.normalizeImageArray(item.rectification_images),
      rectification_image_items: this.normalizeAcceptanceImageItems({
        acceptanceId: row.id,
        itemId: item.id,
        itemTitle: item.title,
        source: "rectification_item",
        value: item.rectification_images,
      }),
    }));
    const progress = this.buildAcceptanceProgress(detailItems);
    const blockedReason = this.getSubmitBlockReason(row, detailItems, progress);

    return {
      ...row,
      stage_label: this.getStageLabel(row.stage_code),
      status_label: this.getStatusLabel(row.status),
      customer_status_label: customerStatusLabel,
      has_customer_dispute: hasCustomerDispute,
      sections: this.buildAcceptanceSections(row, detailItems),
      progress,
      failed_count: progress.failed,
      required_incomplete_count: progress.required_incomplete,
      can_submit: blockedReason === null,
      blocked_reason: blockedReason,
      items: detailItems,
      actions: input.actions.map((item) => {
        const metadata = this.normalizeActionMetadata(item.metadata);
        return {
          ...item,
          operator: item.operator_type === "employee" && item.operator_id
            ? input.employeeMap.get(item.operator_id) || null
            : item.operator_type === "customer" && item.operator_id
            ? input.customerMap.get(item.operator_id) || null
            : null,
          images: metadata.images,
          image_items: metadata.image_items,
          referenced_action_id: metadata.referenced_action_id,
          referenced_item_ids: metadata.referenced_item_ids,
          referenced_image_ids: metadata.referenced_image_ids,
          referenced_image_paths: metadata.referenced_image_paths,
          referenced_images: metadata.referenced_images,
        };
      }),
      project: input.project,
      initiator: input.employeeMap.get(row.initiator_id) || null,
      reviewer: row.reviewer_id ? input.employeeMap.get(row.reviewer_id) || null : null,
      customer: row.customer_id ? input.customerMap.get(row.customer_id) || null : null,
      latest_customer_notification: input.latestNotification
        ? {
          id: input.latestNotification.id,
          status: input.latestNotification.status,
          send_status: input.latestNotification.send_status,
          send_error: input.latestNotification.send_error,
          phone: this.maskPhone(input.latestNotification.phone),
          link_type: input.latestNotification.link_type,
          sent_at: input.latestNotification.sent_at,
          expire_at: input.latestNotification.expire_at,
          used_at: input.latestNotification.used_at,
          created_at: input.latestNotification.created_at,
        }
        : null,
    };
  }

export async function buildDetail(this: any, row: ProjectAcceptanceRow): Promise<AcceptanceDetail> {
    const rawActions = await projectAcceptanceRepository.listActions(
      row.id,
      row.tenant_id,
    );
    const actionEmployeeIds = rawActions
      .filter((item) => item.operator_type === "employee" && item.operator_id)
      .map((item) => item.operator_id as string);
    const actionCustomerIds = rawActions
      .filter((item) => item.operator_type === "customer" && item.operator_id)
      .map((item) => item.operator_id as string);

    const [items, project, employees, customers, latestNotification] = await Promise.all([
      projectAcceptanceRepository.listItems(row.id, row.tenant_id),
      projectAcceptanceRepository.getProject(row.project_id, row.tenant_id),
      projectAcceptanceRepository.listEmployees(
        Array.from(new Set([
          row.initiator_id,
          row.reviewer_id,
          ...actionEmployeeIds,
        ].filter((item): item is string => Boolean(item)))),
      ),
      projectAcceptanceRepository.listCustomers(
        Array.from(new Set([
          row.customer_id,
          ...actionCustomerIds,
        ].filter((item): item is string => Boolean(item)))),
      ),
      projectAcceptanceOpenTicketRepository.findLatestByAcceptance(
        row.id,
        row.tenant_id,
      ),
    ]);

    return this.buildDetailFromParts(row, {
      items,
      actions: rawActions,
      project,
      employeeMap: new Map(employees.map((item) => [item.id, item])),
      customerMap: new Map(customers.map((item) => [item.id, item])),
      latestNotification,
    });
  }
