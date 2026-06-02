import type { FastifyInstance } from "fastify";
import customerShareCampaignController from "./customer-controller";
import employeeShareCampaignController from "./employee-controller";
import marketingCenterCampaignInstanceController from "./marketing-center-instance-controller";
import { CustomerProjectLogSharesBaseController } from "./shared";

class CustomerProjectLogSharesController extends CustomerProjectLogSharesBaseController {
  public override registerExtraRoutes = (fastify: FastifyInstance) => {
    customerShareCampaignController.registerExtraRoutes(fastify);
    employeeShareCampaignController.registerExtraRoutes(fastify);
    marketingCenterCampaignInstanceController.registerExtraRoutes(fastify);
  };
}

export default new CustomerProjectLogSharesController();
