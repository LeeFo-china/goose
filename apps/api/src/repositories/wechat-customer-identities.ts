import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type WechatCustomerIdentityRow = {
  id: string;
  name: string | null;
  phone: string | null;
  user_id: string | null;
  tenant_id: string | null;
  customer_origin?: string | null;
  claimed_at?: string | null;
};

export type WechatCustomerTenantOption = WechatCustomerIdentityRow & {
  tenant: {
    id: string | null;
    name: string | null;
    slug: string | null;
    status: string | null;
  } | Array<{
    id: string | null;
    name: string | null;
    slug: string | null;
    status: string | null;
  }> | null;
  project_count?: number;
  latest_project_name?: string | null;
};

export type WechatCustomerProjectSummaryRow = {
  id: string;
  name: string | null;
  customer_id: string | null;
  created_at: string | null;
};

export type WechatLoginMembershipRow = {
  membership_id: string;
  user_id: string;
  tenant_id: string | null;
  identity_type: string;
  identity_id: string;
  status: string;
  is_default: boolean;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_user_id: string | null;
  customer_origin: string | null;
  customer_claimed_at: string | null;
  tenant_name: string | null;
  tenant_slug: string | null;
  tenant_status: string | null;
};

const AUTH_READ_QUERY_TIMEOUT_MS = 8_000;
const AUTH_READ_QUERY_MAX_ATTEMPTS = 2;
const AUTH_READ_QUERY_RETRY_DELAY_MS = 150;

type SupabaseReadResult<T> = {
  data: T | null;
  error: unknown;
};

function readErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") {
    return typeof error === "string" ? error : "";
  }

  const record = error as Record<string, unknown>;
  return [
    record.name,
    record.code,
    record.message,
    record.details,
    record.hint,
  ]
    .filter((item): item is string => typeof item === "string")
    .join(" ")
    .toLowerCase();
}

function isTransientReadError(error: unknown) {
  const message = readErrorMessage(error);
  return (
    message.includes("socket connection was closed") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("terminated") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("und_err")
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withAuthReadTimeout<T>(request: PromiseLike<T>) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timeout = setTimeout(() => {
      reject({
        code: "SUPABASE_AUTH_READ_TIMEOUT",
        message: `Supabase auth read timed out after ${AUTH_READ_QUERY_TIMEOUT_MS}ms`,
      });
    }, AUTH_READ_QUERY_TIMEOUT_MS);

    Promise.resolve(request)
      .then(resolve, reject)
      .finally(() => {
        if (timeout) {
          clearTimeout(timeout);
        }
      });
  });
}

async function runAuthReadQuery<T>(
  createRequest: () => PromiseLike<SupabaseReadResult<T>>,
) {
  let lastResult: SupabaseReadResult<T> | null = null;

  for (let attempt = 1; attempt <= AUTH_READ_QUERY_MAX_ATTEMPTS; attempt += 1) {
    let result: SupabaseReadResult<T>;
    try {
      result = await withAuthReadTimeout(createRequest());
    } catch (error) {
      result = {
        data: null,
        error,
      };
    }

    lastResult = result;
    if (!result.error || !isTransientReadError(result.error) || attempt === AUTH_READ_QUERY_MAX_ATTEMPTS) {
      return result;
    }

    await delay(AUTH_READ_QUERY_RETRY_DELAY_MS);
  }

  return lastResult ?? { data: null, error: null };
}

class WechatCustomerIdentityRepository {
  private adminClient = SupabaseDB.getAdminClient();

  private customerTenantSelect = `
    id,
    name,
    phone,
    user_id,
    tenant_id,
    customer_origin,
    claimed_at,
    tenant:tenants!customers_tenant_id_fkey(
      id,
      name,
      slug,
      status
    )
  `;

  async listCustomerTenantOptionsByPhone(phone: string) {
    const { data, error } = await runAuthReadQuery(() =>
      this.adminClient
        .from("customers")
        .select(this.customerTenantSelect)
        .eq("phone", phone)
    );

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    return (data || []) as unknown as WechatCustomerTenantOption[];
  }

  async listCustomerIdentitiesByPhone(phone: string) {
    const { data, error } = await this.adminClient
      .from("customers")
      .select("id, phone, user_id, tenant_id, customer_origin, claimed_at")
      .eq("phone", phone);

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    return (data || []) as WechatCustomerIdentityRow[];
  }

  async listCustomerIdentitiesByAuthUserId(authUserId: string, limit?: number) {
    let query = this.adminClient
      .from("customers")
      .select("id, phone, user_id, tenant_id")
      .eq("user_id", authUserId);

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      throw Errors.dbError("查询当前账号客户绑定失败", error);
    }

    return (data || []) as WechatCustomerIdentityRow[];
  }

  async listCustomerTenantOptionsByIds(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [] as WechatCustomerTenantOption[];
    }

    const { data, error } = await runAuthReadQuery(() =>
      this.adminClient
        .from("customers")
        .select(this.customerTenantSelect)
        .in("id", customerIds)
    );

    if (error) {
      throw Errors.dbError("查询客户业务身份失败", error);
    }

    return (data || []) as unknown as WechatCustomerTenantOption[];
  }

  async getCustomerTenantOptionById(customerId: string, tenantId: string) {
    const { data, error } = await runAuthReadQuery(() =>
      this.adminClient
        .from("customers")
        .select(this.customerTenantSelect)
        .eq("id", customerId)
        .eq("tenant_id", tenantId)
        .maybeSingle()
    );

    if (error) {
      throw Errors.dbError("查询客户身份失败", error);
    }

    return (data || null) as unknown as WechatCustomerTenantOption | null;
  }

  async listWechatLoginMemberships(authUserId: string) {
    const { data, error } = await runAuthReadQuery(() =>
      this.adminClient.rpc("list_wechat_login_memberships", {
        p_user_id: authUserId,
      })
    );

    if (error) {
      throw Errors.dbError("查询微信登录业务身份失败", error);
    }

    return (data || []) as WechatLoginMembershipRow[];
  }

  async listProjectSummariesByCustomerIds(customerIds: string[]) {
    if (customerIds.length === 0) {
      return [] as WechatCustomerProjectSummaryRow[];
    }

    const { data, error } = await this.adminClient
      .from("projects")
      .select("id, name, customer_id, created_at")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false });

    if (error) {
      throw Errors.dbError("查询客户项目概览失败", error);
    }

    return (data || []) as WechatCustomerProjectSummaryRow[];
  }

  async createSelfRegisteredCustomer(input: {
    phone: string;
    authUserId: string;
    registeredAt: string;
  }) {
    const { error } = await this.adminClient
      .from("customers")
      .insert({
        phone: input.phone,
        name: `客户${input.phone.slice(-4)}`,
        status: "potential",
        source: null,
        user_id: input.authUserId,
        customer_origin: "visitor_self_registered",
        self_registered_at: input.registeredAt,
      })
      .select("id");

    if (error) {
      throw Errors.dbError("自助创建客户失败", error);
    }
  }

  async bindCustomerAuthUser(input: {
    customerId: string;
    authUserId: string;
    tenantId?: string | null;
    claimedAt?: string | null;
  }) {
    const updatePayload: {
      user_id: string;
      claimed_at?: string;
    } = {
      user_id: input.authUserId,
    };

    if (input.claimedAt) {
      updatePayload.claimed_at = input.claimedAt;
    }

    let query = this.adminClient
      .from("customers")
      .update(updatePayload)
      .eq("id", input.customerId);

    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    const { error } = await query.select("id");

    if (error) {
      throw Errors.dbError("绑定客户身份失败", error);
    }
  }
}

export const wechatCustomerIdentityRepository =
  new WechatCustomerIdentityRepository();
