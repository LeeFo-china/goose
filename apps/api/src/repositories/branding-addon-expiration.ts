import { Errors } from "@/errors/error-factory";
import type {
  BrandingAddonCloseResultRecord,
  BrandingAddonExpirationOrderRecord,
} from "@/repositories/branding-addon-order-records";
import { SupabaseDB } from "@/utils/supabase";

type QueryResult = {
  data: unknown;
  error: unknown;
};

type ExpirationQuery = {
  update(patch: Record<string, unknown>): ExpirationQuery;
  eq(column: string, value: unknown): ExpirationQuery;
  is(column: string, value: null): ExpirationQuery;
  select(columns: string): ExpirationQuery;
  maybeSingle(): Promise<QueryResult>;
};

type ExpirationClient = {
  from(table: "tenant_addon_orders"): ExpirationQuery;
  rpc(
    name:
      | "branding_claim_expired_addon_orders"
      | "branding_renew_addon_close_claim"
      | "branding_claim_legacy_pending_orders"
      | "branding_assert_virtual_cutover_ready",
    params: Record<string, unknown>,
  ): PromiseLike<QueryResult>;
};

export type ClaimExpiredBrandingAddonOrdersInput = {
  batchSize: number;
  leaseSeconds: number;
  excludedOrderIds: string[];
};

export type RenewBrandingAddonCloseClaimInput = {
  orderId: string;
  claimToken: string;
  leaseSeconds: number;
};

export type MarkBrandingAddonOrderClosedInput = {
  orderId: string;
  claimToken: string;
  closedAt: Date;
  requireMissingPrepay?: boolean;
  failureCode?: "PAYMENT_CHANNEL_MIGRATED";
  failureMessage?: string;
};

export type ReleaseBrandingAddonCloseClaimInput = {
  orderId: string;
  claimToken: string;
  errorMessage: string | null;
};

const CLOSE_RESULT_COLUMNS = [
  "id",
  "tenant_id",
  "order_no",
  "out_trade_no",
  "product_code",
  "status",
  "prepay_id",
  "payment_expires_at",
  "closed_at",
  "close_claim_token",
  "close_claim_expires_at",
  "close_attempt_count",
  "close_last_error",
  "updated_at",
].join(",");

export class BrandingAddonExpirationRepository {
  constructor(
    private readonly clientProvider: () => ExpirationClient = () =>
      SupabaseDB.getAdminClient() as unknown as ExpirationClient,
  ) {}

  async claimExpiredOrders(input: ClaimExpiredBrandingAddonOrdersInput) {
    const { data, error } = await this.clientProvider().rpc(
      "branding_claim_expired_addon_orders",
      {
        p_limit: clampInteger(input.batchSize, 1, 100),
        p_lease_seconds: clampInteger(input.leaseSeconds, 10, 600),
        p_excluded_ids: input.excludedOrderIds.slice(0, 100),
      },
    );
    if (error) throw Errors.dbError("领取过期品牌权益订单失败");
    return (data ?? []) as BrandingAddonExpirationOrderRecord[];
  }

  async renewCloseClaim(input: RenewBrandingAddonCloseClaimInput) {
    const { data, error } = await this.clientProvider().rpc(
      "branding_renew_addon_close_claim",
      {
        p_order_id: input.orderId,
        p_claim_token: input.claimToken,
        p_lease_seconds: clampInteger(input.leaseSeconds, 10, 600),
      },
    );
    if (error) throw Errors.dbError("续租品牌权益订单关单领取失败");
    return (data as BrandingAddonExpirationOrderRecord | null) ?? null;
  }

  async claimLegacyPendingOrders(input: {
    batchSize: number;
    leaseSeconds: number;
  }) {
    const { data, error } = await this.clientProvider().rpc(
      "branding_claim_legacy_pending_orders",
      {
        p_limit: clampInteger(input.batchSize, 1, 100),
        p_lease_seconds: clampInteger(input.leaseSeconds, 10, 600),
      },
    );
    if (error) throw Errors.dbError("领取旧品牌权益待支付订单失败");
    return (data ?? []) as BrandingAddonExpirationOrderRecord[];
  }

  async assertVirtualCutoverReady() {
    const { data, error } = await this.clientProvider().rpc(
      "branding_assert_virtual_cutover_ready",
      {},
    );
    if (error) throw Errors.dbError("检查虚拟支付切换条件失败");
    return data === true;
  }

  async markOrderClosed(input: MarkBrandingAddonOrderClosedInput) {
    return this.updateClaimedOrder(
      input.orderId,
      input.claimToken,
      {
        status: "closed",
        closed_at: input.closedAt.toISOString(),
        ...(input.failureCode
          ? {
            failure_code: input.failureCode,
            failure_message: boundedOptionalText(
              input.failureMessage ?? "旧普通支付渠道已关闭",
            ),
          }
          : {}),
        close_claim_token: null,
        close_claim_expires_at: null,
        close_last_error: null,
      },
      "关闭过期品牌权益订单失败",
      input.requireMissingPrepay ?? false,
    );
  }

  async releaseCloseClaim(input: ReleaseBrandingAddonCloseClaimInput) {
    return this.updateClaimedOrder(
      input.orderId,
      input.claimToken,
      {
        close_claim_token: null,
        close_claim_expires_at: null,
        close_last_error: boundedOptionalText(input.errorMessage),
      },
      "释放品牌权益订单关单领取失败",
    );
  }

  private async updateClaimedOrder(
    orderId: string,
    claimToken: string,
    patch: Record<string, unknown>,
    message: string,
    requireMissingPrepay = false,
  ) {
    let query = this.clientProvider()
      .from("tenant_addon_orders")
      .update(patch)
      .eq("id", orderId)
      .eq("status", "pending")
      .eq("close_claim_token", claimToken);
    if (requireMissingPrepay) query = query.is("prepay_id", null);
    const { data, error } = await query
      .select(CLOSE_RESULT_COLUMNS)
      .maybeSingle();
    if (error) throw Errors.dbError(message);
    return (data as BrandingAddonCloseResultRecord | null) ?? null;
  }
}

function clampInteger(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(Math.floor(value), maximum));
}

function boundedOptionalText(value: string | null) {
  const bounded = value?.trim().slice(0, 500) ?? "";
  return bounded.length > 0 ? bounded : null;
}

export const brandingAddonExpirationRepository =
  new BrandingAddonExpirationRepository();
