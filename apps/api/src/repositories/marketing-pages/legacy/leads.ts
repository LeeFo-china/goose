import {
  Errors,
  PROJECT_OPTION_SELECT,
  compareMarketingPageListOrder,
  escapeSupabaseOrValue,
  getErrorMessage,
  type ConvertMarketingLeadInput,
  type MarketingCustomerRecord,
  type MarketingEventRecord,
  type MarketingLeadListQuery,
  type MarketingLeadRecord,
  type MarketingPageConfigInput,
  type MarketingPageListQuery,
  type MarketingPageProjectOptionQuery,
  type MarketingPageProjectOptionRow,
  type MarketingPageRecord,
  type MarketingPageVersionRecord,
  type PublicMarketingPageListQuery,
  type SubmitMarketingLeadInput,
  type TrackMarketingEventInput,
  type UpdateMarketingLeadInput,
  type UpdateMarketingPageInput,
} from "./shared";

export async function createLead(this: any, input: SubmitMarketingLeadInput & {
  tenantId: string | null;
  pageId: string;
  pageVersionId: string;
  requestIp: string | null;
  userAgent: string | null;
  customerId?: string | null;
  wxOpenid?: string | null;
}) {
  const customerId = input.customerId ?? await this.findCustomerIdByPhone(
    input.phone,
    input.tenantId,
  );
  const { data, error } = await this.leads()
    .insert({
      tenant_id: input.tenantId,
      page_id: input.pageId,
      page_version_id: input.pageVersionId,
      name: input.name ?? null,
      phone: input.phone ?? null,
      community: input.community ?? null,
      city: input.city ?? null,
      form_data: input.form_data,
      source: "h5",
      customer_id: customerId,
      wx_openid: input.wxOpenid ?? null,
      request_ip: input.requestIp,
      user_agent: input.userAgent,
    })
    .select("*")
    .single();

  if (error) {
    throw Errors.dbError("提交 H5 营销线索失败", error);
  }

  return data as MarketingLeadRecord;
}

export async function findRecentLeadByPageAndPhone(this: any, input: {
  tenantId: string | null;
  pageId: string;
  phone: string;
  since: string;
}) {
  let request = this.leads()
    .select("*")
    .eq("page_id", input.pageId)
    .eq("phone", input.phone)
    .neq("lead_status", "invalid")
    .gte("created_at", input.since);
  request = this.applyTenantScope(request, {
    tenantId: input.tenantId,
    platformScope: input.tenantId === null,
  });

  const { data, error } = await request
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询 H5 营销线索防重记录失败", error);
  }

  return (data || null) as MarketingLeadRecord | null;
}

export async function updateRecentLeadSubmission(this: any, id: string, input: SubmitMarketingLeadInput & {
  tenantId: string | null;
  pageVersionId: string;
  requestIp: string | null;
  userAgent: string | null;
  customerId?: string | null;
  wxOpenid?: string | null;
}) {
  const updatePayload: Record<string, unknown> = {
    page_version_id: input.pageVersionId,
    name: input.name ?? null,
    phone: input.phone ?? null,
    community: input.community ?? null,
    city: input.city ?? null,
    form_data: input.form_data,
    request_ip: input.requestIp,
    user_agent: input.userAgent,
  };

  const customerId = input.customerId ?? await this.findCustomerIdByPhone(
    input.phone,
    input.tenantId,
  );
  if (customerId) {
    updatePayload.customer_id = customerId;
  }

  if (input.wxOpenid) {
    updatePayload.wx_openid = input.wxOpenid;
  }

  let request = this.leads()
    .update(updatePayload)
    .eq("id", id);

  request = this.applyTenantScope(request, {
    tenantId: input.tenantId,
    platformScope: input.tenantId === null,
  });

  const { data, error } = await request
    .select("*")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("更新 H5 营销线索重复提交信息失败", error);
  }

  if (!data) {
    throw Errors.notFound("H5 营销线索不存在");
  }

  return data as MarketingLeadRecord;
}

export async function findCustomerByAuthUserId(this: any, authUserId: string, tenantId?: string | null) {
  let request = this.customers()
    .select("id,name,phone,status,owner_id")
    .eq("user_id", authUserId);

  request = this.applyTenantScope(request, {
    tenantId,
    platformScope: tenantId === null,
  });

  const { data, error } = await request.maybeSingle();

  if (error) {
    throw Errors.dbError("查询 H5 营销页客户身份失败", error);
  }

  return (data || null) as {
    id: string;
    name: string | null;
    phone: string | null;
    status: string | null;
    owner_id: string | null;
  } | null;
}

export async function listLeads(this: any, query: MarketingLeadListQuery, tenantId?: string | null) {
  const { page, pageSize, status, page_id, keyword, created_from, created_to } = query;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let request = this.leads()
    .select(`
      *,
      page:marketing_pages(id,title,slug),
      customer:customers(id,name,phone,status,owner_id)
    `, { count: "exact" });

  if (tenantId) {
    request = request.eq("tenant_id", tenantId);
  }

  if (status) {
    request = request.eq("lead_status", status);
  } else {
    request = request.neq("lead_status", "invalid");
  }

  if (page_id) {
    request = request.eq("page_id", page_id);
  }

  if (created_from) {
    request = request.gte("created_at", created_from);
  }

  if (created_to) {
    request = request.lte("created_at", created_to);
  }

  if (keyword) {
    const escapedKeyword = escapeSupabaseOrValue(keyword);
    request = request.or(
      `name.ilike.%${escapedKeyword}%,phone.ilike.%${escapedKeyword}%,community.ilike.%${escapedKeyword}%,city.ilike.%${escapedKeyword}%`,
    );
  }

  const { data, error, count } = await request
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw Errors.dbError("查询 H5 营销线索列表失败", error);
  }

  return {
    list: data || [],
    pagination: {
      page,
      pageSize,
      total: count || 0,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
    },
  };
}

export async function updateLead(this: any, id: string, input: UpdateMarketingLeadInput & {
  tenantId?: string | null;
  employeeId: string | null;
}) {
  let request = this.leads()
    .update({
      lead_status: input.lead_status,
      follow_remark: input.follow_remark ?? null,
      followed_by: input.employeeId,
      followed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (input.tenantId) {
    request = request.eq("tenant_id", input.tenantId);
  }

  const { data, error } = await request
    .select(`
      *,
      page:marketing_pages(id,title,slug),
      customer:customers(id,name,phone,status,owner_id)
    `)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("更新 H5 营销线索失败", error);
  }

  if (!data) {
    throw Errors.notFound("H5 营销线索不存在");
  }

  return data as MarketingLeadRecord;
}

export async function convertLeadToCustomer(this: any, id: string, input: ConvertMarketingLeadInput & {
  tenantId?: string | null;
  employeeId: string | null;
}) {
  const lead = await this.findLeadById(id, input.tenantId);
  if (!lead) {
    throw Errors.notFound("H5 营销线索不存在");
  }

  const phone = lead.phone?.trim();
  if (!phone) {
    throw Errors.badRequest("线索未填写手机号，不能转为客户");
  }

  const existingCustomer = await this.findCustomerByPhone(phone, lead.tenant_id);
  const customer = existingCustomer ?? await this.createCustomerFromLead(
    lead,
    input.employeeId,
  );
  const followRemark = input.follow_remark ?? lead.follow_remark;
  let request = this.leads()
    .update({
      customer_id: customer.id,
      lead_status: "converted",
      follow_remark: followRemark ?? null,
      followed_by: input.employeeId,
      followed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (input.tenantId) {
    request = request.eq("tenant_id", input.tenantId);
  }

  const { data, error } = await request
    .select(`
      *,
      page:marketing_pages(id,title,slug),
      customer:customers(id,name,phone,status,owner_id)
    `)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("转化 H5 营销线索失败", error);
  }

  if (!data) {
    throw Errors.notFound("H5 营销线索不存在");
  }

  return {
    lead: data,
    customer,
    created: !existingCustomer,
  };
}

export async function findCustomerIdByPhone(this: any, phone: string | null | undefined, tenantId?: string | null) {
  if (!phone) return null;

  const customer = await this.findCustomerByPhone(phone, tenantId);
  return customer?.id ?? null;
}

export async function findLeadById(this: any, id: string, tenantId?: string | null) {
  let request = this.leads()
    .select("*")
    .eq("id", id);

  if (tenantId) {
    request = request.eq("tenant_id", tenantId);
  }

  const { data, error } = await request.maybeSingle();

  if (error) {
    throw Errors.dbError("查询 H5 营销线索失败", error);
  }

  return (data || null) as MarketingLeadRecord | null;
}

export async function findCustomerByPhone(this: any, phone: string, tenantId?: string | null) {
  let request = this.customers()
    .select("id,name,phone,status,owner_id")
    .eq("phone", phone);

  request = this.applyTenantScope(request, {
    tenantId,
    platformScope: tenantId === null,
  });

  const { data, error } = await request.maybeSingle();

  if (error) {
    throw Errors.dbError("匹配 H5 营销线索客户失败", error);
  }

  return (data || null) as {
    id: string;
    name: string | null;
    phone: string | null;
    status: string | null;
    owner_id: string | null;
  } | null;
}

export async function createCustomerFromLead(this: any, 
  lead: MarketingLeadRecord,
  employeeId: string | null,
) {
  const phone = lead.phone?.trim();
  if (!phone) {
    throw Errors.badRequest("线索未填写手机号，不能转为客户");
  }

  const { data, error } = await this.customers()
    .insert({
      tenant_id: lead.tenant_id,
      name: lead.name?.trim() || "H5营销线索",
      phone,
      source: "platform",
      status: "potential",
      owner_id: employeeId,
    })
    .select("id,name,phone,status,owner_id")
    .single();

  if (error) {
    if (getErrorMessage(error).includes("duplicate key")) {
      const customer = await this.findCustomerByPhone(phone, lead.tenant_id);
      if (customer) return customer;
    }

    throw Errors.dbError("创建 H5 营销线索客户失败", error);
  }

  return data as {
    id: string;
    name: string | null;
    phone: string | null;
    status: string | null;
    owner_id: string | null;
  };
}
