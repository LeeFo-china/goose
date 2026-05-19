import { Errors } from "@/errors/error-factory";
import { customerFollowUpCommentRepository } from "@/repositories/customer-follow-up-comments";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import type { CreateCustomerFollowUpCommentInput } from "@/schema/customer-follow-up-comments";
import { resolveStoredFileUrlList } from "@/services/files/file-url-resolver";

type CommentAuthor = {
  id: string;
  name: string | null;
  avatar: string | null;
  post_name: string | null;
};

type FollowUpSummaryInput = {
  id: string;
  employee?: unknown;
  employee_id: string | null;
};

type FollowUpAccessTarget = {
  owner_id: string | null;
  tenant_id?: string | null;
};

class CustomerFollowUpCommentService {
  private normalizePostName(post: unknown) {
    if (Array.isArray(post)) {
      return (post[0] as { name?: string | null } | undefined)?.name ?? null;
    }

    return (post as { name?: string | null } | null)?.name ?? null;
  }

  private normalizeImages(images: string[] | undefined) {
    return Array.isArray(images) ? images.filter(Boolean) : [];
  }

  private async resolveCommentCapabilities(
    authContext: AuthContext,
    customer: FollowUpAccessTarget,
  ) {
    const canViewComments = await accessPolicyService.canAccessCustomer(
      authContext,
      customer,
      "customer.read",
    );

    const canComment = accessPolicyService.hasPermission(authContext, "customer.update")
      ? await accessPolicyService.canAccessCustomer(
        authContext,
        customer,
        "customer.update",
      )
      : false;

    const canModerateComments = accessPolicyService.hasPermission(
      authContext,
      "customer.assign_owner",
    )
      ? await accessPolicyService.canAccessCustomer(
        authContext,
        customer,
        "customer.assign_owner",
      )
      : false;

    return {
      canViewComments,
      canComment,
      canModerateComments,
    };
  }

  private async assertAccessibleFollowUp(
    authContext: AuthContext,
    followUpId: string,
    permissionCode: "customer.read" | "customer.update",
  ) {
    accessPolicyService.assertTenantContext(authContext);
    const followUp = await customerFollowUpCommentRepository.findFollowUpAccessById(
      followUpId,
    );

    if (!followUp?.id || !followUp.customer) {
      throw Errors.badRequest("客户跟进记录不存在");
    }

    const canAccess = await accessPolicyService.canAccessCustomer(
      authContext,
      followUp.customer,
      permissionCode,
    );

    if (!canAccess) {
      throw Errors.forbidden();
    }

    return followUp;
  }

  private async attachAuthors<
    T extends {
      author_employee_id: string;
      parent_id: string | null;
      status: string | null;
      images: string[] | null;
    },
  >(
    rows: T[],
    canComment: boolean,
    canModerate: boolean,
  ) {
    const employeeIds = Array.from(new Set(rows.map((item) => item.author_employee_id)));
    const authors = await customerFollowUpCommentRepository.listAuthorsByEmployeeIds(
      employeeIds,
    );
    const authorMap = new Map(
      authors.map((item) => [
        item.id,
        {
          id: item.id,
          name: item.name ?? null,
          avatar: item.avatar ?? null,
          post_name: this.normalizePostName(item.post),
        } satisfies CommentAuthor,
      ]),
    );

    return rows.map((item) => ({
      ...item,
      images: resolveStoredFileUrlList(item.images || []),
      author: authorMap.get(item.author_employee_id) ?? null,
      can_reply: item.parent_id === null && item.status === "active" && canComment,
      can_moderate: canModerate,
    }));
  }

  async listComments(
    authContext: AuthContext,
    input: { followUpId: string; page: number; pageSize: number },
  ) {
    const followUp = await this.assertAccessibleFollowUp(
      authContext,
      input.followUpId,
      "customer.read",
    );
    const capabilities = await this.resolveCommentCapabilities(
      authContext,
      followUp.customer!,
    );
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;

    const result = await customerFollowUpCommentRepository.listCommentsByFollowUpId({
      followUpId: input.followUpId,
      from,
      to,
    });

    const list = await this.attachAuthors(
      result.list,
      capabilities.canComment,
      capabilities.canModerateComments,
    );

    return {
      list,
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: result.count,
        totalPages: result.count ? Math.ceil(result.count / input.pageSize) : 0,
      },
    };
  }

  async createComment(
    authContext: AuthContext,
    input: {
      followUpId: string;
      payload: CreateCustomerFollowUpCommentInput;
    },
  ) {
    const followUp = await this.assertAccessibleFollowUp(
      authContext,
      input.followUpId,
      "customer.update",
    );

    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    if (input.payload.parent_id) {
      const parent = await customerFollowUpCommentRepository.findCommentById(
        input.payload.parent_id,
      );

      if (!parent?.id || parent.status !== "active") {
        throw Errors.badRequest("回复目标评论不存在");
      }

      if (parent.follow_up_id !== input.followUpId || parent.parent_id !== null) {
        throw Errors.badRequest("回复目标评论无效");
      }
    }

    const created = await customerFollowUpCommentRepository.createComment({
      follow_up_id: input.followUpId,
      parent_id: input.payload.parent_id ?? null,
      author_employee_id: authContext.employeeId,
      content: input.payload.content,
      images: this.normalizeImages(input.payload.images),
    });

    const capabilities = await this.resolveCommentCapabilities(
      authContext,
      followUp.customer!,
    );
    const [item] = await this.attachAuthors(
      [created],
      capabilities.canComment,
      capabilities.canModerateComments,
    );

    return item;
  }

  async enrichFollowUpsWithCommentSummaries<T extends FollowUpSummaryInput>(
    authContext: AuthContext,
    customer: FollowUpAccessTarget,
    followUps: T[],
  ) {
    const followUpIds = followUps.map((item) => item.id);
    const summaryRows = await customerFollowUpCommentRepository
      .listCommentSummariesByFollowUpIds(followUpIds);
    const employeeIds = Array.from(
      new Set(summaryRows.map((item) => item.author_employee_id)),
    );
    const authors = await customerFollowUpCommentRepository.listAuthorsByEmployeeIds(
      employeeIds,
    );
    const authorMap = new Map(authors.map((item) => [item.id, item]));
    const capabilities = await this.resolveCommentCapabilities(authContext, customer);
    const summaryMap = new Map<
      string,
      {
        count: number;
        latest: {
          id: string;
          content: string;
          author_employee_name: string | null;
          created_at: string;
        } | null;
      }
    >();

    for (const item of summaryRows) {
      const current = summaryMap.get(item.follow_up_id) || {
        count: 0,
        latest: null,
      };
      current.count += 1;
      if (!current.latest) {
        const author = authorMap.get(item.author_employee_id);
        current.latest = {
          id: item.id,
          content: item.content,
          author_employee_name: author?.name ?? null,
          created_at: item.created_at,
        };
      }
      summaryMap.set(item.follow_up_id, current);
    }

    return followUps.map((item) => {
      const summary = summaryMap.get(item.id);
      return {
        ...item,
        comment_count: summary?.count ?? 0,
        latest_comment_preview: summary?.latest ?? null,
        can_comment: capabilities.canComment,
        can_view_comments: capabilities.canViewComments,
        can_moderate_comments: capabilities.canModerateComments,
      };
    });
  }
}

export const customerFollowUpCommentService = new CustomerFollowUpCommentService();
