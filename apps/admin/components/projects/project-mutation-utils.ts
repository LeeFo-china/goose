import {
  CustomerStatusConfig,
  isCustomerStatus,
  ProjectStatusConfig,
} from "@gooes/domain";
import { ProjectWorkflowActionConfig } from "@/components/workflows/workflow-business-actions";
import type {
  CustomerRelation,
  Option,
  ProjectFormState,
  ProjectRecord,
  ProjectStatusActionItem,
  PropertyOption,
  RelationPerson,
  PropertyRelation,
  BadgeVariant,
} from "@/components/projects/project-mutation-types";
import { requestBackendJson } from "@/lib/backend-client";

export const visibilityOptions = [
  ["inherit", "跟随状态"],
  ["public", "强制展示"],
  ["hidden", "隐藏"],
] as const;

export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function personName(value: RelationPerson | RelationPerson[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || item?.phone || "-";
}

export function customerName(value: CustomerRelation | CustomerRelation[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || item?.phone_masked || item?.phone || "-";
}

export function customerStatus(value: CustomerRelation | CustomerRelation[] | null | undefined) {
  return relationOne(value)?.status || null;
}

export function customerStatusLabel(status: string | null | undefined) {
  return isCustomerStatus(status) ? CustomerStatusConfig[status].label : status || "-";
}

export function propertyLabel(value: PropertyRelation | PropertyRelation[] | null | undefined) {
  const item = relationOne(value);
  if (!item) return "-";
  return [item.community, item.building_info].filter(Boolean).join(" ") || "-";
}

export function hasCompletePropertyLocation(value: PropertyRelation | PropertyOption | null | undefined) {
  return Boolean(
    value?.adcode &&
      typeof value.latitude === "number" &&
      typeof value.longitude === "number",
  );
}

export function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusVariant(type: string | null | undefined): BadgeVariant {
  if (type === "success") return "success";
  if (type === "warning") return "warning";
  if (type === "danger") return "danger";
  if (type === "primary") return "default";
  return "secondary";
}

export function projectStatusLabel(status: string | null | undefined) {
  return status && status in ProjectStatusConfig
    ? ProjectStatusConfig[status as keyof typeof ProjectStatusConfig].label
    : status || "-";
}

export function projectStatusBadgeVariant(status: string | null | undefined) {
  return status && status in ProjectStatusConfig
    ? statusVariant(ProjectStatusConfig[status as keyof typeof ProjectStatusConfig].type)
    : "outline";
}

export function projectDisplayStatusLabel(project: ProjectRecord) {
  return project.display_status_label ||
    project.status_label ||
    projectStatusLabel(project.status);
}

export function projectDisplayStatusBadgeVariant(project: ProjectRecord) {
  if (project.display_status === "final_acceptance_completed") {
    return "success";
  }

  return projectStatusBadgeVariant(project.display_status || project.status);
}

export function projectActionLabel(action: string) {
  return action in ProjectWorkflowActionConfig
    ? ProjectWorkflowActionConfig[action as keyof typeof ProjectWorkflowActionConfig].label
    : action;
}

export function blockedProjectActions(currentStatus: string | null | undefined) {
  if (currentStatus === "designing") {
    return [
      {
        action: "sign_contract",
        label: "项目签约",
        reason: "需先确认方案",
      },
    ];
  }

  return [];
}

export function isProjectStatusActionVisible(
  actions: ProjectStatusActionItem[],
  action: string,
) {
  return actions.some((item) => item.action === action);
}

export type ProjectStatusActionView =
  | { kind: "enabled"; action: ProjectStatusActionItem }
  | {
    kind: "blocked";
    action: {
      action: string;
      label: string;
      reason: string;
    };
  };

export function buildProjectActionViews(
  actions: ProjectStatusActionItem[],
  blockedActions: ReturnType<typeof blockedProjectActions>,
) {
  const blockedByAction = new Map(
    blockedActions.map((item) => [item.action, item]),
  );
  const views: ProjectStatusActionView[] = [];

  for (const action of actions) {
    views.push({ kind: "enabled", action });

    if (action.action === "confirm_proposal") {
      const nextAction = blockedByAction.get("sign_contract");
      if (nextAction) {
        views.push({ kind: "blocked", action: nextAction });
        blockedByAction.delete("sign_contract");
      }
    }
  }

  for (const action of blockedByAction.values()) {
    views.push({ kind: "blocked", action });
  }

  return views;
}

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

type ProjectAssigneeRoleCode = "designer" | "supervisor";

export async function requestProject<T = any>(input: {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  payload?: unknown;
}) {
  return requestBackendJson<T>(input.path, {
    method: input.method || "GET",
    body: input.payload ? JSON.stringify(input.payload) : undefined,
    cache: "no-store",
  });
}

async function syncProjectPrimaryAssignee(input: {
  projectId: string;
  roleCode: ProjectAssigneeRoleCode;
  employeeId: string | null;
}) {
  const members = await requestProject({
    path: `/projects/${input.projectId}/members`,
  }) as NonNullable<ProjectRecord["members"]>;
  const roleMembers = members.filter((item) =>
    !item.is_virtual && item.role_code === input.roleCode
  );
  const primaryMembers = roleMembers.filter((item) => item.is_primary);

  if (!input.employeeId) {
    await Promise.all(primaryMembers.map((item) =>
      requestProject({
        path: `/projects/${input.projectId}/members/${item.id}`,
        method: "DELETE",
      })
    ));
    return;
  }

  const existing = roleMembers.find((item) => item.employee_id === input.employeeId);
  if (existing) {
    if (!existing.is_primary) {
      await requestProject({
        path: `/projects/${input.projectId}/members/${existing.id}`,
        method: "PATCH",
        payload: {
          is_primary: true,
        },
      });
    }
    return;
  }

  await requestProject({
    path: `/projects/${input.projectId}/members`,
    method: "POST",
    payload: {
      employee_id: input.employeeId,
      role_code: input.roleCode,
      is_primary: true,
    },
  });
}

export async function syncProjectPrimaryAssignees(input: {
  projectId: string;
  designerId: string | null;
  supervisorId: string | null;
}) {
  await syncProjectPrimaryAssignee({
    projectId: input.projectId,
    roleCode: "designer",
    employeeId: input.designerId,
  });
  await syncProjectPrimaryAssignee({
    projectId: input.projectId,
    roleCode: "supervisor",
    employeeId: input.supervisorId,
  });
}

export function buildDefaults(project?: ProjectRecord): ProjectFormState {
  return {
    name: project?.name || "",
    customer_id: project?.customer_id || relationOne(project?.customer)?.id || "",
    property_id: project?.property_id || relationOne(project?.property)?.id || "",
    property_mode: "existing",
    new_property_community: "",
    new_property_building_info: "",
    new_property_area: "",
    new_property_layout: "",
    designer_employee_id: relationOne(project?.designer)?.id || "",
    supervisor_employee_id: relationOne(project?.supervisor)?.id || "",
    budget: project?.budget != null ? String(project.budget) : "",
    start_date: project?.start_date ? project.start_date.slice(0, 10) : "",
    address: project?.address || "",
    visibility_status: project?.visibility_status || "inherit",
    style_tags: (project?.style_tags || []).join(","),
  };
}

function optionRelation(
  value: string,
  options: Option[],
): RelationPerson | null {
  if (!value) return null;
  const option = options.find((item) => item.id === value);
  return {
    id: value,
    name: option?.label || null,
    phone: null,
    avatar: null,
    department_name: null,
    post_name: option?.description || null,
  };
}

function propertyOptionRelation(
  value: string,
  options: PropertyOption[],
): PropertyRelation | null {
  if (!value) return null;
  const option = options.find((item) => item.id === value);
  return option
    ? {
      id: option.id,
      community: option.community ?? option.label,
      building_info: option.building_info ?? null,
      area: option.area ?? null,
      layout: option.layout ?? null,
      province: option.province ?? null,
      city: option.city ?? null,
      district: option.district ?? null,
      adcode: option.adcode ?? null,
      latitude: option.latitude ?? null,
      longitude: option.longitude ?? null,
      location_status: option.location_status ?? null,
      location_source: option.location_source ?? null,
      location_confidence: option.location_confidence ?? null,
      location_confirmed_at: option.location_confirmed_at ?? null,
    }
    : null;
}

export function buildOptimisticProject(
  project: ProjectRecord,
  formState: ProjectFormState,
  options: {
    designers: Option[];
    supervisors: Option[];
    customers: Option[];
    properties?: PropertyOption[];
  },
): ProjectRecord {
  const property = propertyOptionRelation(
    formState.property_id,
    options.properties ?? [],
  );

  return {
    ...project,
    name: formState.name.trim() || project.name,
    customer_id: formState.customer_id || null,
    property_id: formState.property_id || null,
    property: property ?? project.property ?? null,
    designer: optionRelation(formState.designer_employee_id, options.designers),
    supervisor: optionRelation(formState.supervisor_employee_id, options.supervisors),
    budget: formState.budget ? Number(formState.budget) : null,
    start_date: formState.start_date || null,
    address: formState.address.trim() || null,
    visibility_status: formState.visibility_status,
    style_tags: formState.style_tags
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

export function getEmployeeOptionLabel(employee: { id?: string | null; name?: string | null; phone?: string | null } | null | undefined) {
  if (!employee) return "-";
  return employee.name || employee.phone || employee.id || "-";
}

export function getEmployeeMeta(employee: { department_name?: string | null; post_name?: string | null; phone?: string | null } | null | undefined) {
  if (!employee) return "";
  return [
    employee.department_name,
    employee.post_name,
    employee.phone,
  ].filter(Boolean).join(" · ");
}
