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
import ProjectLogCommentsController from "@/controllers/project-log-comments";
import AiController from "@/controllers/ai";
import UploadController from "@/controllers/uploads";
import ExternalReferrersController from "@/controllers/external-referrers";
import ProjectReferralsController from "@/controllers/project-referrals";
import ExpenseRequestsController from "@/controllers/expense-requests";
import RolesController from "@/controllers/roles";
import PermissionsController from "@/controllers/permissions";
import EmployeePermissionsController from "@/controllers/employee-permissions";
import TaskCenterController from "@/controllers/task-center";
import CustomerSelfServiceController from "@/controllers/customer-self-service";
import CustomerProjectLogSharesController from "@/controllers/customer-project-log-shares";
import CustomerFollowUpCommentsController from "@/controllers/customer-follow-up-comments";

const indexRoutes: FastifyPluginAsync = async (app, options) => {
  //
  app.get("/", async (request, reply) => {
    return { hello: "world" };
  });

  WeChatController.registerExtraRoutes(app);
  AiController.registerExtraRoutes(app);
  UploadController.registerExtraRoutes(app);
  ProjectLogCommentsController.registerExtraRoutes(app);
  EmployeePermissionsController.registerExtraRoutes(app);
  TaskCenterController.registerExtraRoutes(app);
  CustomerSelfServiceController.registerExtraRoutes(app);
  CustomerProjectLogSharesController.registerExtraRoutes(app);
  CustomerFollowUpCommentsController.registerExtraRoutes(app);
  RpcController.registerExtraRoutes(app);
  GetProjectCreatePageDataController.registerExtraRoutes(app);
  app.register(createResourceRoutes("customers", CustomerController));
  app.register(createResourceRoutes("employees", EmployeeController));
  app.register(createResourceRoutes("departments", DepartmentController));
  app.register(createResourceRoutes("payments", PaymentController));
  app.register(createResourceRoutes("expense-requests", ExpenseRequestsController));
  app.register(createResourceRoutes("projects", ProjectController));
  app.register(createResourceRoutes("roles", RolesController));
  app.register(createResourceRoutes("permissions", PermissionsController));
  app.register(createResourceRoutes("external-referrers", ExternalReferrersController));
  app.register(createResourceRoutes("project-referrals", ProjectReferralsController));
  app.register(createResourceRoutes("project-logs", ProjectLogController));
  app.register(createResourceRoutes("posts", PostsController));
  app.register(createResourceRoutes("properties", PropertyControlle));
};

export default indexRoutes;
