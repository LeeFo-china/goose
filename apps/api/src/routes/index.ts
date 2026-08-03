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
import CustomerServiceController from "@/controllers/customer-service";
import PostsController from "@/controllers/posts";
import WeChatController from "@/controllers/wechat";
import PhoneIdentityLoginController from "@/controllers/phone-identity-login";
import RpcController from "@/controllers/common/rpc/get_home_dashboard_stats";
import GetProjectCreatePageDataController from "@/controllers/common/rpc/get_project_create_page_data";
import PropertyControlle from "@/controllers/properties";
import ProjectLogController from "@/controllers/project-logs";
import ProjectLogCommentsController from "@/controllers/project-log-comments";
import ProjectProceduresController from "@/controllers/project-procedures";
import AiController from "@/controllers/ai";
import AiConfigController from "@/controllers/ai-config";
import UploadController from "@/controllers/uploads";
import UploadPreviewController from "@/controllers/upload-previews";
import ExternalReferrersController from "@/controllers/external-referrers";
import ProjectReferralsController from "@/controllers/project-referrals";
import ExpenseRequestsController from "@/controllers/expense-requests";
import RolesController from "@/controllers/roles";
import PermissionsController from "@/controllers/permissions";
import EmployeePermissionsController from "@/controllers/employee-permissions";
import EmployeeSelfServiceController from "@/controllers/employee-self-service";
import EmployeePersonalizationController from "@/controllers/employee-personalization";
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
import PlatformLocationController from "@/controllers/platform-location";
import PlatformTenantsController from "@/controllers/platform-tenants";
import PlatformPartnersController from "@/controllers/platform-partners";
import PlatformPartnerApplicationsController from "@/controllers/platform-partner-applications";
import PlatformPartnerMemberRebindRequestsController from "@/controllers/platform-partner-member-rebind-requests";
import PlatformPartnerRevenueController from "@/controllers/platform-partner-revenue";
import PlatformPartnerPortalController from "@/controllers/platform-partner-portal";
import PlatformPaymentConfigsController from "@/controllers/platform-payment-configs";
import PlatformVirtualProductsController from "@/controllers/platform-virtual-products";
import PlatformWechatPayApplymentsController from "@/controllers/platform-wechat-pay-applyments";
import PlatformAuditLogsController from "@/controllers/platform-audit-logs";
import AdministrativeAreasController from "@/controllers/administrative-areas";
import TenantShareLinksController from "@/controllers/tenant-share-links";
import TenantDeviceController from "@/controllers/tenant-devices";
import TenantServiceAreasController from "@/controllers/tenant-service-areas";
import VisitorLocationController from "@/controllers/visitor-location";
import VisitorProjectsController from "@/controllers/visitor-projects";
import NotificationsController from "@/controllers/notifications";
import UsageController from "@/controllers/usage";
import BillingController from "@/controllers/billing";
import BillingRechargeController from "@/controllers/billing-recharge";
import BillingServiceOrdersController from "@/controllers/billing-service-orders";
import PlatformBillingRechargeController from "@/controllers/platform-billing-recharge";
import PlatformBillingRechargeRefundController from "@/controllers/platform-billing-recharge-refunds";
import PlatformServiceProductsController from "@/controllers/platform-service-products";
import FinanceController from "@/controllers/finance";
import UserAuthEventsController from "@/controllers/user-auth-events";
import IdentityDiagnosticsController from "@/controllers/identity-diagnostics";
import PictureLibraryController from "@/controllers/picture-library";
import VisitorPictureLibraryController from "@/controllers/visitor-picture-library";
import WorkflowController from "@/controllers/workflows";
import WorkflowSubjectsController from "@/controllers/workflow-subjects";
import WorkflowTasksController from "@/controllers/workflow-tasks";
import WechatPayCallbacksController from "@/controllers/wechat-pay-callbacks";
import DouyinThirdPartyEventsController from "@/controllers/douyin-third-party-events";
import DouyinMiniappController from "@/controllers/douyin-miniapp";
import TenantDouyinMiniappController from "@/controllers/tenant-douyin-miniapp";
import PlatformDouyinMiniappsController from "@/controllers/platform-douyin-miniapps";
import SiteContentController from "@/controllers/site-content";
import ProjectHealthController from "@/controllers/project-health";
import TenantOnboardingController from "@/controllers/tenant-onboarding";
import PlatformTenantOnboardingController from "@/controllers/platform-tenant-onboarding";
import PartnerOnboardingApplicationsController from "@/controllers/partner-onboarding-applications";
import TenantServiceProviderController from "@/controllers/tenant-service-provider";
import TenantLocationController from "@/controllers/tenant-location";
import VisitorLocalServiceProvidersController from "@/controllers/visitor-local-service-providers";
import OcrController from "@/controllers/ocr";
import PlatformSuppliersController from "@/controllers/platform-suppliers";
import TenantSuppliersController from "@/controllers/tenant-suppliers";
import PlatformSupplierCatalogController from "@/controllers/platform-supplier-catalog";
import SupplierCatalogController from "@/controllers/supplier-catalog";
import SupplierProductsController from "@/controllers/supplier-products";
import SupplierPriceListsController from "@/controllers/supplier-price-lists";
import SupplierPurchaseOrdersController from "@/controllers/supplier-purchase-orders";
import SupplierPurchaseRequisitionsController from "@/controllers/supplier-purchase-requisitions";
import SupplierPayablesController from "@/controllers/supplier-payables";
import SupplierPaymentRequestsController from "@/controllers/supplier-payment-requests";
import PlatformUploadPreviewsController from "@/controllers/platform-upload-previews";
import PlatformSupplierOnboardingController from "@/controllers/platform-supplier-onboarding";
import BrandingController from "@/controllers/branding";
import BrandingAddonController from "@/controllers/branding-addon";
import TenantOnboardingOcrController from "@/controllers/tenant-onboarding-ocr";
import WechatVirtualPaymentController from "@/controllers/wechat-virtual-payment";

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
  PhoneIdentityLoginController.registerExtraRoutes(app);
  AdminAuthController.registerExtraRoutes(app);
  AdminOpsController.registerExtraRoutes(app);
  SystemSettingsController.registerExtraRoutes(app);
  SocialVideoController.registerExtraRoutes(app);
  PlatformLeadsController.registerExtraRoutes(app);
  PlatformLocationController.registerExtraRoutes(app);
  PlatformTenantsController.registerExtraRoutes(app);
  PlatformPartnersController.registerExtraRoutes(app);
  PlatformPartnerApplicationsController.registerExtraRoutes(app);
  PlatformPartnerMemberRebindRequestsController.registerExtraRoutes(app);
  PlatformPartnerRevenueController.registerExtraRoutes(app);
  PlatformPartnerPortalController.registerExtraRoutes(app);
  PlatformPaymentConfigsController.registerExtraRoutes(app);
  PlatformVirtualProductsController.registerExtraRoutes(app);
  PlatformWechatPayApplymentsController.registerExtraRoutes(app);
  PlatformAuditLogsController.registerExtraRoutes(app);
  AdministrativeAreasController.registerExtraRoutes(app);
  TenantShareLinksController.registerExtraRoutes(app);
  TenantDeviceController.registerExtraRoutes(app);
  TenantServiceAreasController.registerExtraRoutes(app);
  VisitorLocationController.registerExtraRoutes(app);
  VisitorProjectsController.registerExtraRoutes(app);
  NotificationsController.registerExtraRoutes(app);
  UsageController.registerExtraRoutes(app);
  FinanceController.registerExtraRoutes(app);
  BillingController.registerExtraRoutes(app);
  BillingRechargeController.registerExtraRoutes(app);
  BillingServiceOrdersController.registerExtraRoutes(app);
  PlatformBillingRechargeController.registerExtraRoutes(app);
  PlatformBillingRechargeRefundController.registerExtraRoutes(app);
  PlatformServiceProductsController.registerExtraRoutes(app);
  UserAuthEventsController.registerExtraRoutes(app);
  IdentityDiagnosticsController.registerExtraRoutes(app);
  PictureLibraryController.registerExtraRoutes(app);
  VisitorPictureLibraryController.registerExtraRoutes(app);
  WorkflowSubjectsController.registerExtraRoutes(app);
  WorkflowTasksController.registerExtraRoutes(app);
  WechatPayCallbacksController.registerExtraRoutes(app);
  DouyinThirdPartyEventsController.registerExtraRoutes(app);
  DouyinMiniappController.registerExtraRoutes(app);
  TenantDouyinMiniappController.registerExtraRoutes(app);
  PlatformDouyinMiniappsController.registerExtraRoutes(app);
  SiteContentController.registerExtraRoutes(app);
  ProjectHealthController.registerExtraRoutes(app);
  TenantOnboardingController.registerExtraRoutes(app);
  PlatformTenantOnboardingController.registerExtraRoutes(app);
  PartnerOnboardingApplicationsController.registerExtraRoutes(app);
  TenantServiceProviderController.registerExtraRoutes(app);
  TenantLocationController.registerExtraRoutes(app);
  VisitorLocalServiceProvidersController.registerExtraRoutes(app);
  OcrController.registerExtraRoutes(app);
  PlatformSuppliersController.registerExtraRoutes(app);
  TenantSuppliersController.registerExtraRoutes(app);
  PlatformSupplierCatalogController.registerExtraRoutes(app);
  SupplierCatalogController.registerExtraRoutes(app);
  SupplierProductsController.registerExtraRoutes(app);
  SupplierPriceListsController.registerExtraRoutes(app);
  SupplierPurchaseOrdersController.registerExtraRoutes(app);
  SupplierPurchaseRequisitionsController.registerExtraRoutes(app);
  SupplierPayablesController.registerExtraRoutes(app);
  SupplierPaymentRequestsController.registerExtraRoutes(app);
  PlatformUploadPreviewsController.registerExtraRoutes(app);
  PlatformSupplierOnboardingController.registerExtraRoutes(app);
  BrandingController.registerExtraRoutes(app);
  BrandingAddonController.registerExtraRoutes(app);
  TenantOnboardingOcrController.registerExtraRoutes(app);
  WechatVirtualPaymentController.registerExtraRoutes(app);
  AiConfigController.registerExtraRoutes(app);
  MarketingPagesController.registerExtraRoutes(app);
  DepartmentPostRulesController.registerExtraRoutes(app);
  AiController.registerExtraRoutes(app);
  UploadController.registerExtraRoutes(app);
  UploadPreviewController.registerExtraRoutes(app);
  ProjectLogCommentsController.registerExtraRoutes(app);
  ProjectProceduresController.registerExtraRoutes(app);
  EmployeePermissionsController.registerExtraRoutes(app);
  EmployeeSelfServiceController.registerExtraRoutes(app);
  EmployeePersonalizationController.registerExtraRoutes(app);
  TaskCenterController.registerExtraRoutes(app);
  CustomerSelfServiceController.registerExtraRoutes(app);
  CustomerServiceController.registerExtraRoutes(app);
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
  app.register(createResourceRoutes("workflows", WorkflowController, fullCrudRoutes));
  app.register(createResourceRoutes("external-referrers", ExternalReferrersController, fullCrudRoutes));
  app.register(createResourceRoutes("project-referrals", ProjectReferralsController, fullCrudRoutes));
  app.register(createResourceRoutes("project-logs", ProjectLogController, projectLogCrudRoutes));
  app.register(createResourceRoutes("project-acceptances", ProjectAcceptancesController, projectAcceptanceCrudRoutes));
  app.register(createResourceRoutes("posts", PostsController, fullCrudRoutes));
  app.register(createResourceRoutes("properties", PropertyControlle, fullCrudRoutes));
};

export default indexRoutes;
