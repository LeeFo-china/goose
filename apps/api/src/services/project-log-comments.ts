import { Errors } from "@/errors/error-factory";
import {
  projectLogCommentsRepository,
  type ProjectLogAccessInfo,
  type ProjectLogCommentRow,
} from "@/repositories/project-log-comments";
import type { CreateProjectLogCommentInput } from "@/schema/project-log-comments";
import { accessPolicyService } from "@/services/access-policy";
import { authorizationService } from "@/services/authorization";
import { resolveStoredFileUrlList } from "@/services/files/file-url-resolver";
import type {
  ProjectLogCommentAuthorType,
  TenantServiceRouteAccess,
} from "@gooes/domain";

type CommentAuthor = {
  id: string;
  name: string | null;
  avatar: string | null;
};

type ResolvedCommentAuthor = {
  auth_user_id: string;
  author_type: ProjectLogCommentAuthorType;
  author_id: string;
  tenant_id: string | null;
  profile: CommentAuthor;
};

export type ProjectLogCommentResponseItem = ProjectLogCommentRow & {
  images: string[];
  author: CommentAuthor | null;
};

function normalizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 9);
}

class ProjectLogCommentsService {
  async createComment(input: {
    authUserId: string | undefined;
    tenantServiceAccess: TenantServiceRouteAccess;
    tokenRoles: string[];
    payload: CreateProjectLogCommentInput;
  }) {
    const author = await this.resolveCurrentAuthor(input);
    const log = await this.assertProjectLogReadable({
      logId: input.payload.log_id,
      author,
      tenantServiceAccess: input.tenantServiceAccess,
    });

    if (input.payload.parent_id) {
      await this.ensureParentComment({
        logId: input.payload.log_id,
        parentId: input.payload.parent_id,
        tenantId: log.tenant_id,
      });
    }

    const submittedRating = input.payload.rating === 0
      ? null
      : input.payload.rating ?? null;

    if (author.author_type === "employee" && submittedRating != null) {
      throw Errors.badRequest("员工评论不允许评分");
    }

    if (input.payload.parent_id && submittedRating != null) {
      throw Errors.badRequest("回复评论不允许评分");
    }

    let resolvedRating: number | null = null;
    if (author.author_type === "customer" && !input.payload.parent_id) {
      resolvedRating = submittedRating;
      if (resolvedRating != null) {
        const hasExistingRating =
          await projectLogCommentsRepository.hasCustomerExistingRating({
            logId: input.payload.log_id,
            customerId: author.author_id,
            tenantId: log.tenant_id,
          });
        if (hasExistingRating) {
          resolvedRating = null;
        }
      }
    }

    const row = await projectLogCommentsRepository.create({
      tenant_id: log.tenant_id,
      log_id: input.payload.log_id,
      parent_id: input.payload.parent_id ?? null,
      author_type: author.author_type,
      author_id: author.author_id,
      content: input.payload.content,
      rating: resolvedRating,
      images: normalizeImages(input.payload.images),
    });

    return this.attachAuthor(row, author.profile);
  }

  async listComments(input: {
    authUserId: string | undefined;
    tenantServiceAccess: TenantServiceRouteAccess;
    tokenRoles: string[];
    logId: string;
  }) {
    const viewer = await this.resolveCurrentAuthor(input);
    const log = await this.assertProjectLogReadable({
      logId: input.logId,
      author: viewer,
      tenantServiceAccess: input.tenantServiceAccess,
    });

    const rows = await projectLogCommentsRepository.listByLog({
      logId: input.logId,
      tenantId: log.tenant_id,
    });

    return this.attachAuthors(rows);
  }

  private async resolveCurrentAuthor(input: {
    authUserId: string | undefined;
    tokenRoles: string[];
  }): Promise<ResolvedCommentAuthor> {
    if (!input.authUserId) {
      throw Errors.unauthorized("未登录或登录状态无效");
    }

    const [employee, customer] = await Promise.all([
      projectLogCommentsRepository.findEmployeeAuthorByAuthUserId(input.authUserId),
      projectLogCommentsRepository.findCustomerAuthorByAuthUserId(input.authUserId),
    ]);

    if (input.tokenRoles.includes("customer") && customer?.id) {
      return {
        auth_user_id: input.authUserId,
        author_type: "customer",
        author_id: customer.id,
        tenant_id: customer.tenant_id,
        profile: {
          id: customer.id,
          name: customer.name,
          avatar: null,
        },
      };
    }

    if (input.tokenRoles.includes("employee") && employee?.id) {
      return {
        auth_user_id: input.authUserId,
        author_type: "employee",
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
        auth_user_id: input.authUserId,
        author_type: "employee",
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
        auth_user_id: input.authUserId,
        author_type: "customer",
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
    const log = await projectLogCommentsRepository.findProjectLogAccessInfo(logId);
    if (!log?.id) {
      throw Errors.badRequest("施工日志不存在");
    }

    return log;
  }

  private async assertProjectLogReadable(input: {
    logId: string;
    author: ResolvedCommentAuthor;
    tenantServiceAccess: TenantServiceRouteAccess;
  }): Promise<ProjectLogAccessInfo> {
    const log = await this.getProjectLogAccessInfo(input.logId);
    if (input.author.author_type === "customer") {
      const project = await projectLogCommentsRepository.findProjectOwner({
        projectId: log.project_id,
        tenantId: log.tenant_id,
      });

      if (
        !project?.id ||
        project.customer_id !== input.author.author_id ||
        project.tenant_id !== input.author.tenant_id
      ) {
        throw Errors.forbidden();
      }

      return log;
    }

    const authContext = await authorizationService.getRequiredAuthContext(
      input.author.auth_user_id,
      { tenantServiceAccess: input.tenantServiceAccess },
    );
    const tenantId = accessPolicyService.assertTenantContext(authContext);
    if (tenantId !== log.tenant_id) {
      throw Errors.forbidden();
    }

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

  private async ensureParentComment(input: {
    logId: string;
    parentId: string;
    tenantId: string | null;
  }) {
    const parent = await projectLogCommentsRepository.findParentComment({
      parentId: input.parentId,
      tenantId: input.tenantId,
    });

    if (!parent?.id) {
      throw Errors.badRequest("父评论不存在");
    }

    if (parent.log_id !== input.logId) {
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

    const [employees, customers] = await Promise.all([
      projectLogCommentsRepository.listEmployeeAuthors(employeeIds),
      projectLogCommentsRepository.listCustomerAuthors(customerIds),
    ]);

    const employeeMap = new Map(
      employees.map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name,
          avatar: item.avatar,
        },
      ]),
    );
    const customerMap = new Map(
      customers.map((item) => [
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

  private attachAuthor(
    row: ProjectLogCommentRow,
    author: CommentAuthor | null,
  ): ProjectLogCommentResponseItem {
    return {
      ...row,
      images: resolveStoredFileUrlList(row.images),
      author,
    };
  }
}

export const projectLogCommentsService = new ProjectLogCommentsService();
