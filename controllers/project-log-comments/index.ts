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
import type { Tables } from "@/types/database";

type EmployeeAuthor = Pick<Tables<"employees">, "id" | "name" | "avatar" | "user_id">;
type CustomerAuthor = Pick<Tables<"customers">, "id" | "name" | "user_id">;
type ProjectLogCommentRow = Tables<"project_log_comments">;

type CommentAuthor = {
  id: string;
  name: string | null;
  avatar: string | null;
};

type ProjectLogCommentResponseItem = ProjectLogCommentRow & {
  author: CommentAuthor | null;
};

class ProjectLogCommentsController extends BaseController {
  constructor() {
    super("project_log_comments");
  }

  @Post("/project_log_comments")
  async createComment(request: FastifyRequest, reply: FastifyReply) {
    const result = CreateProjectLogCommentSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const author = await this.resolveCurrentAuthor(request);
    const payload: CreateProjectLogCommentInput = result.data;

    await this.ensureLogExists(payload.log_id);
    if (payload.parent_id) {
      await this.ensureParentComment(payload.log_id, payload.parent_id);
    }

    if (author.author_type === "employee" && payload.rating != null) {
      throw Errors.badRequest("员工评论不允许评分");
    }

    if (payload.parent_id && payload.rating != null) {
      throw Errors.badRequest("回复评论不允许评分");
    }

    const insertPayload = {
      log_id: payload.log_id,
      parent_id: payload.parent_id ?? null,
      author_type: author.author_type,
      author_id: author.author_id,
      content: payload.content,
      rating: author.author_type === "customer" && !payload.parent_id
        ? payload.rating ?? null
        : null,
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
    await this.ensureLogExists(log_id);

    const { data, error } = await SupabaseDB.from("project_log_comments")
      .select("*")
      .eq("log_id", log_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询日志评论失败", error);
    }

    const rows = (data || []) as ProjectLogCommentRow[];
    const comments = await this.attachAuthors(rows);

    return ResponseHandler.success({
      list: comments,
    });
  }

  private async resolveCurrentAuthor(request: FastifyRequest) {
    const userId = request.user?.sub;
    if (!userId) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    const adminClient = SupabaseDB.getAdminClient();
    const [{ data: employee }, { data: customer }] = await Promise.all([
      adminClient
        .from("employees")
        .select("id, name, avatar, user_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<EmployeeAuthor>(),
      adminClient
        .from("customers")
        .select("id, name, user_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle<CustomerAuthor>(),
    ]);

    if (employee?.id) {
      return {
        author_type: "employee" as const,
        author_id: employee.id,
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
        profile: {
          id: customer.id,
          name: customer.name,
          avatar: null,
        },
      };
    }

    throw Errors.forbidden();
  }

  private async ensureLogExists(logId: string) {
    const { data, error } = await SupabaseDB.from("project_logs")
      .select("id")
      .eq("id", logId)
      .maybeSingle<{ id: string }>();

    if (error) {
      throw Errors.dbError("查询项目日志失败", error);
    }

    if (!data?.id) {
      throw Errors.badRequest("施工日志不存在");
    }
  }

  private async ensureParentComment(logId: string, parentId: string) {
    const { data, error } = await SupabaseDB.from("project_log_comments")
      .select("id, log_id")
      .eq("id", parentId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; log_id: string }>();

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
        : Promise.resolve({ data: [] as Array<Pick<Tables<"employees">, "id" | "name" | "avatar">> }),
      customerIds.length > 0
        ? adminClient.from("customers")
          .select("id, name")
          .in("id", customerIds)
        : Promise.resolve({ data: [] as Array<Pick<Tables<"customers">, "id" | "name">> }),
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
      author,
    };
  }
}

export default new ProjectLogCommentsController();
