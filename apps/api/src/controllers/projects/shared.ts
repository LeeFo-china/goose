import { TenantBaseController } from "@/controllers/TenantBaseController";
import {
  CreateProjectSchema,
  UpdateProjectSchema,
} from "@/schema/projects";
import {
  customerPhonePrivacyService,
  type CustomerPhonePrivacyContext,
} from "@/services/customer-phone-privacy";
import { projectSer } from "@/services/projects";
import { resolveStoredFileUrlList } from "@/services/files/file-url-resolver";
import type { Tables } from "@/types/database";
import {
  PROJECT_LOG_STAGE_CONFIG,
  PROJECT_MEMBER_ROLE_CONFIG,
  isProjectLogStageCode,
  type ProjectLogStageCode,
  type ProjectMemberRoleCode,
} from "@gooes/domain";

export type ProjectCreateSelectCustomerRow = Pick<
  Tables<"customers">,
  "id" | "name" | "phone" | "owner_id"
>;
export type ProjectCreateSelectPropertyRow = Pick<
  Tables<"properties">,
  | "id"
  | "customer_id"
  | "community"
  | "building_info"
  | "area"
  | "layout"
  | "province"
  | "city"
  | "district"
  | "adcode"
  | "latitude"
  | "longitude"
  | "location_status"
  | "location_source"
  | "location_confidence"
  | "location_confirmed_at"
>;
export type ProjectCreateEmployeeDepartmentRow = {
  id: string;
  name?: string | null;
  alias_name?: string | null;
  code: string | null;
};
export type ProjectCreateSelectEmployeeRow =
  & Pick<Tables<"employees">, "id" | "name" | "phone" | "avatar">
  & {
    department?:
      | Array<ProjectCreateEmployeeDepartmentRow>
      | ProjectCreateEmployeeDepartmentRow
      | null;
    tenant_department?:
      | Array<ProjectCreateEmployeeDepartmentRow>
      | ProjectCreateEmployeeDepartmentRow
      | null;
    post:
      | Array<Pick<Tables<"posts">, "id" | "name" | "code">>
      | null;
  };

export type ProjectCreateCustomerOption = {
  id: string;
  name: string | null;
  phone: string | null;
  phone_masked: string | null;
  can_view_phone: boolean;
};

export type ProjectCreatePropertyOption = {
  id: string;
  customer_id: string | null;
  community: string | null;
  building_info: string | null;
  area: number | null;
  layout: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
  adcode: string | null;
  latitude: number | null;
  longitude: number | null;
  location_status: string | null;
  location_source: string | null;
  location_confidence: number | null;
  location_confirmed_at: string | null;
};

export type ProjectCreateEmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
  avatar: string | null;
  role_label: string | null;
  department: {
    id: string;
    name: string;
  } | null;
  department_name: string | null;
  post: {
    id: string;
    name: string | null;
    code: string | null;
  } | null;
  post_code: string | null;
  post_name: string | null;
};

export type ProjectCreateConstructionWorkflowOption = {
  id: string;
  name: string;
  workflow_key: string;
  description: string | null;
  active_version_id: string;
  is_default: boolean;
  updated_at: string;
};

export type ProjectMemberEmployeeSummary = {
  id: string;
  name: string | null;
  avatar: string | null;
  phone: string | null;
  department_name?: string | null;
  post_name?: string | null;
};

export type ProjectMemberSummary = {
  id: string;
  project_id: string;
  employee_id: string;
  role_code: ProjectMemberRoleCode;
  role_name: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at?: string | null;
  employee: ProjectMemberEmployeeSummary | null;
  is_virtual?: boolean;
};

export type ProjectMemberRoleOption = {
  role_code: ProjectMemberRoleCode;
  role_name: string;
  category: "core" | "extended";
  is_core: boolean;
  sort_order: number;
  status: "active" | "inactive";
};

export type PublicProjectMemberSummary = {
  id: string;
  role_code: ProjectMemberRoleCode;
  role_name: string;
  employee_id: string;
  employee_name: string | null;
  avatar: string | null;
  is_primary: boolean;
  sort_order: number;
};

export type PublicProjectLogSummary = {
  id: string;
  project_id: string;
  stage_code: ProjectLogStageCode | null;
  stage_label: string | null;
  node_name: string | null;
  content: string | null;
  images: string[];
  created_at: string | null;
};

export type ProjectLogCommentSummary = {
  comment_count: number;
  latest_comment: {
    id: string;
    log_id: string;
    parent_id: string | null;
    author_type: string;
    author_id: string;
    content: string | null;
    rating: number | null;
    created_at: string | null;
  } | null;
};

export abstract class ProjectBaseController extends TenantBaseController<
  typeof CreateProjectSchema,
  typeof UpdateProjectSchema
> {
  constructor() {
    super("projects", CreateProjectSchema, UpdateProjectSchema);
  }

  protected normalizeRelation<T extends Record<string, unknown>>(
    value: unknown,
    fallback: T,
  ): T {
    if (Array.isArray(value)) {
      const first = value[0];
      if (first && typeof first === "object") {
        return { ...fallback, ...(first as T) };
      }

      return fallback;
    }

    if (value && typeof value === "object") {
      return { ...fallback, ...(value as T) };
    }

    return fallback;
  }

  protected normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  protected normalizeProjectLogImages(images: unknown) {
    return resolveStoredFileUrlList(images);
  }

  protected serializePublicProjectMember(item: {
    id: string;
    role_code: ProjectMemberRoleCode;
    role_name: string | null;
    employee_id: string;
    is_primary: boolean;
    sort_order: number | null;
    employee: ProjectMemberEmployeeSummary | null;
  }): PublicProjectMemberSummary {
    const roleConfig = PROJECT_MEMBER_ROLE_CONFIG[item.role_code];

    return {
      id: item.id,
      role_code: item.role_code,
      role_name: item.role_name ?? roleConfig.label,
      employee_id: item.employee_id,
      employee_name: item.employee?.name ?? null,
      avatar: item.employee?.avatar ?? null,
      is_primary: item.is_primary,
      sort_order: item.sort_order ?? roleConfig.sortOrder,
    };
  }

  protected async getPublicProjectMembers(projectId: string) {
    const members = await projectSer.listPublicProjectMembers(projectId);
    return members
      .filter((item) => item.role_code !== "customer_owner")
      .map((item) => this.serializePublicProjectMember(item));
  }

  protected serializePublicProjectLog(row: Record<string, unknown>): PublicProjectLogSummary {
    const rawStageCode = typeof row.stage_code === "string" ? row.stage_code : null;
    const stageCode: ProjectLogStageCode | null = isProjectLogStageCode(rawStageCode)
      ? rawStageCode
      : null;

    return {
      id: typeof row.id === "string" ? row.id : "",
      project_id: typeof row.project_id === "string" ? row.project_id : "",
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      node_name: typeof row.node_name === "string" ? row.node_name : null,
      content: typeof row.content === "string" ? row.content : null,
      images: this.normalizeProjectLogImages(row.images),
      created_at: typeof row.created_at === "string" ? row.created_at : null,
    };
  }

  protected async getPublicProjectLogs(projectId: string) {
    const logs = await projectSer.listPublicProjectLogs(projectId);
    return logs.map((item) => this.serializePublicProjectLog(item));
  }

  protected serializeProjectMember(item: {
    id: string;
    project_id: string;
    employee_id: string;
    role_code: ProjectMemberRoleCode;
    role_name: string | null;
    is_primary: boolean;
    sort_order: number | null;
    created_at?: string | null;
    updated_at?: string | null;
    employee: ProjectMemberEmployeeSummary | null;
    is_virtual?: boolean;
  }): ProjectMemberSummary {
    const roleConfig = PROJECT_MEMBER_ROLE_CONFIG[item.role_code];

    return {
      id: item.id,
      project_id: item.project_id,
      employee_id: item.employee_id,
      role_code: item.role_code,
      role_name: item.role_name ?? roleConfig.label,
      is_primary: item.is_primary,
      sort_order: item.sort_order ?? roleConfig.sortOrder,
      created_at: item.created_at ?? null,
      updated_at: item.updated_at ?? null,
      employee: item.employee,
      ...(item.is_virtual ? { is_virtual: true } : {}),
    };
  }

  protected async getProjectMembersForDetail(project: Record<string, unknown>) {
    if (Array.isArray(project.__detail_members)) {
      return project.__detail_members.map((item) => this.serializeProjectMember(item));
    }

    const members = await projectSer.listProjectMembersForDetail(project);
    return members.map((item) => this.serializeProjectMember(item));
  }

  protected serializeProjectLogForBootstrap(
    row: Record<string, unknown>,
    summary?: ProjectLogCommentSummary,
  ) {
    const rawStageCode = typeof row.stage_code === "string" ? row.stage_code : null;
    const stageCode: ProjectLogStageCode | null = isProjectLogStageCode(rawStageCode)
      ? rawStageCode
      : null;
    const images = this.normalizeProjectLogImages(row.images);
    const employee = this.normalizeRelation(row.employee, {
      id: null,
      name: null,
      avatar: null,
    });

    return {
      ...row,
      employee,
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      images,
      image_items: images.map((url) => ({
        url,
        thumb_url: url,
        width: null,
        height: null,
      })),
      image_count: images.length,
      comment_count: summary?.comment_count ?? 0,
      latest_comment: summary?.latest_comment ?? null,
    };
  }

  protected serializeProjectLogCalendarItem(item: {
    date: string;
    count: number | string;
    stage_code: string | null;
    node_name: string | null;
  }) {
    const stageCode = isProjectLogStageCode(item.stage_code)
      ? item.stage_code
      : null;

    return {
      date: item.date,
      count: Number(item.count),
      stage_code: stageCode,
      stage_label: stageCode ? PROJECT_LOG_STAGE_CONFIG[stageCode].label : null,
      node_name: item.node_name,
    };
  }

  protected async serializeProjectDetailItem(
    row: Record<string, unknown>,
    phonePrivacyContext?: CustomerPhonePrivacyContext,
    members?: ProjectMemberSummary[],
  ) {
    const responseRow = { ...row };
    delete responseRow.__detail_members;
    const normalizedCustomer = this.normalizeRelation(row.customer, {
      id: null,
      name: null,
      phone: null,
      owner_id: null,
      owner: null,
    });
    const customerPhoneFields =
      typeof normalizedCustomer.id === "string" && phonePrivacyContext
        ? customerPhonePrivacyService.serializeCustomerPhoneFields(
          phonePrivacyContext,
          {
            id: normalizedCustomer.id,
            owner_id: typeof normalizedCustomer.owner_id === "string"
              ? normalizedCustomer.owner_id
              : null,
            phone: typeof normalizedCustomer.phone === "string"
              ? normalizedCustomer.phone
              : null,
          },
        )
        : customerPhonePrivacyService.serializeMaskedPhoneOnly(
          typeof normalizedCustomer.phone === "string" ? normalizedCustomer.phone : null,
        );

    return {
      ...responseRow,
      customer: {
        ...normalizedCustomer,
        ...customerPhoneFields,
        owner: this.normalizeRelation(normalizedCustomer.owner, {
          id: null,
          name: null,
          avatar: null,
          phone: null,
        }),
      },
      property: this.normalizeRelation(row.property, {
        id: null,
        community: null,
        building_info: null,
        area: null,
        layout: null,
        latitude: null,
        longitude: null,
        province: null,
        city: null,
        district: null,
        adcode: null,
        location_status: null,
      }),
      designer: this.normalizeRelation(row.designer, {
        id: null,
        name: null,
        phone: null,
        avatar: null,
      }),
      supervisor: this.normalizeRelation(row.supervisor, {
        id: null,
        name: null,
        phone: null,
        avatar: null,
      }),
      members: members ?? await this.getProjectMembersForDetail(row),
    };
  }
}
