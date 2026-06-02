import type { FastifyInstance } from "fastify";
import { MarketingPagesBaseController } from "./shared";
import platformMarketingPagesController from "./platform-controller";
import publicMarketingPagesAndLeadsController from "./public-leads-controller";
import tenantMarketingPagesController from "./tenant-controller";

class MarketingPagesController extends MarketingPagesBaseController {
  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    platformMarketingPagesController.registerExtraRoutes(fastify);
    tenantMarketingPagesController.registerExtraRoutes(fastify);
    publicMarketingPagesAndLeadsController.registerExtraRoutes(fastify);
  };
}

export default new MarketingPagesController();
