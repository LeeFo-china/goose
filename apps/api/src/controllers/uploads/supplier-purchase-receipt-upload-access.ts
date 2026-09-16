import { Errors } from "@/errors/error-factory";
import { authorizationService } from "@/services/authorization";
import { supplierPurchaseFulfillmentsService } from
  "@/services/supplier-purchase-fulfillments";
import type { JwtPayload } from "@/utils/jwt";

export async function assertSupplierPurchaseReceiptUploadSceneAccess(
  user: JwtPayload,
  scene: string,
  orderId?: string,
  receiptId?: string,
  authOptions?: Parameters<typeof authorizationService.getRequiredAuthContext>[1],
) {
  if (scene !== "supplier_purchase_receipt_delivery_note") return null;
  if (!user.sub || !orderId || !receiptId) throw Errors.forbidden();
  const auth = await authorizationService.getRequiredAuthContext(
    user.sub,
    authOptions,
  );
  const scope = await supplierPurchaseFulfillmentsService
    .authorizeDeliveryNoteUpload(auth, orderId);
  return {
    tenantId: scope.tenantId,
    employeeId: scope.employeeId,
    customerId: null,
    visitorId: null,
    isPlatformAdmin: false,
    isPlatformIdentity: false,
  };
}
