import type { FastifyRequest } from 'fastify';
import { PlatformBaseController } from '@/controllers/PlatformBaseController';
import { Errors } from '@/errors/error-factory';
import {
  CustomerRenderingSettingsEmptyQuerySchema,
  CustomerRenderingSettingsTenantParamsSchema,
  CustomerRenderingSettingsUpdateSchema,
} from '@/schema/platform-customer-rendering-settings';
import {
  platformCustomerRenderingSettingsService,
  type PlatformCustomerRenderingSettingsService,
} from '@/services/platform-customer-rendering-settings';
import { Get, Put } from '@/utils/decorators/route';
import { ResponseHandler } from '@/utils/response';

type ControllerService = Pick<PlatformCustomerRenderingSettingsService, 'get' | 'update'>;

export class PlatformCustomerRenderingSettingsController extends PlatformBaseController {
  constructor(private readonly service: ControllerService = platformCustomerRenderingSettingsService) {
    super('platform-customer-rendering-settings');
  }

  @Get('/platform/customer-rendering-settings/:tenantId')
  async getSettings(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const params = CustomerRenderingSettingsTenantParamsSchema.safeParse(request.params || {});
    if (!params.success) throw Errors.fromZod(params.error);
    const query = CustomerRenderingSettingsEmptyQuerySchema.safeParse(request.query || {});
    if (!query.success) throw Errors.fromZod(query.error);
    return ResponseHandler.success(await this.service.get(auth, params.data.tenantId));
  }

  @Put('/platform/customer-rendering-settings/:tenantId')
  async putSettings(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformSuperAdminContext(request);
    const params = CustomerRenderingSettingsTenantParamsSchema.safeParse(request.params || {});
    if (!params.success) throw Errors.fromZod(params.error);
    const query = CustomerRenderingSettingsEmptyQuerySchema.safeParse(request.query || {});
    if (!query.success) throw Errors.fromZod(query.error);
    const body = CustomerRenderingSettingsUpdateSchema.safeParse(request.body || {});
    if (!body.success) throw Errors.fromZod(body.error);
    return ResponseHandler.success(await this.service.update(auth, params.data.tenantId, body.data));
  }
}

export default new PlatformCustomerRenderingSettingsController();
