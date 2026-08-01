import { PassThrough } from "node:stream";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  wechatVirtualPaymentNotificationService,
  type WechatVirtualPaymentMessageResult,
} from "@/services/wechat-virtual-payment-notifications";
import {
  WECHAT_VIRTUAL_MESSAGE_BODY_LIMIT,
} from "@/services/wechat-virtual-payment-message";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RequestPayload,
} from "fastify";

type NotificationServicePort = Pick<
  typeof wechatVirtualPaymentNotificationService,
  "verifyEndpoint" | "handle"
>;

export class WechatVirtualPaymentController {
  constructor(
    private readonly service: NotificationServicePort =
      wechatVirtualPaymentNotificationService,
  ) {}

  registerExtraRoutes = (fastify: FastifyInstance): void => {
    fastify.addContentTypeParser(
      ["application/xml", "text/xml"],
      { parseAs: "string", bodyLimit: WECHAT_VIRTUAL_MESSAGE_BODY_LIMIT },
      (_request, body, done) => done(null, body),
    );
    fastify.get(
      "/wechat/virtual-payment/events",
      this.verifyEndpoint,
    );
    fastify.post(
      "/wechat/virtual-payment/events",
      {
        bodyLimit: WECHAT_VIRTUAL_MESSAGE_BODY_LIMIT,
        preParsing: this.captureRawBody,
      },
      this.handleEvent,
    );
  };

  verifyEndpoint = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    const echostr = await this.service.verifyEndpoint(
      request.query as Record<string, unknown>,
    );
    return reply.type("text/plain; charset=utf-8").status(200).send(echostr);
  };

  handleEvent = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    const contentType = headerText(request.headers["content-type"]);
    try {
      if (!request.rawBody) {
        throw Errors.business(
          400,
          "微信虚拟支付消息体不能为空",
          "WECHAT_VIRTUAL_MESSAGE_PAYLOAD_INVALID",
        );
      }
      const result = await this.service.handle({
        rawBody: request.rawBody,
        contentType,
        query: request.query as Record<string, unknown>,
        requestId: String(request.id).slice(0, 128),
      });
      if (result.kind === "ack" &&
        (result.errorCode || result.failurePersistenceErrorCode)) {
        request.log.warn({
          code: result.errorCode,
          persistenceCode: result.failurePersistenceErrorCode,
        }, "微信虚拟支付消息等待重试");
      }
      return sendProtocolResponse(reply, result);
    } catch (error) {
      const appError = error instanceof AppError
        ? error
        : Errors.dbError("处理微信虚拟支付消息失败");
      request.log.warn({
        code: appError.code,
        statusCode: appError.statusCode,
      }, "拒绝微信虚拟支付消息");
      return sendProtocolResponse(reply, {
        kind: "ack",
        httpStatus: appError.statusCode,
        format: isXmlContentType(contentType) ? "xml" : "json",
        body: { ErrCode: 1, ErrMsg: "retry" },
        errorCode: appError.code,
      });
    }
  };

  private captureRawBody = (
    request: FastifyRequest,
    _reply: FastifyReply,
    payload: RequestPayload,
    done: (error: Error | null, stream?: RequestPayload) => void,
  ): void => {
    const chunks: Buffer[] = [];
    let byteLength = 0;
    let completed = false;

    payload.on("data", (chunk: Buffer | string) => {
      if (completed) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteLength += buffer.length;
      if (byteLength > WECHAT_VIRTUAL_MESSAGE_BODY_LIMIT) {
        completed = true;
        done(Errors.business(
          413,
          "微信虚拟支付消息体超过限制",
          "WECHAT_VIRTUAL_MESSAGE_BODY_TOO_LARGE",
        ));
        return;
      }
      chunks.push(buffer);
    });
    payload.on("error", (error: Error) => {
      if (completed) return;
      completed = true;
      done(error);
    });
    payload.on("end", () => {
      if (completed) return;
      completed = true;
      const rawBody = Buffer.concat(chunks).toString("utf8");
      request.rawBody = rawBody;
      const replay = new PassThrough() as PassThrough & {
        receivedEncodedLength: number;
      };
      replay.receivedEncodedLength = byteLength;
      replay.end(rawBody);
      done(null, replay);
    });
  };
}

function sendProtocolResponse(
  reply: FastifyReply,
  result: WechatVirtualPaymentMessageResult,
): FastifyReply {
  if (result.format === "xml") {
    if (result.kind === "ack") {
      const xml = `<xml><ErrCode>${result.body.ErrCode}</ErrCode>` +
        `<ErrMsg><![CDATA[${result.body.ErrMsg}]]></ErrMsg></xml>`;
      return reply.type("application/xml; charset=utf-8")
        .status(result.httpStatus)
        .send(xml);
    }
    const fields = {
      result_code: result.body.result_code,
      result_info: result.body.result_info,
      evidence: result.body.evidence,
    };
    const xml = `<xml>${Object.entries(fields).map(([key, value]) =>
      `<${key}>${escapeXml(String(value))}</${key}>`
    ).join("")}</xml>`;
    return reply.type("application/xml; charset=utf-8")
      .status(result.httpStatus)
      .send(xml);
  }
  return reply.type("application/json; charset=utf-8")
    .status(result.httpStatus)
    .send(result.body);
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

function headerText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isXmlContentType(contentType: string): boolean {
  const type = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return type === "application/xml" || type === "text/xml";
}

export default new WechatVirtualPaymentController();
