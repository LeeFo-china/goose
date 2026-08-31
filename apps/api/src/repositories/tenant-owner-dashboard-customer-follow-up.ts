import { CustomerStatusConfig, isCustomerStatus } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type {
  TenantOwnerCustomerFollowUpItem,
  TenantOwnerCustomerFollowUpSnapshot,
} from "@/services/tenant-owner-daily-dashboard-types";
import { SupabaseDB } from "@/utils/supabase/index";

type CustomerRelation = {
  id: string | null;
  name: string | null;
  status: string | null;
  last_follow_at: string | null;
  owner?: EmployeeRelation;
} | Array<{
  id: string | null;
  name: string | null;
  status: string | null;
  last_follow_at: string | null;
  owner?: EmployeeRelation;
}> | null;

type EmployeeRelation = { name: string | null } | Array<{ name: string | null }> | null;

type FollowUpRecord = {
  id?: string | null;
  customer_id?: string | null;
  next_follow_at?: string | null;
  created_at?: string | null;
  customer?: CustomerRelation;
};

type CustomerRecord = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
  last_follow_at?: string | null;
  created_at?: string | null;
  owner?: EmployeeRelation;
};

type AttentionKind = "overdue" | "due_today" | "new_customer";

const CUSTOMER_FOLLOW_UP_SELECT = `
  id,
  customer_id,
  next_follow_at,
  created_at,
  customer:customers!customer_follow_ups_customer_id_fkey!inner(
    id,
    name,
    status,
    last_follow_at,
    owner:employees!customers_owner_id_fkey(name)
  )
`;

const CUSTOMER_SELECT = `
  id,
  name,
  status,
  last_follow_at,
  created_at,
  owner:employees!customers_owner_id_fkey(name)
`;

export async function getTenantOwnerCustomerFollowUp(input: {
  tenantId: string;
  businessDate: string;
  startAt: string;
  endAt: string;
  limit: number;
}): Promise<TenantOwnerCustomerFollowUpSnapshot> {
  const queryLimit = Math.max(input.limit * 2, input.limit);

  const [
    dueTodayCount,
    overdueCount,
    completedTodayCount,
    newCustomerCount,
    overdueRows,
    dueTodayRows,
    newCustomerRows,
  ] = await Promise.all([
    countFollowUps({
      tenantId: input.tenantId,
      startAt: input.startAt,
      endAt: input.endAt,
      mode: "due_today",
    }),
    countFollowUps({
      tenantId: input.tenantId,
      startAt: input.startAt,
      endAt: input.endAt,
      mode: "overdue",
    }),
    countFollowUps({
      tenantId: input.tenantId,
      startAt: input.startAt,
      endAt: input.endAt,
      mode: "completed_today",
    }),
    countNewCustomers(input),
    listFollowUpRows({
      tenantId: input.tenantId,
      startAt: input.startAt,
      endAt: input.endAt,
      mode: "overdue",
      limit: queryLimit,
    }),
    listFollowUpRows({
      tenantId: input.tenantId,
      startAt: input.startAt,
      endAt: input.endAt,
      mode: "due_today",
      limit: queryLimit,
    }),
    listNewCustomerRows({
      tenantId: input.tenantId,
      startAt: input.startAt,
      endAt: input.endAt,
      limit: queryLimit,
    }),
  ]);

  const items = buildAttentionItems({
    overdueRows,
    dueTodayRows,
    newCustomerRows,
    limit: input.limit,
  });

  return {
    total: dueTodayCount + overdueCount + newCustomerCount,
    due_today_count: dueTodayCount,
    overdue_count: overdueCount,
    completed_today_count: completedTodayCount,
    new_customer_count: newCustomerCount,
    items,
  };
}

async function countFollowUps(input: {
  tenantId: string;
  startAt: string;
  endAt: string;
  mode: "due_today" | "overdue" | "completed_today";
}) {
  let query = SupabaseDB.getAdminClient()
    .from("customer_follow_ups")
    .select(
      "id,customer:customers!customer_follow_ups_customer_id_fkey!inner(id)",
      { count: "exact", head: true },
    )
    .eq("customer.tenant_id", input.tenantId)
    .not("customer_id", "is", null);

  if (input.mode === "due_today") {
    query = query
      .gte("next_follow_at", input.startAt)
      .lt("next_follow_at", input.endAt);
  } else if (input.mode === "overdue") {
    query = query.lt("next_follow_at", input.startAt);
  } else {
    query = query
      .gte("created_at", input.startAt)
      .lt("created_at", input.endAt);
  }

  const { error, count } = await query;
  if (error) {
    throw Errors.dbError("查询老板客户跟进统计失败", error);
  }
  return count ?? 0;
}

async function countNewCustomers(input: {
  tenantId: string;
  startAt: string;
  endAt: string;
}) {
  const { error, count } = await SupabaseDB.getAdminClient()
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", input.tenantId)
    .gte("created_at", input.startAt)
    .lt("created_at", input.endAt);

  if (error) {
    throw Errors.dbError("查询老板新增客户统计失败", error);
  }
  return count ?? 0;
}

async function listFollowUpRows(input: {
  tenantId: string;
  startAt: string;
  endAt: string;
  mode: "due_today" | "overdue";
  limit: number;
}) {
  let query = SupabaseDB.getAdminClient()
    .from("customer_follow_ups")
    .select(CUSTOMER_FOLLOW_UP_SELECT)
    .eq("customer.tenant_id", input.tenantId)
    .not("customer_id", "is", null);

  if (input.mode === "due_today") {
    query = query
      .gte("next_follow_at", input.startAt)
      .lt("next_follow_at", input.endAt)
      .order("next_follow_at", { ascending: true });
  } else {
    query = query
      .lt("next_follow_at", input.startAt)
      .order("next_follow_at", { ascending: true });
  }

  const { data, error } = await query.range(0, input.limit - 1);
  if (error) {
    throw Errors.dbError("查询老板客户跟进事项失败", error);
  }
  return ((data as unknown[] | null) ?? []) as FollowUpRecord[];
}

async function listNewCustomerRows(input: {
  tenantId: string;
  startAt: string;
  endAt: string;
  limit: number;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("customers")
    .select(CUSTOMER_SELECT)
    .eq("tenant_id", input.tenantId)
    .gte("created_at", input.startAt)
    .lt("created_at", input.endAt)
    .order("created_at", { ascending: false })
    .range(0, input.limit - 1);

  if (error) {
    throw Errors.dbError("查询老板新增客户列表失败", error);
  }
  return ((data as unknown[] | null) ?? []) as CustomerRecord[];
}

function buildAttentionItems(input: {
  overdueRows: FollowUpRecord[];
  dueTodayRows: FollowUpRecord[];
  newCustomerRows: CustomerRecord[];
  limit: number;
}) {
  const items: TenantOwnerCustomerFollowUpItem[] = [];
  const seenCustomerIds = new Set<string>();

  for (const row of input.overdueRows) {
    pushFollowUpItem(items, seenCustomerIds, row, "overdue", input.limit);
  }
  for (const row of input.dueTodayRows) {
    pushFollowUpItem(items, seenCustomerIds, row, "due_today", input.limit);
  }
  for (const row of input.newCustomerRows) {
    pushCustomerItem(items, seenCustomerIds, row, "new_customer", input.limit);
  }

  return items;
}

function pushFollowUpItem(
  items: TenantOwnerCustomerFollowUpItem[],
  seenCustomerIds: Set<string>,
  row: FollowUpRecord,
  kind: AttentionKind,
  limit: number,
) {
  if (items.length >= limit) return;
  const customer = relationOne(row.customer);
  const customerId = readString(customer?.id) ?? readString(row.customer_id);
  if (!customerId || seenCustomerIds.has(customerId)) return;

  seenCustomerIds.add(customerId);
  items.push({
    ...serializeCustomer(customer, customerId),
    last_follow_up_at: readString(customer?.last_follow_at) ?? readString(row.created_at),
    next_follow_up_at: readString(row.next_follow_at),
    reason: reasonFor(kind),
  });
}

function pushCustomerItem(
  items: TenantOwnerCustomerFollowUpItem[],
  seenCustomerIds: Set<string>,
  row: CustomerRecord,
  kind: AttentionKind,
  limit: number,
) {
  if (items.length >= limit) return;
  const customerId = readString(row.id);
  if (!customerId || seenCustomerIds.has(customerId)) return;

  seenCustomerIds.add(customerId);
  items.push({
    ...serializeCustomer(row, customerId),
    last_follow_up_at: readString(row.last_follow_at),
    next_follow_up_at: null,
    reason: reasonFor(kind),
  });
}

function serializeCustomer(
  customer: CustomerRecord | null | undefined,
  customerId: string,
): Omit<TenantOwnerCustomerFollowUpItem,
  "last_follow_up_at" | "next_follow_up_at" | "reason"> {
  return {
    customer_id: customerId,
    customer_name: readString(customer?.name) ?? "未命名客户",
    owner_employee_name: readString(relationOne(customer?.owner)?.name),
    status_label: statusLabel(readString(customer?.status)),
    target: {
      path: "/packageCustomers/pages/detail/index",
      query: { id: customerId },
    },
  };
}

function reasonFor(kind: AttentionKind) {
  if (kind === "overdue") return "逾期未跟进";
  if (kind === "due_today") return "今日应跟进";
  return "今日新增客户";
}

function statusLabel(value: string | null) {
  return isCustomerStatus(value) ? CustomerStatusConfig[value].label : null;
}

function relationOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
