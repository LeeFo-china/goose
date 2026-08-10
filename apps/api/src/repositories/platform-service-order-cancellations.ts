import { Errors } from "@/errors/error-factory";
import type { OrderRecord } from "@/repositories/platform-service-order-records";
import { SupabaseDB } from "@/utils/supabase";

export type CancelableServiceOrderRecord = OrderRecord & {
  cancel_idempotency_key: string | null;
  cancel_claim_expires_at: string | null;
  close_reason: string | null;
  closed_by_employee_id: string | null;
};

export type ServiceOrderCancellationCommand = {
  tenantId: string;
  orderId: string;
  expectedVersion: number;
  idempotencyKey: string;
};

export type ClaimServiceOrderCancellationCommand =
  ServiceOrderCancellationCommand & {
    reason: "user_changed_product" | "user_cancelled";
    employeeId: string;
  };

export type FinalizeServiceOrderCancellationCommand =
  ServiceOrderCancellationCommand & {
    requireMissingPrepay: boolean;
  };

export type ServiceOrderCancellationResult = {
  idempotent: boolean;
  claimed: boolean;
  order: CancelableServiceOrderRecord | null;
  errorCode?: string;
};

type QueryResult = { data: unknown; error: unknown };
type CancellationClient = {
  rpc(
    name:
      | "platform_service_claim_pending_order_cancel"
      | "platform_service_cancel_pending_order",
    params: Record<string, unknown>,
  ): PromiseLike<QueryResult>;
};

export class PlatformServiceOrderCancellationRepository {
  constructor(
    private readonly clientProvider: () => CancellationClient = () =>
      SupabaseDB.getAdminClient() as unknown as CancellationClient,
  ) {}

  async claim(
    input: ClaimServiceOrderCancellationCommand,
  ): Promise<ServiceOrderCancellationResult> {
    const { data, error } = await this.clientProvider().rpc(
      "platform_service_claim_pending_order_cancel",
      {
        p_tenant_id: input.tenantId,
        p_order_id: input.orderId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_reason: input.reason,
        p_closed_by_employee_id: input.employeeId,
      },
    );
    if (error) throw Errors.dbError("申请取消平台技术服务订单失败", error);
    return parseCancellationResult(data);
  }

  async finalize(
    input: FinalizeServiceOrderCancellationCommand,
  ): Promise<ServiceOrderCancellationResult> {
    const { data, error } = await this.clientProvider().rpc(
      "platform_service_cancel_pending_order",
      {
        p_tenant_id: input.tenantId,
        p_order_id: input.orderId,
        p_expected_version: input.expectedVersion,
        p_idempotency_key: input.idempotencyKey,
        p_require_missing_prepay: input.requireMissingPrepay,
      },
    );
    if (error) throw Errors.dbError("取消平台技术服务订单失败", error);
    return parseCancellationResult(data);
  }
}

function parseCancellationResult(data: unknown): ServiceOrderCancellationResult {
  const result = data as {
    idempotent?: unknown;
    claimed?: unknown;
    order?: unknown;
    error_code?: unknown;
  } | null;
  return {
    idempotent: result?.idempotent === true,
    claimed: result?.claimed === true,
    order: (result?.order as CancelableServiceOrderRecord | null) ?? null,
    errorCode: typeof result?.error_code === "string"
      ? result.error_code
      : undefined,
  };
}

export const platformServiceOrderCancellationRepository =
  new PlatformServiceOrderCancellationRepository();
