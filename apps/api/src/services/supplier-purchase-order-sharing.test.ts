import { describe, expect, mock, test } from "bun:test";

import { SupplierPurchaseOrderSharingService } from
  "@/services/supplier-purchase-order-sharing";
import type { AuthContext } from "@/services/authorization";

const TENANT_ID = "63000000-0000-4000-8000-000000000001";
const ORDER_ID = "63000000-0000-4000-8000-000000000002";
const PROJECT_ID = "63000000-0000-4000-8000-000000000003";
const SUPPLIER_ID = "63000000-0000-4000-8000-000000000004";
const TENANT_SUPPLIER_ID = "63000000-0000-4000-8000-000000000005";
const EMPLOYEE_ID = "63000000-0000-4000-8000-000000000006";
const AUTH_USER_ID = "63000000-0000-4000-8000-000000000007";
const BATCH_ID = "63000000-0000-4000-8000-000000000008";
const TOKEN = "pos_0123456789abcdefghijklmnopqrstuvwxyzABCDE";
const NOW = new Date("2026-09-04T00:00:00.000Z");

const auth = {
  tenantId: TENANT_ID,
  employeeId: EMPLOYEE_ID,
  authUserId: AUTH_USER_ID,
  permissions: [],
} as unknown as AuthContext;

describe("SupplierPurchaseOrderSharingService", () => {
  test("creates a share link only for a submitted order and replays idempotent result", async () => {
    const existing = shareLink();
    const repository = {
      getOrderSnapshot: mock(async () => snapshot("submitted")),
      findShareLinkByIdempotency: mock(async () => existing),
      createShareLink: mock(async () => shareLink()),
    };
    const service = serviceWith({ repository });

    const result = await service.createShareLink(
      auth,
      ORDER_ID,
      {},
      "share-1",
    );

    expect(result).toMatchObject({
      token: TOKEN,
      share_path: `/public/supplier-purchase-orders/${TOKEN}`,
      idempotent: true,
    });
    expect(repository.createShareLink).not.toHaveBeenCalled();
  });

  test("rejects sharing draft orders", async () => {
    const service = serviceWith({
      repository: {
        getOrderSnapshot: mock(async () => snapshot("draft")),
        findShareLinkByIdempotency: mock(async () => null),
        createShareLink: mock(async () => shareLink()),
      },
    });

    await expect(service.createShareLink(auth, ORDER_ID, {}, "share-1"))
      .rejects.toMatchObject({
        code: "SUPPLIER_PURCHASE_ORDER_SHARE_NOT_ALLOWED",
      });
  });

  test("public detail records view and confirm-view is idempotent by state", async () => {
    const link = shareLink({ viewed_count: 1 });
    const confirmed = shareLink({
      viewed_count: 2,
      confirmed_at: "2026-09-04T01:00:00.000Z",
    });
    const repository = {
      findActiveShareLinkByToken: mock(async () => link),
      recordViewed: mock(async () => ({ ...link, viewed_count: 2 })),
      getOrderSnapshot: mock(async () => snapshot("submitted")),
      confirmViewed: mock(async () => confirmed),
    };
    const service = serviceWith({ repository });

    const detail = await service.getPublicOrder(TOKEN);
    const result = await service.confirmPublicView(TOKEN, {
      confirmed_at: "2026-09-04T01:00:00+00:00",
    });

    expect(detail.order.order_no).toBe("PO-20260904-00000001");
    expect(repository.recordViewed).toHaveBeenCalledWith(
      link,
      NOW.toISOString(),
    );
    expect(result).toEqual({
      id: link.id,
      status: "confirmed",
      confirmed_at: "2026-09-04T01:00:00.000Z",
      idempotent: false,
    });
  });

  test("exports a batch after asserting batch project access", async () => {
    const repository = {
      getBatchOrderSnapshots: mock(async () => [snapshot("submitted")]),
    };
    const batchAccess = {
      requireView: mock(async () => ({
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        authUserId: AUTH_USER_ID,
      })),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      assertProjectRead: mock(async () => undefined),
    };
    const batchRepository = {
      findBatch: mock(async () => ({
        id: BATCH_ID,
        batch_no: "PB-20260904-00000001",
        project_id: PROJECT_ID,
      })),
    };
    const service = serviceWith({
      repository,
      batchAccess,
      batchRepository,
    });

    const file = await service.exportBatchXlsx(auth, BATCH_ID);

    expect(batchAccess.assertProjectRead).toHaveBeenCalledWith(
      auth,
      PROJECT_ID,
    );
    expect(repository.getBatchOrderSnapshots).toHaveBeenCalledWith(
      TENANT_ID,
      BATCH_ID,
    );
    expect(file.content.subarray(0, 2).toString()).toBe("PK");
  });
});

function serviceWith(input: {
  repository: Record<string, unknown>;
  batchAccess?: Record<string, unknown>;
  batchRepository?: Record<string, unknown>;
}) {
  return new SupplierPurchaseOrderSharingService({
    orderAccess: {
      requireRead: mock(async () => ({
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        authUserId: AUTH_USER_ID,
      })),
      requireManage: mock(async () => ({
        tenantId: TENANT_ID,
        employeeId: EMPLOYEE_ID,
        authUserId: AUTH_USER_ID,
      })),
      assertProjectRead: mock(async () => undefined),
      assertProjectUpdate: mock(async () => undefined),
    },
    batchAccess: input.batchAccess as never,
    batchRepository: input.batchRepository as never,
    repository: input.repository as never,
    nowFactory: () => NOW,
    tokenFactory: () => TOKEN,
    publicBaseUrl: "https://api-dev.goodcms.cn",
  });
}

function shareLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "63000000-0000-4000-8000-000000000009",
    tenant_id: TENANT_ID,
    supplier_purchase_order_id: ORDER_ID,
    tenant_supplier_id: TENANT_SUPPLIER_ID,
    supplier_id: SUPPLIER_ID,
    share_token: TOKEN,
    status: "active",
    expires_at: "2026-10-04T00:00:00.000Z",
    created_by_employee_id: EMPLOYEE_ID,
    idempotency_key: "share-1",
    last_viewed_at: null,
    viewed_count: 0,
    confirmed_at: null,
    confirm_remark: null,
    created_at: "2026-09-04T00:00:00.000Z",
    updated_at: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

function snapshot(status: "draft" | "submitted") {
  return {
    order: {
      id: ORDER_ID,
      tenant_id: TENANT_ID,
      project_id: PROJECT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      supplier_id: SUPPLIER_ID,
      order_no: "PO-20260904-00000001",
      status,
      currency: "CNY",
      expected_delivery_date: "2026-09-10",
      remark: null,
      priced_at: "2026-09-04T00:00:00.000Z",
      subtotal_amount: "100.00",
      tax_amount: "0.00",
      total_amount: "100.00",
      purchase_requisition_id: null,
      purchase_batch_id: BATCH_ID,
      version: 1,
      created_by_employee_id: EMPLOYEE_ID,
      updated_by_employee_id: EMPLOYEE_ID,
      submitted_by_employee_id: EMPLOYEE_ID,
      submitted_at: "2026-09-04T00:00:00.000Z",
      cancelled_by_employee_id: null,
      cancelled_at: null,
      cancel_reason: null,
      created_at: "2026-09-04T00:00:00.000Z",
      updated_at: "2026-09-04T00:00:00.000Z",
      project: {
        id: PROJECT_ID,
        name: "Project A",
        address: "Address A",
        status: "active",
      },
      supplier: {
        id: SUPPLIER_ID,
        code: "SUP-A",
        name: "Supplier A",
        legal_name: "Supplier A Ltd",
        onboarding_status: "approved",
        operational_status: "active",
      },
      purchase_requisition: null,
    },
    items: [],
  } as const;
}
