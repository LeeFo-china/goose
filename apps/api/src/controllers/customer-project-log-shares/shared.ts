import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import type { FastifyRequest } from "fastify";

export abstract class CustomerProjectLogSharesBaseController extends BaseController {
  protected readonly marketingCampaignType = "share_assist" as const;

  constructor() {
    super("customer-project-log-shares");
  }

  protected getRequiredAuthUserId(request: FastifyRequest) {
    const authUserId = request.user?.sub;
    if (!authUserId) {
      throw Errors.unauthorized();
    }

    return authUserId;
  }

  protected getOptionalAuthUserId(request: FastifyRequest) {
    return request.user?.sub;
  }

  protected getCustomerProjectScope(request: FastifyRequest) {
    return {
      customerId: request.user?.customer_id ?? null,
      tenantId: request.user?.tenant_id ?? null,
    };
  }

  protected buildAbsoluteUrl(request: FastifyRequest, path: string) {
    const proto = (request.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim()
      || request.protocol
      || "https";
    const host = request.headers["x-forwarded-host"] as string | undefined
      || request.headers.host
      || "sock.goodcms.cn";

    return `${proto}://${host}${path}`;
  }

  protected withCampaignType<T extends Record<string, unknown>>(data: T) {
    return {
      ...data,
      campaign_type: typeof data.campaign_type === "string"
        ? data.campaign_type
        : this.marketingCampaignType,
    };
  }

  protected withCampaignTypeList(list: Array<Record<string, unknown>>) {
    return list.map((item) => this.withCampaignType(item));
  }
}
