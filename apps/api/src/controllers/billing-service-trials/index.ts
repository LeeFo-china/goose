import type { FastifyRequest } from 'fastify';

import { TenantBaseController } from '@/controllers/TenantBaseController';
import { Errors } from '@/errors/error-factory';
import {
  ServiceTrialApplicationCreateSchema,
  ServiceTrialListQuerySchema,
  ServiceTrialParamSchema,
  ServiceTrialWithdrawSchema,
} from '@/schema/service-trials';
import { tenantServiceTrialService } from '@/services/tenant-service-trials';
import { Get, Post } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';

class BillingServiceTrialsController extends TenantBaseController {
  constructor() {
    super('billing-service-trials');
  }

  @Get('/billing/service-trials', { tenantServiceAccess: 'read' })
  async listTrials(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const queryResult = ServiceTrialListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await tenantServiceTrialService.listTrials(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get('/billing/service-trials/current', { tenantServiceAccess: 'read' })
  async getCurrentTrial(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const data = await tenantServiceTrialService.getCurrentTrial(authContext);
    return ResponseHandler.success(data);
  }

  @Get('/billing/service-trials/applications/:id', {
    tenantServiceAccess: 'read',
  })
  async getTrial(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = ServiceTrialParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await tenantServiceTrialService.getTrial(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post('/billing/service-trials/applications', {
    tenantServiceAccess: 'recovery',
  })
  async apply(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const bodyResult = ServiceTrialApplicationCreateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await tenantServiceTrialService.apply(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post('/billing/service-trials/applications/:id/withdraw', {
    tenantServiceAccess: 'recovery',
  })
  async withdraw(request: FastifyRequest) {
    const authContext = await this.getRequiredTenantContext(request);
    const paramsResult = ServiceTrialParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = ServiceTrialWithdrawSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await tenantServiceTrialService.withdraw(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new BillingServiceTrialsController();
