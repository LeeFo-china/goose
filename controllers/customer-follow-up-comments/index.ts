import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateCustomerFollowUpCommentSchema,
  CustomerFollowUpCommentsListQuerySchema,
  type CreateCustomerFollowUpCommentInput,
  type CustomerFollowUpCommentsListQuery,
} from "@/schema/customer-follow-up-comments";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { authorizationService } from "@/services/authorization";
import { customerFollowUpCommentService } from "@/services/customer-follow-up-comments";

class CustomerFollowUpCommentsController extends BaseController {
  constructor() {
    super("customer_follow_up_comments");
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  @Get("/customer_follow_ups/:followUpId/comments")
  async listComments(
    request: FastifyRequest<{
      Params: { followUpId: string };
      Querystring: CustomerFollowUpCommentsListQuery;
    }>,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredAuthContext(request);
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
    const authContext = await this.getRequiredAuthContext(request);
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
