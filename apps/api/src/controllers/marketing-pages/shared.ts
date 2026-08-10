import { BaseController } from "@/controllers/BaseController";
import { authorizationService } from "@/services/authorization";
import { getTenantServiceAuthOptions } from "@/services/tenant-service-route-access";
import type { FastifyRequest } from "fastify";

export function getRequestMetadata(request: FastifyRequest) {
  const userAgent = request.headers["user-agent"];

  return {
    requestIp: request.ip || null,
    userAgent: typeof userAgent === "string" ? userAgent : null,
  };
}

export function createAiPageContext(
  pages: Array<{
    title: string;
    slug: string;
    status: string;
    description: string | null;
  }>,
) {
  return pages.slice(0, 20).map((page) => ({
    title: page.title,
    slug: page.slug,
    status: page.status,
    description: page.description,
  }));
}

export abstract class MarketingPagesBaseController extends BaseController {
  constructor() {
    super("marketing_pages");
  }

  protected async getRequiredAuthContext(request: FastifyRequest) {
    return authorizationService.getRequiredAuthContext(
      request.user?.sub,
      getTenantServiceAuthOptions(request),
    );
  }
}
