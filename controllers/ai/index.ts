import type { FastifyReply, FastifyRequest } from "fastify";
import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import { Post } from "@/utils/decorators/route";
import {
  DecorationQaRequestSchema,
  DecorationQaStreamRequestSchema,
} from "@/schema/ai";
import {
  askDecorationQa,
  resolveDecorationQaStreamSystemMessages,
  serializeDecorationQaStreamEvent,
  streamDecorationQa,
} from "@/services/decoration-qa";

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

  @Post("/ai/decoration-qa/stream")
  async decorationQaStream(request: FastifyRequest, reply: FastifyReply) {
    const result = DecorationQaStreamRequestSchema.safeParse(request.body);

    if (!result.success) {
      throw Errors.fromZod(result.error);
    }

    const extraSystemMessages = await resolveDecorationQaStreamSystemMessages(
      result.data,
      request.user?.sub,
    );

    reply.hijack();
    reply.raw.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders?.();

    const abortController = new AbortController();
    reply.raw.on("close", () => {
      if (!reply.raw.writableEnded) {
        abortController.abort();
      }
    });

    try {
      await streamDecorationQa(
        result.data,
        async (event) => {
          if (!reply.raw.writableEnded) {
            reply.raw.write(serializeDecorationQaStreamEvent(event));
          }
        },
        {
          authUserId: request.user?.sub,
          extraSystemMessages,
          signal: abortController.signal,
        },
      );
    } catch (error) {
      request.log.error(
        { err: error, requestId: request.id },
        "[ai] decoration qa stream failed",
      );

      if (!reply.raw.writableEnded) {
        reply.raw.write(serializeDecorationQaStreamEvent({
          type: "error",
          message: "AI 服务繁忙，请稍后再试",
        }));
      }
    } finally {
      if (!reply.raw.writableEnded) {
        reply.raw.end();
      }
    }
  }
}

export default new AiController();
