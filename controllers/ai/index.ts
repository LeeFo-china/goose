import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { Post } from "@/utils/decorators/route";
import { DecorationQaRequestSchema } from "@/schema/ai";
import { askDecorationQa } from "@/services/decoration-qa";

class AiController extends BaseController {
  constructor() {
    super("ai");
  }

  @Post("/ai/decoration-qa")
  async decorationQa(request: FastifyRequest, reply: FastifyReply) {
    const result = DecorationQaRequestSchema.safeParse(request.body);

    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    try {
      const qaResult = await askDecorationQa(result.data);

      return reply.status(200).send({
        data: qaResult,
        message: "success",
        statusCode: 200,
      });
    } catch (error) {
      request.log.error({ err: error, requestId: request.id }, "[ai] decoration qa failed");

      return reply.status(500).send({
        error: "Internal Server Error",
        message: "AI 服务繁忙，请稍后再试",
        statusCode: 500,
      });
    }
  }
}

export default new AiController();
