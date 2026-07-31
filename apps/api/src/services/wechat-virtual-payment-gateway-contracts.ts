import type { BrandingVirtualPaymentEnvironment } from "@gooes/domain";

import type { WechatMiniSessionCredentialService } from "./wechat-mini-session-credentials";
import type { WechatVirtualPaymentSigningSecret } from "./wechat-virtual-payment-signatures";

export type CredentialInvalidationPort = Pick<
  WechatMiniSessionCredentialService,
  "invalidate"
>;

export type WechatVirtualPaymentFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type VirtualOrderReference = {
  orderId?: string;
  wechatOrderId?: string;
};

type SignedVirtualPaymentInput = VirtualOrderReference & {
  accessToken: string;
  openid: string;
  environment: BrandingVirtualPaymentEnvironment;
  signingSecret: WechatVirtualPaymentSigningSecret;
};

export type QueryVirtualOrderInput = SignedVirtualPaymentInput;

export type RefundVirtualOrderInput = SignedVirtualPaymentInput & {
  sessionKey: string;
  credential: {
    userId: string;
    credentialId: string;
    sessionRevision: number;
  };
  refundOrderId: string;
  leftFee: number;
  refundFee: number;
  bizMeta: string;
  refundReason: "0" | "1" | "2" | "3" | "4" | "5";
  requestSource: "1" | "2" | "3";
};

export type ProvideVirtualGoodsInput = VirtualOrderReference & {
  accessToken: string;
  environment: BrandingVirtualPaymentEnvironment;
};

export type VirtualOrderStatus = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type VirtualOrderType = 0 | 1 | 7 | 8;
export type VirtualSettlementState = 0 | 1 | 2 | 3;

export type QueryVirtualOrderResult = {
  requestId: string | null;
  environment: BrandingVirtualPaymentEnvironment;
  orderId: string;
  status: VirtualOrderStatus;
  businessType: 0;
  orderType: VirtualOrderType;
  orderFee: number;
  couponFee: number | null;
  paidFee: number;
  refundFee: number;
  leftFee: number;
  createdAt: number;
  updatedAt: number;
  paidAt: number;
  providedAt: number;
  wechatOrderId: string | null;
  channelOrderId: string | null;
  wechatPayOrderId: string | null;
  settledAt: number | null;
  settlementState: VirtualSettlementState | null;
  platformFeeFen: number | null;
  cpsFeeFen: number | null;
};

export type RefundVirtualOrderResult = {
  status: "submitted";
  requestId: string | null;
  refundOrderId: string;
  refundWechatOrderId: string | null;
  payOrderId: string;
  payWechatOrderId: string | null;
};

export type ProvideVirtualGoodsResult = {
  accepted: true;
  requestId: string | null;
};

export interface WechatVirtualPaymentGatewayPort {
  queryOrder(input: QueryVirtualOrderInput): Promise<QueryVirtualOrderResult>;
  refundOrder(input: RefundVirtualOrderInput): Promise<RefundVirtualOrderResult>;
  notifyProvideGoods(
    input: ProvideVirtualGoodsInput,
  ): Promise<ProvideVirtualGoodsResult>;
}
