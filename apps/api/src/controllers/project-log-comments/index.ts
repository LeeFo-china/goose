import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateProjectLogCommentSchema,
  type CreateProjectLogCommentInput,
  ProjectLogCommentsQuerySchema,
  type ProjectLogCommentsQueryType,
} from "@/schema/project-log-comments";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { SupabaseDB } from "@/utils/supabase";
import type { ProjectLogCommentAuthorType } from "@gooes/domain";
import { authorizationService } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { resolveStoredFileUrlList } from "@/services/files/file-url-resolver";

type EmployeeAuthor = {
  id: string;
  name: string | null;
  avatar: string | null;
  user_id: string | null;
  tenant_id: string | null;
};

type CustomerAuthor = {
  id: string;
  name: string | null;
  user_id: string | null;
  tenant_id: string | null;
};

type ProjectLogCommentRow = {
  id: string;
  tenant_id: string | null;
  log_id: string;
  parent_id: string | null;
  author_type: string;
  author_id: string;
  content: string;
  rating: number | null;
  images: unknown;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

type CommentAuthor = {
  id: string;
  name: string | null;
  avatar: string | null;
};

type ProjectLogCommentResponseItem = ProjectLogCommentRow & {
  images: string[];
  author: CommentAuthor | null;
};

type ResolvedCommentAuthor = {
  author_type: ProjectLogCommentAuthorType;
  author_id: string;
  tenant_id: string | null;
  profile: CommentAuthor;
};

type ProjectLogAccessInfo = {
  id: string;
  project_id: string;
  tenant_id: string | null;
};

type ProjectOwnerInfo = {
  id: string;
  customer_id: string | null;
  tenant_id: string | null;
};

class ProjectLogCommentsController extends BaseController {
  constructor() {
    super("project_log_comments");
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  @Post("/project_log_comments")
  async createComment(request: FastifyRequest, reply: FastifyReply) {
    const result = CreateProjectLogCommentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const author = await this.resolveCurrentAuthor(request);
    const payload: CreateProjectLogCommentInput = result.data;

    const log = await this.assertProjectLogReadable(request, payload.log_id, author);
    if (payload.parent_id) {
      await this.ensureParentComment(payload.log_id, payload.parent_id, log.tenant_id);
    }

    if (author.author_type === "employee" && payload.rating != null) {
      throw Errors.badRequest("员工评论不允许评分");
    }

    if (payload.parent_id && payload.rating != null) {
      throw Errors.badRequest("回复评论不允许评分");
    }

    let resolvedRating: number | null = null;
    if (author.author_type === "customer" && !payload.parent_id) {
      resolvedRating = payload.rating ?? null;
      if (resolvedRating != null) {
        const hasExistingRating = await this.hasCustomerExistingRating(
          payload.log_id,
          author.author_id,
          log.tenant_id,
        );
        if (hasExistingRating) {
          resolvedRating = null;
        }
      }
    }

    const insertPayload = {
      tenant_id: log.tenant_id,
      log_id: payload.log_id,
      parent_id: payload.parent_id ?? null,
      author_type: author.author_type,
      author_id: author.author_id,
      content: payload.content,
      rating: resolvedRating,
      images: this.normalizeImages(payload.images),
    };

    const { data, error } = await SupabaseDB.from("project_log_comments")
      .insert(insertPayload)
      .select()
      .single<ProjectLogCommentRow>();

    if (error || !data) {
      throw Errors.dbError("创建日志评论失败", error);
    }

    return ResponseHandler.success(
      this.attachAuthor(data, author.profile),
    );
  }

  @Get("/project_log_comments")
  async listComments(request: FastifyRequest, reply: FastifyReply) {
    const result = ProjectLogCommentsQuerySchema.safeParse(request.query);
    if (!result.success) throw Errors.fromZod(result.error);

    const { log_id }: ProjectLogCommentsQueryType = result.data;
    const viewer = await this.resolveCurrentAuthor(request);
    const log = await this.assertProjectLogReadable(request, log_id, viewer);

    let query = SupabaseDB.from("project_log_comments")
      .select("*")
      .eq("log_id", log_id)
      .is("deleted_at", null);

    if (log.tenant_id) {
      query = query.eq("tenant_id", log.tenant_id);
    }

    const { data, error } = await query.order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询日志评论失败", error);
    }

    const rows = (data || []) as ProjectLogCommentRow[];
    const comments = await this.attachAuthors(rows);

    return ResponseHandler.success({
      list: comments,
    });
  }

  private async resolveCurrentAuthor(
    request: FastifyRequest,
  ): Promise<ResolvedCommentAuthor> {
    const userId = request.user?.sub;
    if (!userId) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }
    const tokenRoles = Array.isArray(request.user?.roles)
      ? request.user.roles.filter((item): item is string => typeof item === "string")
      : [];

    const adminClient = SupabaseDB.getAdminClient();
    const [{ data: employee }, { data: customer }] = await Promise.all([
      adminClient
        .from("employees")
        .select("id, name, avatar, user_id, tenant_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<EmployeeAuthor>(),
      adminClient
        .from("customers")
        .select("id, name, user_id, tenant_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<CustomerAuthor>(),
    ]);

    if (tokenRoles.includes("customer") && customer?.id) {
      return {
        author_type: "customer" as const,
        author_id: customer.id,
        tenant_id: customer.tenant_id,
        profile: {
          id: customer.id,
          name: customer.name,
          avatar: null,
        },
      };
    }

    if (tokenRoles.includes("employee") && employee?.id) {
      return {
        author_type: "employee" as const,
        author_id: employee.id,
        tenant_id: employee.tenant_id,
        profile: {
          id: employee.id,
          name: employee.name,
          avatar: employee.avatar,
        },
      };
    }

    if (employee?.id) {
      return {
        author_type: "employee" as const,
        author_id: employee.id,
        tenant_id: employee.tenant_id,
        profile: {
          id: employee.id,
          name: employee.name,
          avatar: employee.avatar,
        },
      };
    }

    if (customer?.id) {
      return {
        author_type: "customer" as const,
        author_id: customer.id,
        tenant_id: customer.tenant_id,
        profile: {
          id: customer.id,
          name: customer.name,
          avatar: null,
        },
      };
    }

    throw Errors.forbidden();
  }

  private async getProjectLogAccessInfo(logId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_logs")
      .select("id, project_id, tenant_id")
      .eq("id", logId)
      .maybeSingle<ProjectLogAccessInfo>();

    if (error) {
      throw Errors.dbError("查询项目日志失败", error);
    }

    if (!data?.id) {
      throw Errors.badRequest("施工日志不存在");
    }

    return data;
  }

  private async assertProjectLogReadable(
    request: FastifyRequest,
    logId: string,
    author: ResolvedCommentAuthor,
  ) {
    const log = await this.getProjectLogAccessInfo(logId);
    if (author.author_type === "customer") {
      const { data, error } = await SupabaseDB.getAdminClient()
        .from("projects")
        .select("id, customer_id, tenant_id")
        .eq("id", log.project_id)
        .eq("tenant_id", log.tenant_id)
        .maybeSingle<ProjectOwnerInfo>();

      if (error) {
        throw Errors.dbError("查询项目归属失败", error);
      }

      if (
        !data?.id ||
        data.customer_id !== author.author_id ||
        data.tenant_id !== author.tenant_id
      ) {
        throw Errors.forbidden();
      }

      return log;
    }

    const authContext = await this.getRequiredAuthContext(request);
    const hasAccess = await accessPolicyService.canAccessProject(
      authContext,
      log.project_id,
      "project.read",
    );
    if (!hasAccess) {
      throw Errors.forbidden();
    }

    return log;
  }

  private async hasCustomerExistingRating(
    logId: string,
    customerId: string,
    tenantId: string | null,
  ) {
    let query = SupabaseDB.getAdminClient()
      .from("project_log_comments")
      .select("id")
      .eq("log_id", logId)
      .eq("author_type", "customer")
      .eq("author_id", customerId)
      .is("parent_id", null)
      .not("rating", "is", null)
      .is("deleted_at", null)
      .limit(1);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle<{ id: string }>();

    if (error) {
      throw Errors.dbError("查询客户评分记录失败", error);
    }

    return Boolean(data?.id);
  }

  private async ensureParentComment(
    logId: string,
    parentId: string,
    tenantId: string | null,
  ) {
    let query = SupabaseDB.from("project_log_comments")
      .select("id, log_id")
      .eq("id", parentId)
      .is("deleted_at", null);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle<{ id: string; log_id: string }>();

    if (error) {
      throw Errors.dbError("查询父评论失败", error);
    }

    if (!data?.id) {
      throw Errors.badRequest("父评论不存在");
    }

    if (data.log_id !== logId) {
      throw Errors.badRequest("父评论与当前日志不匹配");
    }
  }

  private async attachAuthors(rows: ProjectLogCommentRow[]) {
    if (rows.length === 0) {
      return [];
    }

    const employeeIds = rows
      .filter((item) => item.author_type === "employee")
      .map((item) => item.author_id);
    const customerIds = rows
      .filter((item) => item.author_type === "customer")
      .map((item) => item.author_id);

    const adminClient = SupabaseDB.getAdminClient();
    const [{ data: employees }, { data: customers }] = await Promise.all([
      employeeIds.length > 0
        ? adminClient.from("employees")
          .select("id, name, avatar")
          .in("id", employeeIds)
        : Promise.resolve({
          data: [] as Array<{ id: string; name: string | null; avatar: string | null }>,
        }),
      customerIds.length > 0
        ? adminClient.from("customers")
          .select("id, name")
          .in("id", customerIds)
        : Promise.resolve({
          data: [] as Array<{ id: string; name: string | null }>,
        }),
    ]);

    const employeeMap = new Map(
      (employees || []).map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          avatar: item.avatar,
        },
      ]),
    );
    const customerMap = new Map(
      (customers || []).map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          avatar: null,
        },
      ]),
    );

    return rows.map((row) => this.attachAuthor(
      row,
      row.author_type === "employee"
        ? employeeMap.get(row.author_id) || null
        : customerMap.get(row.author_id) || null,
    ));
  }

  private attachAuthor(row: ProjectLogCommentRow, author: CommentAuthor | null): ProjectLogCommentResponseItem {
    return {
      ...row,
      images: resolveStoredFileUrlList(
        (row as ProjectLogCommentRow & { images?: unknown }).images,
      ),
      author,
    };
  }

  private normalizeImages(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 9);
  }
}

export default new ProjectLogCommentsController();
