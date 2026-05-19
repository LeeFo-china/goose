import { BaseController } from "@/controllers/BaseController";
import { Errors } from "@/errors/error-factory";
import {
  CreateExternalReferrerSchema,
  ExternalReferrerListQuerySchema,
  UpdateExternalReferrerSchema,
} from "@/schema/project-referrals";
import { authorizationService } from "@/services/authorization";
import { externalReferrerService } from "@/services/external-referrers";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";

class ExternalReferrersController extends BaseController<
  typeof CreateExternalReferrerSchema,
  typeof UpdateExternalReferrerSchema
> {
  constructor() {
    super(
      "external_referrers",
      CreateExternalReferrerSchema,
      UpdateExternalReferrerSchema,
    );
  }

  private async getRequiredAuthContext(request: FastifyRequest) {
    const authContext = await authorizationService.getRequiredAuthContext(
      request.user?.sub,
    );
    request.authContext = authContext;
    return authContext;
  }

  override list = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const queryResult = ExternalReferrerListQuerySchema.safeParse(request.query);
    if (!queryResult.success) throw Errors.fromZod(queryResult.error);

    const data = await externalReferrerService.listReferrers(
      authContext,
      queryResult.data,
    );
    return ResponseHandler.success(data);
  };

  override getById = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const data = await externalReferrerService.getReferrerById(
      authContext,
      idVerify.data.id,
    );
    return ResponseHandler.success(data);
  };

  override create = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const result = CreateExternalReferrerSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await externalReferrerService.createReferrer(
      authContext,
      result.data,
    );
    return ResponseHandler.success(data);
  };

  override update = async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = await this.getRequiredAuthContext(request);
    const idVerify = this.idParamSchema.safeParse(request.params);
    if (!idVerify.success) throw Errors.fromZod(idVerify.error);

    const result = UpdateExternalReferrerSchema.safeParse(request.body);
    if (!result.success) throw Errors.fromZod(result.error);

    const data = await externalReferrerService.updateReferrer(
      authContext,
      idVerify.data.id,
      result.data,
    );
    return ResponseHandler.success(data);
  };
}

export default new ExternalReferrersController();
