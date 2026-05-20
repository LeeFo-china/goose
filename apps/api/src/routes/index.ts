//职位控制器
import type {
  FastifyError,
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
} from "fastify";
import {
  createResourceRoutes,
  type ResourceCrudRouteConfig,
} from "./factory";

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
import AiConfigController from "@/controllers/ai-config";
import UploadController from "@/controllers/uploads";
import ExternalReferrersController from "@/controllers/external-referrers";
import ProjectReferralsController from "@/controllers/project-referrals";
import ExpenseRequestsController from "@/controllers/expense-requests";
import RolesController from "@/controllers/roles";
import PermissionsController from "@/controllers/permissions";
import EmployeePermissionsController from "@/controllers/employee-permissions";
import EmployeeSelfServiceController from "@/controllers/employee-self-service";
import TaskCenterController from "@/controllers/task-center";
import CustomerSelfServiceController from "@/controllers/customer-self-service";
import CustomerProjectLogSharesController from "@/controllers/customer-project-log-shares";
import CustomerFollowUpCommentsController from "@/controllers/customer-follow-up-comments";
import ExpenseRequestCategoriesController from "@/controllers/expense-request-categories";
import ProjectCameraController from "@/controllers/project-cameras";
import ProjectAcceptancesController from "@/controllers/project-acceptances";
import AdminAuthController from "@/controllers/admin-auth";
import AdminOpsController from "@/controllers/admin-ops";
import SystemSettingsController from "@/controllers/system-settings";
import MarketingPagesController from "@/controllers/marketing-pages";
import DepartmentPostRulesController from "@/controllers/department-post-rules";
import SocialVideoController from "@/controllers/social-video";
import PlatformLeadsController from "@/controllers/platform-leads";
import PlatformTenantsController from "@/controllers/platform-tenants";
import PlatformAuditLogsController from "@/controllers/platform-audit-logs";
import TenantShareLinksController from "@/controllers/tenant-share-links";
import TenantDeviceController from "@/controllers/tenant-devices";
import NotificationsController from "@/controllers/notifications";
import UsageController from "@/controllers/usage";
import BillingController from "@/controllers/billing";
import UserAuthEventsController from "@/controllers/user-auth-events";
import IdentityDiagnosticsController from "@/controllers/identity-diagnostics";

const fullCrudRoutes = {
  list: true,
  getById: true,
  create: true,
  update: true,
} satisfies ResourceCrudRouteConfig;

const employeeCrudRoutes = {
  list: true,
  getById: true,
  create: true,
  update: true,
} satisfies ResourceCrudRouteConfig;

const projectCrudRoutes = {
  list: true,
  getById: true,
  create: true,
  update: true,
} satisfies ResourceCrudRouteConfig;

const projectLogCrudRoutes = {
  list: true,
  getById: true,
  create: true,
  update: true,
} satisfies ResourceCrudRouteConfig;

const projectAcceptanceCrudRoutes = {
  list: true,
  getById: true,
  create: true,
  update: true,
} satisfies ResourceCrudRouteConfig;

const indexRoutes: FastifyPluginAsync = async (app, options) => {
  //
  app.get("/", async (request, reply) => {
    return { hello: "world" };
  });

  WeChatController.registerExtraRoutes(app);
  AdminAuthController.registerExtraRoutes(app);
  AdminOpsController.registerExtraRoutes(app);
  SystemSettingsController.registerExtraRoutes(app);
  SocialVideoController.registerExtraRoutes(app);
  PlatformLeadsController.registerExtraRoutes(app);
  PlatformTenantsController.registerExtraRoutes(app);
  PlatformAuditLogsController.registerExtraRoutes(app);
  TenantShareLinksController.registerExtraRoutes(app);
  TenantDeviceController.registerExtraRoutes(app);
  NotificationsController.registerExtraRoutes(app);
  UsageController.registerExtraRoutes(app);
  BillingController.registerExtraRoutes(app);
  UserAuthEventsController.registerExtraRoutes(app);
  IdentityDiagnosticsController.registerExtraRoutes(app);
  AiConfigController.registerExtraRoutes(app);
  MarketingPagesController.registerExtraRoutes(app);
  DepartmentPostRulesController.registerExtraRoutes(app);
  AiController.registerExtraRoutes(app);
  UploadController.registerExtraRoutes(app);
  ProjectLogCommentsController.registerExtraRoutes(app);
  EmployeePermissionsController.registerExtraRoutes(app);
  EmployeeSelfServiceController.registerExtraRoutes(app);
  TaskCenterController.registerExtraRoutes(app);
  CustomerSelfServiceController.registerExtraRoutes(app);
  CustomerProjectLogSharesController.registerExtraRoutes(app);
  CustomerFollowUpCommentsController.registerExtraRoutes(app);
  ProjectCameraController.registerExtraRoutes(app);
  RpcController.registerExtraRoutes(app);
  GetProjectCreatePageDataController.registerExtraRoutes(app);
  app.register(createResourceRoutes("customers", CustomerController, fullCrudRoutes));
  app.register(createResourceRoutes("employees", EmployeeController, employeeCrudRoutes));
  app.register(createResourceRoutes("departments", DepartmentController, fullCrudRoutes));
  app.register(createResourceRoutes("payments", PaymentController, fullCrudRoutes));
  app.register(createResourceRoutes("expense-requests", ExpenseRequestsController, fullCrudRoutes));
  app.register(createResourceRoutes("expense-request-categories", ExpenseRequestCategoriesController, fullCrudRoutes));
  app.register(createResourceRoutes("projects", ProjectController, projectCrudRoutes));
  app.register(createResourceRoutes("roles", RolesController, fullCrudRoutes));
  app.register(createResourceRoutes("permissions", PermissionsController, fullCrudRoutes));
  app.register(createResourceRoutes("external-referrers", ExternalReferrersController, fullCrudRoutes));
  app.register(createResourceRoutes("project-referrals", ProjectReferralsController, fullCrudRoutes));
  app.register(createResourceRoutes("project-logs", ProjectLogController, projectLogCrudRoutes));
  app.register(createResourceRoutes("project-acceptances", ProjectAcceptancesController, projectAcceptanceCrudRoutes));
  app.register(createResourceRoutes("posts", PostsController, fullCrudRoutes));
  app.register(createResourceRoutes("properties", PropertyControlle, fullCrudRoutes));
};

export default indexRoutes;
