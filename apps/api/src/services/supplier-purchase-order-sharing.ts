import { randomBytes } from "node:crypto";

import { Errors } from "@/errors/error-factory";
import {
  supplierPurchaseOrderSharingRepository,
  type SupplierPurchaseOrderExportSnapshot,
  type SupplierPurchaseOrderShareLink,
  type SupplierPurchaseOrderShareStatus,
} from "@/repositories/supplier-purchase-order-sharing";
import { supplierPurchaseBatchesRepository } from
  "@/repositories/supplier-purchase-batches";
import type {
  SupplierPurchaseOrderPublicConfirmViewInput,
  SupplierPurchaseOrderShareLinkCreateInput,
} from "@/schema/supplier-purchase-order-sharing";
import type { AuthContext } from "@/services/authorization";
import { supplierPurchaseBatchAccessService } from
  "@/services/supplier-purchase-batch-access";
import {
  supplierPurchaseOrderAccessService,
} from "@/services/supplier-purchase-order-access";
import {
  exportPurchaseBatchXlsx,
  exportPurchaseOrderPdf,
  exportPurchaseOrderXlsx,
  toPurchaseOrderPrintPreview,
} from "@/services/supplier-purchase-order-exporters";

type OrderAccessPort = Pick<
  typeof supplierPurchaseOrderAccessService,
  "requireRead" | "requireManage" | "assertProjectRead" | "assertProjectUpdate"
>;
type BatchAccessPort = Pick<
  typeof supplierPurchaseBatchAccessService,
  "requireView" | "getVisibleProjectIds" | "assertProjectRead"
>;
type BatchRepositoryPort = Pick<
  typeof supplierPurchaseBatchesRepository,
  "findBatch"
>;
type SharingRepositoryPort = Pick<
  typeof supplierPurchaseOrderSharingRepository,
  | "findShareLinkByIdempotency"
  | "createShareLink"
  | "findActiveShareLinkByToken"
  | "recordViewed"
  | "confirmViewed"
  | "ensureFulfillmentFromShareConfirmation"
  | "getOrderSnapshot"
  | "getBatchOrderSnapshots"
  | "getShareStatus"
>;

export type SupplierPurchaseOrderSharingServiceDependencies = {
  orderAccess?: OrderAccessPort;
  batchAccess?: BatchAccessPort;
  batchRepository?: BatchRepositoryPort;
  repository?: SharingRepositoryPort;
  nowFactory?: () => Date;
  tokenFactory?: () => string;
  publicBaseUrl?: string;
};

export class SupplierPurchaseOrderSharingService {
  private readonly orderAccess: OrderAccessPort;
  private readonly batchAccess: BatchAccessPort;
  private readonly batchRepository: BatchRepositoryPort;
  private readonly repository: SharingRepositoryPort;
  private readonly nowFactory: () => Date;
  private readonly tokenFactory: () => string;
  private readonly publicBaseUrl: string;

  constructor(
    dependencies: SupplierPurchaseOrderSharingServiceDependencies = {},
  ) {
    this.orderAccess = dependencies.orderAccess ??
      supplierPurchaseOrderAccessService;
    this.batchAccess = dependencies.batchAccess ??
      supplierPurchaseBatchAccessService;
    this.batchRepository = dependencies.batchRepository ??
      supplierPurchaseBatchesRepository;
    this.repository = dependencies.repository ??
      supplierPurchaseOrderSharingRepository;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.tokenFactory = dependencies.tokenFactory ?? buildShareToken;
    this.publicBaseUrl = dependencies.publicBaseUrl ??
      normalizeBaseUrl(
        process.env.SUPPLIER_PURCHASE_ORDER_PUBLIC_BASE_URL ??
          process.env.API_BASE_URL ??
          process.env.GOOES_API_BASE_URL ??
          "",
      );
  }

  async createShareLink(
    auth: AuthContext,
    orderId: string,
    input: SupplierPurchaseOrderShareLinkCreateInput,
    idempotencyKey: string,
  ) {
    const scope = await this.orderAccess.requireManage(auth);
    const snapshot = await this.requireEmployeeSnapshot(
      auth,
      scope.tenantId,
      orderId,
      "update",
    );
    if (snapshot.order.status !== "submitted") {
      throw Errors.business(
        409,
        "只有已提交采购单可以分享给供应商",
        "SUPPLIER_PURCHASE_ORDER_SHARE_NOT_ALLOWED",
      );
    }

    const existing = await this.repository.findShareLinkByIdempotency({
      tenantId: scope.tenantId,
      orderId,
      employeeId: scope.employeeId,
      idempotencyKey,
    });
    if (existing) return this.serializeShareLink(existing, true);

    const expiresAt = this.resolveExpiresAt(input.expires_at);
    const link = await this.repository.createShareLink({
      tenantId: scope.tenantId,
      orderId,
      tenantSupplierId: snapshot.order.tenant_supplier_id,
      supplierId: snapshot.order.supplier_id,
      shareToken: this.tokenFactory(),
      expiresAt,
      employeeId: scope.employeeId,
      idempotencyKey,
    });
    if (!link) {
      throw Errors.business(
        409,
        "采购单分享链接幂等冲突",
        "SUPPLIER_PURCHASE_ORDER_SHARE_IDEMPOTENCY_CONFLICT",
      );
    }
    return this.serializeShareLink(link, false);
  }

  async getEmployeePrintPreview(auth: AuthContext, orderId: string) {
    const scope = await this.orderAccess.requireRead(auth);
    const snapshot = await this.requireEmployeeSnapshot(
      auth,
      scope.tenantId,
      orderId,
      "read",
    );
    return toPurchaseOrderPrintPreview(snapshot);
  }

  async exportEmployeeOrderPdf(auth: AuthContext, orderId: string) {
    const scope = await this.orderAccess.requireRead(auth);
    const snapshot = await this.requireEmployeeSnapshot(
      auth,
      scope.tenantId,
      orderId,
      "read",
    );
    return exportPurchaseOrderPdf(snapshot);
  }

  async exportEmployeeOrderXlsx(auth: AuthContext, orderId: string) {
    const scope = await this.orderAccess.requireRead(auth);
    const snapshot = await this.requireEmployeeSnapshot(
      auth,
      scope.tenantId,
      orderId,
      "read",
    );
    return exportPurchaseOrderXlsx(snapshot);
  }

  async exportBatchXlsx(auth: AuthContext, batchId: string) {
    const scope = await this.batchAccess.requireView(auth);
    const batch = await this.batchRepository.findBatch(scope.tenantId, batchId);
    if (!batch) {
      throw Errors.business(
        404,
        "供应商采购批次不存在",
        "SUPPLIER_PURCHASE_BATCH_NOT_FOUND",
      );
    }
    await this.batchAccess.assertProjectRead(auth, batch.project_id);
    const visibleProjectIds = await this.batchAccess.getVisibleProjectIds(auth);
    if (visibleProjectIds && !visibleProjectIds.includes(batch.project_id)) {
      throw Errors.forbidden();
    }
    const snapshots = await this.repository.getBatchOrderSnapshots(
      scope.tenantId,
      batchId,
    );
    return exportPurchaseBatchXlsx(snapshots, batch.batch_no);
  }

  async getPublicOrder(token: string) {
    const link = await this.requirePublicLink(token);
    const viewed = await this.repository.recordViewed(
      link,
      this.nowFactory().toISOString(),
    );
    const snapshot = await this.requireSnapshotForPublicLink(viewed);
    return toPurchaseOrderPrintPreview({ ...snapshot, share_link: viewed });
  }

  async confirmPublicView(
    token: string,
    input: SupplierPurchaseOrderPublicConfirmViewInput,
  ) {
    const link = await this.requirePublicLink(token);
    const confirmed = await this.repository.confirmViewed({
      link,
      confirmedAt: input.confirmed_at,
      remark: input.remark ?? null,
    });
    await this.repository.ensureFulfillmentFromShareConfirmation({
      link: confirmed,
      confirmedAt: input.confirmed_at,
      remark: input.remark ?? null,
    });
    return {
      id: confirmed.id,
      status: "confirmed",
      confirmed_at: confirmed.confirmed_at,
      idempotent: link.confirmed_at !== null,
    };
  }

  async getPublicPrintPreview(token: string) {
    const link = await this.requirePublicLink(token);
    const snapshot = await this.requireSnapshotForPublicLink(link);
    return toPurchaseOrderPrintPreview({ ...snapshot, share_link: link });
  }

  async exportPublicOrderPdf(token: string) {
    const link = await this.requirePublicLink(token);
    const snapshot = await this.requireSnapshotForPublicLink(link);
    return exportPurchaseOrderPdf({ ...snapshot, share_link: link });
  }

  async exportPublicOrderXlsx(token: string) {
    const link = await this.requirePublicLink(token);
    const snapshot = await this.requireSnapshotForPublicLink(link);
    return exportPurchaseOrderXlsx({ ...snapshot, share_link: link });
  }

  private async requireEmployeeSnapshot(
    auth: AuthContext,
    tenantId: string,
    orderId: string,
    mode: "read" | "update",
  ) {
    const snapshot = await this.repository.getOrderSnapshot(tenantId, orderId);
    if (!snapshot) {
      throw Errors.business(
        404,
        "供应商采购单不存在",
        "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
      );
    }
    if (mode === "update") {
      await this.orderAccess.assertProjectUpdate(auth, snapshot.order.project_id);
    } else {
      await this.orderAccess.assertProjectRead(auth, snapshot.order.project_id);
    }
    return snapshot;
  }

  private async requirePublicLink(token: string) {
    const link = await this.repository.findActiveShareLinkByToken(
      token,
      this.nowFactory().toISOString(),
    );
    if (!link) {
      throw Errors.business(
        404,
        "采购单分享链接不存在或已过期",
        "SUPPLIER_PURCHASE_ORDER_SHARE_LINK_NOT_FOUND",
      );
    }
    return link;
  }

  private async requireSnapshotForPublicLink(
    link: SupplierPurchaseOrderShareLink,
  ): Promise<SupplierPurchaseOrderExportSnapshot> {
    const snapshot = await this.repository.getOrderSnapshot(
      link.tenant_id,
      link.supplier_purchase_order_id,
    );
    if (!snapshot || snapshot.order.supplier_id !== link.supplier_id) {
      throw Errors.business(
        404,
        "采购单分享链接不可用",
        "SUPPLIER_PURCHASE_ORDER_SHARE_LINK_NOT_AVAILABLE",
      );
    }
    return snapshot;
  }

  private async serializeShareLink(
    link: SupplierPurchaseOrderShareLink,
    idempotent: boolean,
  ) {
    const sharePath = `/public/supplier-purchase-orders/${link.share_token}`;
    return {
      id: link.id,
      supplier_purchase_order_id: link.supplier_purchase_order_id,
      token: link.share_token,
      share_path: sharePath,
      public_url: this.publicBaseUrl
        ? `${this.publicBaseUrl}${sharePath}`
        : null,
      expires_at: link.expires_at,
      status: link.status,
      idempotent,
      share_status: await this.getShareStatus(
        link.tenant_id,
        link.supplier_purchase_order_id,
      ),
    };
  }

  private getShareStatus(
    tenantId: string,
    orderId: string,
  ): Promise<SupplierPurchaseOrderShareStatus> {
    return this.repository.getShareStatus({
      tenantId,
      orderId,
      checkedAt: this.nowFactory().toISOString(),
    });
  }

  private resolveExpiresAt(input?: string | null) {
    const now = this.nowFactory();
    const defaultExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiresAt = input ? new Date(input) : defaultExpiresAt;
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
      throw Errors.business(
        400,
        "分享链接过期时间必须晚于当前时间",
        "SUPPLIER_PURCHASE_ORDER_SHARE_EXPIRY_INVALID",
      );
    }
    return expiresAt.toISOString();
  }
}

function buildShareToken() {
  return `pos_${randomBytes(32).toString("base64url")}`;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export const supplierPurchaseOrderSharingService =
  new SupplierPurchaseOrderSharingService();
