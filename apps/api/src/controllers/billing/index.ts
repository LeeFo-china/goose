import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  BillingAiUsageStatsQuerySchema,
  BillingDateRangeQuerySchema,
  BillingEventQuerySchema,
  BillingLedgerQuerySchema,
  BillingManualRechargeSchema,
  BillingPricingRuleCreateSchema,
  BillingPricingRuleParamSchema,
  BillingPricingRuleQuerySchema,
  BillingPricingRuleUpdateSchema,
  BillingShadowRunSchema,
  BillingSubscriptionInvoiceParamSchema,
  BillingSubscriptionInvoiceQuerySchema,
  BillingTenantListQuerySchema,
  BillingTenantParamSchema,
} from "@/schema/billing";
import { authorizationService } from "@/services/authorization";
import { billingService } from "@/services/billing";
import { getTenantServiceAuthOptions } from "@/services/tenant-service-route-access";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class BillingController extends BaseController {
  constructor() {
    super("tenant_credit_accounts");
  }

  private async getBillingAllowedAuthContext(request: FastifyRequest) {
    return authorizationService.getRequiredAuthContext(request.user?.sub, {
      ...getTenantServiceAuthOptions(request),
    });
  }

  @Get("/billing/account", { tenantServiceAccess: "recovery" })
  async getTenantAccount(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const data = await billingService.getTenantAccount(authContext);
    return ResponseHandler.success(data);
  }

  @Get("/billing/summary", { tenantServiceAccess: "recovery" })
  async getTenantSummary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const queryResult = BillingDateRangeQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await billingService.getTenantSummary(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/billing/ledger", { tenantServiceAccess: "recovery" })
  async listTenantLedger(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const queryResult = BillingLedgerQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await billingService.listTenantLedger(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/billing/feature-estimates", { tenantServiceAccess: "recovery" })
  async getTenantFeatureEstimates(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const data = await billingService.getTenantFeatureEstimates(authContext);
    return ResponseHandler.success(data);
  }

  @Get("/billing/subscription", { tenantServiceAccess: "recovery" })
  async getTenantSubscription(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const data = await billingService.getTenantSubscription(authContext);
    return ResponseHandler.success(data);
  }

  @Get("/billing/subscription-invoices", {
    tenantServiceAccess: "recovery",
  })
  async listTenantSubscriptionInvoices(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const queryResult = BillingSubscriptionInvoiceQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await billingService.listTenantSubscriptionInvoices(
      queryResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Get("/billing/subscription-invoices/:id", {
    tenantServiceAccess: "recovery",
  })
  async getTenantSubscriptionInvoice(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await this.getBillingAllowedAuthContext(request);
    const paramsResult = BillingSubscriptionInvoiceParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await billingService.getTenantSubscriptionInvoice(
      paramsResult.data.id,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/summary")
  async getPlatformSummary(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const data = await billingService.getPlatformSummary(authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/tenants")
  async listPlatformTenants(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = BillingTenantListQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await billingService.listPlatformTenants(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/tenants/:tenantId/manual-recharge")
  async manualRecharge(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = BillingTenantParamSchema.safeParse(request.params || {});
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = BillingManualRechargeSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await billingService.manualRecharge(
      paramsResult.data.tenantId,
      bodyResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/ledger")
  async listPlatformLedger(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = BillingLedgerQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await billingService.listPlatformLedger(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/events")
  async listPlatformBillingEvents(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = BillingEventQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await billingService.listPlatformBillingEvents(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/ai-usage-stats")
  async getPlatformAiUsageStats(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = BillingAiUsageStatsQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await billingService.getPlatformAiUsageStats(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/ai-usage-filter-options")
  async getPlatformAiUsageFilterOptions(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const data = await billingService.getPlatformAiUsageFilterOptions(authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/shadow-run")
  async runShadowBilling(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const bodyResult = BillingShadowRunSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await billingService.runShadowBilling(bodyResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Get("/platform/billing/pricing-rules")
  async listPricingRules(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const queryResult = BillingPricingRuleQuerySchema.safeParse(request.query || {});
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await billingService.listPricingRules(queryResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Post("/platform/billing/pricing-rules")
  async createPricingRule(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const bodyResult = BillingPricingRuleCreateSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await billingService.createPricingRule(bodyResult.data, authContext);
    return ResponseHandler.success(data);
  }

  @Patch("/platform/billing/pricing-rules/:id")
  async updatePricingRule(request: FastifyRequest, reply: FastifyReply) {
    const authContext = await authorizationService.getRequiredAuthContext(request.user?.sub);
    const paramsResult = BillingPricingRuleParamSchema.safeParse(request.params || {});
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const bodyResult = BillingPricingRuleUpdateSchema.safeParse(request.body || {});
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await billingService.updatePricingRule(
      paramsResult.data.id,
      bodyResult.data,
      authContext,
    );
    return ResponseHandler.success(data);
  }
}

export default new BillingController();
