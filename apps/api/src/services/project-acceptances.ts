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
  SubmitProjectAcceptanceInput,
  UpdateProjectAcceptanceInput,
  VerifyProjectAcceptanceOpenTicketInput,
} from "@/schema/project-acceptances";
import { createHash, randomBytes } from "node:crypto";
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
import type {
  ProjectAcceptanceActionRow,
  ProjectAcceptanceCustomerRow,
  ProjectAcceptanceEmployeeRow,
  ProjectAcceptanceItemRow,
  ProjectAcceptanceProjectRow,
  ProjectAcceptanceRow,
  ProjectAcceptanceTemplateRow,
} from "@/repositories/project-acceptances";
import {
  PROJECT_ACCEPTANCE_STAGE_LABELS,
  PROJECT_LOG_STAGE_CONFIG,
  isProjectLogStageCode,
  type ProjectAcceptanceAction,
  type ProjectAcceptanceStatus,
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

type AuthIdentitySource = "legacy" | "dual" | "membership";

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
  referenced_image_ids: string[];
  referenced_image_paths: string[];
  referenced_images: AcceptanceImageItem[];
};

type AcceptanceDetail = ProjectAcceptanceRow & {
  stage_label: string | null;
  status_label: string;
  customer_status_label: string;
  has_customer_dispute: boolean;
  items: Array<ProjectAcceptanceItemRow & {
    images: string[];
    image_items: AcceptanceImageItem[];
    rectification_images: string[];
    rectification_image_items: AcceptanceImageItem[];
  }>;
  actions: Array<ProjectAcceptanceActionRow & {
    operator: ProjectAcceptanceEmployeeRow | ProjectAcceptanceCustomerRow | null;
    images: string[];
    image_items: AcceptanceImageItem[];
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
      rejected: ["update", "submit", "cancel"],
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

class ProjectAcceptanceService {
  private customerAcceptanceListCache = new Map<string, {
    expiresAt: number;
    value: CustomerAcceptanceListResult;
  }>();
  private customerAcceptanceListInFlight = new Map<string, Promise<CustomerAcceptanceListResult>>();

  private requireTenantId(authContext: AuthContext) {
    return accessPolicyService.assertTenantContext(authContext);
  }

  private getCachedCustomerAcceptanceList(cacheKey: string) {
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

  private setCachedCustomerAcceptanceList(
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

  private clearCustomerAcceptanceListCache() {
    this.customerAcceptanceListCache.clear();
    this.customerAcceptanceListInFlight.clear();
  }

  private customerAcceptanceListCacheKey(
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
  ) {
    return [
      authUserId,
      scope?.tenantId ?? "",
      scope?.customerId ?? "",
      query.project_id,
      query.page,
      query.pageSize,
      query.status ?? "",
      query.stage_code ?? "",
    ].join(":");
  }

  private getAuthIdentitySource(): AuthIdentitySource {
    const value = (process.env.AUTH_IDENTITY_SOURCE || "membership").trim().toLowerCase();
    if (value === "legacy" || value === "membership") {
      return value;
    }

    return "dual";
  }

  private async listCustomerProfilesByMembership(
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

  private async getCustomerByAuthUserId(
    authUserId: string,
    scope?: {
      tenantId?: string | null;
      customerId?: string | null;
    },
  ) {
    const identitySource = this.getAuthIdentitySource();
    if (identitySource === "membership") {
      const customers = await this.listCustomerProfilesByMembership(authUserId, scope);
      if (customers.length > 1) {
        throw Errors.badRequest("当前账号绑定了多个客户档案，请先选择装修公司");
      }
      return customers[0] || null;
    }

    const legacyCustomer = await projectAcceptanceRepository.getCustomerByAuthUserId(
      authUserId,
      scope,
    );
    if (identitySource === "legacy") {
      return legacyCustomer;
    }

    const membershipCustomers = await this.listCustomerProfilesByMembership(authUserId, scope);
    const customerMap = new Map<string, ProjectAcceptanceCustomerRow>();
    for (const customer of [...membershipCustomers, ...(legacyCustomer ? [legacyCustomer] : [])]) {
      customerMap.set(customer.id, customer);
    }

    const customers = Array.from(customerMap.values());
    if (customers.length > 1) {
      throw Errors.badRequest("当前账号绑定了多个客户档案，请先选择装修公司");
    }

    return customers[0] || null;
  }

  private async getCustomerByAuthUserOrScope(
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

  private getStatusLabel(status: ProjectAcceptanceStatus) {
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

  private normalizeImageArray(value: unknown) {
    return this.normalizeImageItems(value).map((item) => item.url);
  }

  private normalizeImageItems(value: unknown) {
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

  private buildAcceptanceImageId(input: {
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

  private normalizeAcceptanceImageItems(input: {
    acceptanceId: string;
    itemId: string;
    itemTitle?: string | null;
    source: AcceptanceImageSource;
    value: unknown;
  }) {
    return this.normalizeImageItems(input.value).map((item, index) => ({
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

  private normalizeActionMetadata(value: unknown): ActionMetadata {
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
      referenced_image_ids: referencedImageIds,
      referenced_image_paths: referencedImagePaths,
      referenced_images: referencedImages,
    };
  }

  private normalizeImageReferenceSnapshot(
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

  private buildImageReferenceCatalog(
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

  private resolveReferencedImages(input: {
    ids?: string[] | null;
    paths?: string[] | null;
    catalog: ReturnType<ProjectAcceptanceService["buildImageReferenceCatalog"]>;
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

  private getImagePublicUrl(path: string) {
    return resolveStoredFileUrl(path) || path;
  }

  private getStageLabel(stageCode: string | null | undefined) {
    if (!isProjectLogStageCode(stageCode)) {
      return null;
    }

    return PROJECT_ACCEPTANCE_STAGE_LABELS[stageCode] ||
      PROJECT_LOG_STAGE_CONFIG[stageCode].label;
  }

  private buildDetailFromParts(
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
    const detailItems = input.items.map((item) => ({
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

    return {
      ...row,
      stage_label: this.getStageLabel(row.stage_code),
      status_label: this.getStatusLabel(row.status),
      customer_status_label: customerStatusLabel,
      has_customer_dispute: hasCustomerDispute,
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

  private async buildDetail(row: ProjectAcceptanceRow): Promise<AcceptanceDetail> {
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

  private getCommonTenantId(rows: ProjectAcceptanceRow[]) {
    const tenantIds = Array.from(
      new Set(rows.map((item) => item.tenant_id).filter((item): item is string => Boolean(item))),
    );
    return tenantIds.length === 1 ? tenantIds[0] : null;
  }

  private groupBy<T>(rows: T[], getKey: (row: T) => string) {
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

  private async buildDetails(
    rows: ProjectAcceptanceRow[],
    known?: {
      projects?: ProjectAcceptanceProjectRow[];
      customers?: ProjectAcceptanceCustomerRow[];
    },
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
    const [items, actions, projects, latestNotifications] = await Promise.all([
      projectAcceptanceRepository.listItemsByAcceptanceIds(acceptanceIds, tenantId),
      projectAcceptanceRepository.listActionsByAcceptanceIds(acceptanceIds, tenantId),
      projectAcceptanceRepository.listProjectsByIds(missingProjectIds, tenantId),
      projectAcceptanceOpenTicketRepository.listLatestByAcceptances(
        acceptanceIds,
        tenantId,
      ),
    ]);
    const employeeIds = new Set<string>();
    const customerMap = new Map(
      (known?.customers || []).map((item) => [item.id, item]),
    );
    const missingCustomerIds = new Set<string>();

    for (const row of rows) {
      employeeIds.add(row.initiator_id);
      if (row.reviewer_id) employeeIds.add(row.reviewer_id);
      if (row.customer_id && !customerMap.has(row.customer_id)) {
        missingCustomerIds.add(row.customer_id);
      }
    }

    for (const action of actions) {
      if (action.operator_type === "employee" && action.operator_id) {
        employeeIds.add(action.operator_id);
      }
      if (
        action.operator_type === "customer" &&
        action.operator_id &&
        !customerMap.has(action.operator_id)
      ) {
        missingCustomerIds.add(action.operator_id);
      }
    }

    const [employees, customers] = await Promise.all([
      projectAcceptanceRepository.listEmployees(Array.from(employeeIds)),
      projectAcceptanceRepository.listCustomers(Array.from(missingCustomerIds)),
    ]);
    const itemsByAcceptance = this.groupBy(items, (item) => item.acceptance_id);
    const actionsByAcceptance = this.groupBy(actions, (item) => item.acceptance_id);
    const projectMap = new Map([
      ...knownProjectMap,
      ...projects.map((item) => [item.id, item] as const),
    ]);
    const notificationMap = new Map(
      latestNotifications.map((item) => [item.acceptance_id, item]),
    );
    const employeeMap = new Map(employees.map((item) => [item.id, item]));
    for (const customer of customers) {
      customerMap.set(customer.id, customer);
    }

    return rows.map((row) =>
      this.buildDetailFromParts(row, {
        items: itemsByAcceptance.get(row.id) || [],
        actions: actionsByAcceptance.get(row.id) || [],
        project: projectMap.get(row.project_id) || null,
        employeeMap,
        customerMap,
        latestNotification: notificationMap.get(row.id) || null,
      })
    );
  }

  private async getRequiredAcceptance(id: string, tenantId?: string | null) {
    const row = await projectAcceptanceRepository.getAcceptanceById(id, tenantId);
    if (!row) {
      throw Errors.badRequest("项目验收单不存在");
    }
    return row;
  }

  private async assertCanRead(authContext: AuthContext, row: ProjectAcceptanceRow) {
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      row.project_id,
      "project_acceptance.read",
    );
    if (!hasAccess) throw Errors.forbidden();
  }

  private assertCurrentEmployee(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private async assertCanCreate(
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

  private assertCanUpdateOwn(authContext: AuthContext, row: ProjectAcceptanceRow) {
    const employeeId = this.assertCurrentEmployee(authContext);
    const manageScope = accessPolicyService.getScope(
      authContext,
      "project_acceptance.manage",
    );
    if (manageScope === "all") {
      return;
    }

    accessPolicyService.assertPermission(authContext, "project_acceptance.update_own");
    if (row.initiator_id !== employeeId) {
      throw Errors.forbidden();
    }
  }

  private assertCanSubmit(authContext: AuthContext, row: ProjectAcceptanceRow) {
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

  private assertCanReview(authContext: AuthContext, row: ProjectAcceptanceRow) {
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

  private assertCanReject(authContext: AuthContext, row: ProjectAcceptanceRow) {
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

  private assertCanManage(authContext: AuthContext) {
    accessPolicyService.assertPermission(authContext, "project_acceptance.manage");
  }

  private async resolveTemplate(input: CreateProjectAcceptanceInput) {
    const template = input.template_id
      ? await projectAcceptanceRepository.getTemplateById(input.template_id)
      : await projectAcceptanceRepository.getActiveTemplateByStage(input.stage_code);

    if (!template) {
      throw Errors.badRequest("验收模板不存在");
    }

    if (template.status !== "active") {
      throw Errors.badRequest("验收模板未启用");
    }

    if (template.stage_code !== input.stage_code) {
      throw Errors.badRequest("验收模板与工序不匹配");
    }

    const items = await projectAcceptanceRepository.listTemplateItems(template.id);
    if (items.length === 0) {
      throw Errors.badRequest("验收模板没有可用标准项");
    }

    return { template, items };
  }

  private async resolveReviewer(
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

  private async recordAction(input: {
    row: ProjectAcceptanceRow;
    action: ProjectAcceptanceAction;
    fromStatus: ProjectAcceptanceStatus | null;
    toStatus: ProjectAcceptanceStatus;
    operatorType: "employee" | "customer" | "system";
    operatorId: string | null;
    comment?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    await projectAcceptanceRepository.createAction({
      tenant_id: input.row.tenant_id,
      acceptance_id: input.row.id,
      operator_type: input.operatorType,
      operator_id: input.operatorId,
      action: input.action,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      comment: input.comment ?? null,
      metadata: input.metadata ?? {},
    });
    this.clearCustomerAcceptanceListCache();
  }

  private maskPhone(phone: string) {
    const normalized = phone.trim();
    if (normalized.length < 7) {
      return normalized.replace(/.(?=.{2})/g, "*");
    }

    return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
  }

  private createTicketValue() {
    return randomBytes(32).toString("hex");
  }

  private async getAcceptanceSmsExpireHours(tenantId?: string | null) {
    const channelMode = tenantId
      ? await systemSettingsService.getTenantOverrideString(
        "SMS_CHANNEL_MODE",
        tenantId,
        "platform",
      )
      : "platform";
    const effectiveTenantId = channelMode === "tenant_aliyun" || channelMode === "tenant_tencent"
      ? tenantId
      : null;
    const value = await systemSettingsService.getNumber(
      "PROJECT_ACCEPTANCE_SMS_EXPIRE_HOURS",
      72,
      { tenantId: effectiveTenantId },
    );
    if (!Number.isFinite(value) || value <= 0) {
      return 72;
    }

    return Math.min(Math.max(Math.floor(value), 1), 720);
  }

  private async getAcceptanceSmsLink(input: {
    row: ProjectAcceptanceRow;
    ticket: string;
    expireAt: Date;
  }) {
    const pagePath = (await systemSettingsService.getString(
      "WECHAT_PROJECT_ACCEPTANCE_PAGE",
      "packageCustomerPortal/pages/customer-project-acceptance/index",
    )).replace(/^\/+/, "");
    const envVersion = wechatOpenLinkService.normalizeEnvVersion(
      await systemSettingsService.getString(
        "WECHAT_MINIPROGRAM_ENV_VERSION",
        "release",
      ),
    );
    const linkType = (await systemSettingsService.getString(
      "PROJECT_ACCEPTANCE_SMS_LINK_TYPE",
      "scheme",
    )).trim().toLowerCase() === "url_link"
      ? "url_link"
      : "scheme";
    const query = new URLSearchParams({
      id: input.row.id,
      projectId: input.row.project_id,
      ticket: input.ticket,
      source: "sms_acceptance",
    }).toString();

    const link = linkType === "url_link"
      ? await wechatOpenLinkService.generateUrlLink({
        path: pagePath,
        query,
        envVersion,
        expireAt: input.expireAt,
      })
      : await wechatOpenLinkService.generateScheme({
        path: pagePath,
        query,
        envVersion,
      });

    return { link, linkType };
  }

  private async getAcceptanceCustomer(row: ProjectAcceptanceRow) {
    if (!row.customer_id) {
      throw Errors.badRequest("该验收单未关联客户");
    }

    const [customer] = await projectAcceptanceRepository.listCustomers([
      row.customer_id,
    ]);
    if (!customer || customer.tenant_id !== row.tenant_id) {
      throw Errors.badRequest("验收单关联客户不存在");
    }
    if (!customer.phone?.trim()) {
      throw Errors.badRequest("客户未配置手机号，无法发送验收通知");
    }

    return customer;
  }

  private async sendAcceptanceCustomerSms(input: {
    tenantId: string | null;
    phone: string;
    stageName: string;
    link: string;
    expireHours: number;
  }) {
    await sendSmsTemplate({
      phone: input.phone,
      templateParam: {
        stageName: input.stageName,
        link: input.link,
        expireHours: input.expireHours,
      },
      tenantId: input.tenantId,
      templatePurpose: "project_acceptance",
    });
  }

  private async notifyCustomerForAcceptanceInternal(input: {
    row: ProjectAcceptanceRow;
    createdBy: string | null;
    force: boolean;
  }) {
    if (input.row.status !== "leader_approved") {
      throw Errors.badRequest("只有待业主确认的验收单可以发送客户通知");
    }

    const customer = await this.getAcceptanceCustomer(input.row);
    const reusable = input.force
      ? null
      : await projectAcceptanceOpenTicketRepository.findReusable({
        tenant_id: input.row.tenant_id,
        acceptance_id: input.row.id,
        customer_id: customer.id,
        phone: customer.phone!,
      });

    if (reusable?.sent_at && reusable.send_status === "sent") {
      this.clearCustomerAcceptanceListCache();
      return {
        sent: true,
        reused: true,
        phone: this.maskPhone(reusable.phone),
        link_type: reusable.link_type || "scheme",
        expire_at: reusable.expire_at,
      };
    }

    const expireHours = await this.getAcceptanceSmsExpireHours(input.row.tenant_id);
    const expireAt = new Date(Date.now() + expireHours * 60 * 60 * 1000);
    const ticket = this.createTicketValue();
    const { link, linkType } = await this.getAcceptanceSmsLink({
      row: input.row,
      ticket,
      expireAt,
    });
    const openTicket = await projectAcceptanceOpenTicketRepository.create({
      tenant_id: input.row.tenant_id,
      ticket,
      acceptance_id: input.row.id,
      project_id: input.row.project_id,
      customer_id: customer.id,
      phone: customer.phone!,
      expire_at: expireAt.toISOString(),
      created_by: input.createdBy,
      link_type: linkType,
      link_url: link,
    });

    try {
      await this.sendAcceptanceCustomerSms({
        tenantId: input.row.tenant_id,
        phone: customer.phone!,
        stageName: this.getStageLabel(input.row.stage_code) || input.row.title,
        link,
        expireHours,
      });

      const sent = await projectAcceptanceOpenTicketRepository.update(
        openTicket.id,
        {
          send_status: "sent",
          send_error: null,
          sent_at: new Date().toISOString(),
        },
        input.row.tenant_id,
      );

      this.clearCustomerAcceptanceListCache();
      return {
        sent: true,
        reused: false,
        phone: this.maskPhone(sent.phone),
        link_type: sent.link_type || linkType,
        expire_at: sent.expire_at,
      };
    } catch (error) {
      await projectAcceptanceOpenTicketRepository.update(
        openTicket.id,
        {
          send_status: "failed",
          send_error: error instanceof Error ? error.message : "短信发送失败",
        },
        input.row.tenant_id,
      );
      this.clearCustomerAcceptanceListCache();
      throw error;
    }
  }

  private async verifyOpenTicketRow(input: VerifyProjectAcceptanceOpenTicketInput) {
    const ticket = await projectAcceptanceOpenTicketRepository.findByTicket(
      input.ticket,
    );
    if (!ticket) {
      return { valid: false as const, reason: "not_found" as const };
    }

    if (ticket.acceptance_id !== input.acceptance_id || ticket.project_id !== input.project_id) {
      return { valid: false as const, reason: "acceptance_mismatch" as const };
    }

    await this.assertTenantAvailableById(ticket.tenant_id);

    if (ticket.status === "revoked") {
      return { valid: false as const, reason: "revoked" as const };
    }

    if (ticket.status === "expired" || new Date(ticket.expire_at).getTime() <= Date.now()) {
      if (ticket.status === "active") {
        await projectAcceptanceOpenTicketRepository.update(
          ticket.id,
          { status: "expired" },
          ticket.tenant_id,
        );
      }
      return { valid: false as const, reason: "expired" as const };
    }

    const row = await projectAcceptanceRepository.getAcceptanceById(
      ticket.acceptance_id,
      ticket.tenant_id,
    );
    if (!row) {
      return { valid: false as const, reason: "not_found" as const };
    }

    if (row.customer_id !== ticket.customer_id) {
      return { valid: false as const, reason: "customer_mismatch" as const };
    }

    if (row.status !== "leader_approved") {
      return { valid: false as const, reason: "not_reviewable" as const };
    }

    const now = new Date().toISOString();
    const verified = await projectAcceptanceOpenTicketRepository.update(
      ticket.id,
      {
        used_at: ticket.used_at || now,
        last_verified_at: now,
        verify_count: (ticket.verify_count || 0) + 1,
      },
      ticket.tenant_id,
    );

    return { valid: true as const, ticket: verified, row };
  }

  async listTemplates(input: ProjectAcceptanceTemplateListQuery) {
    const templates = await projectAcceptanceRepository.listTemplates({
      stage_code: input.stage_code,
      status: input.status ?? "active",
    });

    return {
      list: await Promise.all(
        templates.map(async (template) => ({
          ...template,
          stage_label: this.getStageLabel(template.stage_code),
          items: await projectAcceptanceRepository.listTemplateItems(template.id),
        })),
      ),
    };
  }

  async getTemplate(id: string) {
    const template = await projectAcceptanceRepository.getTemplateById(id);
    if (!template) {
      throw Errors.badRequest("验收模板不存在");
    }
    return {
      ...template,
      stage_label: this.getStageLabel(template.stage_code),
      items: await projectAcceptanceRepository.listTemplateItems(template.id),
    };
  }

  async listAcceptances(
    authContext: AuthContext,
    query: ProjectAcceptanceListQuery,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const visibleProjectIds = await accessPolicyService.getVisibleProjectIds(
      authContext,
      "project_acceptance.read",
    );
    const { list, total } = await projectAcceptanceRepository.listAcceptances({
      ...query,
      visibleProjectIds,
      tenantId,
    });

    return {
      list: await this.buildDetails(list),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
    };
  }

  async getAcceptance(authContext: AuthContext, id: string) {
    const tenantId = this.requireTenantId(authContext);
    const row = await this.getRequiredAcceptance(id, tenantId);
    await this.assertCanRead(authContext, row);
    return this.buildDetail(row);
  }

  async listCustomerAcceptances(
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
  ) {
    const cacheKey = this.customerAcceptanceListCacheKey(authUserId, query, scope);
    const cached = this.getCachedCustomerAcceptanceList(cacheKey);
    if (cached) {
      return cached;
    }

    const inFlight = this.customerAcceptanceListInFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const request = this.loadCustomerAcceptances(authUserId, query, scope)
      .then((result) => {
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

  private async loadCustomerAcceptances(
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
  ): Promise<CustomerAcceptanceListResult> {
    const customerPromise = this.getCustomerByAuthUserOrScope(authUserId, scope);
    const projectPromise = scope?.tenantId
      ? projectAcceptanceRepository.getProject(query.project_id, scope.tenantId)
      : null;
    const customer = await customerPromise;
    if (!customer) throw Errors.forbidden();
    this.assertCustomerTenantAvailable(customer);

    const project = projectPromise
      ? await projectPromise
      : await projectAcceptanceRepository.getProject(
        query.project_id,
        customer.tenant_id,
      );
    if (
      !project ||
      project.customer_id !== customer.id ||
      project.tenant_id !== customer.tenant_id
    ) {
      throw Errors.notFound("项目不存在");
    }

    const { list, total } = await projectAcceptanceRepository.listAcceptances({
      ...query,
      customer_id: customer.id,
      tenantId: customer.tenant_id,
    });

    return {
      list: await this.buildDetails(list, {
        projects: [project],
        customers: [customer],
      }),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: total ? Math.ceil(total / query.pageSize) : 0,
      },
    };
  }

  async getCustomerAcceptance(
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

  async getCustomerAcceptanceByAuthOrTicket(input: {
    authUserId?: string | null;
    tenantId?: string | null;
    customerId?: string | null;
    id: string;
    ticketQuery?: CustomerProjectAcceptanceOpenTicketQuery;
  }) {
    if (input.authUserId) {
      const customer = await this.getCustomerByAuthUserId(
        input.authUserId,
        {
          tenantId: input.tenantId,
          customerId: input.customerId,
        },
      );
      const row = customer?.tenant_id
        ? await projectAcceptanceRepository.getAcceptanceById(
          input.id,
          customer.tenant_id,
        )
        : null;
      if (
        customer &&
        row &&
        row.customer_id === customer.id &&
        row.tenant_id === customer.tenant_id
      ) {
        this.assertCustomerTenantAvailable(customer);
        return this.buildDetail(row);
      }
    }

    if (input.ticketQuery?.ticket && input.ticketQuery.project_id) {
      const result = await this.verifyOpenTicketRow({
        ticket: input.ticketQuery.ticket,
        acceptance_id: input.id,
        project_id: input.ticketQuery.project_id,
      });
      if (result.valid) {
        return this.buildDetail(result.row);
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

  async verifyOpenTicket(input: VerifyProjectAcceptanceOpenTicketInput) {
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

  private async resolveCustomerActor(input: {
    authUserId?: string | null;
    tenantId?: string | null;
    customerId?: string | null;
    row: ProjectAcceptanceRow;
    ticket?: string;
    projectId?: string;
  }) {
    if (input.authUserId) {
      const customer = await this.getCustomerByAuthUserId(
        input.authUserId,
        {
          tenantId: input.tenantId,
          customerId: input.customerId,
        },
      );
      if (
        customer &&
        input.row.customer_id === customer.id &&
        input.row.tenant_id === customer.tenant_id
      ) {
        this.assertCustomerTenantAvailable(customer);
        return customer;
      }
    }

    if (input.ticket && input.projectId) {
      const result = await this.verifyOpenTicketRow({
        ticket: input.ticket,
        acceptance_id: input.row.id,
        project_id: input.projectId,
      });
      if (result.valid) {
        const [customer] = await projectAcceptanceRepository.listCustomers([
          result.ticket.customer_id,
        ]);
        if (customer && customer.tenant_id === input.row.tenant_id) {
          return customer;
        }
      }
    }

    if (input.authUserId || input.ticket) {
      throw Errors.forbidden();
    }

    throw Errors.unauthorized("请先登录或提供有效访问票据");
  }

  private normalizeCustomerTenant(customer: ProjectAcceptanceCustomerRow) {
    const tenant = customer.tenant;
    return Array.isArray(tenant) ? tenant[0] ?? null : tenant ?? null;
  }

  private assertCustomerTenantAvailable(customer: ProjectAcceptanceCustomerRow) {
    const tenant = this.normalizeCustomerTenant(customer);
    if (!customer.tenant_id || tenant?.status !== "active") {
      throw Errors.business(
        403,
        "装修公司服务已暂停，请联系装修公司",
        ErrorCodes.TENANT_NOT_AVAILABLE,
        {
          tenant_id: customer.tenant_id,
          tenant_status: tenant?.status ?? null,
        },
      );
    }
  }

  private async assertTenantAvailableById(tenantId: string | null | undefined) {
    if (!tenantId) {
      throw Errors.business(403, "装修公司服务已暂停，请联系装修公司", ErrorCodes.TENANT_NOT_AVAILABLE);
    }

    const tenant = await projectAcceptanceRepository.getTenantById(tenantId);
    if (tenant?.status !== "active") {
      throw Errors.business(
        403,
        "装修公司服务已暂停，请联系装修公司",
        ErrorCodes.TENANT_NOT_AVAILABLE,
        {
          tenant_id: tenantId,
          tenant_status: tenant?.status ?? null,
        },
      );
    }
  }

  async createAcceptance(
    authContext: AuthContext,
    input: CreateProjectAcceptanceInput,
  ) {
    const employeeId = this.assertCurrentEmployee(authContext);
    const tenantId = this.requireTenantId(authContext);
    await this.assertCanCreate(authContext, input.project_id);

    const project = await projectAcceptanceRepository.getProject(
      input.project_id,
      tenantId,
    );
    if (!project) {
      throw Errors.badRequest("项目不存在");
    }

    const open = await projectAcceptanceRepository.hasOpenAcceptance(
      input.project_id,
      input.stage_code,
      tenantId,
    );
    if (open) {
      throw Errors.badRequest("该工序已有进行中的验收单，请处理完成后再发起");
    }

    const { template, items } = await this.resolveTemplate(input);
    const reviewerId = await this.resolveReviewer(project, input.reviewer_id);

    const title = PROJECT_ACCEPTANCE_STAGE_LABELS[input.stage_code] || template.name;
    const row = await projectAcceptanceRepository.createAcceptance({
      tenant_id: project.tenant_id,
      project_id: input.project_id,
      stage_code: input.stage_code,
      template_id: template.id,
      template_version: template.version,
      title,
      status: "draft",
      initiator_id: employeeId,
      reviewer_id: reviewerId,
      customer_id: project.customer_id,
      summary: input.summary ?? null,
    });

    await projectAcceptanceRepository.createItems(
      items.map((item) => ({
        acceptance_id: row.id,
        tenant_id: row.tenant_id,
        template_item_id: item.id,
        category: item.category,
        title: item.title,
        standard: item.standard,
        required: item.required,
        allow_not_applicable: item.allow_not_applicable,
        photo_required: item.photo_required,
        photo_min_count: item.photo_min_count,
        photo_max_count: item.photo_max_count,
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

    return this.buildDetail(row);
  }

  private async applyUpdate(
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

  async updateAcceptance(
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
    this.assertCanUpdateOwn(authContext, row);

    const nextRow = await this.applyUpdate(row, input);
    await this.recordAction({
      row: nextRow,
      action: "update",
      fromStatus: row.status,
      toStatus: nextRow.status,
      operatorType: "employee",
      operatorId: authContext.employeeId,
    });

    return this.buildDetail(nextRow);
  }

  async deleteDraftAcceptance(authContext: AuthContext, id: string) {
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

    this.assertCanUpdateOwn(authContext, row);
    await projectAcceptanceRepository.deleteAcceptance(row.id, row.tenant_id);
    this.clearCustomerAcceptanceListCache();

    return {
      id: row.id,
      deleted: true,
    };
  }

  private validateSubmitItems(input: {
    beforeItems: ProjectAcceptanceItemRow[];
    afterItems: ProjectAcceptanceItemRow[];
    isResubmit: boolean;
  }) {
    const beforeFailIds = new Set(
      input.beforeItems
        .filter((item) => item.result === "fail")
        .map((item) => item.id),
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

      if (item.result === "fail") {
        failedItems.push(item);
      }
    }

    return failedItems;
  }

  async submitAcceptance(
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
    this.assertCanSubmit(authContext, row);

    const beforeItems = await projectAcceptanceRepository.listItems(
      row.id,
      row.tenant_id,
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
    });

    if (failedItems.length > 0) {
      const reason = `存在 ${failedItems.length} 个未通过验收项：${
        failedItems.map((item) => item.title).join("、")
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

    return this.buildDetail(nextRow);
  }

  async approveAcceptance(
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

    return this.buildDetail(nextRow);
  }

  async notifyCustomerForAcceptance(
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

  async rejectAcceptance(
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

    return this.buildDetail(nextRow);
  }

  async customerConfirmAcceptance(
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

    return this.buildDetail(nextRow);
  }

  async customerDisputeAcceptance(
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
          .map((item) => item.id)
          .filter((item): item is string => Boolean(item)),
        referenced_image_paths: referencedImages.map((item) =>
          item.path || item.url
        ),
        referenced_images: referencedImages,
      },
    });

    return this.buildDetail(nextRow);
  }

  async cancelAcceptance(
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

    return this.buildDetail(nextRow);
  }
}

export const projectAcceptanceService = new ProjectAcceptanceService();
