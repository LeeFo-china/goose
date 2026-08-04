import {
  platformServiceOrderShippingReportRepository,
  type OrderShippingReportRecord,
  type OrderShippingReportSource,
  type PlatformServiceOrderShippingReportRepository,
} from "@/repositories/platform-service-order-shipping-reports";
import type {
  OrderRecord,
} from "@/repositories/platform-service-order-records";
import {
  wechatMiniProgramOrderShippingGateway,
  type WechatOrderShippingPayload,
  type WechatOrderShippingResult,
} from "@/services/wechat-miniprogram-order-shipping-gateway";

const NO_PHYSICAL_DELIVERY_LOGISTICS_TYPE = 3;
const UNIFIED_DELIVERY_MODE = 1;
const TRANSACTION_ID_ORDER_NUMBER_TYPE = 2;
const SERVICE_DELIVERY_ITEM_DESC =
  "客户专属系统环境已部署，服务器配置及首次操作培训已完成";

type RepositoryPort = Pick<
  PlatformServiceOrderShippingReportRepository,
  "beginOrderShippingReportAttempt" | "finishOrderShippingReportAttempt"
>;

type GatewayPort = {
  uploadShippingInfo: (
    payload: WechatOrderShippingPayload,
  ) => Promise<WechatOrderShippingResult>;
};

type Dependencies = {
  repository?: RepositoryPort;
  gateway?: GatewayPort;
  nowFactory?: () => Date;
  attemptKeyFactory?: () => string;
};

export type ReportAcceptedOrderInput = {
  order: OrderRecord;
  source: OrderShippingReportSource;
};

export type OrderShippingReportResult = {
  status: "succeeded" | "failed" | "skipped";
  idempotent: boolean;
  report: OrderShippingReportRecord | null;
  error_code: string | null;
  skipped_reason: string | null;
};

export class PlatformServiceOrderShippingService {
  private readonly repository: RepositoryPort;
  private readonly gateway: GatewayPort;
  private readonly nowFactory: () => Date;
  private readonly attemptKeyFactory: () => string;

  constructor(dependencies: Dependencies = {}) {
    this.repository = dependencies.repository ??
      platformServiceOrderShippingReportRepository;
    this.gateway = dependencies.gateway ?? wechatMiniProgramOrderShippingGateway;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.attemptKeyFactory = dependencies.attemptKeyFactory ??
      (() => crypto.randomUUID());
  }

  async reportAcceptedOrder(
    input: ReportAcceptedOrderInput,
  ): Promise<OrderShippingReportResult> {
    const validation = validateReportableOrder(input.order);
    if (validation) {
      return skippedResult(validation);
    }

    const now = this.nowFactory();
    const attemptKey = this.attemptKeyFactory();
    const payload = buildNoPhysicalDeliveryPayload(input.order, now);
    const tenantId = text(input.order.tenant_id);
    const report = await this.repository.beginOrderShippingReportAttempt({
      tenantId,
      serviceOrderId: input.order.id,
      source: input.source,
      attemptKey,
      requestPayload: payload as unknown as Record<string, unknown>,
      attemptedAt: now.toISOString(),
    });
    if (report.status === "succeeded") {
      return {
        status: "succeeded",
        idempotent: true,
        report,
        error_code: null,
        skipped_reason: null,
      };
    }

    try {
      const uploadResult = await this.gateway.uploadShippingInfo(payload);
      const finished = await this.repository.finishOrderShippingReportAttempt({
        reportId: report.id,
        attemptKey,
        status: "succeeded",
        wechatErrcode: uploadResult.wechat_errcode,
        wechatErrmsg: uploadResult.wechat_errmsg,
        providerRequestId: null,
        finishedAt: now.toISOString(),
      });
      return {
        status: "succeeded",
        idempotent: false,
        report: finished,
        error_code: null,
        skipped_reason: null,
      };
    } catch (error) {
      const errorCode = stableErrorCode(error);
      const failed = await this.repository.finishOrderShippingReportAttempt({
        reportId: report.id,
        attemptKey,
        status: "failed",
        wechatErrcode: wechatErrcodeFrom(error),
        wechatErrmsg: errorCode,
        providerRequestId: null,
        finishedAt: now.toISOString(),
      });
      return {
        status: "failed",
        idempotent: false,
        report: failed,
        error_code: errorCode,
        skipped_reason: null,
      };
    }
  }
}

function validateReportableOrder(order: OrderRecord): string | null {
  if (order.payment_status !== "paid") return "ORDER_NOT_PAID";
  if (order.service_status !== "accepted") return "ORDER_NOT_ACCEPTED";
  if (!order.tenant_id) return "ORDER_TENANT_MISSING";
  if (!text(order.transaction_id)) return "ORDER_TRANSACTION_ID_MISSING";
  if (!text(order.payer_openid)) return "ORDER_PAYER_OPENID_MISSING";
  return null;
}

function buildNoPhysicalDeliveryPayload(
  order: OrderRecord,
  now: Date,
): WechatOrderShippingPayload {
  return {
    order_key: {
      order_number_type: TRANSACTION_ID_ORDER_NUMBER_TYPE,
      transaction_id: text(order.transaction_id),
    },
    logistics_type: NO_PHYSICAL_DELIVERY_LOGISTICS_TYPE,
    delivery_mode: UNIFIED_DELIVERY_MODE,
    shipping_list: [{ item_desc: SERVICE_DELIVERY_ITEM_DESC }],
    upload_time: now.toISOString(),
    payer: { openid: text(order.payer_openid) },
  };
}

function skippedResult(skippedReason: string): OrderShippingReportResult {
  return {
    status: "skipped",
    idempotent: false,
    report: null,
    error_code: null,
    skipped_reason: skippedReason,
  };
}

function stableErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = error.code;
    if (typeof code === "string" && code.trim()) return code.slice(0, 100);
  }
  return "WECHAT_ORDER_SHIPPING_UPLOAD_FAILED";
}

function wechatErrcodeFrom(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("details" in error)) return null;
  const details = error.details;
  if (!details || typeof details !== "object" || !("wechatErrcode" in details)) {
    return null;
  }
  const errcode = Number(details.wechatErrcode);
  return Number.isSafeInteger(errcode) ? errcode : null;
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export const platformServiceOrderShippingService =
  new PlatformServiceOrderShippingService();
