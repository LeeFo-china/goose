import { TenantBaseController } from "@/controllers/TenantBaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { SupplierCommandSchema } from "@/schema/platform-suppliers";
import {
  SupplierContractCreateSchema,
  SupplierContractParamSchema,
  SupplierContractTerminateCommandSchema,
  SupplierContractUpdateSchema,
  TenantSupplierBlacklistCommandSchema,
  TenantSupplierChildListQuerySchema,
  TenantSupplierCodeAllocationSchema,
  TenantSupplierContractPolicySchema,
  TenantSupplierDirectoryQuerySchema,
  TenantSupplierEventListQuerySchema,
  TenantSupplierIdParamSchema,
  TenantSupplierListQuerySchema,
  TenantSupplierPrivateCreateSchema,
  TenantSupplierSharedCreateSchema,
  TenantSupplierSuspendCommandSchema,
  TenantSupplierTerminateCommandSchema,
  TenantSupplierUpdateSchema,
  TenantPrivateSupplierUpdateSchema,
} from "@/schema/tenant-suppliers";
import { tenantSuppliersService } from "@/services/tenant-suppliers";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

const MAX_IDEMPOTENCY_KEY_LENGTH = 120;

function requireIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0]?.trim() : value?.trim();
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw Errors.business(
      400,
      "缺少有效的 Idempotency-Key",
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  return key;
}

class TenantSuppliersController extends TenantBaseController {
  constructor() {
    super("tenant-suppliers");
  }

  @Get("/supplier-settings")
  async getSettings(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    return ResponseHandler.success(
      await tenantSuppliersService.getSettings(auth),
    );
  }

  @Patch("/supplier-settings/contract-policy")
  async updateContractPolicy(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const input = this.parse(TenantSupplierContractPolicySchema, request.body);
    return ResponseHandler.success(
      await tenantSuppliersService.updateContractPolicy(auth, input),
    );
  }

  @Get("/suppliers")
  async listRelationships(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(TenantSupplierListQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantSuppliersService.listRelationships(auth, query),
    );
  }

  @Get("/suppliers/directory")
  async listDirectory(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(TenantSupplierDirectoryQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantSuppliersService.listDirectory(auth, query),
    );
  }

  @Post("/suppliers")
  async createRelationship(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const input = this.parse(TenantSupplierSharedCreateSchema, request.body);
    return ResponseHandler.success(
      await tenantSuppliersService.createSharedRelationship(auth, input, key),
    );
  }

  @Post("/suppliers/code-allocations")
  async allocateInternalCode(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    this.parse(TenantSupplierCodeAllocationSchema, request.body);
    return ResponseHandler.success(
      await tenantSuppliersService.allocateInternalCode(auth, key),
    );
  }

  @Post("/suppliers/private")
  async createPrivateSupplier(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const input = this.parse(TenantSupplierPrivateCreateSchema, request.body);
    return ResponseHandler.success(
      await tenantSuppliersService.createPrivateSupplier(auth, input, key),
    );
  }

  @Get("/suppliers/:id")
  async getRelationship(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    return ResponseHandler.success(
      await tenantSuppliersService.getRelationship(auth, id),
    );
  }

  @Patch("/suppliers/:id/master")
  async updatePrivateSupplierMaster(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    const input = this.parse(TenantPrivateSupplierUpdateSchema, request.body);
    return ResponseHandler.success(
      await tenantSuppliersService.updatePrivateSupplierMaster(auth, id, input),
    );
  }

  @Patch("/suppliers/:id")
  async updateRelationship(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    const input = this.parse(TenantSupplierUpdateSchema, request.body);
    return ResponseHandler.success(
      await tenantSuppliersService.updateRelationship(auth, id, input),
    );
  }

  @Post("/suppliers/:id/activate")
  async activateRelationship(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierCommandSchema, request.body);
    return ResponseHandler.success(
      await tenantSuppliersService.mutateRelationship(
        auth, id, "activate", input, key,
      ),
    );
  }

  @Post("/suppliers/:id/suspend")
  async suspendRelationship(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    const input = this.parse(
      TenantSupplierSuspendCommandSchema,
      request.body,
    );
    return ResponseHandler.success(
      await tenantSuppliersService.mutateRelationship(
        auth, id, "suspend", input, key,
      ),
    );
  }

  @Post("/suppliers/:id/terminate")
  async terminateRelationship(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    const input = this.parse(
      TenantSupplierTerminateCommandSchema,
      request.body,
    );
    return ResponseHandler.success(
      await tenantSuppliersService.mutateRelationship(
        auth, id, "terminate", input, key,
      ),
    );
  }

  @Post("/suppliers/:id/blacklist")
  async blacklistRelationship(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    const input = this.parse(
      TenantSupplierBlacklistCommandSchema,
      request.body,
    );
    return ResponseHandler.success(
      await tenantSuppliersService.mutateRelationship(
        auth, id, "blacklist", input, key,
      ),
    );
  }

  @Get("/suppliers/:id/order-eligibility")
  async getOrderEligibility(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    return ResponseHandler.success(
      await tenantSuppliersService.getOrderEligibility(auth, id),
    );
  }

  @Get("/suppliers/:id/contracts")
  async listContracts(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    const query = this.parse(TenantSupplierChildListQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantSuppliersService.listContracts(auth, id, query),
    );
  }

  @Post("/suppliers/:id/contracts")
  async createContract(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierContractCreateSchema, request.body);
    return ResponseHandler.success(
      await tenantSuppliersService.createContract(
        auth,
        id,
        crypto.randomUUID(),
        input,
        key,
      ),
    );
  }

  @Patch("/suppliers/:id/contracts/:contractId")
  async updateContract(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const params = this.parse(SupplierContractParamSchema, request.params);
    const input = this.parse(SupplierContractUpdateSchema, request.body);
    return ResponseHandler.success(
      await tenantSuppliersService.updateContract(
        auth,
        params.id,
        params.contractId,
        input,
      ),
    );
  }

  @Post("/suppliers/:id/contracts/:contractId/activate")
  async activateContract(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const params = this.parse(SupplierContractParamSchema, request.params);
    const input = this.parse(SupplierCommandSchema, request.body);
    return ResponseHandler.success(
      await tenantSuppliersService.mutateContract(
        auth,
        params.id,
        params.contractId,
        "activate",
        input,
        key,
      ),
    );
  }

  @Post("/suppliers/:id/contracts/:contractId/terminate")
  async terminateContract(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const params = this.parse(SupplierContractParamSchema, request.params);
    const input = this.parse(
      SupplierContractTerminateCommandSchema,
      request.body,
    );
    return ResponseHandler.success(
      await tenantSuppliersService.mutateContract(
        auth,
        params.id,
        params.contractId,
        "terminate",
        input,
        key,
      ),
    );
  }

  @Get("/suppliers/:id/events")
  async listEvents(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(TenantSupplierIdParamSchema, request.params);
    const query = this.parse(TenantSupplierEventListQuerySchema, request.query);
    return ResponseHandler.success(
      await tenantSuppliersService.listEvents(auth, id, query),
    );
  }

  private parse<Schema extends z.ZodTypeAny>(
    schema: Schema,
    input: unknown,
  ): z.infer<Schema> {
    const result = schema.safeParse(input || {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}

export default new TenantSuppliersController();
