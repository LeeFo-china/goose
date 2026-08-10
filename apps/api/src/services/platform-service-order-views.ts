import type {
  OrderRecord,
  PlatformProductRecord,
  ProductRecord,
  ProductVersionRecord,
} from "../repositories/platform-service-order-records";

type ActionView = {
  enabled: boolean;
  label: string;
  disabled_reason: string | null;
};

type TenantServiceOrderInput = OrderRecord & Record<string, unknown>;

export function serializeTenantServiceProduct(record: ProductRecord) {
  const publishedVersion = firstVersion(record.published_version);
  if (!publishedVersion) {
    return null;
  }
  return {
    id: record.id,
    code: record.code,
    status: record.status,
    published_version_id: record.published_version_id,
    title: publishedVersion.title,
    term_years: publishedVersion.term_years,
    list_amount_fen: publishedVersion.list_amount_fen,
    amount_fen: publishedVersion.amount_fen,
    price_rate_basis_points: calculatePriceRateBasisPoints(publishedVersion),
    pricing_version: publishedVersion.version,
    service_scope: publishedVersion.service_scope,
    terms_version: publishedVersion.terms_version,
    terms_content: publishedVersion.terms_content,
  };
}

export function serializePlatformServiceProduct(record: PlatformProductRecord) {
  const publishedVersion = firstVersion(record.published_version);
  const draft = serializeVersionLike({
    id: null,
    version: record.version,
    title: record.title,
    term_years: record.term_years,
    list_amount_fen: record.list_amount_fen,
    amount_fen: record.amount_fen,
    service_scope: record.service_scope,
    terms_version: record.terms_version,
    terms_content: record.terms_content,
  });
  const published = publishedVersion
    ? serializeVersionLike(publishedVersion)
    : null;

  return {
    id: record.id,
    code: record.code,
    status: record.status,
    version: record.version,
    published_version_id: record.published_version_id,
    sort_order: record.sort_order,
    draft,
    published,
    has_unpublished_changes: hasUnpublishedChanges(record, publishedVersion),
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function serializeTenantServiceOrder(
  record: TenantServiceOrderInput,
  now: Date = new Date(),
  options: { canCancelPayment?: boolean } = {},
) {
  const paymentStatus = String(record.payment_status);
  const serviceStatus = String(record.service_status);
  const cancellationClaimed = hasCancellationClaim(record);
  const cancellationActive = hasActiveCancellationClaim(record, now);
  return {
    id: record.id,
    order_no: record.order_no,
    product_code: record.product_code,
    term_years: record.term_years,
    amount_fen: record.amount_fen,
    payment_status: paymentStatus,
    service_status: serviceStatus,
    display_stage: getDisplayStage(paymentStatus, serviceStatus),
    payment_expires_at: record.payment_expires_at,
    paid_at: record.paid_at,
    closed_at: record.closed_at,
    pricing_version: getSnapshotPricingVersion(record),
    terms_version: record.terms_version,
    version: record.version,
    available_actions: {
      continue_payment: getContinuePaymentAction(
        record,
        now,
        cancellationClaimed,
      ),
      cancel_payment: getCancelPaymentAction(
        paymentStatus,
        options.canCancelPayment === true,
        cancellationActive,
      ),
      request_refund: getRequestRefundAction(paymentStatus),
    },
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function getCancelPaymentAction(
  paymentStatus: string,
  canCancelPayment: boolean,
  cancellationActive: boolean,
): ActionView {
  if (paymentStatus === "pending") {
    if (cancellationActive) {
      return {
        enabled: false,
        label: "取消订单",
        disabled_reason: "订单正在取消，请稍后刷新",
      };
    }
    if (!canCancelPayment) {
      return {
        enabled: false,
        label: "取消订单",
        disabled_reason: "无取消订单权限",
      };
    }
    return {
      enabled: true,
      label: "取消订单",
      disabled_reason: null,
    };
  }
  return {
    enabled: false,
    label: "取消订单",
    disabled_reason: paymentStatus === "paid"
      ? "订单已支付，不能取消"
      : paymentStatus === "closed"
      ? "订单已关闭"
      : "订单状态不允许取消",
  };
}

function getSnapshotPricingVersion(record: TenantServiceOrderInput) {
  const pricingVersion = record.product_snapshot?.pricing_version;
  return typeof pricingVersion === "number" &&
      Number.isSafeInteger(pricingVersion) && pricingVersion > 0
    ? pricingVersion
    : undefined;
}

function serializeVersionLike(version: {
  id: string | null;
  version: number;
  title: string;
  term_years: number;
  list_amount_fen: number;
  amount_fen: number;
  service_scope: string[];
  terms_version: number;
  terms_content: string;
}) {
  return {
    id: version.id,
    version: version.version,
    title: version.title,
    term_years: version.term_years,
    list_amount_fen: version.list_amount_fen,
    amount_fen: version.amount_fen,
    price_rate_basis_points: calculatePriceRateBasisPoints(version),
    service_scope: version.service_scope,
    terms_version: version.terms_version,
    terms_content: version.terms_content,
  };
}

function firstVersion(
  version: ProductVersionRecord | ProductVersionRecord[] | null | undefined,
) {
  if (Array.isArray(version)) return version[0] ?? null;
  return version ?? null;
}

function calculatePriceRateBasisPoints(input: {
  amount_fen: number;
  list_amount_fen: number;
}) {
  return Math.round((input.amount_fen * 10000) / input.list_amount_fen);
}

function hasUnpublishedChanges(
  draft: PlatformProductRecord,
  published: ProductVersionRecord | null,
) {
  if (!published) return true;
  return (
    draft.version !== published.version ||
    draft.title !== published.title ||
    draft.term_years !== published.term_years ||
    draft.list_amount_fen !== published.list_amount_fen ||
    draft.amount_fen !== published.amount_fen ||
    draft.terms_version !== published.terms_version ||
    draft.terms_content !== published.terms_content ||
    JSON.stringify(draft.service_scope) !== JSON.stringify(published.service_scope)
  );
}

function getContinuePaymentAction(
  record: TenantServiceOrderInput,
  now: Date,
  cancellationClaimed: boolean,
): ActionView {
  if (record.payment_status !== "pending") {
    return {
      enabled: false,
      label: "继续支付",
      disabled_reason: "订单不是待支付状态",
    };
  }
  if (cancellationClaimed) {
    return {
      enabled: false,
      label: "继续支付",
      disabled_reason: "订单正在取消，请稍后刷新",
    };
  }
  if (new Date(record.payment_expires_at).getTime() <= now.getTime()) {
    return {
      enabled: false,
      label: "继续支付",
      disabled_reason: "订单已超过支付有效期",
    };
  }
  return {
    enabled: true,
    label: "继续支付",
    disabled_reason: null,
  };
}

function hasCancellationClaim(record: TenantServiceOrderInput) {
  return typeof record.cancel_claim_expires_at === "string" &&
    Boolean(record.cancel_claim_expires_at.trim());
}

function hasActiveCancellationClaim(
  record: TenantServiceOrderInput,
  now: Date,
) {
  if (!hasCancellationClaim(record)) return false;
  const expiresAt = typeof record.cancel_claim_expires_at === "string"
    ? Date.parse(record.cancel_claim_expires_at)
    : Number.NaN;
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

function getRequestRefundAction(paymentStatus: string): ActionView {
  if (paymentStatus === "paid") {
    return {
      enabled: true,
      label: "申请售后",
      disabled_reason: null,
    };
  }
  return {
    enabled: false,
    label: "申请售后",
    disabled_reason: "仅已支付订单可申请售后",
  };
}

function getDisplayStage(paymentStatus: string, serviceStatus: string) {
  if (paymentStatus === "pending") return "waiting_payment";
  if (paymentStatus === "closed") return "closed";
  if (paymentStatus.startsWith("refund")) return paymentStatus;
  return serviceStatus;
}
