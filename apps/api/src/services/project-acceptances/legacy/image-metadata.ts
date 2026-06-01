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

export function normalizeImageArray(this: any, value: unknown) {
    return this.normalizeImageItems(value).map((item: AcceptanceImageItem) => item.url);
  }

export function normalizeImageItems(this: any, value: unknown) {
    if (!Array.isArray(value)) {
      return [] as AcceptanceImageItem[];
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const url = this.getImagePublicUrl(item);
        return {
          path: /^https?:\/\//i.test(item) ? "" : item,
          url,
          thumb_url: url,
        };
      });
  }

export function buildAcceptanceImageId(this: any, input: {
    acceptanceId: string;
    itemId: string;
    source: AcceptanceImageSource;
    path: string;
    index: number;
  }) {
    const raw = [
      input.acceptanceId,
      input.itemId,
      input.source,
      input.path,
      String(input.index),
    ].join(":");

    return createHash("sha1").update(raw).digest("hex").slice(0, 24);
  }

export function normalizeAcceptanceImageItems(this: any, input: {
    acceptanceId: string;
    itemId: string;
    itemTitle?: string | null;
    source: AcceptanceImageSource;
    value: unknown;
  }) {
    return this.normalizeImageItems(input.value).map((item: AcceptanceImageItem, index: number) => ({
      ...item,
      id: this.buildAcceptanceImageId({
        acceptanceId: input.acceptanceId,
        itemId: input.itemId,
        source: input.source,
        path: item.path || item.url,
        index,
      }),
      acceptance_id: input.acceptanceId,
      item_id: input.itemId,
      item_title: input.itemTitle ?? null,
      source: input.source,
      created_at: null,
    }));
  }

export function normalizeActionMetadata(this: any, value: unknown): ActionMetadata {
    const raw = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};

    const images = Array.isArray(raw.images)
      ? raw.images.filter((item): item is string => typeof item === "string")
      : [];
    const referencedImageIds = Array.isArray(raw.referenced_image_ids)
      ? raw.referenced_image_ids.filter((item): item is string =>
        typeof item === "string"
      )
      : [];
    const referencedImagePaths = Array.isArray(raw.referenced_image_paths)
      ? raw.referenced_image_paths.filter((item): item is string =>
        typeof item === "string"
      )
      : [];
    const referencedActionId = typeof raw.referenced_action_id === "string"
      ? raw.referenced_action_id
      : null;
    const referencedItemIds = Array.isArray(raw.referenced_item_ids)
      ? raw.referenced_item_ids.filter((item): item is string =>
        typeof item === "string"
      )
      : [];
    const referencedImages = Array.isArray(raw.referenced_images)
      ? raw.referenced_images
        .filter((item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
        )
        .map((item) => this.normalizeImageReferenceSnapshot(item))
        .filter((item): item is AcceptanceImageItem => Boolean(item))
      : [];

    return {
      images,
      image_items: this.normalizeImageItems(images),
      referenced_action_id: referencedActionId,
      referenced_item_ids: referencedItemIds,
      referenced_image_ids: referencedImageIds,
      referenced_image_paths: referencedImagePaths,
      referenced_images: referencedImages,
    };
  }

export function normalizeImageReferenceSnapshot(this: any, 
    value: Record<string, unknown>,
  ): AcceptanceImageItem | null {
    const path = typeof value.path === "string" ? value.path : "";
    const rawUrl = typeof value.url === "string"
      ? value.url
      : path
      ? this.getImagePublicUrl(path)
      : "";
    const url = rawUrl ? this.getImagePublicUrl(rawUrl) : "";
    if (!path && !url) return null;

    const source = value.source === "acceptance_item" ||
        value.source === "rectification_item"
      ? value.source
      : undefined;

    return {
      id: typeof value.id === "string" ? value.id : undefined,
      acceptance_id: typeof value.acceptance_id === "string"
        ? value.acceptance_id
        : undefined,
      item_id: typeof value.item_id === "string" ? value.item_id : undefined,
      item_title: typeof value.item_title === "string"
        ? value.item_title
        : null,
      path,
      url,
      thumb_url: typeof value.thumb_url === "string"
        ? this.getImagePublicUrl(value.thumb_url)
        : url,
      source,
      created_at: typeof value.created_at === "string"
        ? value.created_at
        : null,
    };
  }

export function buildImageReferenceCatalog(this: any, 
    acceptanceId: string,
    items: ProjectAcceptanceItemRow[],
  ) {
    const byId = new Map<string, AcceptanceImageItem>();
    const byPath = new Map<string, AcceptanceImageItem>();
    const byUrl = new Map<string, AcceptanceImageItem>();

    for (const item of items) {
      const imageGroups = [
        this.normalizeAcceptanceImageItems({
          acceptanceId,
          itemId: item.id,
          itemTitle: item.title,
          source: "acceptance_item",
          value: item.images,
        }),
        this.normalizeAcceptanceImageItems({
          acceptanceId,
          itemId: item.id,
          itemTitle: item.title,
          source: "rectification_item",
          value: item.rectification_images,
        }),
      ];

      for (const image of imageGroups.flat()) {
        if (image.id) byId.set(image.id, image);
        if (image.path) byPath.set(image.path, image);
        if (image.url) byUrl.set(image.url, image);
      }
    }

    return { byId, byPath, byUrl };
  }

export function resolveReferencedImages(this: any, input: {
    ids?: string[] | null;
    paths?: string[] | null;
    catalog: any;
  }) {
    const ids = Array.from(new Set(input.ids || []));
    const paths = Array.from(new Set(input.paths || []));
    const useIds = ids.length > 0;
    const values = useIds ? ids : paths;
    if (values.length > 9) {
      throw Errors.business(400, "最多引用9张验收图片", "ACCEPTANCE_IMAGE_REFERENCE_LIMIT");
    }

    const resolved: AcceptanceImageItem[] = [];
    for (const value of values) {
      const image = useIds
        ? input.catalog.byId.get(value)
        : input.catalog.byPath.get(value) || input.catalog.byUrl.get(value);

      if (!image) {
        throw Errors.business(
          400,
          "引用图片不属于当前验收单",
          "ACCEPTANCE_IMAGE_REFERENCE_INVALID",
          { reference: value },
        );
      }

      resolved.push(image);
    }

    return resolved;
  }

export function getImagePublicUrl(this: any, path: string) {
    return resolveStoredFileUrl(path) || path;
  }
