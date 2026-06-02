import {
  Errors,
  SupabaseDB,
  projectMemberService,
  constructionStageStatusService,
  isProjectLogStageCode,
  isProjectStatus,
  PROJECT_LOG_STAGE_CONFIG,
  ProjectStatusConfig,
  type CustomerProjectQaConstructionStageContext,
  type CustomerProjectQaConstructionStageItem,
  type CustomerProjectQaContext,
  type ProjectConstructionStagesResult,
  type ProjectQaLogRow,
  type ProjectQaProjectRowWithTenant,
} from './shared';
import { getCustomerContextByAuthUserId, normalizeRelation, normalizeStringArray } from './identity';

export async function buildCustomerProjectQaContext(
  authUserId: string,
  projectId: string,
  options: {
    includeConstructionStages?: boolean;
  } = {},
): Promise<CustomerProjectQaContext> {
  const customer = await getCustomerContextByAuthUserId(authUserId);
  const { data: projectData, error: projectError } = await SupabaseDB
    .getAdminClient()
    .from("projects")
    .select(`
      id,
      tenant_id,
      name,
      status,
      address,
      start_date,
      style_tags,
      property:properties!projects_property_id_fkey(
        community,
        building_info,
        layout,
        area
      )
    `)
    .eq("id", projectId)
    .eq("customer_id", customer.id)
    .maybeSingle();

  if (projectError) {
    throw Errors.dbError("查询客户项目上下文失败", projectError);
  }

  if (!projectData) {
    throw Errors.forbidden();
  }

  const [assignees, logsResult] = await Promise.all([
    projectMemberService.listPrimaryAssigneesByProjectId(projectId),
    SupabaseDB.getAdminClient()
    .from("project_logs")
    .select("stage_code, node_name, content, created_at")
    .eq("project_id", projectId)
    .eq(
      "tenant_id",
      (projectData as unknown as ProjectQaProjectRowWithTenant).tenant_id,
    )
    .order("created_at", { ascending: false })
    .limit(5),
  ]);
  const { data: logsData, error: logsError } = logsResult;

  if (logsError) {
    throw Errors.dbError("查询客户项目日志上下文失败", logsError);
  }

  const project = projectData as unknown as ProjectQaProjectRowWithTenant;
  const constructionStages = options.includeConstructionStages === false
    ? null
    : await getCustomerProjectQaConstructionStages(project.id, project.tenant_id);
  const property = normalizeRelation(project.property, {
    community: null,
    building_info: null,
    layout: null,
    area: null,
  });
  const designer = assignees.find((item) => item.role_code === "designer");
  const supervisor = assignees.find((item) => item.role_code === "supervisor");
  const status = isProjectStatus(project.status) ? project.status : null;

  return {
    customer_id: customer.id,
    customer_name: customer.name,
    tenant_id: project.tenant_id,
    project_id: project.id,
    project_name: project.name,
    status,
    status_label: status ? ProjectStatusConfig[status].label : null,
    address: project.address,
    start_date: project.start_date,
    style_tags: normalizeStringArray(project.style_tags),
    property:
      property.community || property.building_info || property.layout ||
        property.area
        ? {
          community: typeof property.community === "string"
            ? property.community
            : null,
          building_info: typeof property.building_info === "string"
            ? property.building_info
            : null,
          layout: typeof property.layout === "string" ? property.layout : null,
          area: typeof property.area === "number" ? property.area : null,
        }
        : null,
    designer_name: designer?.employee?.name ?? null,
    supervisor_name: supervisor?.employee?.name ?? null,
    construction_stages: constructionStages,
    recent_logs: ((logsData || []) as ProjectQaLogRow[]).map((item) => {
      const stageCode = isProjectLogStageCode(item.stage_code)
        ? item.stage_code
        : null;

      return {
        stage_code: stageCode,
        stage_label: stageCode
          ? PROJECT_LOG_STAGE_CONFIG[stageCode].label
          : null,
        node_name: item.node_name,
        content: item.content,
        created_at: item.created_at,
      };
    }),
  };
}

export async function getCustomerProjectQaConstructionStages(
  projectId: string,
  tenantId: string | null,
): Promise<CustomerProjectQaConstructionStageContext | null> {
  try {
    const payload = await constructionStageStatusService
      .listProjectConstructionStagesForProject({
        projectId,
        tenantId,
      });

    return normalizeCustomerProjectQaConstructionStages(payload);
  } catch {
    return null;
  }
}

export function normalizeCustomerProjectQaConstructionStages(
  payload: ProjectConstructionStagesResult,
): CustomerProjectQaConstructionStageContext {
  const stages = payload.stages
    .map(normalizeCustomerProjectQaConstructionStageItem)
    .filter((item): item is CustomerProjectQaConstructionStageItem =>
      Boolean(item)
    );
  const stageMap = new Map(stages.map((item) => [item.stage_code, item]));
  const currentStageCode = payload.current_stage;
  const currentStage = isProjectLogStageCode(currentStageCode)
    ? stageMap.get(currentStageCode) ?? null
    : null;
  const nextStageCode = payload.next_stage?.stage_code ?? null;
  const nextStage = isProjectLogStageCode(nextStageCode)
    ? stageMap.get(nextStageCode) ?? null
    : null;

  return {
    current_stage: currentStage,
    next_stage: nextStage,
    required_completed: payload.required_completed,
    required_stage_codes: payload.required_stage_codes.filter(isProjectLogStageCode),
    missing_required_stages: payload.missing_required_stages.reduce<
      CustomerProjectQaConstructionStageContext["missing_required_stages"]
    >((list, item) => {
      if (!isProjectLogStageCode(item.stage_code)) {
        return list;
      }

      list.push({
        stage_code: item.stage_code,
        stage_label: item.stage_label,
      });
      return list;
    }, []),
    stages,
  };
}

export function normalizeCustomerProjectQaConstructionStageItem(
  item: ProjectConstructionStagesResult["stages"][number],
): CustomerProjectQaConstructionStageItem | null {
  if (!isProjectLogStageCode(item.stage_code)) {
    return null;
  }

  return {
    stage_code: item.stage_code,
    stage_label: item.stage_label,
    status: item.status,
    is_required: item.is_required,
    is_completion: item.is_completion,
    acceptance_status: item.acceptance_status,
    latest_log: item.latest_log
      ? {
        node_name: item.latest_log.node_name,
        content: item.latest_log.content,
        created_at: item.latest_log.created_at,
      }
      : null,
    blocked_reason: item.blocked_reason,
  };
}
