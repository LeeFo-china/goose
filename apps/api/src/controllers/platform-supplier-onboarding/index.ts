import type { FastifyRequest } from "fastify";
import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  SupplierIdentityCheckQuerySchema,
  SupplierOnboardingCreateSchema,
} from "@/schema/supplier-onboarding";
import { supplierOnboardingService } from "@/services/supplier-onboarding";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";

const MAX_IDEMPOTENCY_KEY_LENGTH = 120;

function requireIdempotencyKey(request: FastifyRequest) {
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

class PlatformSupplierOnboardingController extends PlatformBaseController {
  constructor() {
    super("platform-supplier-onboarding");
  }

  @Post("/platform/suppliers/onboarding")
  async onboardSupplier(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformAdminContext(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const parsed = SupplierOnboardingCreateSchema.safeParse(request.body ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    return ResponseHandler.success(
      await supplierOnboardingService.create(auth, parsed.data, idempotencyKey),
    );
  }

  @Get("/platform/suppliers/identity-check")
  async checkIdentity(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformAdminContext(request);
    const parsed = SupplierIdentityCheckQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    return ResponseHandler.success(
      await supplierOnboardingService.checkIdentity(
        auth,
        parsed.data.unified_social_credit_code,
      ),
    );
  }
}

export default new PlatformSupplierOnboardingController();
