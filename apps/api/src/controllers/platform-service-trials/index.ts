import type { FastifyRequest } from 'fastify';

import { PlatformBaseController } from '@/controllers/PlatformBaseController';
import { Errors } from '@/errors/error-factory';
import {
  PlatformServiceTrialAssignSchema,
  PlatformServiceTrialExtendSchema,
  PlatformServiceTrialGrantSchema,
  PlatformServiceTrialListQuerySchema,
  PlatformServiceTrialPolicyUpdateSchema,
  PlatformServiceTrialReviewSchema,
  PlatformServiceTrialRevokeSchema,
  ServiceTrialParamSchema,
} from '@/schema/service-trials';
import { platformServiceTrialService } from '@/services/platform-service-trials';
import { Get, Post, Put } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';

class PlatformServiceTrialsController extends PlatformBaseController {
  constructor() {
    super('platform-service-trials');
  }

  @Get('/platform/billing/service-trials', { tenantServiceAccess: 'read' })
  async listTrials(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const queryResult = PlatformServiceTrialListQuerySchema.safeParse(
      request.query || {},
    );
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await platformServiceTrialService.listTrials(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get('/platform/billing/service-trials/summary', {
    tenantServiceAccess: 'read',
  })
  async getSummary(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const data = await platformServiceTrialService.getSummary(authContext);
    return ResponseHandler.success(data);
  }

  @Get('/platform/billing/service-trials/:id', {
    tenantServiceAccess: 'read',
  })
  async getTrial(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const paramsResult = ServiceTrialParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);

    const data = await platformServiceTrialService.getTrial(
      authContext,
      paramsResult.data.id,
    );
    return ResponseHandler.success(data);
  }

  @Post('/platform/billing/service-trials', { tenantServiceAccess: 'write' })
  async grant(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const bodyResult = PlatformServiceTrialGrantSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformServiceTrialService.grant(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post('/platform/billing/service-trials/:id/review', {
    tenantServiceAccess: 'write',
  })
  async review(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const paramsResult = ServiceTrialParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformServiceTrialReviewSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformServiceTrialService.review(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post('/platform/billing/service-trials/:id/extend', {
    tenantServiceAccess: 'write',
  })
  async extend(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const paramsResult = ServiceTrialParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformServiceTrialExtendSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformServiceTrialService.extend(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post('/platform/billing/service-trials/:id/revoke', {
    tenantServiceAccess: 'write',
  })
  async revoke(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const paramsResult = ServiceTrialParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformServiceTrialRevokeSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformServiceTrialService.revoke(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Post('/platform/billing/service-trials/:id/assign', {
    tenantServiceAccess: 'write',
  })
  async assign(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const paramsResult = ServiceTrialParamSchema.safeParse(
      request.params || {},
    );
    if (!paramsResult.success) throw Errors.fromZod(paramsResult.error);
    const bodyResult = PlatformServiceTrialAssignSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformServiceTrialService.assign(
      authContext,
      paramsResult.data.id,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }

  @Get('/platform/billing/service-trial-policy', {
    tenantServiceAccess: 'read',
  })
  async getPolicy(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const data = await platformServiceTrialService.getPolicy(authContext);
    return ResponseHandler.success(data);
  }

  @Put('/platform/billing/service-trial-policy', {
    tenantServiceAccess: 'write',
  })
  async updatePolicy(request: FastifyRequest) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const bodyResult = PlatformServiceTrialPolicyUpdateSchema.safeParse(
      request.body || {},
    );
    if (!bodyResult.success) throw Errors.fromZod(bodyResult.error);

    const data = await platformServiceTrialService.updatePolicy(
      authContext,
      bodyResult.data,
    );
    return ResponseHandler.success(data);
  }
}

export default new PlatformServiceTrialsController();
