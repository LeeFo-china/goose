import { Errors } from "@/errors/error-factory";
import {
  supplierPriceListsRepository,
  type SupplierPriceCommandResult,
} from "@/repositories/supplier-price-lists";
import type {
  SupplierPriceItemDeleteInput,
  SupplierPriceItemListQuery,
  SupplierPriceItemUpsertInput,
  SupplierPriceListCommandInput,
  SupplierPriceListCreateInput,
  SupplierPriceListListQuery,
  SupplierPriceListNewVersionInput,
  SupplierPriceListUpdateInput,
} from "@/schema/supplier-price-lists";
import type { AuthContext } from "@/services/authorization";
import {
  supplierProductAccessService,
  type SupplierProxyScope,
} from "@/services/supplier-product-access";

type PriceAccessPort = Pick<
  typeof supplierProductAccessService,
  "requirePriceRead" | "requirePriceWrite"
>;
type PriceRepositoryPort = Pick<
  typeof supplierPriceListsRepository,
  | "listPriceLists"
  | "findPriceList"
  | "listItems"
  | "create"
  | "updateDraft"
  | "upsertItem"
  | "deleteItem"
  | "publish"
  | "createVersion"
  | "retire"
>;

export type SupplierPriceListsServiceDependencies = {
  access?: PriceAccessPort;
  repository?: PriceRepositoryPort;
};

export class SupplierPriceListsService {
  private readonly access: PriceAccessPort;
  private readonly repository: PriceRepositoryPort;

  constructor(dependencies: SupplierPriceListsServiceDependencies = {}) {
    this.access = dependencies.access ?? supplierProductAccessService;
    this.repository = dependencies.repository ?? supplierPriceListsRepository;
  }

  async listPriceLists(
    auth: AuthContext,
    query: SupplierPriceListListQuery,
  ) {
    const scope = await this.access.requirePriceRead(
      auth,
      query.tenantSupplierId,
    );
    const { tenantSupplierId: _relationship, ...filters } = query;
    return this.repository.listPriceLists({
      ...filters,
      supplier_id: scope.supplierId,
      tenant_id: scope.tenantId,
      tenant_supplier_id: scope.tenantSupplierId,
    });
  }

  async getPriceList(
    auth: AuthContext,
    tenantSupplierId: string,
    priceListId: string,
  ) {
    const scope = await this.access.requirePriceRead(auth, tenantSupplierId);
    const priceList = await this.repository.findPriceList({
      supplier_id: scope.supplierId,
      tenant_id: scope.tenantId,
      tenant_supplier_id: scope.tenantSupplierId,
      price_list_id: priceListId,
    });
    if (!priceList) {
      throw Errors.business(
        404,
        "供应商价格簿不存在",
        "SUPPLIER_PRICE_LIST_NOT_FOUND",
      );
    }
    return priceList;
  }

  async create(
    auth: AuthContext,
    tenantSupplierId: string,
    priceListId: string,
    input: SupplierPriceListCreateInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requirePriceWrite(auth, tenantSupplierId);
    return requireCommand(await this.repository.create({
      price_list_id: priceListId,
      ...input,
      ...commandContext(scope, idempotencyKey),
    }));
  }

  async updateDraft(
    auth: AuthContext,
    tenantSupplierId: string,
    priceListId: string,
    input: SupplierPriceListUpdateInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requirePriceWrite(auth, tenantSupplierId);
    return requireCommand(await this.repository.updateDraft({
      ...input,
      price_list_id: priceListId,
      ...commandContext(scope, idempotencyKey),
    }));
  }

  async listItems(
    auth: AuthContext,
    tenantSupplierId: string,
    priceListId: string,
    query: SupplierPriceItemListQuery,
  ) {
    const scope = await this.access.requirePriceRead(auth, tenantSupplierId);
    return this.repository.listItems({
      ...query,
      supplier_id: scope.supplierId,
      tenant_id: scope.tenantId,
      tenant_supplier_id: scope.tenantSupplierId,
      price_list_id: priceListId,
    });
  }

  async upsertItem(
    auth: AuthContext,
    tenantSupplierId: string,
    priceListId: string,
    itemId: string,
    input: SupplierPriceItemUpsertInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requirePriceWrite(auth, tenantSupplierId);
    return requireCommand(await this.repository.upsertItem({
      item_id: itemId,
      price_list_id: priceListId,
      sku_id: input.supplier_sku_id,
      unit_price: input.unit_price,
      tax_rate: input.tax_rate,
      tax_inclusive: input.tax_inclusive,
      expected_version: input.expected_version,
      ...commandContext(scope, idempotencyKey),
    }));
  }

  async deleteItem(
    auth: AuthContext,
    tenantSupplierId: string,
    priceListId: string,
    itemId: string,
    input: SupplierPriceItemDeleteInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requirePriceWrite(auth, tenantSupplierId);
    return requireCommand(await this.repository.deleteItem({
      item_id: itemId,
      price_list_id: priceListId,
      expected_version: input.expected_version,
      ...commandContext(scope, idempotencyKey),
    }));
  }

  publish(
    auth: AuthContext,
    tenantSupplierId: string,
    priceListId: string,
    input: SupplierPriceListCommandInput,
    idempotencyKey: string,
  ) {
    return this.lifecycle(
      auth,
      tenantSupplierId,
      priceListId,
      input,
      idempotencyKey,
      "publish",
    );
  }

  async createVersion(
    auth: AuthContext,
    tenantSupplierId: string,
    sourcePriceListId: string,
    input: SupplierPriceListNewVersionInput,
    idempotencyKey: string,
  ) {
    const scope = await this.access.requirePriceWrite(auth, tenantSupplierId);
    return requireCommand(await this.repository.createVersion({
      new_price_list_id: input.new_price_list_id,
      source_price_list_id: sourcePriceListId,
      expected_version: input.expected_version,
      ...commandContext(scope, idempotencyKey),
    }));
  }

  retire(
    auth: AuthContext,
    tenantSupplierId: string,
    priceListId: string,
    input: SupplierPriceListCommandInput,
    idempotencyKey: string,
  ) {
    return this.lifecycle(
      auth,
      tenantSupplierId,
      priceListId,
      input,
      idempotencyKey,
      "retire",
    );
  }

  private async lifecycle(
    auth: AuthContext,
    tenantSupplierId: string,
    priceListId: string,
    input: SupplierPriceListCommandInput,
    idempotencyKey: string,
    action: "publish" | "retire",
  ) {
    const scope = await this.access.requirePriceWrite(auth, tenantSupplierId);
    const command = action === "publish"
      ? this.repository.publish.bind(this.repository)
      : this.repository.retire.bind(this.repository);
    return requireCommand(await command({
      price_list_id: priceListId,
      expected_version: input.expected_version,
      ...commandContext(scope, idempotencyKey),
    }));
  }
}

function commandContext(
  scope: SupplierProxyScope,
  idempotencyKey: string,
) {
  return {
    supplier_id: scope.supplierId,
    tenant_id: scope.tenantId,
    tenant_supplier_id: scope.tenantSupplierId,
    actor_user_id: scope.authUserId,
    actor_employee_id: scope.employeeId,
    idempotency_key: idempotencyKey,
  };
}

function requireCommand(result: SupplierPriceCommandResult) {
  if (!result.error_code) return result;
  const notFound = result.error_code.endsWith("_NOT_FOUND");
  throw Errors.business(
    notFound ? 404 : 409,
    priceErrorMessage(result.error_code),
    result.error_code,
    {
      version: result.version,
      current_status: result.current_status,
      reason: result.reason,
    },
  );
}

function priceErrorMessage(code: string) {
  if (code === "SUPPLIER_PRICE_LIST_NOT_FOUND") {
    return "供应商价格簿不存在";
  }
  if (code === "SUPPLIER_PRICE_ITEM_NOT_FOUND") {
    return "供应商价格条目不存在";
  }
  if (code === "SUPPLIER_PRICE_PERIOD_CONFLICT") {
    return "供应商价格生效期存在重叠";
  }
  if (code.includes("VERSION_CONFLICT")) return "供应商价格簿版本已变化";
  return "供应商价格簿当前状态不允许该操作";
}

export const supplierPriceListsService = new SupplierPriceListsService();
