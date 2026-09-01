import {
  tenantOwnerDailyDashboardRepository,
} from "@/repositories/tenant-owner-daily-dashboard";
import type {
  TenantOwnerActionItem,
  TenantOwnerConstructionActivity,
  TenantOwnerFinanceSnapshot,
  TenantOwnerGanttProjectRow,
  TenantOwnerGanttRiskSummary,
  TenantOwnerProjectSnapshot,
  TenantOwnerRiskProjectItem,
  TenantOwnerTopList,
} from "@/services/tenant-owner-daily-dashboard-types";
import type {
  TenantOwnerDailyDashboardQuery,
  TenantOwnerProjectGanttQuery,
} from "@/schema/tenant-owner-daily-dashboard";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  tenantOwnerDashboardWorkflowProgressReader,
  type TenantOwnerDashboardWorkflowProgressReaderPort,
} from "@/services/tenant-owner-dashboard-workflow-progress";
import {
  getDateInTimezone,
  resolveTenantOwnerBusinessDay,
} from "@/services/tenant-owner-dashboard-date";
import type {
  WorkflowTimelineNode,
  WorkflowProgressSource,
} from "@/services/project-workflow-progress";

const TOP_LIST_LIMIT = 5;

type Awaitable<T> = T | Promise<T>;

type AccessPolicyServicePort = {
  assertTenantContext(authContext: AuthContext): Awaitable<string>;
  assertPermission(
    authContext: AuthContext,
    permissionCode: string,
  ): Awaitable<unknown>;
};

type TenantOwnerDailyDashboardRepositoryPort = {
  listOwnerActions(input: {
    tenantId: string;
    businessDate: string;
    endAt: string;
    limit: number;
  }): Promise<TenantOwnerTopList<TenantOwnerActionItem>>;
  getFinanceSnapshot(input: {
    tenantId: string;
    businessDate: string;
    timezone: string;
    startAt: string;
    endAt: string;
  }): Promise<TenantOwnerFinanceSnapshot>;
  getProjectSnapshot(input: {
    tenantId: string;
    businessDate: string;
    startAt: string;
    endAt: string;
  }): Promise<TenantOwnerProjectSnapshot>;
  listRiskProjects(input: {
    tenantId: string;
    businessDate: string;
    limit: number;
  }): Promise<TenantOwnerTopList<TenantOwnerRiskProjectItem>>;
  getConstructionActivity(input: {
    tenantId: string;
    businessDate: string;
    startAt: string;
    endAt: string;
    limit: number;
  }): Promise<TenantOwnerConstructionActivity>;
  listGanttProjects(input: {
    tenantId: string;
    page: number;
    pageSize: number;
    keyword?: string;
    windowStart?: string;
    windowEnd?: string;
    timezone: string;
    risk?: "delayed" | "blocked" | "unscheduled";
  }): Promise<{
    list: TenantOwnerGanttProjectRow[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }>;
};

export type TenantOwnerDashboardPartialError = {
  module:
    | "owner_actions"
    | "finance"
    | "projects"
    | "risk_projects"
    | "construction_activity"
    | "workflow_progress";
  code: string;
  message: string;
};

export type TenantOwnerDailyDashboardServiceDependencies = {
  repository?: TenantOwnerDailyDashboardRepositoryPort;
  workflowProgressReader?: TenantOwnerDashboardWorkflowProgressReaderPort;
  accessPolicyService?: AccessPolicyServicePort;
};

export class TenantOwnerDailyDashboardService {
  private readonly repository: TenantOwnerDailyDashboardRepositoryPort;
  private readonly workflowProgressReader: TenantOwnerDashboardWorkflowProgressReaderPort;
  private readonly accessPolicyService: AccessPolicyServicePort;

  constructor(
    dependencies: TenantOwnerDailyDashboardServiceDependencies = {},
  ) {
    this.repository =
      dependencies.repository ?? tenantOwnerDailyDashboardRepository;
    this.workflowProgressReader =
      dependencies.workflowProgressReader ?? tenantOwnerDashboardWorkflowProgressReader;
    this.accessPolicyService =
      dependencies.accessPolicyService ?? accessPolicyService;
  }

  async getDailyDashboard(
    authContext: AuthContext,
    query: TenantOwnerDailyDashboardQuery,
  ) {
    const tenantId = await this.assertReadable(authContext);
    const businessDay = resolveTenantOwnerBusinessDay(query);
    const partialErrors: TenantOwnerDashboardPartialError[] = [];

    const [
      ownerActions,
      finance,
      projects,
      riskProjects,
      constructionActivity,
    ] = await Promise.all([
      this.loadSection(
        "owner_actions",
        "待处理数据暂不可用",
        partialErrors,
        () => this.repository.listOwnerActions({
          tenantId,
          businessDate: businessDay.businessDate,
          endAt: businessDay.endAt,
          limit: TOP_LIST_LIMIT,
        }),
        emptyTopList<TenantOwnerActionItem>(),
      ),
      this.loadSection(
        "finance",
        "财务数据暂不可用",
        partialErrors,
        () => this.repository.getFinanceSnapshot({
          tenantId,
          businessDate: businessDay.businessDate,
          timezone: query.timezone,
          startAt: businessDay.startAt,
          endAt: businessDay.endAt,
        }),
        emptyFinanceSnapshot(),
      ),
      this.loadSection(
        "projects",
        "项目概览暂不可用",
        partialErrors,
        () => this.repository.getProjectSnapshot({
          tenantId,
          businessDate: businessDay.businessDate,
          startAt: businessDay.startAt,
          endAt: businessDay.endAt,
        }),
        emptyProjectSnapshot(),
      ),
      this.loadSection(
        "risk_projects",
        "风险项目暂不可用",
        partialErrors,
        () => this.repository.listRiskProjects({
          tenantId,
          businessDate: businessDay.businessDate,
          limit: TOP_LIST_LIMIT,
        }),
        emptyTopList<TenantOwnerRiskProjectItem>(),
      ),
      this.loadSection(
        "construction_activity",
        "施工动态暂不可用",
        partialErrors,
        () => this.repository.getConstructionActivity({
          tenantId,
          businessDate: businessDay.businessDate,
          startAt: businessDay.startAt,
          endAt: businessDay.endAt,
          limit: TOP_LIST_LIMIT,
        }),
        emptyConstructionActivity(),
      ),
    ]);

    return {
      business_date: businessDay.businessDate,
      timezone: businessDay.timezone,
      generated_at: new Date().toISOString(),
      owner_actions: {
        total: ownerActions.total,
        items: ownerActions.items.slice(0, TOP_LIST_LIMIT),
      },
      finance,
      projects,
      risk_projects: {
        total: riskProjects.total,
        items: riskProjects.items.slice(0, TOP_LIST_LIMIT),
      },
      construction_activity: {
        ...constructionActivity,
        latest_logs: constructionActivity.latest_logs.slice(0, TOP_LIST_LIMIT),
        missing_logs: constructionActivity.missing_logs.slice(0, TOP_LIST_LIMIT),
      },
      partial_errors: partialErrors,
    };
  }

  async listProjectGantt(
    authContext: AuthContext,
    query: TenantOwnerProjectGanttQuery,
  ) {
    const tenantId = await this.assertReadable(authContext);
    const pageSize = Math.min(query.pageSize, 100);
    const partialErrors: TenantOwnerDashboardPartialError[] = [];
    const projects = await this.repository.listGanttProjects({
      tenantId,
      page: query.page,
      pageSize,
      keyword: query.keyword,
      windowStart: query.window_start,
      windowEnd: query.window_end,
      timezone: query.timezone,
      risk: query.risk,
    });
    const workflowProgressByProjectId = await this.loadProjectProgressMap({
      tenantId,
      businessDate: getDateInTimezone(query.timezone),
      projectIds: projects.list.map((project) => project.id),
      partialErrors,
      required: Boolean(query.window_start || query.risk),
    });

    const list = projects.list.map((project) => {
      const workflowProgress =
        workflowProgressByProjectId.get(project.id) ?? emptyWorkflowProgress();
      return {
        project,
        workflow_progress: workflowProgress,
        risk_summary: buildGanttRiskSummary(workflowProgress.timeline_nodes),
      };
    });

    return {
      list,
      pagination: projects.pagination,
      partial_errors: partialErrors,
    };
  }

  private async assertReadable(authContext: AuthContext): Promise<string> {
    const tenantId = await this.accessPolicyService.assertTenantContext(authContext);
    await this.accessPolicyService.assertPermission(authContext, "dashboard.read");
    return tenantId;
  }

  private async loadSection<T>(
    module: TenantOwnerDashboardPartialError["module"],
    message: string,
    partialErrors: TenantOwnerDashboardPartialError[],
    loader: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await loader();
    } catch (error) {
      partialErrors.push({
        module,
        code: readErrorCode(error),
        message,
      });
      return fallback;
    }
  }

  private async loadProjectProgressMap(input: {
    tenantId: string;
    projectIds: string[];
    businessDate: string;
    partialErrors: TenantOwnerDashboardPartialError[],
    required: boolean;
  }) {
    try {
      const progressByProjectId =
        await this.workflowProgressReader.listProjectProgress({
          tenantId: input.tenantId,
          projectIds: input.projectIds,
          businessDate: input.businessDate,
        });
      return new Map(
        Array.from(progressByProjectId.entries()).map(([projectId, progress]) => [
          projectId,
          {
            source: progress.source,
            instance_id: progress.instance_id,
            instance_status: progress.instance_status,
            current_node_key: progress.current_node_key,
            current_node_title: progress.current_node_title,
            timeline_nodes: progress.timeline_nodes.map(serializeGanttNode),
          },
        ]),
      );
    } catch (error) {
      if (input.required) throw error;

      input.partialErrors.push({
        module: "workflow_progress",
        code: readErrorCode(error),
        message: "项目流程进度暂不可用",
      });
      return new Map(input.projectIds.map((projectId) => [
        projectId,
        emptyWorkflowProgress(),
      ]));
    }
  }
}

function serializeGanttNode(node: WorkflowTimelineNode) {
  return {
    node_key: node.node_key,
    node_title: node.node_title,
    node_type: node.node_type,
    business_kind: node.business_kind,
    stage_code: node.attributes.stage_code ?? null,
    status: node.status,
    planned_start_date: node.attributes.planned_start_date ?? null,
    planned_end_date: node.attributes.planned_end_date ?? null,
    schedule_status: normalizeScheduleStatus(node.attributes.schedule_status),
    assignee_employee_name:
      node.attributes.procedure_assignee_employee_name ??
        node.attributes.assignee_employee_name ??
        node.assignee_employee_name ??
        null,
    blocked_reason: node.status === "blocked" ? node.display.status_label : null,
  };
}

function buildGanttRiskSummary(
  timelineNodes: Array<ReturnType<typeof serializeGanttNode>>,
): TenantOwnerGanttRiskSummary {
  const blockedNode = timelineNodes.find((node) =>
    node.node_type === "procedure" && node.status === "blocked"
  );
  const delayedNode = timelineNodes.find((node) =>
    node.node_type === "procedure" && node.schedule_status === "delayed"
  );
  const unscheduledNode = timelineNodes.find((node) =>
    node.node_type === "procedure" &&
    (node.status === "current" || node.status === "pending") &&
    node.schedule_status === "unscheduled"
  );
  const riskTypes = [
    ...(blockedNode ? ["blocked_workflow"] : []),
    ...(delayedNode ? ["delayed_workflow"] : []),
    ...(unscheduledNode ? ["unscheduled_workflow"] : []),
  ];

  if (riskTypes.length === 0) {
    return {
      risk_level: "normal",
      risk_types: [],
      reason: null,
    };
  }

  return {
    risk_level: blockedNode ? "high" : "warning",
    risk_types: riskTypes,
    reason: blockedNode
      ? `${blockedNode.node_title} ${blockedNode.blocked_reason ?? "流程受阻"}`
      : delayedNode
        ? `${delayedNode.node_title} 已逾期`
        : `${unscheduledNode?.node_title ?? "施工工序"} 尚未排期`,
  };
}

function normalizeScheduleStatus(value: string | null | undefined) {
  if (value === "overdue") return "delayed";
  if (value === "completed") return "done";
  if (value === "on_track" || value === "due_today") return "on_track";
  return "unscheduled";
}

function readErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "UNKNOWN_ERROR";
}

function emptyTopList<T>(): TenantOwnerTopList<T> {
  return {
    total: 0,
    items: [],
  };
}

function emptyWorkflowProgress() {
  return {
    source: "unavailable" as WorkflowProgressSource,
    instance_id: null,
    instance_status: null,
    current_node_key: null,
    current_node_title: null,
    timeline_nodes: [],
  };
}

function emptyFinanceSnapshot(): TenantOwnerFinanceSnapshot {
  return {
    today_income_amount: "0.00",
    today_expense_amount: "0.00",
    today_net_cash_amount: "0.00",
    receivable_due_today_amount: "0.00",
    receivable_due_7d_amount: "0.00",
    overdue_receivable_amount: "0.00",
    pending_supplier_payable_amount: "0.00",
  };
}

function emptyProjectSnapshot(): TenantOwnerProjectSnapshot {
  return {
    active_project_count: 0,
    advanced_today_count: 0,
    started_today_count: 0,
    completed_today_count: 0,
    delayed_project_count: 0,
    no_log_today_count: 0,
    pending_acceptance_count: 0,
  };
}

function emptyConstructionActivity(): TenantOwnerConstructionActivity {
  return {
    log_count: 0,
    project_coverage_count: 0,
    photo_count: 0,
    latest_logs: [],
    missing_logs: [],
  };
}

export const tenantOwnerDailyDashboardService =
  new TenantOwnerDailyDashboardService();
