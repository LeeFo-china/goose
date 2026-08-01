import { Errors } from "@/errors/error-factory";
import { brandingVirtualOrderRepository } from "@/repositories/branding-virtual-orders";
import { brandingVirtualRefundRepository } from "@/repositories/branding-virtual-refunds";
import {
  parseWechatVirtualPaymentSecretBundle,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { systemSettingsService } from "@/services/system-settings";
import {
  wechatMiniProgramAccessTokenProvider,
  type WechatMiniProgramAccessTokenPort,
} from "@/services/wechat-miniprogram-access-token";
import { wechatMiniSessionCredentialService } from "@/services/wechat-mini-session-credentials";
import { WechatVirtualPaymentGateway } from "@/services/wechat-virtual-payment-gateway";
import type { WechatVirtualPaymentGatewayPort } from "@/services/wechat-virtual-payment-gateway-contracts";
import type { WechatVirtualRefundNotificationMessage } from "@/services/wechat-virtual-payment-message";

type OrdersPort = Pick<typeof brandingVirtualOrderRepository, "findByOutTradeNo">;
type RefundsPort = Pick<typeof brandingVirtualRefundRepository,
  "findOrderContext" | "recordAppleRefundOrderTypeFact">;
type SettingsPort = Pick<typeof systemSettingsService, "getPlatformSecretString">;
type GatewayPort = Pick<WechatVirtualPaymentGatewayPort, "queryOrder">;

export interface WechatVirtualPaymentRefundChannelPort {
  ensureTrusted(message: WechatVirtualRefundNotificationMessage): Promise<void>;
}

export class WechatVirtualPaymentRefundChannelVerifier
  implements WechatVirtualPaymentRefundChannelPort {
  private readonly orders: OrdersPort;
  private readonly refunds: RefundsPort;
  private readonly settings: SettingsPort;
  private readonly gateway: GatewayPort;
  private readonly accessTokenProvider: WechatMiniProgramAccessTokenPort;

  constructor(dependencies: {
    orders?: OrdersPort;
    refunds?: RefundsPort;
    settings?: SettingsPort;
    gateway?: GatewayPort;
    accessTokenProvider?: WechatMiniProgramAccessTokenPort;
  } = {}) {
    this.orders = dependencies.orders ?? brandingVirtualOrderRepository;
    this.refunds = dependencies.refunds ?? brandingVirtualRefundRepository;
    this.settings = dependencies.settings ?? systemSettingsService;
    this.gateway = dependencies.gateway ?? new WechatVirtualPaymentGateway({
      credentialInvalidation: wechatMiniSessionCredentialService,
    });
    this.accessTokenProvider = dependencies.accessTokenProvider ??
      wechatMiniProgramAccessTokenProvider;
  }

  async ensureTrusted(
    message: WechatVirtualRefundNotificationMessage,
  ): Promise<void> {
    const order = await this.orders.findByOutTradeNo(message.outTradeNo);
    if (!order) throw refundOrderNotFound();
    const context = await this.refunds.findOrderContext(order.id);
    if (!context) throw refundOrderNotFound();
    if (
      context.out_trade_no !== message.outTradeNo ||
      context.payer_openid !== message.openid ||
      context.provider_order_no !== message.providerOrderId ||
      context.amount_fen !== message.refundFeeFen ||
      context.paid_amount_fen !== context.amount_fen ||
      context.payment_status !== "succeeded" ||
      context.fulfillment_status !== "granted" ||
      !context.entitlement_event_id
    ) {
      throw refundNotificationQueryConflict();
    }
    if (context.provider_order_type !== null) return;

    const [accessToken, signingSecret] = await Promise.all([
      this.accessTokenProvider.getAccessToken(),
      this.requireSecret(context.environment, context.secret_revision),
    ]);
    const result = await this.gateway.queryOrder({
      accessToken,
      openid: context.payer_openid,
      environment: context.environment,
      signingSecret,
      orderId: context.out_trade_no,
    });
    const expectedStatus = message.refundSuccessful ? 8 : 7;
    const expectedRefundFee = message.refundSuccessful ? context.amount_fen : 0;
    const expectedLeftFee = message.refundSuccessful ? 0 : context.amount_fen;
    if (
      result.status !== expectedStatus || result.orderType !== 8 ||
      result.orderId !== context.out_trade_no ||
      result.environment !== context.environment ||
      result.wechatOrderId !== context.provider_order_no ||
      result.orderFee !== context.amount_fen ||
      result.paidFee !== context.amount_fen ||
      result.refundFee !== expectedRefundFee ||
      result.leftFee !== expectedLeftFee
    ) {
      throw refundNotificationQueryConflict();
    }
    await this.refunds.recordAppleRefundOrderTypeFact({
      orderId: context.id,
      officialStatus: result.status,
      providerOrderType: result.orderType,
      outTradeNo: result.orderId,
      environment: result.environment,
      providerOrderNo: result.wechatOrderId,
      orderFeeFen: result.orderFee,
      paidFeeFen: result.paidFee,
      refundFeeFen: result.refundFee,
      leftFeeFen: result.leftFee,
    });
  }

  private async requireSecret(
    environment: "sandbox" | "production",
    revision: number,
  ) {
    const value = await this.settings.getPlatformSecretString(
      WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[environment],
    );
    const secret = parseWechatVirtualPaymentSecretBundle(value);
    if (!secret || secret.revision !== revision) {
      throw Errors.business(409, "虚拟支付退款密钥版本与订单不一致",
        "BRANDING_VIRTUAL_PAYMENT_SECRET_REVISION_INVALID");
    }
    return { environment, appKey: secret.appKey };
  }
}

function refundOrderNotFound() {
  return Errors.business(404, "虚拟支付退款通知订单不存在",
    "BRANDING_VIRTUAL_REFUND_ORDER_NOT_FOUND");
}

function refundNotificationQueryConflict() {
  return Errors.business(
    409,
    "微信虚拟支付退款通知查单事实不一致",
    "BRANDING_VIRTUAL_REFUND_NOTIFICATION_QUERY_CONFLICT",
  );
}

export const wechatVirtualPaymentRefundChannelVerifier =
  new WechatVirtualPaymentRefundChannelVerifier();
