import { PassThrough } from "node:stream";
import { Errors } from "@/errors/error-factory";
import { wechatPayCallbackService } from "@/services/wechat-pay-callbacks";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RequestPayload,
} from "fastify";

class WechatPayCallbacksController {
  public registerExtraRoutes = (fastify: FastifyInstance) => {
    fastify.post(
      "/pay/wechat/callback",
      {
        preParsing: this.captureRawBody,
      },
      this.handleWechatPayCallback,
    );
  };

  handleWechatPayCallback = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (!request.rawBody) {
      throw Errors.badRequest("微信支付回调原始请求体缺失");
    }

    const result = await wechatPayCallbackService.handleCallback({
      rawBody: request.rawBody,
      headers: request.headers,
    });
    return reply.status(200).send(result);
  };

  private captureRawBody = (
    request: FastifyRequest,
    reply: FastifyReply,
    payload: RequestPayload,
    done: (error: Error | null, stream?: RequestPayload) => void,
  ) => {
    const chunks: Buffer[] = [];

    payload.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    payload.on("error", (error: Error) => {
      done(error);
    });
    payload.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      request.rawBody = rawBody;
      const replay = new PassThrough() as PassThrough & {
        receivedEncodedLength: number;
      };
      replay.receivedEncodedLength = Buffer.byteLength(rawBody);
      replay.end(rawBody);
      done(null, replay);
    });
  };
}

export default new WechatPayCallbacksController();
