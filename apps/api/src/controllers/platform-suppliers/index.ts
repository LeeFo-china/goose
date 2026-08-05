import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  PlatformSupplierCreateSchema,
  PlatformSupplierIdParamSchema,
  PlatformSupplierListQuerySchema,
  PlatformSupplierUpdateSchema,
  PlatformTenantSupplierSettingsCommandSchema,
  PlatformTenantSupplierSettingsParamSchema,
  SupplierAddressCreateSchema,
  SupplierAddressParamSchema,
  SupplierAddressUpdateSchema,
  SupplierBlacklistCommandSchema,
  SupplierChildListQuerySchema,
  SupplierContactCreateSchema,
  SupplierContactParamSchema,
  SupplierContactUpdateSchema,
  SupplierEventListQuerySchema,
  SupplierQualificationCreateSchema,
  SupplierQualificationParamSchema,
  SupplierQualificationRejectCommandSchema,
  SupplierRejectCommandSchema,
  SupplierQualificationTypeCreateSchema,
  SupplierQualificationTypeListQuerySchema,
  SupplierQualificationTypeUpdateSchema,
  SupplierQualificationUpdateSchema,
  SupplierServiceRegionCreateSchema,
  SupplierServiceRegionParamSchema,
  SupplierServiceRegionUpdateSchema,
  SupplierSuspendCommandSchema,
  SupplierCommandSchema,
} from "@/schema/platform-suppliers";
import { platformSuppliersService } from "@/services/platform-suppliers";
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

class PlatformSuppliersController extends PlatformBaseController {
  constructor() {
    super("platform-suppliers");
  }

  @Get("/platform/suppliers")
  async listSuppliers(request: FastifyRequest) {
    const auth = await this.getSupplierViewContext(request);
    const query = this.parse(PlatformSupplierListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformSuppliersService.listSuppliers(auth, query),
    );
  }

  @Post("/platform/suppliers")
  async createSupplier(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const key = requireIdempotencyKey(request);
    const input = this.parse(PlatformSupplierCreateSchema, request.body);
    return ResponseHandler.success(await platformSuppliersService.createSupplier(
      auth,
      { supplierId: crypto.randomUUID(), input, idempotencyKey: key },
    ));
  }

  @Get("/platform/supplier-qualification-types")
  async listQualificationTypes(request: FastifyRequest) {
    const auth = await this.getSupplierViewContext(request);
    const query = this.parse(
      SupplierQualificationTypeListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await platformSuppliersService.listQualificationTypes(auth, query),
    );
  }

  @Post("/platform/supplier-qualification-types")
  async createQualificationType(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const key = requireIdempotencyKey(request);
    const input = this.parse(SupplierQualificationTypeCreateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.createQualificationType(auth, input, key),
    );
  }

  @Patch("/platform/supplier-qualification-types/:id")
  async updateQualificationType(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierQualificationTypeUpdateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.updateQualificationType(auth, {
        qualification_type_id: id,
        ...input,
      }),
    );
  }

  @Get("/platform/suppliers/:id")
  async getSupplier(request: FastifyRequest) {
    const auth = await this.getSupplierViewContext(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    return ResponseHandler.success(
      await platformSuppliersService.getSupplier(auth, id),
    );
  }

  @Patch("/platform/suppliers/:id")
  async updateSupplier(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(PlatformSupplierUpdateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.updateSupplier(auth, id, input),
    );
  }

  @Post("/platform/suppliers/:id/submit")
  async submitSupplier(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierCommandSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.mutateSupplier(
        auth, id, "submit", input, key,
      ),
    );
  }

  @Post("/platform/suppliers/:id/approve")
  async approveSupplier(request: FastifyRequest) {
    const auth = await this.getSupplierReviewContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierCommandSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.mutateSupplier(
        auth, id, "approve", input, key,
      ),
    );
  }

  @Post("/platform/suppliers/:id/reject")
  async rejectSupplier(request: FastifyRequest) {
    const auth = await this.getSupplierReviewContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(
      SupplierRejectCommandSchema,
      request.body,
    );
    return ResponseHandler.success(
      await platformSuppliersService.mutateSupplier(
        auth, id, "reject", input, key,
      ),
    );
  }

  @Post("/platform/suppliers/:id/suspend")
  async suspendSupplier(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(
      SupplierSuspendCommandSchema,
      request.body,
    );
    return ResponseHandler.success(
      await platformSuppliersService.mutateSupplier(
        auth, id, "suspend", input, key,
      ),
    );
  }

  @Post("/platform/suppliers/:id/resume")
  async resumeSupplier(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierCommandSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.mutateSupplier(
        auth, id, "resume", input, key,
      ),
    );
  }

  @Post("/platform/suppliers/:id/blacklist")
  async blacklistSupplier(request: FastifyRequest) {
    const auth = await this.getSupplierBlacklistContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierBlacklistCommandSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.mutateSupplier(
        auth, id, "blacklist", input, key,
      ),
    );
  }

  @Get("/platform/suppliers/:id/qualifications")
  async listQualifications(request: FastifyRequest) {
    const auth = await this.getSupplierViewContext(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const query = this.parse(SupplierChildListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformSuppliersService.listQualifications(auth, {
        ...query,
        supplier_id: id,
      }),
    );
  }

  @Post("/platform/suppliers/:id/qualifications")
  async createQualification(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierQualificationCreateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.createQualification(auth, {
        ...input,
        supplier_id: id,
      }, key),
    );
  }

  @Patch("/platform/suppliers/:id/qualifications/:qualificationId")
  async updateQualification(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const params = this.parse(SupplierQualificationParamSchema, request.params);
    const input = this.parse(SupplierQualificationUpdateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.updateQualification(auth, {
        ...input,
        supplier_id: params.id,
        qualification_id: params.qualificationId,
      }),
    );
  }

  @Post("/platform/suppliers/:id/qualifications/:qualificationId/verify")
  async verifyQualification(request: FastifyRequest) {
    const auth = await this.getSupplierReviewContext(request);
    const key = requireIdempotencyKey(request);
    const params = this.parse(SupplierQualificationParamSchema, request.params);
    const input = this.parse(SupplierCommandSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.reviewQualification(
        auth,
        params.id,
        params.qualificationId,
        "verified",
        input,
        key,
      ),
    );
  }

  @Post("/platform/suppliers/:id/qualifications/:qualificationId/reject")
  async rejectQualification(request: FastifyRequest) {
    const auth = await this.getSupplierReviewContext(request);
    const key = requireIdempotencyKey(request);
    const params = this.parse(SupplierQualificationParamSchema, request.params);
    const input = this.parse(
      SupplierQualificationRejectCommandSchema,
      request.body,
    );
    return ResponseHandler.success(
      await platformSuppliersService.reviewQualification(
        auth,
        params.id,
        params.qualificationId,
        "rejected",
        input,
        key,
      ),
    );
  }

  @Get("/platform/suppliers/:id/service-regions")
  async listServiceRegions(request: FastifyRequest) {
    const auth = await this.getSupplierViewContext(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const query = this.parse(SupplierChildListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformSuppliersService.listServiceRegions(auth, {
        ...query,
        supplier_id: id,
      }),
    );
  }

  @Post("/platform/suppliers/:id/service-regions")
  async createServiceRegion(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierServiceRegionCreateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.createServiceRegion(auth, {
        ...input,
        supplier_id: id,
      }, key),
    );
  }

  @Patch("/platform/suppliers/:id/service-regions/:regionId")
  async updateServiceRegion(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const params = this.parse(SupplierServiceRegionParamSchema, request.params);
    const input = this.parse(SupplierServiceRegionUpdateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.upsertServiceRegion(auth, {
        ...input,
        supplier_id: params.id,
        region_id: params.regionId,
      }),
    );
  }

  @Get("/platform/suppliers/:id/addresses")
  async listAddresses(request: FastifyRequest) {
    const auth = await this.getSupplierViewContext(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const query = this.parse(SupplierChildListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformSuppliersService.listAddresses(auth, {
        ...query,
        supplier_id: id,
      }),
    );
  }

  @Post("/platform/suppliers/:id/addresses")
  async createAddress(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierAddressCreateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.createAddress(auth, {
        ...input,
        supplier_id: id,
      }, key),
    );
  }

  @Patch("/platform/suppliers/:id/addresses/:addressId")
  async updateAddress(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const params = this.parse(SupplierAddressParamSchema, request.params);
    const input = this.parse(SupplierAddressUpdateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.upsertAddress(auth, {
        ...input,
        supplier_id: params.id,
        address_id: params.addressId,
      }),
    );
  }

  @Get("/platform/suppliers/:id/contacts")
  async listContacts(request: FastifyRequest) {
    const auth = await this.getSupplierViewContext(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const query = this.parse(SupplierChildListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformSuppliersService.listContacts(auth, {
        ...query,
        supplier_id: id,
      }),
    );
  }

  @Post("/platform/suppliers/:id/contacts")
  async createContact(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const input = this.parse(SupplierContactCreateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.createContact(auth, {
        ...input,
        supplier_id: id,
      }, key),
    );
  }

  @Patch("/platform/suppliers/:id/contacts/:contactId")
  async updateContact(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const params = this.parse(SupplierContactParamSchema, request.params);
    const input = this.parse(SupplierContactUpdateSchema, request.body);
    return ResponseHandler.success(
      await platformSuppliersService.upsertContact(auth, {
        ...input,
        supplier_id: params.id,
        contact_id: params.contactId,
      }),
    );
  }

  @Get("/platform/suppliers/:id/events")
  async listEvents(request: FastifyRequest) {
    const auth = await this.getSupplierViewContext(request);
    const { id } = this.parse(PlatformSupplierIdParamSchema, request.params);
    const query = this.parse(SupplierEventListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformSuppliersService.listEvents(auth, {
        ...query,
        supplier_id: id,
      }),
    );
  }

  @Get("/platform/tenant-supplier-settings/:tenantId")
  async getTenantSupplierSettings(request: FastifyRequest) {
    const auth = await this.getSupplierViewContext(request);
    const { tenantId } = this.parse(
      PlatformTenantSupplierSettingsParamSchema,
      request.params,
    );
    return ResponseHandler.success(
      await platformSuppliersService.getTenantSupplierSettings(auth, tenantId),
    );
  }

  @Patch("/platform/tenant-supplier-settings/:tenantId")
  async setTenantSupplierSettings(request: FastifyRequest) {
    const auth = await this.getSupplierManageContext(request);
    const key = requireIdempotencyKey(request);
    const { tenantId } = this.parse(
      PlatformTenantSupplierSettingsParamSchema,
      request.params,
    );
    const input = this.parse(
      PlatformTenantSupplierSettingsCommandSchema,
      request.body,
    );
    return ResponseHandler.success(
      await platformSuppliersService.setTenantSupplierSettings(auth, {
        ...input,
        tenantId,
        idempotencyKey: key,
      }),
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

  private getSupplierViewContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.supplier.view");
  }

  private getSupplierManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.supplier.manage");
  }

  private getSupplierReviewContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.supplier.review");
  }

  private getSupplierBlacklistContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, "platform.supplier.blacklist");
  }
}

export default new PlatformSuppliersController();
