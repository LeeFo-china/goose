import type { FastifyInstance, FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  DouyinCustomerAuthAuthorizeSchema,
  DouyinCustomerAuthSelectSchema,
  DouyinCustomerAuthSendCodeSchema,
  DouyinCustomerAuthVerifySchema,
} from "@/schema/douyin-customer-auth";
import {
  getDouyinCustomerAuthService,
} from "@/services/douyin-miniapp/customer-auth-default";
import { ResponseHandler } from "@/utils/response";
import { resolveTrustedClientIp } from "@/utils/trusted-proxy-client-ip";

type CustomerAuthService = Pick<
  ReturnType<typeof getDouyinCustomerAuthService>,
  "sendCode" | "verifySms" | "authorizePhone" | "select"
>;

export class DouyinCustomerAuthController {
  constructor(private readonly customerAuthService?: CustomerAuthService) {}

  registerExtraRoutes(fastify: FastifyInstance): void {
    fastify.post(
      "/douyin-mini/customer-auth/authorize-phone",
      this.authorizePhone,
    );
    fastify.post(
      "/douyin-mini/customer-auth/sms/send-code",
      this.sendCode,
    );
    fastify.post(
      "/douyin-mini/customer-auth/sms/verify",
      this.verifySms,
    );
    fastify.post("/douyin-mini/customer-auth/select", this.select);
  }

  authorizePhone = async (request: FastifyRequest) => {
    const input = parse(DouyinCustomerAuthAuthorizeSchema, request.body || {});
    return ResponseHandler.success(await this.service().authorizePhone({
      request,
      input,
    }));
  };

  sendCode = async (request: FastifyRequest) => {
    const input = parse(DouyinCustomerAuthSendCodeSchema, request.body || {});
    return ResponseHandler.success(await this.service().sendCode({
      request,
      input,
      requestIp: resolveTrustedClientIp(request),
    }));
  };

  verifySms = async (request: FastifyRequest) => {
    const input = parse(DouyinCustomerAuthVerifySchema, request.body || {});
    return ResponseHandler.success(await this.service().verifySms({
      request,
      input,
    }));
  };

  select = async (request: FastifyRequest) => {
    const input = parse(DouyinCustomerAuthSelectSchema, request.body || {});
    return ResponseHandler.success(await this.service().select({
      request,
      input,
    }));
  };

  private service(): CustomerAuthService {
    return this.customerAuthService ?? getDouyinCustomerAuthService();
  }
}

function parse<T>(schema: { safeParse(value: unknown):
  { success: true; data: T } | { success: false; error: Parameters<typeof Errors.fromZod>[0] } },
value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Errors.fromZod(result.error);
  return result.data;
}
