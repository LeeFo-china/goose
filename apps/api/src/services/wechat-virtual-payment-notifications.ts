import { createHash } from "node:crypto";

import { Errors } from "@/errors/error-factory";
import {
  brandingVirtualOrderRepository,
  type BrandingVirtualOrderRecord,
} from "@/repositories/branding-virtual-orders";
import { brandingVirtualRefundRepository } from "@/repositories/branding-virtual-refunds";
import { brandingVirtualRefundNotificationRepository } from "@/repositories/branding-virtual-refund-notifications";
import {
  wechatVirtualPaymentNotificationRepository,
  type WechatVirtualPaymentNotificationRecord,
} from "@/repositories/wechat-virtual-payment-notifications";
import {
  brandingVirtualPaymentConfirmation,
} from "@/services/branding-virtual-payment-confirmation";
import {
  parseWechatVirtualPaymentMessage,
  verifyWechatMessageSignature,
  type WechatVirtualMessageFormat,
} from "@/services/wechat-virtual-payment-message";
import {
  isValidWechatMiniProgramOriginalId,
  isValidWechatVirtualPaymentMessageToken,
} from "@/services/wechat-virtual-payment-message-config";
import { systemSettingsService } from "@/services/system-settings";

export const WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN =
  "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN";
export const WECHAT_MINIPROGRAM_ORIGINAL_ID =
  "WECHAT_MINIPROGRAM_ORIGINAL_ID";

type SignatureQuery = {
  signature?: unknown;
  timestamp?: unknown;
  nonce?: unknown;
  echostr?: unknown;
  encrypt_type?: unknown;
  msg_signature?: unknown;
};

type SettingsPort = Pick<
  typeof systemSettingsService,
  "getPlatformSecretString"
>;
type NotificationsPort = Pick<
  typeof wechatVirtualPaymentNotificationRepository,
  "createOrGet" | "markProcessed" | "markFailed"
>;
type OrdersPort = {
  findByOutTradeNo(outTradeNo: string): Promise<BrandingVirtualOrderRecord | null>;
};
type ConfirmationPort = Pick<
  typeof brandingVirtualPaymentConfirmation,
  "confirm"
>;
type RefundsPort = Pick<typeof brandingVirtualRefundRepository, "compensate"> &
  Pick<typeof brandingVirtualRefundNotificationRepository,
    "processProviderNotification" | "processIosInquiry">;

type WechatVirtualPaymentAckResult = {
  kind: "ack";
  httpStatus: number;
  format: WechatVirtualMessageFormat;
  body: { ErrCode: number; ErrMsg: "success" | "retry" };
  errorCode?: string;
  failurePersistenceErrorCode?: string;
};

type WechatVirtualPaymentInquiryResult = {
  kind: "ios_refund_inquiry";
  httpStatus: 200;
  format: WechatVirtualMessageFormat;
  body: { result_code: 0 | 1; result_info: string; evidence: string };
};

export type WechatVirtualPaymentMessageResult =
  | WechatVirtualPaymentAckResult
  | WechatVirtualPaymentInquiryResult;

export class WechatVirtualPaymentNotificationService {
  private readonly settings: SettingsPort;
  private readonly notifications: NotificationsPort;
  private readonly orders: OrdersPort;
  private readonly confirmation: ConfirmationPort;
  private readonly refunds: RefundsPort;

  constructor(dependencies: {
    settings?: SettingsPort;
    notifications?: NotificationsPort;
    orders?: OrdersPort;
    confirmation?: ConfirmationPort;
    refunds?: RefundsPort;
  } = {}) {
    this.settings = dependencies.settings ?? systemSettingsService;
    this.notifications = dependencies.notifications ??
      wechatVirtualPaymentNotificationRepository;
    this.orders = dependencies.orders ?? brandingVirtualOrderRepository;
    this.confirmation = dependencies.confirmation ??
      brandingVirtualPaymentConfirmation;
    this.refunds = dependencies.refunds ?? {
      compensate: (input) => brandingVirtualRefundRepository.compensate(input),
      processProviderNotification: (input) =>
        brandingVirtualRefundNotificationRepository.processProviderNotification(input),
      processIosInquiry: (input) =>
        brandingVirtualRefundNotificationRepository.processIosInquiry(input),
    };
  }

  async verifyEndpoint(query: SignatureQuery): Promise<string> {
    const verified = await this.authenticate(query);
    const echostr = exactQueryText(query.echostr, "echostr", 512);
    if (!verified) throw invalidSignature();
    return echostr;
  }

  async handle(input: {
    rawBody: string;
    contentType: string;
    query: SignatureQuery;
    requestId: string | null;
  }): Promise<WechatVirtualPaymentMessageResult> {
    const format = formatFromContentType(input.contentType);
    if (!await this.authenticate(input.query)) throw invalidSignature();

    try {
      return await this.processAuthenticated({ ...input, format });
    } catch (error) {
      return retryResult(format, readErrorCode(error));
    }
  }

  private async authenticate(query: SignatureQuery): Promise<boolean> {
    if (query.encrypt_type !== undefined || query.msg_signature !== undefined) {
      throw Errors.business(
        409,
        "当前虚拟支付消息入口未启用微信安全模式",
        "WECHAT_VIRTUAL_MESSAGE_ENCRYPTION_UNSUPPORTED",
      );
    }
    const token = await this.settings.getPlatformSecretString(
      WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN,
    );
    if (!token) {
      throw Errors.business(
        503,
        "微信虚拟支付消息令牌未配置",
        "WECHAT_VIRTUAL_MESSAGE_TOKEN_MISSING",
      );
    }
    if (!isValidWechatVirtualPaymentMessageToken(token)) {
      throw Errors.business(
        503,
        "微信虚拟支付消息令牌配置无效",
        "WECHAT_VIRTUAL_MESSAGE_TOKEN_INVALID",
      );
    }
    const signature = exactQueryText(query.signature, "signature", 40);
    const timestamp = exactQueryText(query.timestamp, "timestamp", 20);
    const nonce = exactQueryText(query.nonce, "nonce", 128);
    if (!/^\d{1,20}$/.test(timestamp) || !/^[0-9a-f]{40}$/i.test(signature)) {
      return false;
    }
    return verifyWechatMessageSignature({ token, timestamp, nonce, signature });
  }

  private async processAuthenticated(input: {
    rawBody: string;
    contentType: string;
    format: WechatVirtualMessageFormat;
    requestId: string | null;
  }): Promise<WechatVirtualPaymentMessageResult> {
    const message = parseWechatVirtualPaymentMessage(input);
    const expectedOriginalId = await this.settings.getPlatformSecretString(
      WECHAT_MINIPROGRAM_ORIGINAL_ID,
    );
    if (!expectedOriginalId) {
      throw Errors.business(
        503,
        "微信小程序原始 ID 未配置",
        "WECHAT_VIRTUAL_MESSAGE_ORIGINAL_ID_MISSING",
      );
    }
    if (!isValidWechatMiniProgramOriginalId(expectedOriginalId)) {
      throw Errors.business(
        503,
        "微信小程序原始 ID 配置无效",
        "WECHAT_VIRTUAL_MESSAGE_ORIGINAL_ID_INVALID",
      );
    }
    if (message.toUserName !== expectedOriginalId) {
      throw Errors.business(
        409,
        "微信虚拟支付消息接收方不匹配",
        "WECHAT_VIRTUAL_MESSAGE_ORIGINAL_ID_MISMATCH",
        { field: "ToUserName" },
      );
    }
    if (message.eventType === "xpay_subscribe_ios_refund_query_notify") {
      const decision = await this.refunds.processIosInquiry({
        recipientOriginalId: message.toUserName,
        senderIdHash: sha256(message.fromUserName),
        providerCreatedAtUnix: message.providerCreatedAtUnix,
        outTradeNo: message.outTradeNo,
        refundTime: message.refundTime,
        orderTime: message.orderTime,
        channelBillHash: sha256(message.channelBill),
        bundleId: message.bundleId,
        providerProductId: message.providerProductId,
        quantity: message.quantity,
        refundRequestReason: message.refundRequestReason,
        provideStatus: message.provideStatus,
        requestId: input.requestId?.slice(0, 128) ?? null,
      });
      return {
        kind: "ios_refund_inquiry",
        httpStatus: 200,
        format: input.format,
        body: {
          result_code: decision.result_code,
          result_info: decision.result_info,
          evidence: decision.evidence,
        },
      };
    }
    if (message.eventType === "xpay_refund_notify") {
      const result = await this.refunds.processProviderNotification({
        recipientOriginalId: message.toUserName,
        senderIdHash: sha256(message.fromUserName),
        providerCreatedAtUnix: message.providerCreatedAtUnix,
        outTradeNo: message.outTradeNo,
        openidHash: sha256(message.openid),
        localRefundNo: message.localRefundNo,
        providerOrderId: message.providerOrderId,
        providerRefundId: message.providerRefundId,
        providerRefundTransactionId: message.providerRefundTransactionId,
        refundFeeFen: message.refundFeeFen,
        successful: message.refundSuccessful,
        providerResultCode: message.providerResultCode,
        providerResultMessage: message.providerResultMessage,
        refundStartedAt: message.refundStartedAt,
        refundSucceededAt: message.refundSucceededAt,
        retryTimes: message.retryTimes,
        requestId: input.requestId?.slice(0, 128) ?? null,
      });
      if (result.refund_status === "succeeded" &&
        result.compensation_status !== "succeeded") {
        await this.refunds.compensate({ refundId: result.refund_id });
      }
      return successResult(input.format);
    }
    const persisted = await this.notifications.createOrGet({
      eventType: message.eventType,
      environment: message.environment,
      recipientOriginalId: message.toUserName,
      senderIdHash: sha256(message.fromUserName),
      providerCreatedAtUnix: message.providerCreatedAtUnix,
      messageType: message.messageType,
      outTradeNo: message.outTradeNo,
      providerProductId: message.providerProductId,
      openidHash: sha256(message.openid),
      providerOrderNo: message.providerOrderNo,
      transactionId: message.transactionId,
      paidAt: message.paidAt,
      quantity: message.quantity,
      origPriceFen: message.origPriceFen,
      actualPriceFen: message.actualPriceFen,
      attach: message.attach,
      requestId: input.requestId?.slice(0, 128) ?? null,
    });

    if (!persisted.created && persisted.record.status === "processed") {
      return successResult(input.format);
    }
    const order = await this.orders.findByOutTradeNo(message.outTradeNo);
    if (!order) {
      return this.failPersisted(
        persisted.record,
        null,
        "BRANDING_VIRTUAL_ORDER_NOT_FOUND",
        input.format,
      );
    }

    try {
      const result = await this.confirmation.confirm({
        source: "notification",
        order,
        notificationId: persisted.record.id,
        transaction: {
          eventType: message.eventType,
          successful: true,
          environment: message.environment,
          recipientOriginalId: message.toUserName,
          senderIdHash: sha256(message.fromUserName),
          providerCreatedAtUnix: message.providerCreatedAtUnix,
          messageType: message.messageType,
          openid: message.openid,
          outTradeNo: message.outTradeNo,
          providerProductId: message.providerProductId,
          quantity: message.quantity,
          currency: null,
          origPriceFen: message.origPriceFen,
          actualPriceFen: message.actualPriceFen,
          providerOrderNo: message.providerOrderNo,
          transactionId: message.transactionId,
          paidAt: message.paidAt,
          attach: message.attach,
        },
      });
      if (!result.fulfilled) {
        return this.failPersisted(
          persisted.record,
          order.id,
          result.failure_code ?? "BRANDING_VIRTUAL_ENTITLEMENT_GRANT_FAILED",
          input.format,
        );
      }
      if (!result.entitlement_event_id || !result.entitlement_status) {
        throw Errors.dbError("微信虚拟支付履约结果缺少权益事实");
      }
      await this.notifications.markProcessed({
        notificationId: persisted.record.id,
        orderId: order.id,
        paymentRecorded: true,
        fulfilled: true,
        entitlementEventId: result.entitlement_event_id,
        entitlementStatus: result.entitlement_status,
      });
      return successResult(input.format);
    } catch (error) {
      return this.failPersisted(
        persisted.record,
        order.id,
        readErrorCode(error),
        input.format,
      );
    }
  }

  private async failPersisted(
    notification: WechatVirtualPaymentNotificationRecord,
    orderId: string | null,
    errorCode: string,
    format: WechatVirtualMessageFormat,
  ): Promise<WechatVirtualPaymentMessageResult> {
    try {
      await this.notifications.markFailed({
        notificationId: notification.id,
        orderId,
        errorCode,
        errorSummary: failureSummary(errorCode),
      });
      return retryResult(format, errorCode);
    } catch (error) {
      return {
        ...retryResult(format, errorCode),
        failurePersistenceErrorCode: readErrorCode(error),
      };
    }
  }
}

function formatFromContentType(contentType: string): WechatVirtualMessageFormat {
  const type = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return type === "application/xml" || type === "text/xml" ? "xml" : "json";
}

function exactQueryText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value || value.length > max) {
    throw Errors.business(
      400,
      "微信虚拟支付消息验签参数不正确",
      "WECHAT_VIRTUAL_MESSAGE_AUTH_INPUT_INVALID",
      { field },
    );
  }
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "INTERNAL_SERVER_ERROR";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "INTERNAL_SERVER_ERROR";
}

function failureSummary(code: string): string {
  if (code === "BRANDING_VIRTUAL_ORDER_NOT_FOUND") return "订单不存在";
  if (code.includes("MISMATCH") || code.includes("CONFLICT")) {
    return "微信支付事实与订单上下文不一致";
  }
  return "微信虚拟支付消息等待重试";
}

function invalidSignature() {
  return Errors.unauthorized(
    "微信虚拟支付消息签名无效",
    "WECHAT_VIRTUAL_MESSAGE_SIGNATURE_INVALID",
  );
}

function successResult(
  format: WechatVirtualMessageFormat,
): WechatVirtualPaymentAckResult {
  return {
    kind: "ack",
    httpStatus: 200,
    format,
    body: { ErrCode: 0, ErrMsg: "success" },
  };
}

function retryResult(
  format: WechatVirtualMessageFormat,
  errorCode: string,
): WechatVirtualPaymentAckResult {
  return {
    kind: "ack",
    httpStatus: 200,
    format,
    body: { ErrCode: 1, ErrMsg: "retry" },
    errorCode,
  };
}

export const wechatVirtualPaymentNotificationService =
  new WechatVirtualPaymentNotificationService();
