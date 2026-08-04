import { Errors } from "@/errors/error-factory";
import {
  platformServiceOrderRepository,
  type PlatformServiceOrderRepository,
} from "@/repositories/platform-service-orders";
import type { PlatformProductRecord } from "@/repositories/platform-service-order-records";
import type {
  PlatformServiceProductActionInput,
  PlatformServiceProductDraftInput,
  PlatformServiceProductListQuery,
  PlatformServiceProductUpdateInput,
} from "@/schema/platform-service-products";
import type { AuthContext } from "@/services/authorization";
import { serializePlatformServiceProduct } from "@/services/platform-service-order-views";

type RepositoryPort = Pick<
  PlatformServiceOrderRepository,
  | "listPlatformProducts"
  | "createProductDraft"
  | "updateProductDraft"
  | "findPlatformProductById"
  | "publishProductVersion"
  | "archiveProduct"
  | "hasOrdersForProduct"
>;

type PlatformServiceProductServiceDependencies = {
  repository?: RepositoryPort;
};

const PRODUCT_MANAGE_PERMISSION = "platform.service_product.manage";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class PlatformServiceProductService {
  private readonly repository: RepositoryPort;

  constructor(dependencies: PlatformServiceProductServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformServiceOrderRepository;
  }

  async listProducts(
    authContext: AuthContext,
    query: Partial<PlatformServiceProductListQuery> = {},
  ) {
    this.assertPlatformAdmin(authContext);
    const products = await this.repository.listPlatformProducts({
      page: normalizePositiveInteger(query.page, DEFAULT_PAGE),
      pageSize: normalizePageSize(query.pageSize),
    });
    return {
      ...products,
      list: products.list.map(serializePlatformServiceProduct),
    };
  }

  async createProduct(
    authContext: AuthContext,
    input: PlatformServiceProductDraftInput,
  ) {
    const employeeId = this.assertCanManage(authContext);
    const product = await this.repository.createProductDraft({
      code: input.code,
      title: input.title,
      termYears: input.term_years,
      listAmountFen: input.list_amount_fen,
      amountFen: input.amount_fen,
      serviceScope: input.service_scope,
      termsContent: input.terms_content,
      employeeId,
    });
    return serializePlatformServiceProduct(product);
  }

  async updateProduct(
    authContext: AuthContext,
    productId: string,
    input: PlatformServiceProductUpdateInput,
  ) {
    const employeeId = this.assertCanManage(authContext);
    const currentProduct = input.code !== undefined || input.terms_content !== undefined
      ? await this.requireProduct(productId)
      : null;
    if (
      input.code !== undefined &&
      currentProduct &&
      input.code !== currentProduct.code &&
      await this.repository.hasOrdersForProduct(productId)
    ) {
      throw Errors.business(
        409,
        "平台服务商品已有订单，不能修改商品编码",
        "SERVICE_PRODUCT_CODE_LOCKED",
      );
    }
    const termsVersion = input.terms_content !== undefined && currentProduct &&
        input.terms_content !== currentProduct.terms_content
      ? currentProduct.terms_version + 1
      : undefined;
    const product = await this.repository.updateProductDraft({
      productId,
      expectedVersion: input.expected_version,
      employeeId,
      code: input.code,
      title: input.title,
      termYears: input.term_years,
      listAmountFen: input.list_amount_fen,
      amountFen: input.amount_fen,
      serviceScope: input.service_scope,
      termsContent: input.terms_content,
      termsVersion,
    });
    if (!product) {
      throw Errors.business(
        409,
        "平台服务商品已被更新，请刷新后重试",
        "SERVICE_PRODUCT_VERSION_CONFLICT",
      );
    }
    return serializePlatformServiceProduct(product);
  }

  async publishProduct(
    authContext: AuthContext,
    productId: string,
    input: PlatformServiceProductActionInput,
  ) {
    const employeeId = this.assertCanManage(authContext);
    const product = await this.requireProduct(productId);
    this.assertExpectedVersion(product, input.expected_version);

    const publishedVersion = await this.repository.publishProductVersion({
      productId,
      expectedVersion: input.expected_version,
      title: product.title,
      termYears: product.term_years,
      listAmountFen: product.list_amount_fen,
      amountFen: product.amount_fen,
      serviceScope: product.service_scope,
      termsVersion: product.terms_version,
      termsContent: product.terms_content,
      employeeId,
    });
    if (!publishedVersion) {
      throw Errors.business(
        409,
        "平台服务商品已被更新，请刷新后重试",
        "SERVICE_PRODUCT_VERSION_CONFLICT",
      );
    }

    return {
      product_id: productId,
      published_version: publishedVersion,
    };
  }

  async archiveProduct(
    authContext: AuthContext,
    productId: string,
    input: PlatformServiceProductActionInput,
  ) {
    const employeeId = this.assertCanManage(authContext);
    const product = await this.repository.archiveProduct({
      productId,
      expectedVersion: input.expected_version,
      employeeId,
    });
    if (!product) {
      throw Errors.business(
        409,
        "平台服务商品已被更新，请刷新后重试",
        "SERVICE_PRODUCT_VERSION_CONFLICT",
      );
    }
    return serializePlatformServiceProduct(product);
  }

  private async requireProduct(productId: string) {
    const product = await this.repository.findPlatformProductById(productId);
    if (!product) {
      throw Errors.business(
        404,
        "平台服务商品不存在",
        "SERVICE_PRODUCT_NOT_FOUND",
      );
    }
    return product;
  }

  private assertExpectedVersion(
    product: PlatformProductRecord,
    expectedVersion: number,
  ) {
    if (product.version !== expectedVersion) {
      throw Errors.business(
        409,
        "平台服务商品已被更新，请刷新后重试",
        "SERVICE_PRODUCT_VERSION_CONFLICT",
      );
    }
  }

  private assertCanManage(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    if (!hasPermission(authContext, PRODUCT_MANAGE_PERMISSION)) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function normalizePageSize(value: number | undefined) {
  return Math.min(
    normalizePositiveInteger(value, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
}

function hasPermission(authContext: AuthContext, permissionCode: string) {
  return authContext.permissions.some((permission) =>
    permission.code === permissionCode
  );
}

export const platformServiceProductService =
  new PlatformServiceProductService();
