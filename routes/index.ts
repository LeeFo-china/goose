//职位控制器
import type {
  FastifyError,
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
} from "fastify";
import { createResourceRoutes } from "./factory";

import PaymentController from "@/controllers/payment";
import ProjectController from "@/controllers/projects";
import DepartmentController from "@/controllers/departments";
import EmployeeController from "@/controllers/employee";
import CustomerController from "@/controllers/customer";
import PostsController from "@/controllers/posts";
import WeChatController from "@/controllers/wechat";
import RpcController from "@/controllers/common/rpc/get_home_dashboard_stats";
import GetProjectCreatePageDataController from "@/controllers/common/rpc/get_project_create_page_data";
import PropertyControlle from "@/controllers/properties";
import ProjectLogController from "@/controllers/project-logs";
import AiController from "@/controllers/ai";

const indexRoutes: FastifyPluginAsync = async (app, options) => {
  //
  app.get("/", async (request, reply) => {
    return { hello: "world" };
  });

  WeChatController.registerExtraRoutes(app);
  AiController.registerExtraRoutes(app);
  RpcController.registerExtraRoutes(app);
  GetProjectCreatePageDataController.registerExtraRoutes(app);
  app.register(createResourceRoutes("customers", CustomerController));
  app.register(createResourceRoutes("employees", EmployeeController));
  app.register(createResourceRoutes("departments", DepartmentController));
  app.register(createResourceRoutes("payments", PaymentController));
  app.register(createResourceRoutes("projects", ProjectController));
  app.register(createResourceRoutes("project-logs", ProjectLogController));
  app.register(createResourceRoutes("posts", PostsController));
  app.register(createResourceRoutes("properties", PropertyControlle));
};

export default indexRoutes;
