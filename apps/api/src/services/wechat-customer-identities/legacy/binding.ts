import { ErrorCodes } from "@/errors/error-codes";
import { invalidateCustomerTenantOptions } from "./cache";
import {
  Errors,
  userIdentityService,
  wechatCustomerIdentityRepository,
  wechatRebindRequestService,
  type WechatCustomerIdentityCacheContext,
  type WechatCustomerIdentityRow,
} from "./shared";

const CUSTOMER_TENANT_USER_ID_CONSTRAINT = "customers_tenant_user_id_unique";

export async function bindCustomerAuthUser(
  this: WechatCustomerIdentityCacheContext,
  input: {
    authUserId: string;
    customer: Pick<
      WechatCustomerIdentityRow,
      "id" | "tenant_id" | "claimed_at"
    >;
  },
) {
  await assertCustomerTenantBindingAvailable(input);

  const result = await wechatCustomerIdentityRepository
    .bindCustomerAuthUser({
      customerId: input.customer.id,
      authUserId: input.authUserId,
      tenantId: input.customer.tenant_id,
      claimedAt: input.customer.claimed_at ? null : new Date().toISOString(),
    })
    .catch((error: unknown) => {
      if (isCustomerTenantUserConflict(error)) {
        throw buildCustomerTenantBindingConflict(input);
      }
      throw error;
    });
  invalidateCustomerTenantOptions.call(this, input.authUserId);
  return result;
}

async function assertCustomerTenantBindingAvailable(input: {
  authUserId: string;
  customer: Pick<WechatCustomerIdentityRow, "id" | "tenant_id">;
}) {
  const tenantId = input.customer.tenant_id;
  if (!tenantId) return;

  const currentBinding = await wechatCustomerIdentityRepository
    .findCustomerIdentityByAuthUserAndTenant({
      authUserId: input.authUserId,
      tenantId,
    });
  if (!currentBinding || currentBinding.id === input.customer.id) return;

  throw buildCustomerTenantBindingConflict(input, currentBinding.id);
}

function buildCustomerTenantBindingConflict(
  input: {
    customer: Pick<WechatCustomerIdentityRow, "id" | "tenant_id">;
  },
  currentCustomerId?: string | null,
) {
  return Errors.business(
    409,
    "当前微信已绑定该装修公司的其他客户档案，请联系管理员处理",
    ErrorCodes.WECHAT_ALREADY_BOUND,
    {
      target_role: "customer",
      tenant_id: input.customer.tenant_id ?? null,
      customer_id: input.customer.id,
      current_customer_id: currentCustomerId ?? null,
    },
  );
}

function isCustomerTenantUserConflict(error: unknown) {
  const details = databaseErrorDetails(error);
  if (!details || details.code !== "23505") return false;

  return JSON.stringify(details).includes(CUSTOMER_TENANT_USER_ID_CONSTRAINT);
}

function databaseErrorDetails(error: unknown): Record<string, unknown> | null {
  if (typeof error !== "object" || error === null) return null;

  const record = error as Record<string, unknown>;
  const details = record.details;
  return typeof details === "object" && details !== null
    ? details as Record<string, unknown>
    : record;
}

export async function bindCustomerRole(
  this: WechatCustomerIdentityCacheContext,
  input: {
    authUserId: string;
    phone: string;
    createIfMissing?: boolean;
    customerOrigin?: string | null;
  },
) {
  const [customers, currentBindings] = await Promise.all([
    wechatCustomerIdentityRepository.listCustomerIdentitiesByPhone(input.phone),
    wechatCustomerIdentityRepository.listCustomerIdentitiesByAuthUserId(
      input.authUserId,
      2,
    ),
  ]);

  if (currentBindings.length > 1) {
    throw Errors.badRequest("当前账号绑定了多个客户档案，请联系管理员处理");
  }
  const currentBinding = currentBindings[0] || null;

  if (customers.length === 0) {
    if (!input.createIfMissing) {
      throw Errors.badRequest("该手机号未绑定客户身份");
    }

    if (currentBinding) {
      throw Errors.badRequest("当前微信已绑定其他客户，请联系工作人员");
    }

    const customerOrigin = input.customerOrigin || "visitor_self_registered";
    if (customerOrigin !== "visitor_self_registered") {
      throw Errors.badRequest("当前客户创建渠道不支持自助注册");
    }

    await wechatCustomerIdentityRepository.createSelfRegisteredCustomer({
      phone: input.phone,
      authUserId: input.authUserId,
      registeredAt: new Date().toISOString(),
    });
    invalidateCustomerTenantOptions.call(this, input.authUserId);

    return;
  }

  if (customers.length > 1) {
    throw Errors.badRequest("该手机号绑定了多个客户档案，请联系管理员处理");
  }

  const customer = customers[0];
  if (!customer) {
    throw Errors.badRequest("该手机号未绑定客户身份");
  }

  if (currentBinding && currentBinding.id !== customer.id) {
    throw Errors.badRequest("当前微信已绑定其他客户，请联系工作人员");
  }

  await wechatRebindRequestService.assertCustomerCanBind(
    input.authUserId,
    customer,
  );

  await bindCustomerAuthUser.call(this, {
    authUserId: input.authUserId,
    customer,
  });

  await userIdentityService.syncBusinessMembershipBestEffort({
    userId: input.authUserId,
    tenantId: customer.tenant_id,
    identityType: "customer",
    identityId: customer.id,
    source: "customer_verify_role_bind",
  });
  invalidateCustomerTenantOptions.call(this, input.authUserId);
}
