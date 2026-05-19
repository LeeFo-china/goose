import type { FastifyReply, FastifyRequest } from "fastify";
import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateCustomerFollowUpCommentSchema,
  CustomerFollowUpCommentsListQuerySchema,
  type CreateCustomerFollowUpCommentInput,
  type CustomerFollowUpCommentsListQuery,
} from "@/schema/customer-follow-up-comments";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { customerFollowUpCommentService } from "@/services/customer-follow-up-comments";

class CustomerFollowUpCommentsController extends TenantBaseController {
  constructor() {
    super("customer_follow_up_comments");
  }

  @Get("/customer_follow_ups/:followUpId/comments")
  async listComments(
    request: FastifyRequest<{
      Params: { followUpId: string };
      Querystring: CustomerFollowUpCommentsListQuery;
    }>,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = CustomerFollowUpCommentsListQuerySchema.safeParse(
      request.query,
    );
    if (!queryResult.success) {
      throw Errors.fromZod(queryResult.error);
    }

    const result = await customerFollowUpCommentService.listComments(
      authContext,
      {
        followUpId: request.params.followUpId,
        page: queryResult.data.page,
        pageSize: queryResult.data.pageSize,
      },
    );

    return ResponseHandler.success(result);
  }

  @Post("/customer_follow_ups/:followUpId/comments")
  async createComment(
    request: FastifyRequest<{
      Params: { followUpId: string };
      Body: CreateCustomerFollowUpCommentInput;
    }>,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredTenantContext(request);
    const result = CreateCustomerFollowUpCommentSchema.safeParse(request.body);
    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    const created = await customerFollowUpCommentService.createComment(
      authContext,
      {
        followUpId: request.params.followUpId,
        payload: result.data,
      },
    );

    return ResponseHandler.success(created);
  }
}

export default new CustomerFollowUpCommentsController();
