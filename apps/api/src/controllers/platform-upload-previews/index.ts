import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import { platformFileObjectRepository } from "@/repositories/platform-file-objects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { resolveSignedStoredFileUrl } from "@/services/files/file-url-resolver";
import { Get } from "@/utils/decorators/route";

const SupplierLicensePreviewParamsSchema = z.object({
  id: z.string().uuid("无效的文件 ID"),
});

const SUPPLIER_MANAGE_PERMISSION = "platform.supplier.manage";
const SUPPLIER_VIEW_PERMISSION = "platform.supplier.view";

class PlatformUploadPreviewController extends PlatformBaseController {
  constructor() {
    super("platform-upload-previews");
  }

  @Get("/platform/uploads/supplier-business-license/:id/preview")
  async getSupplierBusinessLicensePreview(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const authContext = await this.getRequiredPlatformStaffContext(request);
    const parsed = SupplierLicensePreviewParamsSchema.safeParse(request.params);
    if (!parsed.success) throw Errors.fromZod(parsed.error);

    const file = await platformFileObjectRepository
      .findSupplierBusinessLicensePreviewById(parsed.data.id);
    this.assertSupplierLicensePreviewAccess(authContext, file);
    const previewUrl = await resolveSignedStoredFileUrl(file.object_key, {
      ttlSeconds: 600,
    });

    reply.header("Cache-Control", "private, no-store");
    reply.header("Pragma", "no-cache");
    reply.header("Referrer-Policy", "no-referrer");
    return reply.redirect(previewUrl);
  }

  private assertSupplierLicensePreviewAccess(
    authContext: AuthContext,
    file: Awaited<ReturnType<
      typeof platformFileObjectRepository.findSupplierBusinessLicensePreviewById
    >>,
  ): asserts file is NonNullable<typeof file> {
    if (
      !file ||
      file.tenant_id !== null ||
      file.scene !== "supplier_business_license" ||
      file.provider !== "tencent_cos" ||
      file.visibility !== "private" ||
      file.status !== "active" ||
      file.deleted_at !== null
    ) throw Errors.forbidden();

    if (file.owner_type === "supplier_business_license" && file.owner_id === null) {
      if (
        !authContext.employeeId ||
        file.created_by_employee_id !== authContext.employeeId
      ) throw Errors.forbidden();
      accessPolicyService.assertPermission(authContext, SUPPLIER_MANAGE_PERMISSION);
      return;
    }

    if (file.owner_type === "supplier" && file.owner_id) {
      accessPolicyService.assertPermission(authContext, SUPPLIER_VIEW_PERMISSION);
      return;
    }

    throw Errors.forbidden();
  }
}

export default new PlatformUploadPreviewController();
