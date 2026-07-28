import { Errors } from "@/errors/error-factory";
import {
  brandingAddonOrderRepository,
} from "@/repositories/branding-addon-orders";
import {
  billingRechargeRepository,
  type BillingWechatRefundRequestMatch,
  type TenantCreditOrderRecord,
} from "@/repositories/billing-recharge";
import {
  customerWechatPaySmokeRepository,
  type CustomerWechatPaySmokeOrderRecord,
} from "@/repositories/customer-wechat-pay-smoke";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
} from "@/repositories/platform-payment-configs";
import {
  wechatPayConfigRepository,
  type WechatPayConfigRecord,
} from "@/repositories/wechat-pay-configs";
import {
  wechatPayOrderRepository,
  type WechatPayOrderRecord,
} from "@/repositories/wechat-pay-orders";
import {
  decryptWechatPayResource,
  verifyWechatPayCallbackSignature,
} from "@/services/wechat-pay-callback-crypto";
import {
  isPlatformPaymentSecretBundleRevisionError,
  requireMatchingPlatformPaymentSecretBundle,
} from "@/services/platform-payment-secret-bundle-revision";
import { wechatPaySecretBundleService } from "@/services/wechat-pay-secret-bundles";
import {
  type BrandingAddonCallbackContext,
  type CreditRechargeCallbackContext,
  WechatPayPlatformPaymentCallbackMatcher,
} from "@/services/wechat-pay-callback-platform-payment";
export type {
  BrandingAddonCallbackContext,
  CreditRechargeCallbackContext,
} from "@/services/wechat-pay-callback-platform-payment";

export type CallbackHeaders = Record<string, string | string[] | undefined>;

type ConfigRepositoryPort = Pick<
  typeof wechatPayConfigRepository,
  "listCallbackCandidateConfigs"
>;
type PlatformConfigRepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "listCallbackCandidateConfigs"
>;
type SecretBundleServicePort = Pick<typeof wechatPaySecretBundleService, "load">;
type ProjectOrderRepositoryPort = Pick<typeof wechatPayOrderRepository, "findByOutTradeNo">;
type CustomerSmokeRepositoryPort = Pick<
  typeof customerWechatPaySmokeRepository,
  "findByOutTradeNo"
>;
type CreditRechargeRepositoryPort = Pick<
  typeof billingRechargeRepository,
  "findWechatOrderByOutTradeNo" | "findWechatRefundRequestByOutRefundNo"
>;
type BrandingAddonRepositoryPort = Pick<
  typeof brandingAddonOrderRepository,
  "findByOutTradeNo"
>;

export type WechatPayCallbackCrypto = {
  verifySignature: typeof verifyWechatPayCallbackSignature;
  decryptResource: typeof decryptWechatPayResource;
};

export type WechatPayCallbackContextMatcherDependencies = {
  configRepository?: ConfigRepositoryPort;
  platformConfigRepository?: PlatformConfigRepositoryPort;
  secretBundleService?: SecretBundleServicePort;
  crypto?: WechatPayCallbackCrypto;
  orderRepository?: ProjectOrderRepositoryPort;
  customerSmokeRepository?: CustomerSmokeRepositoryPort;
  creditRechargeRepository?: CreditRechargeRepositoryPort;
  brandingAddonMatchRepository?: BrandingAddonRepositoryPort;
};

export type ProjectPaymentCallbackContext = {
  kind: "project_payment";
  config: WechatPayConfigRecord;
  payload: Record<string, unknown>;
  resource: Record<string, unknown>;
  order: WechatPayOrderRecord;
};

export type CustomerWechatPaySmokeCallbackContext = {
  kind: "customer_wechat_pay_smoke";
  config: WechatPayConfigRecord;
  payload: Record<string, unknown>;
  resource: Record<string, unknown>;
  order: CustomerWechatPaySmokeOrderRecord;
};

export type CreditRechargeRefundCallbackContext = {
  kind: "credit_recharge_refund";
  config: PlatformPaymentConfigRecord;
  payload: Record<string, unknown>;
  resource: Record<string, unknown>;
  refundRequest: BillingWechatRefundRequestMatch["request"];
  order: TenantCreditOrderRecord;
};

export type MatchedCallbackContext =
  | ProjectPaymentCallbackContext
  | CustomerWechatPaySmokeCallbackContext
  | BrandingAddonCallbackContext
  | CreditRechargeCallbackContext
  | CreditRechargeRefundCallbackContext;

export class WechatPayCallbackContextMatcher {
  private readonly configRepository: ConfigRepositoryPort;
  private readonly platformConfigRepository: PlatformConfigRepositoryPort;
  private readonly secretBundleService: SecretBundleServicePort;
  private readonly crypto: WechatPayCallbackCrypto;
  private readonly orderRepository: ProjectOrderRepositoryPort;
  private readonly customerSmokeRepository: CustomerSmokeRepositoryPort;
  private readonly creditRechargeRepository: CreditRechargeRepositoryPort;
  private readonly platformPaymentMatcher:
    WechatPayPlatformPaymentCallbackMatcher;

  constructor(dependencies: WechatPayCallbackContextMatcherDependencies = {}) {
    this.configRepository = dependencies.configRepository ??
      wechatPayConfigRepository;
    this.platformConfigRepository = dependencies.platformConfigRepository ??
      platformPaymentConfigRepository;
    this.secretBundleService = dependencies.secretBundleService ??
      wechatPaySecretBundleService;
    this.crypto = dependencies.crypto ?? {
      verifySignature: verifyWechatPayCallbackSignature,
      decryptResource: decryptWechatPayResource,
    };
    this.orderRepository = dependencies.orderRepository ??
      wechatPayOrderRepository;
    this.customerSmokeRepository = dependencies.customerSmokeRepository ??
      customerWechatPaySmokeRepository;
    this.creditRechargeRepository = dependencies.creditRechargeRepository ??
      billingRechargeRepository;
    this.platformPaymentMatcher =
      new WechatPayPlatformPaymentCallbackMatcher(
        dependencies.brandingAddonMatchRepository ??
          brandingAddonOrderRepository,
        this.creditRechargeRepository,
      );
  }

  async match(input: {
    rawBody: string;
    headers: CallbackHeaders;
    payload: Record<string, unknown>;
  }): Promise<MatchedCallbackContext> {
    const timestamp = this.requireHeader(input.headers, "wechatpay-timestamp");
    const nonce = this.requireHeader(input.headers, "wechatpay-nonce");
    const signature = this.requireHeader(input.headers, "wechatpay-signature");
    const callbackSerial = this.optionalHeader(input.headers, "wechatpay-serial");
    const resource = this.requireResource(input.payload);
    if (this.isRefundEvent(input.payload)) {
      const refundMatch = await this.matchCreditRechargeRefund({
        ...input,
        timestamp,
        nonce,
        signature,
        callbackSerial,
        resource,
      });
      if (refundMatch) return refundMatch;
      throw Errors.business(
        401,
        "微信支付退款回调签名或退款单匹配失败",
        "WECHAT_PAY_REFUND_CALLBACK_VERIFY_FAILED",
      );
    }

    const platformPaymentMatch = await this.matchPlatformPayment({
      ...input,
      timestamp,
      nonce,
      signature,
      callbackSerial,
      resource,
    });
    if (platformPaymentMatch) return platformPaymentMatch;

    const projectMatch = await this.matchProjectPayment({
      ...input,
      timestamp,
      nonce,
      signature,
      callbackSerial,
      resource,
    });
    if (projectMatch) return projectMatch;

    const smokeMatch = await this.matchCustomerWechatPaySmoke({
      ...input,
      timestamp,
      nonce,
      signature,
      callbackSerial,
      resource,
    });
    if (smokeMatch) return smokeMatch;

    throw Errors.business(
      401,
      "微信支付回调签名或订单匹配失败",
      "WECHAT_PAY_CALLBACK_VERIFY_FAILED",
    );
  }

  private async matchProjectPayment(input: MatchInput) {
    const configs = await this.configRepository.listCallbackCandidateConfigs();
    for (const config of configs) {
      const decrypted = await this.verifyAndDecrypt({ ...input, config });
      if (!decrypted) continue;
      const outTradeNo = this.requireString(
        decrypted,
        "out_trade_no",
        "微信支付回调缺少商户订单号",
      );
      const order = await this.orderRepository.findByOutTradeNo(outTradeNo);
      if (order?.payment_config_id === config.id) {
        return {
          kind: "project_payment",
          config,
          payload: input.payload,
          resource: decrypted,
          order,
        } satisfies ProjectPaymentCallbackContext;
      }
    }
    return null;
  }

  private async matchCustomerWechatPaySmoke(input: MatchInput) {
    const configs = await this.configRepository.listCallbackCandidateConfigs();
    for (const config of configs) {
      const decrypted = await this.verifyAndDecrypt({ ...input, config });
      if (!decrypted) continue;
      const outTradeNo = this.requireString(
        decrypted,
        "out_trade_no",
        "微信支付回调缺少商户订单号",
      );
      const order = await this.customerSmokeRepository.findByOutTradeNo(
        outTradeNo,
      );
      if (order?.payment_config_id === config.id) {
        return {
          kind: "customer_wechat_pay_smoke",
          config,
          payload: input.payload,
          resource: decrypted,
          order,
        } satisfies CustomerWechatPaySmokeCallbackContext;
      }
    }
    return null;
  }

  private async matchCreditRechargeRefund(input: MatchInput) {
    const configs =
      await this.platformConfigRepository.listCallbackCandidateConfigs();
    for (const config of configs) {
      const decrypted = await this.verifyAndDecrypt({
        ...input,
        config,
        platformConfig: config,
      });
      if (!decrypted) continue;
      const outRefundNo = this.requireString(
        decrypted,
        "out_refund_no",
        "微信支付退款回调缺少商户退款单号",
      );
      const matched =
        await this.creditRechargeRepository.findWechatRefundRequestByOutRefundNo(
          outRefundNo,
        );
      if (matched?.order.payment_config_id === config.id) {
        return {
          kind: "credit_recharge_refund",
          config,
          payload: input.payload,
          resource: decrypted,
          refundRequest: matched.request,
          order: matched.order,
        } satisfies CreditRechargeRefundCallbackContext;
      }
    }
    return null;
  }

  private async matchPlatformPayment(input: MatchInput) {
    const configs =
      await this.platformConfigRepository.listCallbackCandidateConfigs();
    for (const config of configs) {
      const decrypted = await this.verifyAndDecrypt({
        ...input,
        config,
        platformConfig: config,
      });
      if (!decrypted) continue;
      const matched = await this.platformPaymentMatcher.match({
        config,
        payload: input.payload,
        decrypted,
      });
      if (matched) return matched;
    }
    return null;
  }

  private async verifyAndDecrypt(input: MatchInput & {
    config: Pick<WechatPayConfigRecord, "encrypted_config_ref"> |
      Pick<PlatformPaymentConfigRecord, "encrypted_config_ref">;
    platformConfig?: PlatformPaymentConfigRecord;
  }) {
    const loadedBundle = await this.secretBundleService.load(
      input.config.encrypted_config_ref,
    );
    let bundle = loadedBundle;
    if (input.platformConfig) {
      try {
        bundle = requireMatchingPlatformPaymentSecretBundle(
          input.platformConfig,
          loadedBundle,
        );
      } catch (error) {
        if (isPlatformPaymentSecretBundleRevisionError(error)) return null;
        throw error;
      }
    }
    if (!bundle.wechatPayPublicKeyPem) return null;
    if (
      input.callbackSerial &&
      bundle.wechatPayPublicKeyId &&
      input.callbackSerial !== bundle.wechatPayPublicKeyId
    ) {
      return null;
    }

    const signatureValid = this.crypto.verifySignature({
      timestamp: input.timestamp,
      nonce: input.nonce,
      rawBody: input.rawBody,
      signature: input.signature,
      publicKeyPem: bundle.wechatPayPublicKeyPem,
    });
    if (!signatureValid) return null;

    try {
      return this.crypto.decryptResource({
        apiV3Key: bundle.apiV3Key,
        nonce: this.requireString(input.resource, "nonce", "回调资源 nonce 缺失"),
        associatedData: this.optionalString(input.resource.associated_data) ?? "",
        ciphertext: this.requireString(
          input.resource,
          "ciphertext",
          "回调资源密文缺失",
        ),
      });
    } catch {
      return null;
    }
  }

  private requireResource(payload: Record<string, unknown>) {
    const resource = payload.resource;
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) {
      throw Errors.badRequest("微信支付回调资源缺失");
    }
    return resource as Record<string, unknown>;
  }

  private requireHeader(headers: CallbackHeaders, key: string) {
    const value = this.optionalHeader(headers, key);
    if (!value) {
      throw Errors.badRequest(`微信支付回调缺少请求头 ${key}`);
    }
    return value;
  }

  private optionalHeader(headers: CallbackHeaders, key: string) {
    const value = headers[key] ?? headers[key.toLowerCase()];
    const first = Array.isArray(value) ? value[0] : value;
    return this.optionalString(first);
  }

  private requireString(
    record: Record<string, unknown>,
    key: string,
    message: string,
  ) {
    const value = this.optionalString(record[key]);
    if (!value) {
      throw Errors.badRequest(message);
    }
    return value;
  }

  private optionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private isRefundEvent(payload: Record<string, unknown>) {
    const eventType = this.optionalString(payload.event_type);
    return Boolean(eventType?.startsWith("REFUND."));
  }
}


type MatchInput = {
  rawBody: string;
  payload: Record<string, unknown>;
  timestamp: string;
  nonce: string;
  signature: string;
  callbackSerial: string | null;
  resource: Record<string, unknown>;
};
