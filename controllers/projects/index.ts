import { BaseController } from "@/controllers/BaseController";
import { CreateProjectSchema, UpdateProjectSchema } from "@/schema/projects";
import { SupabaseDB } from "@/utils/supabase/index";
import { Errors } from "@/errors/error-factory";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ProjectListQuerySchema } from "@/schema/projects";
import { projectSer } from "@/services/projects";
import {
  ProjectCreateSelectCustomerQuerySchema,
  type ProjectCreateSelectCustomerQueryType,
  ProjectCreateSelectEmployeeQuerySchema,
  type ProjectCreateSelectEmployeeQueryType,
  type ProjectCreateSelectEmployeeScene,
} from "@/schema/project-create-select";
import type { Tables } from "@/types/database";
import type { PostCode } from "@gooes/domain";

type ProjectCreateSelectCustomerRow = Pick<
  Tables<"customers">,
  "id" | "name" | "phone"
>;
type ProjectCreateSelectEmployeeRow =
  & Pick<
    Tables<"employees">,
    "id" | "name" | "phone" | "role"
  >
  & {
    department:
      | Array<Pick<Tables<"departments">, "id" | "name" | "code">>
      | null;
    post:
      | Array<Pick<Tables<"posts">, "id" | "name" | "code">>
      | null;
  };

type ProjectCreateCustomerOption = {
  id: string;
  name: string | null;
  phone: string | null;
};

type ProjectCreateEmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
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

class ProjectController extends BaseController<
  typeof CreateProjectSchema,
  typeof UpdateProjectSchema
> {
  constructor() {
    super("projects", CreateProjectSchema, UpdateProjectSchema);
  }

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    if (!this.updateSchema) {
      throw Errors.badRequest("缺少参数类型：updateSchema");
    }

    const result = this.updateSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await projectSer.updateProject(idVerify.data.id, result.data);
    return ResponseHandler.success(data);
  };

  @Get("/projects/frontend-visible")
  //获取游客页可以展示的项目
  async getFrontendVisibleProjects(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const visibleStatuses = ["signed", "constructing", "completed"];

    const { data, error } = await SupabaseDB.from(this.tableName)
      .select(`
    *,
    property:properties(id, community),
    designer:employees!projects_designer_id_fkey(id, name),
    supervisor:employees!projects_supervisor_id_fkey(id, name)
  `)
      .in("status", visibleStatuses)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询前端可展示项目失败", error);
    }

    return ResponseHandler.success(data, "查询成功");
  }

  @Get("/projects/status")
  async getProjectsBystatus(request: FastifyRequest, reply: FastifyReply) {
    const queryResult = ProjectListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);
    const { page, pageSize, status, keyword } = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = SupabaseDB
      .from("projects")
      .select(
        `
            id,
            name,
            status,
            budget,
            address,
            created_at,
            designer:employees!projects_designer_id_fkey(
              id,
              name,
              avatar,
              phone
            ),
            property:properties!projects_property_id_fkey(
              community,
              building_info,
              area,
              layout,
              latitude,
              longitude
            ),
            customer:customers!projects_customer_id_fkey(
              id,
              name,
              phone
            ),
            supervisor:employees!projects_supervisor_id_fkey(
              id,
              name,
              avatar,
              phone
            )
            `,
        { count: "exact" },
      );

    if (status) {
      query = query.eq("status", status);
    }

    const normalizedKeyword = keyword?.trim();
    if (normalizedKeyword) {
      query = query.or(
        `name.ilike.%${normalizedKeyword}%,address.ilike.%${normalizedKeyword}%`,
      );
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw Errors.dbError("列表查询失败", error);

    return ResponseHandler.success({
      list: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  }

  @Get("/projects/create/customers")
  async getProjectCreateCustomers(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const queryResult = ProjectCreateSelectCustomerQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, keyword }: ProjectCreateSelectCustomerQueryType =
      queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = SupabaseDB.from("customers")
      .select("id, name, phone", { count: "exact" })
      .order("created_at", { ascending: false });

    const normalizedKeyword = keyword?.trim();
    if (normalizedKeyword) {
      query = query.or(
        `name.ilike.%${normalizedKeyword}%,phone.ilike.%${normalizedKeyword}%`,
      );
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw Errors.dbError("查询项目创建客户选择项失败", error);
    }

    const list: ProjectCreateCustomerOption[] =
      ((data || []) as ProjectCreateSelectCustomerRow[])
        .map((item) => ({
          id: item.id,
          name: item.name,
          phone: item.phone,
        }));

    return ResponseHandler.success({
      list,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    });
  }

  @Get("/projects/create/employees")
  async getProjectCreateEmployees(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const queryResult = ProjectCreateSelectEmployeeQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const { page, pageSize, keyword, scene }:
      ProjectCreateSelectEmployeeQueryType = queryResult.data;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const postCodes = this.getPostCodesByScene(scene);
    const postIds = await this.getPostIdsByCodes(postCodes);
    const result = await this.queryProjectCreateEmployees({
      from,
      to,
      keyword,
      postIds,
    });

    const list: ProjectCreateEmployeeOption[] =
      ((result.data || []) as ProjectCreateSelectEmployeeRow[])
        .map((item) => {
          const department = Array.isArray(item.department)
            ? (item.department[0] ?? null)
            : item.department;
          const post = Array.isArray(item.post)
            ? (item.post[0] ?? null)
            : item.post;

          return {
            id: item.id,
            name: item.name,
            phone: item.phone,
            role_label: item.role,
            department: department
              ? {
                id: department.id,
                name: department.name,
              }
              : null,
            department_name: department?.name || null,
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
        });

    return ResponseHandler.success({
      list,
      pagination: {
        page,
        pageSize,
        total: result.count || 0,
        totalPages: result.count ? Math.ceil(result.count / pageSize) : 0,
      },
    });
  }

  private getPostCodesByScene(scene: ProjectCreateSelectEmployeeScene): PostCode[] {
    if (scene === "project_designer") {
      return ["INTERIOR_DESIGNER", "DESIGN_DIRECTOR"];
    }

    return ["PROJECT_MANAGER", "CONSTRUCTION_SUPER"];
  }

  private async getPostIdsByCodes(codes: PostCode[]) {
    if (codes.length === 0) {
      return [];
    }

    const { data, error } = await SupabaseDB.from("posts")
      .select("id")
      .in("code", codes);

    if (error) {
      throw Errors.dbError("查询项目创建员工筛选岗位失败", error);
    }

    return ((data || []) as Array<Pick<Tables<"posts">, "id">>).map(
      (item) => item.id,
    );
  }

  private async queryProjectCreateEmployees(params: {
    from: number;
    to: number;
    keyword?: string;
    postIds?: string[];
  }) {
    let query = SupabaseDB.from("employees")
      .select(
        `
        id,
        name,
        phone,
        role,
        department:departments!employees_department_id_fkey(id, name, code),
        post:posts!employees_post_id_fkey(id, name, code)
      `,
        { count: "exact" },
      )
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (params.postIds && params.postIds.length > 0) {
      query = query.in("post_id", params.postIds);
    }

    const normalizedKeyword = params.keyword?.trim();
    if (normalizedKeyword) {
      query = query.or(
        `name.ilike.%${normalizedKeyword}%,phone.ilike.%${normalizedKeyword}%`,
      );
    }

    const { data, error, count } = await query.range(params.from, params.to);

    if (error) {
      throw Errors.dbError("查询项目创建员工选择项失败", error);
    }

    return {
      data,
      count,
    };
  }
}

export default new ProjectController();
