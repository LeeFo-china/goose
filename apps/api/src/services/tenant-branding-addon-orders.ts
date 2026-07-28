import { Errors } from "@/errors/error-factory";
import type {
  BrandingAddonPaymentOrderRecord,
} from "@/repositories/branding-addon-orders";
import { brandingAddonOrderRepository } from "@/repositories/branding-addon-orders";
import {
  brandingAddonProductRepository,
  type BrandingAddonProductRecord,
} from "@/repositories/branding-addon-products";
import {
  tenantEntitlementsRepository,
  type TenantEntitlementRecord,
} from "@/repositories/tenant-entitlements";
import {
  platformPaymentConfigRepository,
} from "@/repositories/platform-payment-configs";
import type {
  BrandingAddonCreateOrderInput,
  BrandingAddonOrderListQuery,
} from "@/schema/branding-addon";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  BRANDING_ADDON_PAYMENT_WINDOW_MS,
  MAX_POSTGRES_INTEGER_FEN,
} from "@/services/branding-addon-contracts";
import {
  assertBrandingAddonOrderPayerMatches,
  buildBrandingAddonOrderCreateInput,
  createBrandingAddonTradeNo,
} from "@/services/tenant-branding-addon-order-creation";
import {
  toTenantBrandingAddonOrderView,
  toTenantBrandingAddonProductView,
} from "@/services/branding-addon-order-views";
import {
  type BrandingAddonGatewayPort,
  type BrandingAddonPaymentConfigRepositoryPort,
  type BrandingAddonSecretBundleServicePort,
  isBrandingAddonPostInsertPaymentGuardError,
  TenantBrandingAddonOrderPayment,
} from "@/services/tenant-branding-addon-order-payment";
import { wechatPayGateway } from "@/services/wechat-pay-gateway";
import { wechatPaySecretBundleService } from "@/services/wechat-pay-secret-bundles";

const PURCHASE_PERMISSION = "brand.entitlement.purchase";
const READ_PERMISSION = "brand.entitlement_order.read";
const TENANT_ADMIN_ROLE = "system_admin";

type ProductRepositoryPort = Pick<
  typeof brandingAddonProductRepository,
  "getProduct"
>;
type OrderRepositoryPort = Pick<
  typeof brandingAddonOrderRepository,
  | "findByIdempotencyKey"
  | "findPendingByTenantProduct"
  | "createOrder"
  | "markPrepayCreated"
  | "markFailedBeforePrepay"
  | "findInternalTenantOrderById"
  | "findTenantOrderById"
  | "listTenantOrders"
>;
type EntitlementRepositoryPort = Pick<
  typeof tenantEntitlementsRepository,
  "findByCode"
>;
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "hasPermission"
>;

export type TenantBrandingAddonOrderServiceDependencies = {
  productRepository?: ProductRepositoryPort;
  orderRepository?: OrderRepositoryPort;
  entitlementRepository?: EntitlementRepositoryPort;
  paymentConfigRepository?: BrandingAddonPaymentConfigRepositoryPort;
  accessPolicy?: AccessPolicyPort;
  secretBundleService?: BrandingAddonSecretBundleServicePort;
  wechatPayGateway?: BrandingAddonGatewayPort;
  tradeNoFactory?: () => string;
  nowFactory?: () => Date;
};

export class TenantBrandingAddonOrderService {
  private readonly productRepository: ProductRepositoryPort;
  private readonly orderRepository: OrderRepositoryPort;
  private readonly entitlementRepository: EntitlementRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly payment: TenantBrandingAddonOrderPayment;
  private readonly tradeNoFactory: () => string;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: TenantBrandingAddonOrderServiceDependencies = {},
  ) {
    this.productRepository = dependencies.productRepository ??
      brandingAddonProductRepository;
    this.orderRepository = dependencies.orderRepository ??
      brandingAddonOrderRepository;
    this.entitlementRepository = dependencies.entitlementRepository ??
      tenantEntitlementsRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.tradeNoFactory = dependencies.tradeNoFactory ??
      createBrandingAddonTradeNo;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.payment = new TenantBrandingAddonOrderPayment({
      orderRepository: this.orderRepository,
      paymentConfigRepository: dependencies.paymentConfigRepository ??
        platformPaymentConfigRepository,
      secretBundleService: dependencies.secretBundleService ??
        wechatPaySecretBundleService,
      gateway: dependencies.wechatPayGateway ?? wechatPayGateway,
      nowFactory: this.nowFactory,
    });
  }

  async getProduct(authContext: AuthContext) {
    const tenantId = this.requirePurchaser(authContext).tenantId;
    const [product, entitlement] = await Promise.all([
      this.requireEnabledProduct(),
      this.findEntitlement(tenantId),
    ]);
    const responseNow = this.nowFactory();
    return {
      product: toTenantBrandingAddonProductView(product, entitlement),
      server_time: responseNow.toISOString(),
    };
  }

  /**
   * payerOpenid is payment payer data, never a tenant selector. The HTTP
   * controller binds it to the verified mini-program JWT.
   */
  async createOrder(
    authContext: AuthContext,
    input: BrandingAddonCreateOrderInput,
    payerOpenid: string,
  ) {
    const actor = this.requirePurchaser(authContext);
    const entitlement = await this.findEntitlement(actor.tenantId);
    assertEntitlementAllowsPurchase(entitlement);

    const replay = await this.orderRepository.findByIdempotencyKey({
      tenantId: actor.tenantId,
      idempotencyKey: input.idempotency_key,
    });
    if (replay) {
      return this.buildCreateResult(
        replay,
        entitlement,
        payerOpenid,
        true,
        false,
      );
    }

    const pending = await this.orderRepository.findPendingByTenantProduct({
      tenantId: actor.tenantId,
      productCode: input.product_code,
    });
    if (pending) {
      return this.buildCreateResult(
        pending,
        entitlement,
        payerOpenid,
        false,
        true,
      );
    }

    const product = await this.requireEnabledProduct();
    const preflight = await this.payment.preflight();
    const tradeNo = this.tradeNoFactory();
    const creationNow = this.nowFactory();
    const expiresAt = new Date(
      creationNow.getTime() + BRANDING_ADDON_PAYMENT_WINDOW_MS,
    ).toISOString();
    const createInput = buildBrandingAddonOrderCreateInput({
      actor,
      input,
      payerOpenid,
      product,
      config: preflight.config,
      guardVersion: preflight.guardVersion,
      tradeNo,
      expiresAt,
    });

    let created: BrandingAddonPaymentOrderRecord;
    try {
      created = await this.orderRepository.createOrder(createInput);
    } catch (error) {
      const recovered = await this.recoverCreateConflict(
        error,
        actor.tenantId,
        input,
        payerOpenid,
        entitlement,
      );
      if (recovered) return recovered;
      throw error;
    }

    let payment: Awaited<
      ReturnType<TenantBrandingAddonOrderPayment["createInitialPrepay"]>
    >;
    try {
      payment = await this.payment.createInitialPrepay(created);
    } catch (error) {
      if (isBrandingAddonPostInsertPaymentGuardError(error)) {
        await this.orderRepository.markFailedBeforePrepay({
          tenantId: actor.tenantId,
          orderId: created.id,
          paymentConfigId: created.payment_config_id,
          expectedGuardVersion: created.expected_guard_version,
        });
      }
      throw error;
    }

    const responseNow = this.nowFactory();
    return {
      idempotent: false,
      reused_pending: false,
      order: toTenantBrandingAddonOrderView(
        payment.order,
        entitlement,
        responseNow,
      ),
      payment_request: payment.paymentRequest,
      server_time: responseNow.toISOString(),
    };
  }

  async createPaymentRequest(
    authContext: AuthContext,
    orderId: string,
    payerOpenid: string,
  ) {
    const actor = this.requirePurchaser(authContext);
    const entitlement = await this.findEntitlement(actor.tenantId);
    assertEntitlementAllowsPurchase(entitlement);
    const order = await this.orderRepository.findInternalTenantOrderById({
      tenantId: actor.tenantId,
      orderId,
    });
    if (!order) throw orderNotFound();
    assertBrandingAddonOrderPayerMatches(order, payerOpenid);
    this.payment.assertPayable(order, this.nowFactory());

    const paymentRequest = await this.payment.preparePaymentRequest(order);
    const responseNow = this.nowFactory();
    return {
      order: toTenantBrandingAddonOrderView(order, entitlement, responseNow),
      payment_request: paymentRequest,
      server_time: responseNow.toISOString(),
    };
  }

  async listOrders(
    authContext: AuthContext,
    query: BrandingAddonOrderListQuery,
  ) {
    const tenantId = this.requireReader(authContext);
    const [orders, entitlement] = await Promise.all([
      this.orderRepository.listTenantOrders({
        tenantId,
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        keyword: query.keyword,
      }),
      this.findEntitlement(tenantId),
    ]);
    const responseNow = this.nowFactory();
    return {
      ...orders,
      list: orders.list.map((order) =>
        toTenantBrandingAddonOrderView(order, entitlement, responseNow)
      ),
      server_time: responseNow.toISOString(),
    };
  }

  async getOrder(authContext: AuthContext, orderId: string) {
    const tenantId = this.requireReader(authContext);
    const [order, entitlement] = await Promise.all([
      this.orderRepository.findTenantOrderById({ tenantId, orderId }),
      this.findEntitlement(tenantId),
    ]);
    if (!order) throw orderNotFound();
    const responseNow = this.nowFactory();
    return {
      order: toTenantBrandingAddonOrderView(order, entitlement, responseNow),
      server_time: responseNow.toISOString(),
    };
  }

  private requirePurchaser(authContext: AuthContext) {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    if (
      !authContext.employeeId ||
      !authContext.roleCodes.includes(TENANT_ADMIN_ROLE) ||
      !this.accessPolicy.hasPermission(authContext, PURCHASE_PERMISSION)
    ) {
      throw Errors.business(
        403,
        "仅当前租户管理员可以购买品牌权益",
        "BRANDING_ENTITLEMENT_PURCHASE_FORBIDDEN",
      );
    }
    return { tenantId, employeeId: authContext.employeeId };
  }

  private requireReader(authContext: AuthContext) {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    if (
      !authContext.employeeId ||
      !this.accessPolicy.hasPermission(authContext, READ_PERMISSION)
    ) {
      throw Errors.forbidden();
    }
    return tenantId;
  }

  private async requireEnabledProduct() {
    let product: BrandingAddonProductRecord | null;
    try {
      product = await this.productRepository.getProduct();
    } catch {
      throw Errors.dbError("查询年度品牌权益商品失败");
    }
    if (
      !product ||
      !product.enabled ||
      !Number.isSafeInteger(product.amount_fen) ||
      Number(product.amount_fen) <= 0 ||
      Number(product.amount_fen) > MAX_POSTGRES_INTEGER_FEN
    ) {
      throw Errors.business(
        404,
        "年度品牌权益商品不存在或未上架",
        "BRANDING_ADDON_PRODUCT_NOT_FOUND",
      );
    }
    return product as BrandingAddonProductRecord & { amount_fen: number };
  }

  private async findEntitlement(tenantId: string) {
    try {
      return await this.entitlementRepository.findByCode(
        tenantId,
        "custom_support_branding",
      );
    } catch {
      throw Errors.dbError("查询租户品牌权益失败");
    }
  }

  private async buildCreateResult(
    order: BrandingAddonPaymentOrderRecord,
    entitlement: TenantEntitlementRecord | null,
    payerOpenid: string,
    idempotent: boolean,
    reusedPending: boolean,
  ) {
    assertBrandingAddonOrderPayerMatches(order, payerOpenid);
    const responseNow = this.nowFactory();
    if (reusedPending) {
      this.payment.assertPayable(order, responseNow);
    }
    const isPayable = isPendingAndOpen(order, responseNow);
    const paymentRequest = isPayable
      ? await this.payment.preparePaymentRequest(order)
      : null;
    return {
      idempotent,
      reused_pending: reusedPending,
      order: toTenantBrandingAddonOrderView(order, entitlement, responseNow),
      payment_request: paymentRequest,
      server_time: responseNow.toISOString(),
    };
  }

  private async recoverCreateConflict(
    error: unknown,
    tenantId: string,
    input: BrandingAddonCreateOrderInput,
    payerOpenid: string,
    entitlement: TenantEntitlementRecord | null,
  ) {
    const code = readErrorCode(error);
    if (code === "BRANDING_ADDON_IDEMPOTENCY_KEY_CONFLICT") {
      const existing = await this.orderRepository.findByIdempotencyKey({
        tenantId,
        idempotencyKey: input.idempotency_key,
      });
      return existing
        ? this.buildCreateResult(
          existing,
          entitlement,
          payerOpenid,
          true,
          false,
        )
        : null;
    }
    if (code === "BRANDING_ADDON_PENDING_ORDER_EXISTS") {
      const pending = await this.orderRepository.findPendingByTenantProduct({
        tenantId,
        productCode: input.product_code,
      });
      return pending
        ? this.buildCreateResult(
          pending,
          entitlement,
          payerOpenid,
          false,
          true,
        )
        : null;
    }
    return null;
  }
}

function assertEntitlementAllowsPurchase(
  entitlement: TenantEntitlementRecord | null,
) {
  if (entitlement?.status === "suspended") {
    throw Errors.business(
      409,
      "品牌权益已暂停，不能购买或续费",
      "BRANDING_ENTITLEMENT_SUSPENDED",
    );
  }
  if (entitlement?.status === "revoked") {
    throw Errors.business(
      409,
      "品牌权益已撤销，不能购买或续费",
      "BRANDING_ENTITLEMENT_REVOKED",
    );
  }
}

function isPendingAndOpen(
  order: BrandingAddonPaymentOrderRecord,
  now: Date,
) {
  const expiresAt = Date.parse(order.payment_expires_at);
  return order.status === "pending" &&
    order.channel === "wechat_pay" &&
    Number.isFinite(expiresAt) &&
    expiresAt > now.getTime();
}

function readErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function orderNotFound() {
  return Errors.business(
    404,
    "年度品牌权益订单不存在",
    "BRANDING_ADDON_ORDER_NOT_FOUND",
  );
}

export const tenantBrandingAddonOrderService =
  new TenantBrandingAddonOrderService();
