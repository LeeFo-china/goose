import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import { ProjectListQuerySchema } from "@/schema/projects";
import {
  ProjectCreateSelectCustomerQuerySchema,
  ProjectCreateSelectEmployeeQuerySchema,
  ProjectCreateSelectPropertyQuerySchema,
  ProjectMemberCandidateQuerySchema,
} from "@/schema/project-create-select";
import { customerPhonePrivacyService } from "@/services/customer-phone-privacy";
import { projectSer } from "@/services/projects";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { serializeProjectListItem } from "./list-serializer";
import {
  ProjectBaseController,
  type ProjectCreateCustomerOption,
  type ProjectCreateEmployeeOption,
  type ProjectCreatePropertyOption,
  type ProjectCreateSelectCustomerRow,
  type ProjectCreateSelectEmployeeRow,
  type ProjectCreateSelectPropertyRow,
} from "./shared";

function serializeEmployeeOption(item: ProjectCreateSelectEmployeeRow): ProjectCreateEmployeeOption {
  const rawDepartment = item.department ?? item.tenant_department ?? null;
  const department = Array.isArray(rawDepartment)
    ? (rawDepartment[0] ?? null)
    : rawDepartment;
  const post = Array.isArray(item.post)
    ? (item.post[0] ?? null)
    : item.post;
  const departmentName = department?.name ?? department?.alias_name ?? null;

  return {
    id: item.id,
    name: item.name,
    phone: item.phone,
    avatar: item.avatar ?? null,
    role_label: post?.name || null,
    department: department
      ? {
        id: department.id,
        name: departmentName ?? "",
      }
      : null,
    department_name: departmentName,
    post: post
      ? {
        id: post.id,
        name: post.name,
        code: post.code,
      }
      : null,
    post_code: post?.code || null,
    post_name: post?.name || null,
  };
}

function serializePropertyOption(item: ProjectCreateSelectPropertyRow): ProjectCreatePropertyOption {
  return {
    id: item.id,
    customer_id: item.customer_id,
    community: item.community,
    building_info: item.building_info,
    area: item.area,
    layout: item.layout,
    province: item.province,
    city: item.city,
    district: item.district,
    adcode: item.adcode,
    latitude: item.latitude,
    longitude: item.longitude,
    location_status: item.location_status,
    location_source: item.location_source,
    location_confidence: item.location_confidence,
    location_confirmed_at: item.location_confirmed_at,
  };
}

function buildProjectListDebugTiming(input: {
  authContextMs: number;
  controllerTotalMs: number;
  timings?: Record<string, number | string | null>;
}) {
  return {
    auth_context_ms: input.authContextMs,
    cache: input.timings?.cache ?? null,
    scope_ms: input.timings?.scopeMs ?? null,
    rows_ms: input.timings?.rowsMs ?? null,
    assignees_ms: input.timings?.assigneesMs ?? null,
    stages_ms: input.timings?.stagesMs ?? null,
    display_status_ms: input.timings?.displayStatusMs ?? null,
    total_ms: input.timings?.totalMs ?? input.controllerTotalMs,
    visible_project_count: input.timings?.visibleProjectCount ?? null,
    today_project_count: input.timings?.todayProjectCount ?? null,
    row_count: input.timings?.rowCount ?? null,
    has_more: input.timings?.hasMore ?? null,
  };
}

class ProjectCreateSelectController extends ProjectBaseController {
  @Get("/projects/status")
  async getProjectsBystatus(request: FastifyRequest) {
    const requestStartedAt = Date.now();
    const queryResult = ProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const authContextStartedAt = Date.now();
    const authContext = await this.getRequiredTenantContext(request);
    const authContextMs = Date.now() - authContextStartedAt;
    const result = await projectSer.listProjects({
      authContext,
      query: queryResult.data,
    });
    if (queryResult.data.mode === "home") {
      request.log.info(
        {
          requestId: request.id,
          employeeId: authContext.employeeId ?? null,
          tenantId: authContext.tenantId,
          authContextMs,
          timings: result.debugTimings ?? null,
        },
        "[project-home-list] timings",
      );

      return ResponseHandler.success({
        list: result.rows.map((item) => serializeProjectListItem(item)),
        pagination: result.pagination,
        ...(queryResult.data.debug_timing
          ? {
            debug_timing: buildProjectListDebugTiming({
              authContextMs,
              controllerTotalMs: Date.now() - requestStartedAt,
              timings: result.debugTimings,
            }),
          }
          : {}),
      });
    }

    const phonePrivacyContext = await customerPhonePrivacyService.createPrivacyContext(
      authContext,
    );

    return ResponseHandler.success({
      list: result.rows.map((item) =>
        serializeProjectListItem(item, phonePrivacyContext)
      ),
      pagination: result.pagination,
    });
  }

  @Get("/projects/create/customers")
  async getProjectCreateCustomers(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);

    const queryResult = ProjectCreateSelectCustomerQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await projectSer.listProjectCreateCustomers({
      authContext,
      query: queryResult.data,
    });

    const list: ProjectCreateCustomerOption[] =
      (result.rows as unknown as ProjectCreateSelectCustomerRow[])
        .map((item) => ({
          id: item.id,
          name: item.name,
          phone: null,
          phone_masked: customerPhonePrivacyService.maskPhone(item.phone),
          can_view_phone: false,
        }));

    return ResponseHandler.success({
      list,
      pagination: result.pagination,
    });
  }

  @Get("/projects/create/employees")
  async getProjectCreateEmployees(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);

    const queryResult = ProjectCreateSelectEmployeeQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await projectSer.listProjectCreateEmployees({
      authContext,
      query: queryResult.data,
    });

    return ResponseHandler.success({
      list: (result.rows as unknown as ProjectCreateSelectEmployeeRow[])
        .map(serializeEmployeeOption),
      pagination: result.pagination,
    });
  }

  @Get("/projects/create/properties")
  async getProjectCreateProperties(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);

    const queryResult = ProjectCreateSelectPropertyQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await projectSer.listProjectCreateProperties({
      authContext,
      query: queryResult.data,
    });

    return ResponseHandler.success({
      list: (result.rows as unknown as ProjectCreateSelectPropertyRow[])
        .map(serializePropertyOption),
      pagination: result.pagination,
    });
  }

  @Get("/projects/:id/member-candidates")
  async getProjectMemberCandidates(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const queryResult = ProjectMemberCandidateQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const result = await projectSer.listProjectMemberCandidates({
      authContext,
      projectId: idVerify.data.id,
      query: queryResult.data,
    });

    return ResponseHandler.success({
      list: (result.rows as unknown as ProjectCreateSelectEmployeeRow[])
        .map(serializeEmployeeOption),
      pagination: result.pagination,
    });
  }
}

export default new ProjectCreateSelectController();
