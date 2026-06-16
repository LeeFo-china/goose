import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

export type FinanceLedgerRecord = {
  id: string;
  tenant_id: string;
  project_id: string | null;
  direction: "in" | "out";
  entry_type: string;
  amount: number | string | null;
  occurred_at: string | null;
  summary: string | null;
  project?: { id: string; name: string | null; status: string | null } | null;
  handler?: { id: string; name: string | null; phone: string | null } | null;
};

export type FinanceLedgerListData = {
  list: FinanceLedgerRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type FinanceLedgerResult = FinanceLedgerListData & {
  error: string | null;
};

const FINANCE_LEDGER_PAGE_SIZE = 20;

export function emptyFinanceLedger(page = 1): FinanceLedgerResult {
  return {
    list: [],
    pagination: {
      page,
      pageSize: FINANCE_LEDGER_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
    error: null,
  };
}

export async function fetchFinanceLedger(query: {
  page?: number;
  pageSize?: number;
}): Promise<FinanceLedgerResult> {
  const token = await getAdminToken();
  const page = normalizeFinanceLedgerPage(query.page);
  const pageSize = normalizeFinanceLedgerPageSize(query.pageSize);

  if (!token) {
    return {
      ...emptyFinanceLedger(page),
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
      error: "缺少登录凭证",
    };
  }

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  try {
    const response = await fetch(buildBackendUrl(`/finance/ledger?${params}`), {
      headers: {
        authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    const payload = await parseBackendJson<FinanceLedgerListData>(response);
    return {
      ...(payload.data || {
        list: [],
        pagination: {
          page,
          pageSize,
          total: 0,
          totalPages: 0,
        },
      }),
      error: null,
    };
  } catch (error) {
    return {
      list: [],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
      error: error instanceof Error ? error.message : "财务台账加载失败",
    };
  }
}

function normalizeFinanceLedgerPage(value: number | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizeFinanceLedgerPageSize(value: number | undefined) {
  const pageSize = Number(value || FINANCE_LEDGER_PAGE_SIZE);
  if (!Number.isFinite(pageSize) || pageSize <= 0) return FINANCE_LEDGER_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), 100);
}
