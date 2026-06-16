import { Errors } from "@/errors/error-factory";
import {
  measureCustomerProjectDetailStep,
  type CustomerProjectDetailTimingSteps,
} from "@/utils/customer-project-detail-timing";
import {
  customerSelfServiceService,
  type CustomerContextRow,
  type CustomerProjectLogCommentAggregateRow,
  type CustomerProjectLogCommentAuthorCustomer,
  type CustomerProjectLogCommentAuthorEmployee,
  type CustomerProjectLogCommentRow,
  type CustomerProjectLogRow,
  type CustomerProjectListItem,
  type CustomerProjectRecentLogSummaryRow,
} from "@/services/customer-self-service";
import { buildCustomerHomeProjectsPayload } from "@/services/customer-home-projects";
import { projectMemberService } from "@/services/project-members";
import {
  PROJECT_LOG_STAGE_CONFIG,
  ProjectStatusConfig,
  isProjectLogStageCode,
  isProjectStatus,
  type ProjectLogStageCode,
  type ProjectMemberRoleCode,
} from "@gooes/domain";
import { CustomerSelfServiceBaseController } from "./shared";
import { deriveCustomerProjectTeam } from "./customer-project-team";

type CustomerProjectLogCommentAuthor = {
  id: string;
  name: string | null;
  avatar: string | null;
};

type CustomerProjectMemberSummary = {
  id: string; project_id: string; employee_id: string;
  role_code: ProjectMemberRoleCode; role_name: string;
  is_primary: boolean; sort_order: number;
  created_at: string | null;
  updated_at?: string | null;
  employee: {
    id: string; name: string | null;
    avatar: string | null; phone: string | null;
  } | null;
  is_virtual?: boolean;
};

export abstract class CustomerSelfServiceProjectBaseController
  extends CustomerSelfServiceBaseController {
  protected normalizeProjectLogImages(images: unknown) {
    if (!Array.isArray(images)) {
      return [] as string[];
    }

    return images
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => this.getImagePublicUrl(item) || item);
  }

  protected getImageThumbUrl(url: string) {
    return url;
  }

  protected normalizeProjectLogImageItems(images: unknown) {
    return this.normalizeProjectLogImages(images).map((url) => ({
      url,
      thumb_url: this.getImageThumbUrl(url),
      width: null as number | null,
      height: null as number | null,
    }));
  }

  protected async buildCustomerProjectsPayload(input: {
    customer: CustomerContextRow;
    page: number;
    pageSize: number;
    include?: "home_summary";
    includeDesigner?: boolean; includeCount?: boolean; recentLogsTimeoutMs?: number;
    request?: { id: string; log: { info: (...args: unknown[]) => void } };
    timingSteps?: CustomerProjectDetailTimingSteps;
  }) {
    const from = (input.page - 1) * input.pageSize; const to = from + input.pageSize - 1;
    if (input.include === "home_summary" && input.includeDesigner === false && input.includeCount === false) {
      return buildCustomerHomeProjectsPayload({
        customerId: input.customer.id,
        tenantId: input.customer.tenant_id!,
        page: input.page,
        pageSize: input.pageSize,
        timingSteps: input.timingSteps,
        serializeProject: (row) => this.serializeCustomerProjectListItem(row), serializeRecentLog: (log) => this.serializeCustomerProjectRecentLog(log),
      });
    }

    const projectsStartedAt = Date.now();
    const { list: projectRows, count } = input.timingSteps
      ? await measureCustomerProjectDetailStep(
        input.timingSteps,
        "projects_query_ms",
        () => customerSelfServiceService.listOwnedProjects({
          customerId: input.customer.id,
          tenantId: input.customer.tenant_id!,
          from,
          to,
          includeDesigner: input.includeDesigner,
          includeCount: input.includeCount,
        }),
      )
      : await customerSelfServiceService.listOwnedProjects({
        customerId: input.customer.id,
        tenantId: input.customer.tenant_id!,
        from,
        to,
        includeDesigner: input.includeDesigner,
        includeCount: input.includeCount,
      });
    if (input.timingSteps) {
      input.timingSteps.projects_ms += Date.now() - projectsStartedAt;
    }
    input.request?.log.info(
      {
        requestId: input.request.id,
        durationMs: Date.now() - projectsStartedAt,
        customerId: input.customer.id,
        tenantId: input.customer.tenant_id,
        count: projectRows.length,
        total: count || 0,
        page: input.page,
        pageSize: input.pageSize,
      },
      "[customer-bootstrap] owned projects loaded",
    );

    const list = input.timingSteps
      ? await measureCustomerProjectDetailStep(
        input.timingSteps,
        "projects_serialize_ms",
        async () => projectRows.map((item) =>
          this.serializeCustomerProjectListItem(item)
        ),
      )
      : projectRows.map((item) =>
        this.serializeCustomerProjectListItem(item)
      );

    let recentLogMap: Awaited<
      ReturnType<CustomerSelfServiceProjectBaseController["listRecentLogSummariesForProjects"]>
    > | null = null;
    if (input.include === "home_summary") {
      const recentLogsStartedAt = Date.now();
      const loadRecentLogMap = input.timingSteps
        ? measureCustomerProjectDetailStep(
          input.timingSteps,
          "recent_logs_query_ms",
          () => this.listRecentLogSummariesForProjects(
            input.customer.id,
            list.map((item) => item.id),
          ),
        )
        : this.listRecentLogSummariesForProjects(
          input.customer.id,
          list.map((item) => item.id),
        );
      const waitForRecentLogs = () => input.recentLogsTimeoutMs == null
        ? loadRecentLogMap
        : Promise.race([
          loadRecentLogMap,
          new Promise<Awaited<typeof loadRecentLogMap>>((resolve) => {
            setTimeout(() => resolve(new Map()), input.recentLogsTimeoutMs);
          }),
        ]);
      const loadedRecentLogMap = input.timingSteps
        ? await measureCustomerProjectDetailStep(
          input.timingSteps,
          "recent_logs_wait_ms",
          waitForRecentLogs,
        )
        : await waitForRecentLogs();
      if (input.timingSteps) {
        input.timingSteps.recent_logs_ms += Date.now() - recentLogsStartedAt;
      }
      recentLogMap = loadedRecentLogMap;
      input.request?.log.info(
        {
          requestId: input.request.id,
          durationMs: Date.now() - recentLogsStartedAt,
          customerId: input.customer.id,
          projectCount: list.length,
          recentLogProjectCount: loadedRecentLogMap.size,
        },
        "[customer-bootstrap] recent log summaries loaded",
      );
    }

    return {
      list: list.map((item) => ({
        ...item,
        ...(recentLogMap ? { recent_logs: recentLogMap.get(item.id) || [] } : {}),
      })),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  protected serializeCustomerProjectListItem(row: CustomerProjectListItem) {
    const status = isProjectStatus(row.status) ? row.status : null;
    const property = this.normalizeRelation(row.property, {
      id: null, community: null, building_info: null, layout: null, area: null,
      latitude: null, longitude: null, province: null, city: null, district: null,
      adcode: null, location_status: null,
    });
    const designer = this.normalizeRelation(row.designer, {
      id: null,
      name: null,
      avatar: null,
    });
    return {
      id: row.id,
      name: row.name,
      status,
      status_label: status ? ProjectStatusConfig[status].label : null,
      budget: row.budget,
      address: row.address,
      property_id: typeof row.property_id === "string" ? row.property_id : typeof property.id === "string" ? property.id : null,
      start_date: row.start_date,
      style_tags: this.normalizeStringArray(row.style_tags),
      workflow_state: row.workflow_state ? { instance_status: row.workflow_state.instance_status, current_node_key: row.workflow_state.current_node_key, current_node_title: row.workflow_state.current_node_title, current_business_kind: row.workflow_state.current_business_kind, pending_task_count: row.workflow_state.pending_task_count, updated_at: row.workflow_state.updated_at } : null,
      designer: designer.id
        ? {
          id: designer.id as string,
          name: typeof designer.name === "string" ? designer.name : null,
          avatar: typeof designer.avatar === "string" ? designer.avatar : null,
        }
        : null,
      property: {
        id: typeof property.id === "string" ? property.id : null,
        community: typeof property.community === "string" ? property.community : null,
        building_info: typeof property.building_info === "string" ? property.building_info : null,
        layout: typeof property.layout === "string" ? property.layout : null,
        area: typeof property.area === "number" ? property.area : null,
        latitude: typeof property.latitude === "number" ? property.latitude : null,
        longitude: typeof property.longitude === "number" ? property.longitude : null,
        province: typeof property.province === "string" ? property.province : null,
        city: typeof property.city === "string" ? property.city : null,
        district: typeof property.district === "string" ? property.district : null,
        adcode: typeof property.adcode === "string" ? property.adcode : null,
        location_status: typeof property.location_status === "string" ? property.location_status : null,
      },
    };
  }

  protected serializeCustomerProjectRecentLog(row: CustomerProjectRecentLogSummaryRow) {
    const stageCode: ProjectLogStageCode | null = isProjectLogStageCode(row.stage_code)
      ? row.stage_code
      : null;

    return {
      id: row.id,
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      employee_avatar: row.employee_avatar,
      employee: row.employee_id
        ? {
          id: row.employee_id,
          name: row.employee_name,
          avatar: row.employee_avatar,
        }
        : null,
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      node_name: row.node_name,
      created_at: row.created_at,
      comment_count: Number(row.comment_count ?? 0),
      rating_count: Number(row.rating_count ?? 0),
      average_rating: row.average_rating == null ? null : Number(row.average_rating),
      image_count: Number(row.image_count ?? 0),
      cover_thumb_url: this.getImagePublicUrl(row.cover_image_path),
    };
  }

  protected serializeCustomerProjectLog(row: CustomerProjectLogRow) {
    const stageCode: ProjectLogStageCode | null = isProjectLogStageCode(row.stage_code)
      ? row.stage_code
      : null;
    const images = this.normalizeProjectLogImages(row.images);
    const imageItems = images.map((url) => ({
      url,
      thumb_url: this.getImageThumbUrl(url),
      width: null as number | null,
      height: null as number | null,
    }));
    const employee = this.normalizeRelation(row.employee, {
      id: null,
      name: null,
      avatar: null,
    });
    const employeeId = typeof employee.id === "string"
      ? employee.id
      : row.employee_id ?? null;
    const employeeName = typeof employee.name === "string" ? employee.name : null;
    const employeeAvatar = typeof employee.avatar === "string" ? employee.avatar : null;

    return {
      id: row.id,
      project_id: row.project_id,
      employee_id: employeeId,
      employee_name: employeeName,
      employee_avatar: employeeAvatar,
      employee: employeeId
        ? { id: employeeId, name: employeeName, avatar: employeeAvatar }
        : null,
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      node_name: row.node_name,
      content: row.content,
      images,
      image_items: imageItems,
      image_count: imageItems.length,
      created_at: row.created_at,
    };
  }

  protected buildProjectLogAggregates(
    rows: CustomerProjectLogCommentAggregateRow[],
    customerId: string,
  ) {
    const aggregates = new Map<string, {
      comment_count: number;
      rating_count: number;
      rating_sum: number;
      my_rating: number | null;
      my_rating_created_at: string | null;
    }>();

    for (const row of rows) {
      const current = aggregates.get(row.log_id) || {
        comment_count: 0,
        rating_count: 0,
        rating_sum: 0,
        my_rating: null,
        my_rating_created_at: null,
      };
      current.comment_count += 1;
      if (typeof row.rating === "number") {
        current.rating_count += 1;
        current.rating_sum += row.rating;
        if (row.author_type === "customer" && row.author_id === customerId && row.parent_id == null) {
          const nextCreatedAt = row.created_at ? new Date(row.created_at).getTime() : 0;
          const currentCreatedAt = current.my_rating_created_at
            ? new Date(current.my_rating_created_at).getTime()
            : 0;
          if (nextCreatedAt >= currentCreatedAt) {
            current.my_rating = row.rating;
            current.my_rating_created_at = row.created_at;
          }
        }
      }
      aggregates.set(row.log_id, current);
    }

    return aggregates;
  }

  protected async listRecentLogSummariesForProjects(customerId: string, projectIds: string[]) {
    if (projectIds.length === 0) {
      return new Map<string, ReturnType<typeof this.serializeCustomerProjectRecentLog>[]>();
    }

    const rows = await customerSelfServiceService.listRecentLogSummariesForProjects({
      customerId,
      projectIds,
      perProject: 2,
    });
    const recentLogMap = new Map<string, ReturnType<typeof this.serializeCustomerProjectRecentLog>[]>();
    for (const row of rows) {
      const list = recentLogMap.get(row.project_id) || [];
      if (list.length < 2) {
        list.push(this.serializeCustomerProjectRecentLog(row));
        recentLogMap.set(row.project_id, list);
      }
    }
    return recentLogMap;
  }

  protected async getOwnedProjectLog(logId: string, projectId: string, tenantId?: string | null) {
    const log = await customerSelfServiceService.findOwnedProjectLog({
      logId,
      projectId,
      tenantId,
    });
    if (!log?.id) {
      throw Errors.notFound("项目日志不存在");
    }
    return log;
  }

  protected async attachCustomerProjectLogCommentAuthors(rows: CustomerProjectLogCommentRow[]) {
    if (rows.length === 0) return [];

    const employeeIds = Array.from(new Set(
      rows.filter((item) => item.author_type === "employee").map((item) => item.author_id),
    ));
    const customerIds = Array.from(new Set(
      rows.filter((item) => item.author_type === "customer").map((item) => item.author_id),
    ));
    const [employees, customers] = await Promise.all([
      customerSelfServiceService.listCommentAuthorEmployees(employeeIds),
      customerSelfServiceService.listCommentAuthorCustomers(customerIds),
    ]);
    const employeeMap = new Map<string, CustomerProjectLogCommentAuthor>(
      employees.map((item: CustomerProjectLogCommentAuthorEmployee) => [
        item.id,
        { id: item.id, name: item.name, avatar: item.avatar },
      ]),
    );
    const customerMap = new Map<string, CustomerProjectLogCommentAuthor>(
      customers.map((item: CustomerProjectLogCommentAuthorCustomer) => [
        item.id,
        { id: item.id, name: item.name, avatar: null },
      ]),
    );

    return rows.map((row) => ({
      id: row.id,
      log_id: row.log_id,
      parent_id: row.parent_id,
      content: row.content,
      rating: row.rating,
      images: this.normalizeProjectLogImageItems(row.images).map((item) => ({
        url: item.url,
        thumb_url: item.thumb_url,
      })),
      author_type: row.author_type,
      author: row.author_type === "employee"
        ? employeeMap.get(row.author_id) ?? null
        : customerMap.get(row.author_id) ?? null,
      created_at: row.created_at,
    }));
  }

  protected serializeCustomerProjectMember(item: CustomerProjectMemberSummary) {
    return {
      id: item.id,
      project_id: item.project_id,
      employee_id: item.employee_id,
      role_code: item.role_code,
      role_name: item.role_name,
      is_primary: item.is_primary,
      sort_order: item.sort_order,
      created_at: item.created_at,
      updated_at: item.updated_at ?? null,
      employee: item.employee
        ? {
          id: item.employee.id,
          name: item.employee.name ?? null,
          avatar: item.employee.avatar ?? null,
          phone: item.employee.phone ?? null,
        }
        : null,
      ...(item.is_virtual ? { is_virtual: true } : {}),
    };
  }
  protected async serializeCustomerProjectDetailItem(row: CustomerProjectListItem) {
    const projectId = typeof row.id === "string" ? row.id : "";
    const base = this.serializeCustomerProjectListItem(row);
    if (!projectId) {
      return { ...base, supervisor: null, members: [] as ReturnType<typeof this.serializeCustomerProjectMember>[] };
    }

    const members = await projectMemberService.listProjectMembers(projectId);
    const serializedMembers = members.map((item) => this.serializeCustomerProjectMember(item as CustomerProjectMemberSummary));
    const team = deriveCustomerProjectTeam({
      designer: base.designer,
      members: serializedMembers,
    });
    return {
      ...base,
      ...team,
      members: serializedMembers,
    };
  }
  protected async getOwnedProject(projectId: string, customerId: string, tenantId?: string | null) {
    const project = await customerSelfServiceService.findOwnedProject({
      projectId,
      customerId,
      tenantId,
    });
    if (!project) {
      throw Errors.notFound("项目不存在");
    }
    return project;
  }
}
