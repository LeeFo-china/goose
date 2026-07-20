import { Errors } from "@/errors/error-factory";
import {
  billingRechargeRepository,
  type BillingConfirmWechatRechargeResult,
  type TenantCreditOrderRecord,
  type TenantCreditWechatNotificationRecord,
} from "@/repositories/billing-recharge";
import { platformBillingRechargeRepository } from "@/repositories/platform-billing-recharge";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "@/repositories/platform-payment-configs";
import type { PlatformRechargeOrderCompensateInput } from "@/schema/platform-billing-recharge";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { requireMatchingPlatformPaymentSecretBundle } from "@/services/platform-payment-secret-bundle-revision";
import {
  wechatPayGateway,
} from "@/services/wechat-pay-gateway";
import { wechatPaySecretBundleService } from "@/services/wechat-pay-secret-bundles";
import {
  assertWechatPaySuccessTransaction,
  buildWechatPayTransactionExpectedBinding,
  parseAndAssertWechatPayTransactionQuery,
  type WechatPayValidatedSuccessTransaction,
} from "@/services/wechat-pay-transaction-contract";

type PlatformBillingRechargeRepositoryPort = Pick<
  typeof platformBillingRechargeRepository,
  "findOrderById"
>;

type BillingRechargeRepositoryPort = Pick<
  typeof billingRechargeRepository,
  | "findWechatNotificationByNotifyId"
  | "createWechatNotification"
  | "markWechatNotificationProcessed"
  | "markWechatNotificationFailed"
  | "confirmWechatRecharge"
>;

type PaymentConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfig"
>;

type SecretBundleServicePort = Pick<typeof wechatPaySecretBundleService, "load">;

type WechatPayGatewayPort = Pick<
  typeof wechatPayGateway,
  "queryTransactionByOutTradeNo"
>;

type AuditLogServicePort = Pick<typeof platformAuditLogService, "recordBestEffort">;

export type PlatformBillingRechargeCompensationServiceDependencies = {
  repository?: PlatformBillingRechargeRepositoryPort;
  rechargeRepository?: BillingRechargeRepositoryPort;
  paymentConfigRepository?: PaymentConfigRepositoryPort;
  secretBundleService?: SecretBundleServicePort;
  wechatPayGateway?: WechatPayGatewayPort;
  auditLogService?: AuditLogServicePort;
};

const RECHARGE_CHANNEL = "tenant_recharge";

export class PlatformBillingRechargeCompensationService {
  private readonly repository: PlatformBillingRechargeRepositoryPort;
  private readonly rechargeRepository: BillingRechargeRepositoryPort;
  private readonly paymentConfigRepository: PaymentConfigRepositoryPort;
  private readonly secretBundleService: SecretBundleServicePort;
  private readonly wechatPayGateway: WechatPayGatewayPort;
  private readonly auditLogService: AuditLogServicePort;

  constructor(
    dependencies: PlatformBillingRechargeCompensationServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ?? platformBillingRechargeRepository;
    this.rechargeRepository =
      dependencies.rechargeRepository ?? billingRechargeRepository;
    this.paymentConfigRepository =
      dependencies.paymentConfigRepository ?? platformPaymentConfigRepository;
    this.secretBundleService =
      dependencies.secretBundleService ?? wechatPaySecretBundleService;
    this.wechatPayGateway = dependencies.wechatPayGateway ?? wechatPayGateway;
    this.auditLogService =
      dependencies.auditLogService ?? platformAuditLogService;
  }

  async compensateWechatOrder(
    authContext: AuthContext,
    orderId: string,
    input: PlatformRechargeOrderCompensateInput = {},
  ) {
    const order = await this.repository.findOrderById(orderId);
    if (!order) {
      throw Errors.business(
        404,
        "积分充值订单不存在",
        "BILLING_RECHARGE_ORDER_NOT_FOUND",
      );
    }
    this.assertWechatRechargeOrder(order);
    const outTradeNo = this.requireOrderOutTradeNo(order);

    if (order.status === "paid") {
      return this.recoverPaidOrder({
        authContext,
        order,
        outTradeNo,
        reason: input.reason ?? null,
      });
    }
    if (order.status !== "pending") {
      throw Errors.business(
        409,
        "只有待支付的积分充值订单可以执行查单补偿",
        "BILLING_RECHARGE_ORDER_STATUS_INVALID",
        { status: order.status },
      );
    }

    const config = await this.paymentConfigRepository.findWechatPayConfig();
    this.assertPaymentConfigReady(config, order);
    const secretBundle = requireMatchingPlatformPaymentSecretBundle(
      config,
      await this.secretBundleService.load(config.encrypted_config_ref),
    );
    const queryResult = await this.wechatPayGateway.queryTransactionByOutTradeNo({
      config,
      outTradeNo,
      secretBundle,
    });
    const transaction = parseAndAssertWechatPayTransactionQuery(
      queryResult,
      buildWechatPayTransactionExpectedBinding({
        merchantMode: config.merchant_mode,
        merchantId: config.merchant_id,
        subMerchantId: config.sub_merchant_id,
        outTradeNo,
        amountFen: order.amount_fen,
        transactionId: order.transaction_id,
      }),
    );
    const tradeState = transaction.tradeState;
    if (tradeState !== "SUCCESS") {
      await this.recordCompensationAudit({
        authContext,
        order,
        status: "success",
        summary: "微信支付查单未支付，未执行积分入账补偿",
        metadata: {
          reason: input.reason ?? null,
          out_trade_no: outTradeNo,
          trade_state: tradeState,
        },
      });
      return {
        compensated: false,
        already_paid: false,
        trade_state: tradeState,
        order_id: order.id,
        out_trade_no: outTradeNo,
        transaction_id: transaction.transactionId,
        notification_id: null,
        result: null,
      };
    }

    assertWechatPaySuccessTransaction(transaction);
    return this.confirmSuccessfulQueriedTransaction({
      authContext,
      order,
      outTradeNo,
      transaction,
      reason: input.reason ?? null,
    });
  }

  private assertWechatRechargeOrder(order: TenantCreditOrderRecord) {
    if (order.channel !== "wechat_pay") {
      throw Errors.business(
        409,
        "订单不是微信支付积分充值订单",
        "BILLING_RECHARGE_ORDER_CHANNEL_INVALID",
        { channel: order.channel },
      );
    }
  }

  private requireOrderOutTradeNo(order: TenantCreditOrderRecord) {
    const outTradeNo = this.optionalString(order.out_trade_no);
    if (!outTradeNo) {
      throw Errors.business(
        409,
        "积分充值订单缺少微信支付商户订单号",
        "BILLING_RECHARGE_OUT_TRADE_NO_REQUIRED",
      );
    }
    return outTradeNo;
  }

  private assertPaymentConfigReady(
    config: PlatformPaymentConfigRecord | null,
    order: TenantCreditOrderRecord,
  ): asserts config is PlatformPaymentConfigRecord {
    if (!config || config.status !== "active") {
      throw Errors.business(
        409,
        "平台微信支付配置未启用",
        "PLATFORM_WECHAT_PAY_CONFIG_NOT_ACTIVE",
      );
    }
    if (order.payment_config_id && order.payment_config_id !== config.id) {
      throw Errors.business(
        409,
        "积分充值订单关联的微信支付配置与当前平台配置不一致",
        "BILLING_RECHARGE_PAYMENT_CONFIG_MISMATCH",
        {
          order_payment_config_id: order.payment_config_id,
          active_payment_config_id: config.id,
        },
      );
    }
    if (!config.merchant_id || !config.app_id || !config.serial_no) {
      throw Errors.business(
        409,
        "平台微信支付商户号、AppID 或证书序列号未配置",
        "PLATFORM_WECHAT_PAY_CONFIG_INCOMPLETE",
      );
    }
    if (!config.encrypted_config_ref) {
      throw Errors.business(
        409,
        "平台微信支付密钥引用未配置",
        "PLATFORM_WECHAT_PAY_SECRET_REF_REQUIRED",
      );
    }
    if (!config.enabled_channels.includes(RECHARGE_CHANNEL)) {
      throw Errors.business(
        409,
        "平台微信支付未启用积分充值通道",
        "PLATFORM_WECHAT_PAY_RECHARGE_CHANNEL_DISABLED",
      );
    }
  }

  private async confirmSuccessfulQueriedTransaction(input: {
    authContext: AuthContext;
    order: TenantCreditOrderRecord;
    outTradeNo: string;
    transaction: WechatPayValidatedSuccessTransaction;
    reason: string | null;
  }) {
    const { authContext, order, outTradeNo, transaction, reason } = input;
    const transactionId = transaction.transactionId;
    const paidAmountFen = transaction.amountFen;

    const notifyId = `query-compensation:${transactionId}`;
    const notification = await this.findOrCreateCompensationNotification({
      order,
      notifyId,
      transaction,
    });

    try {
      const confirmResult = await this.rechargeRepository.confirmWechatRecharge({
        orderId: order.id,
        transactionId,
        paidAmountFen,
        paidAt: transaction.successTime,
        notificationId: notification.id,
        metadata: {
          compensation_source: "platform_wechat_query",
          compensation_actor_employee_id: authContext.employeeId ?? null,
          compensation_notify_id: notifyId,
          out_trade_no: outTradeNo,
        },
      });
      await this.rechargeRepository.markWechatNotificationProcessed({
        notificationId: notification.id,
      });
      await this.recordCompensationAudit({
        authContext,
        order,
        status: "success",
        summary: "微信支付查单确认积分充值入账",
        metadata: {
          reason,
          out_trade_no: outTradeNo,
          transaction_id: transactionId,
          notification_id: notification.id,
          paid_amount_fen: paidAmountFen,
          confirm_idempotent: confirmResult.idempotent,
        },
      });
      return this.buildCompensationResult({
        order,
        outTradeNo,
        transaction,
        notification,
        confirmResult,
      });
    } catch (error) {
      await this.rechargeRepository.markWechatNotificationFailed({
        notificationId: notification.id,
        errorMessage: getErrorMessage(error),
      });
      await this.recordCompensationAudit({
        authContext,
        order,
        status: "failure",
        summary: "微信支付查单补偿积分充值入账失败",
        metadata: {
          reason,
          out_trade_no: outTradeNo,
          transaction_id: transactionId,
          notification_id: notification.id,
          error_message: getErrorMessage(error),
        },
      });
      throw error;
    }
  }

  private async recoverPaidOrder(input: {
    authContext: AuthContext;
    order: TenantCreditOrderRecord;
    outTradeNo: string;
    reason: string | null;
  }) {
    const { authContext, order, outTradeNo, reason } = input;
    const transactionId = this.optionalString(order.transaction_id);
    const auditMetadata = {
      reason,
      out_trade_no: outTradeNo,
      transaction_id: transactionId,
      notification_id: order.latest_notification_id,
      paid_amount_fen: order.paid_amount_fen,
    };

    try {
      if (!transactionId) {
        throw Errors.business(
          409,
          "已支付积分充值订单缺少微信支付交易号",
          "BILLING_RECHARGE_TRANSACTION_ID_REQUIRED",
        );
      }
      const confirmResult = await this.rechargeRepository.confirmWechatRecharge({
        orderId: order.id,
        transactionId,
        paidAmountFen: order.paid_amount_fen,
        paidAt: order.paid_at,
        notificationId: order.latest_notification_id,
        metadata: {
          compensation_source: "platform_paid_recovery",
          compensation_actor_employee_id: authContext.employeeId ?? null,
          out_trade_no: outTradeNo,
        },
      });
      await this.recordCompensationAudit({
        authContext,
        order,
        status: "success",
        summary: "已支付积分充值原子恢复订阅",
        metadata: { ...auditMetadata, confirm_idempotent: confirmResult.idempotent },
      });
      return {
        compensated: false,
        already_paid: true,
        trade_state: "SUCCESS",
        order_id: order.id,
        out_trade_no: outTradeNo,
        transaction_id: transactionId,
        notification_id: order.latest_notification_id,
        result: confirmResult,
      };
    } catch (error) {
      await this.recordCompensationAudit({
        authContext,
        order,
        status: "failure",
        summary: "已支付积分充值原子恢复订阅失败",
        metadata: { ...auditMetadata, error_message: getErrorMessage(error) },
      });
      throw error;
    }
  }

  private async findOrCreateCompensationNotification(input: {
    order: TenantCreditOrderRecord;
    notifyId: string;
    transaction: WechatPayValidatedSuccessTransaction;
  }) {
    const existing =
      await this.rechargeRepository.findWechatNotificationByNotifyId({
        notifyId: input.notifyId,
      });
    if (existing) return existing;

    return this.rechargeRepository.createWechatNotification({
      tenant_id: input.order.tenant_id,
      credit_order_id: input.order.id,
      notify_id: input.notifyId,
      event_type: "TRANSACTION.SUCCESS",
      resource_type: "wechatpay-query",
      raw_payload: {
        source: "platform_wechat_query_compensation",
        transaction: input.transaction,
      },
      signature_valid: true,
      processed: false,
    });
  }

  private buildCompensationResult(input: {
    order: TenantCreditOrderRecord;
    outTradeNo: string;
    transaction: WechatPayValidatedSuccessTransaction;
    notification: TenantCreditWechatNotificationRecord;
    confirmResult: BillingConfirmWechatRechargeResult;
  }) {
    return {
      compensated: true,
      already_paid: Boolean(input.confirmResult.idempotent),
      trade_state: input.transaction.tradeState,
      order_id: input.order.id,
      out_trade_no: input.outTradeNo,
      transaction_id: input.transaction.transactionId,
      notification_id: input.notification.id,
      result: input.confirmResult,
    };
  }

  private async recordCompensationAudit(input: {
    authContext: AuthContext;
    order: TenantCreditOrderRecord;
    status: "success" | "failure";
    summary: string;
    metadata: Record<string, unknown>;
  }) {
    await this.auditLogService.recordBestEffort({
      action: "platform_billing_recharge",
      actorEmployeeId: input.authContext.employeeId ?? null,
      actorUserId: input.authContext.authUserId ?? null,
      targetTenantId: input.order.tenant_id,
      resourceType: "tenant_credit_order",
      resourceId: input.order.id,
      resourceLabel: input.order.order_no,
      status: input.status,
      summary: input.summary,
      metadata: input.metadata,
    });
  }

  private optionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}

export const platformBillingRechargeCompensationService =
  new PlatformBillingRechargeCompensationService();

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
