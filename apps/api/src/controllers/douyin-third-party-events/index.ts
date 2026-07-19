import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  DouyinCallbackWrapperSchema,
  type DouyinCallbackWrapper,
} from "@/schema/douyin-third-party-events";
import { getDouyinAuthorizationEventsService } from "@/services/douyin-miniapp/authorization-events";

interface DouyinAuthorizationEventHandler {
  handleCallback(wrapper: DouyinCallbackWrapper): Promise<void>;
}

export class DouyinThirdPartyEventsController {
  constructor(
    private readonly getAuthorizationEventHandler: () => DouyinAuthorizationEventHandler =
      getDouyinAuthorizationEventsService,
  ) {}

  registerExtraRoutes(fastify: FastifyInstance): void {
    fastify.post(
      "/douyin-thirdparty/events/authorization",
      this.handleCallback,
    );
    fastify.post(
      "/douyin-thirdparty/events/message",
      this.handleCallback,
    );
  }

  handleCallback = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const bodyResult = DouyinCallbackWrapperSchema.safeParse(request.body);
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    await this.getAuthorizationEventHandler().handleCallback(bodyResult.data);
    return reply.type("text/plain").status(200).send("success");
  };
}

export default new DouyinThirdPartyEventsController();
