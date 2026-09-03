import { Errors } from "@/errors/error-factory";
import type {
  TenantOwnerActionItem,
  TenantOwnerConstructionActivity,
  TenantOwnerCustomerFollowUpSnapshot,
  TenantOwnerFinanceSnapshot,
  TenantOwnerGanttProjectRow,
  TenantOwnerProjectSnapshot,
  TenantOwnerRiskProjectItem,
  TenantOwnerTopList,
} from "@/services/tenant-owner-daily-dashboard-types";
import { SupabaseDB } from "@/utils/supabase/index";
import { getTenantOwnerFinanceSnapshot } from "./tenant-owner-dashboard-finance";
import {
  getTenantOwnerCustomerFollowUp,
} from "./tenant-owner-dashboard-customer-follow-up";

type ProjectRelation = { id: string; name: string | null; status?: string | null } |
  Array<{ id: string; name: string | null; status?: string | null }> |
  null;
type EmployeeRelation = { name: string | null } | Array<{ name: string | null }> | null;

type TenantOwnerGanttRisk = "delayed" | "blocked" | "unscheduled";

type TenantOwnerGanttRpcRow = {
  project_id: string | null;
  project_name: string | null;
  customer_name: string | null;
  address_summary: string | null;
  owner_employee_name: string | null;
  project_status: string | null;
  updated_at: string | null;
  total_count: number | string | null;
};

type UntypedRpcClient = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

class TenantOwnerDailyDashboardRepository {
  private readonly adminClient = SupabaseDB.getAdminClient();

  async listOwnerActions(input: {
    tenantId: string;
    businessDate: string;
    endAt: string;
    limit: number;
  }): Promise<TenantOwnerTopList<TenantOwnerActionItem>> {
    const { data, error, count } = await this.adminClient
      .from("workflow_tasks")
      .select(`
        id,
        title,
        due_at,
        node_type,
        instance:workflow_instances!workflow_tasks_instance_id_fkey(
          subject_id,
          subject_type
        )
      `, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("status", "pending")
      .lt("due_at", input.endAt)
      .order("due_at", { ascending: true })
      .range(0, input.limit - 1);

    if (error) {
      throw Errors.dbError("查询老板待处理事项失败", error);
    }

    const rows = ((data as unknown[] | null) ?? []);
    const projectIds = rows
      .map((row) => {
        const instance = asRecord(asRecord(row).instance);
        return instance.subject_type === "project"
          ? readString(instance.subject_id)
          : null;
      })
      .filter((value): value is string => Boolean(value));
    const projectsById = await this.listProjectNames(input.tenantId, projectIds);

    const items = rows.map((row) => {
      const record = asRecord(row);
      const instance = asRecord(record.instance);
      const subjectId = readString(instance.subject_id);
      const projectId = instance.subject_type === "project" ? subjectId : null;
      const projectName = projectId ? projectsById.get(projectId) ?? null : null;
      return {
        id: String(record.id),
        type: resolveActionType(readString(record.node_type)),
        title: readString(record.title) ?? "待处理流程任务",
        project_id: projectId,
        project_name: projectName,
        priority: "high" as const,
        target: {
          path: "/packageProjects/pages/detail/index",
          ...(projectId ? { query: { id: projectId } } : {}),
        },
      };
    });

    return {
      total: count ?? items.length,
      items,
    };
  }

  private async listProjectNames(tenantId: string, projectIds: string[]) {
    const uniqueIds = [...new Set(projectIds)];
    if (uniqueIds.length === 0) return new Map<string, string | null>();

    const { data, error } = await this.adminClient
      .from("projects")
      .select("id,name")
      .eq("tenant_id", tenantId)
      .in("id", uniqueIds);

    if (error) {
      throw Errors.dbError("查询老板待处理项目失败", error);
    }

    return new Map(
      ((data as Array<{ id: string; name: string | null }> | null) ?? [])
        .map((project) => [project.id, project.name]),
    );
  }

  async getFinanceSnapshot(input: {
    tenantId: string;
    businessDate: string;
    timezone: string;
    startAt: string;
    endAt: string;
  }): Promise<TenantOwnerFinanceSnapshot> {
    return getTenantOwnerFinanceSnapshot(input);
  }

  async getProjectSnapshot(input: {
    tenantId: string;
    businessDate: string;
    startAt: string;
    endAt: string;
  }): Promise<TenantOwnerProjectSnapshot> {
    const { data, error } = await this.adminClient.rpc(
      "get_tenant_owner_project_daily_snapshot",
      {
        p_tenant_id: input.tenantId,
        p_business_date: input.businessDate,
        p_start_at: input.startAt,
        p_end_at: input.endAt,
      },
    );

    if (error) {
      throw Errors.dbError("查询老板项目概览失败", error);
    }

    const record = asRecord(data);

    return {
      active_project_count: toInteger(record.active_project_count),
      advanced_today_count: toInteger(record.advanced_today_count),
      started_today_count: toInteger(record.started_today_count),
      completed_today_count: toInteger(record.completed_today_count),
      delayed_project_count: toInteger(record.delayed_project_count),
      no_log_today_count: toInteger(record.no_log_today_count),
      pending_acceptance_count: toInteger(record.pending_acceptance_count),
    };
  }

  async listRiskProjects(input: {
    tenantId: string;
    businessDate: string;
    limit: number;
  }): Promise<TenantOwnerTopList<TenantOwnerRiskProjectItem>> {
    const { data, error } = await this.adminClient.rpc(
      "list_tenant_owner_risk_projects",
      {
        p_tenant_id: input.tenantId,
        p_business_date: input.businessDate,
        p_limit: input.limit,
      },
    );

    if (error) {
      throw Errors.dbError("查询老板风险项目失败", error);
    }

    const rows = (data as unknown[] | null) ?? [];
    const items = rows.map((row) => {
      const record = asRecord(row);
      const projectId = readString(record.project_id) ?? "";
      return {
        project_id: projectId,
        project_name: readString(record.project_name) ?? "未命名项目",
        customer_name: readString(record.customer_name),
        current_node_title: readString(record.current_node_title),
        risk_level: readRiskLevel(record.risk_level),
        risk_types: Array.isArray(record.risk_types)
          ? record.risk_types.filter((item): item is string =>
            typeof item === "string" && Boolean(item.trim())
          )
          : ["delayed_workflow"],
        reason: readString(record.reason) ?? "项目流程存在风险",
        owner_employee_name: readString(record.owner_employee_name),
        updated_at: readString(record.updated_at) ?? new Date().toISOString(),
        target: {
          path: "/packageProjects/pages/detail/index",
          query: { id: projectId },
        },
      };
    });

    return {
      total: toInteger(asRecord(rows[0]).total_count, items.length),
      items,
    };
  }

  async getConstructionActivity(input: {
    tenantId: string;
    businessDate: string;
    startAt: string;
    endAt: string;
    limit: number;
  }): Promise<TenantOwnerConstructionActivity> {
    const [snapshot, logs, missingLogs] = await Promise.all([
      this.adminClient.rpc("get_tenant_owner_construction_activity_snapshot", {
        p_tenant_id: input.tenantId,
        p_start_at: input.startAt,
        p_end_at: input.endAt,
      }),
      this.adminClient
        .from("project_logs")
        .select(`
          id,
          project_id,
          content,
          images,
          stage_code,
          created_at,
          project:projects!project_logs_project_id_fkey(id, name),
          employee:employees!project_logs_employee_id_fkey(name)
        `)
        .eq("tenant_id", input.tenantId)
        .gte("created_at", input.startAt)
        .lt("created_at", input.endAt)
        .order("created_at", { ascending: false })
        .range(0, input.limit - 1),
      this.adminClient.rpc("list_tenant_owner_missing_project_logs", {
        p_tenant_id: input.tenantId,
        p_business_date: input.businessDate,
        p_start_at: input.startAt,
        p_end_at: input.endAt,
        p_limit: input.limit,
      }),
    ]);

    if (snapshot.error) {
      throw Errors.dbError("查询老板施工动态汇总失败", snapshot.error);
    }
    if (logs.error) {
      throw Errors.dbError("查询老板施工日志失败", logs.error);
    }
    if (missingLogs.error) {
      throw Errors.dbError("查询老板缺日志项目失败", missingLogs.error);
    }

    const rows = ((logs.data as unknown[] | null) ?? []);
    const latestLogs = rows.map((row) => {
      const record = asRecord(row);
      const projectId = readString(record.project_id) ?? "";
      const images = Array.isArray(record.images) ? record.images : [];
      const projectName = getRelationValue(
        record.project as ProjectRelation,
        "name",
      );
      const employeeName = getRelationValue(
        record.employee as EmployeeRelation,
        "name",
      );
      return {
        log_id: readString(record.id) ?? "",
        project_id: projectId,
        project_name: typeof projectName === "string" ? projectName : "未命名项目",
        stage_label: readString(record.stage_code),
        summary: readString(record.content) ?? "今日已更新施工日志",
        image_count: images.length,
        created_at: readString(record.created_at) ?? "",
        employee_name: typeof employeeName === "string" ? employeeName : null,
      };
    });
    const snapshotRecord = asRecord(snapshot.data);

    return {
      log_count: toInteger(snapshotRecord.log_count),
      project_coverage_count: toInteger(snapshotRecord.project_coverage_count),
      photo_count: toInteger(snapshotRecord.photo_count),
      latest_logs: latestLogs,
      missing_logs: ((missingLogs.data as unknown[] | null) ?? [])
        .map((row) => {
          const record = asRecord(row);
          return {
            project_id: readString(record.project_id) ?? "",
            project_name: readString(record.project_name) ?? "未命名项目",
            current_node_title: readString(record.current_node_title),
            assignee_employee_name: readString(record.assignee_employee_name),
          };
        }),
    };
  }

  async getCustomerFollowUp(input: {
    tenantId: string;
    startAt: string;
    endAt: string;
    limit: number;
  }): Promise<TenantOwnerCustomerFollowUpSnapshot> {
    return getTenantOwnerCustomerFollowUp(input);
  }

  async listGanttProjects(input: {
    tenantId: string;
    page: number;
    pageSize: number;
    keyword?: string;
    windowStart?: string;
    windowEnd?: string;
    timezone: string;
    risk?: TenantOwnerGanttRisk;
  }): Promise<{
    list: TenantOwnerGanttProjectRow[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }> {
    const pageSize = Math.min(input.pageSize, 100);
    const { data, error } = await (this.adminClient as unknown as UntypedRpcClient)
      .rpc("list_tenant_owner_project_gantt", {
        p_tenant_id: input.tenantId,
        p_page: input.page,
        p_page_size: pageSize,
        p_keyword: input.keyword ?? null,
        p_window_start: input.windowStart ?? null,
        p_window_end: input.windowEnd ?? null,
        p_timezone: input.timezone,
        p_risk: input.risk ?? null,
      });

    if (error) {
      throw Errors.dbError("查询老板项目甘特图失败", error);
    }

    const rows = (data as TenantOwnerGanttRpcRow[] | null) ?? [];
    const total = toInteger(rows[0]?.total_count);
    const list = rows
      .filter((row): row is TenantOwnerGanttRpcRow & { project_id: string } =>
        typeof row.project_id === "string" && Boolean(row.project_id.trim())
      )
      .map((row) => ({
        id: row.project_id,
        name: readString(row.project_name) ?? "未命名项目",
        customer_name: readString(row.customer_name),
        address_summary: readString(row.address_summary),
        owner_employee_name: readString(row.owner_employee_name),
        status: readString(row.project_status) ?? "unknown",
      }));

    return {
      list,
      pagination: {
        page: input.page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }
}

function resolveActionType(nodeType: string | null): TenantOwnerActionItem["type"] {
  if (nodeType === "acceptance") return "acceptance";
  if (nodeType === "payment_collection") return "payment";
  return "approval";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRiskLevel(value: unknown): TenantOwnerRiskProjectItem["risk_level"] {
  return value === "high" ? "high" : "warning";
}

function toInteger(value: unknown, fallback = 0) {
  const numericValue = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isInteger(numericValue) && numericValue >= 0
    ? numericValue
    : fallback;
}

function getRelationValue<T extends Record<string, unknown>, K extends keyof T>(
  value: T | T[] | null | undefined,
  key: K,
) {
  const record = Array.isArray(value) ? value[0] : value;
  return record?.[key] ?? null;
}

export const tenantOwnerDailyDashboardRepository =
  new TenantOwnerDailyDashboardRepository();
