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

export async function listTemplates(this: any, input: ProjectAcceptanceTemplateListQuery) {
    const templates = await projectAcceptanceRepository.listTemplates({
      acceptance_type: input.acceptance_type,
      stage_code: input.stage_code,
      status: input.status ?? "active",
    });

    return {
      list: await Promise.all(
        templates.map((template) => this.buildTemplateDetail(template)),
      ),
    };
  }

export async function getTemplate(this: any, id: string) {
    const template = await projectAcceptanceRepository.getTemplateById(id);
    if (!template) {
      throw Errors.badRequest("验收模板不存在");
    }
    return this.buildTemplateDetail(template);
  }

export async function updateTemplate(this: any, 
    authContext: AuthContext,
    id: string,
    input: UpdateProjectAcceptanceTemplateInput,
  ) {
    this.requireTenantId(authContext);
    this.assertCanManage(authContext);

    const template = await projectAcceptanceRepository.getTemplateById(id);
    if (!template) {
      throw Errors.badRequest("验收模板不存在");
    }

    const [existingSections, existingItems] = await Promise.all([
      projectAcceptanceRepository.listTemplateSections(template.id),
      projectAcceptanceRepository.listTemplateItems(template.id),
    ]);
    const existingSectionIds = new Set(existingSections.map((item) => item.id));
    const existingItemIds = new Set(existingItems.map((item) => item.id));
    const incomingSectionIds = new Set<string>();
    const incomingItemIds = new Set<string>();

    const sectionRows: ProjectAcceptanceTemplateSectionWriteRow[] = [];
    const itemRows: ProjectAcceptanceTemplateItemWriteRow[] = [];

    input.sections.forEach((section, sectionIndex) => {
      if (section.id && !existingSectionIds.has(section.id)) {
        throw Errors.badRequest("模板分组不存在或不属于当前模板");
      }

      const sectionId = section.id || randomUUID();
      if (incomingSectionIds.has(sectionId)) {
        throw Errors.badRequest("模板分组重复");
      }
      incomingSectionIds.add(sectionId);
      sectionRows.push({
        id: sectionId,
        template_id: template.id,
        title: section.title,
        description: section.description ?? null,
        sort_order: section.sort_order || sectionIndex,
        status: "active",
      });

      section.items.forEach((item, itemIndex) => {
        if (item.id && !existingItemIds.has(item.id)) {
          throw Errors.badRequest("模板检查项不存在或不属于当前模板");
        }

        const itemId = item.id || randomUUID();
        if (incomingItemIds.has(itemId)) {
          throw Errors.badRequest("模板检查项重复");
        }
        incomingItemIds.add(itemId);
        itemRows.push({
          id: itemId,
          template_id: template.id,
          section_id: sectionId,
          category: item.category ?? null,
          title: item.title,
          standard: item.standard,
          required: item.required,
          allow_not_applicable: item.allow_not_applicable,
          photo_required: item.photo_required,
          photo_min_count: item.photo_min_count,
          photo_max_count: item.photo_max_count,
          remark_required_on_fail: item.remark_required_on_fail,
          input_type: "pass_fail",
          options: null,
          sort_order: item.sort_order || itemIndex,
          status: "active",
        });
      });
    });

    const removedItemIds = existingItems
      .map((item) => item.id)
      .filter((itemId) => !incomingItemIds.has(itemId));
    const removedSectionIds = existingSections
      .map((section) => section.id)
      .filter((sectionId) => !incomingSectionIds.has(sectionId));

    await projectAcceptanceRepository.deactivateTemplateItems(
      template.id,
      removedItemIds,
    );
    await projectAcceptanceRepository.deactivateTemplateSections(
      template.id,
      removedSectionIds,
    );
    await projectAcceptanceRepository.upsertTemplateSections(sectionRows);
    await projectAcceptanceRepository.upsertTemplateItems(itemRows);

    const nextTemplate = await projectAcceptanceRepository.updateTemplate(
      template.id,
      {
        name: input.name,
        description: input.description ?? null,
        status: input.status ?? template.status,
        version: Number(template.version || 0) + 1,
      },
    );
    if (!nextTemplate) {
      throw Errors.badRequest("验收模板不存在");
    }

    return this.buildTemplateDetail(nextTemplate);
  }

export async function buildTemplateDetail(this: any, template: ProjectAcceptanceTemplateRow) {
    const [sections, items] = await Promise.all([
      projectAcceptanceRepository.listTemplateSections(template.id),
      projectAcceptanceRepository.listTemplateItems(template.id),
    ]);

    return {
      ...template,
      stage_label: this.getStageLabel(template.stage_code),
      sections: this.buildTemplateSections(sections, items),
      items,
    };
  }

export function buildTemplateSections(this: any, 
    sections: ProjectAcceptanceTemplateSectionRow[],
    items: ProjectAcceptanceTemplateItemRow[],
  ) {
    const sectionMap = new Map(sections.map((section) => [
      section.id,
      {
        ...section,
        items: [] as ProjectAcceptanceTemplateItemRow[],
      },
    ]));

    for (const item of items) {
      const sectionId = typeof item.section_id === "string" ? item.section_id : null;
      if (sectionId && sectionMap.has(sectionId)) {
        sectionMap.get(sectionId)?.items.push(item);
      }
    }

    return [...sectionMap.values()].map((section) => ({
      ...section,
      items: [...section.items].sort((left, right) =>
        Number(left.sort_order || 0) - Number(right.sort_order || 0)
      ),
    }));
  }
