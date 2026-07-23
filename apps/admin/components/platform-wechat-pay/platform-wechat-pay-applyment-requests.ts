import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import type {
  WechatPayApplymentDetailData,
  WechatPayApplymentEvent,
  WechatPayApplymentRecord,
} from "@/components/finance/finance-wechat-pay-applyment-shared";

export type {
  WechatPayApplymentDetailData,
  WechatPayApplymentEvent,
  WechatPayApplymentRecord,
};

export type PlatformWechatPayApplymentListData = {
  list: WechatPayApplymentRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type PlatformWechatPayApplymentListResult =
  PlatformWechatPayApplymentListData & {
    error: string | null;
  };

export type PlatformWechatPayApplymentDetailResult =
  WechatPayApplymentDetailData & {
    error: string | null;
  };

export function emptyPlatformWechatPayApplymentList(input: {
  page: number;
  pageSize: number;
}): PlatformWechatPayApplymentListResult {
  return {
    list: [],
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: 0,
      totalPages: 0,
    },
    error: null,
  };
}

export function emptyPlatformWechatPayApplymentDetail():
  PlatformWechatPayApplymentDetailResult {
  return {
    applyment: null,
    events: [],
    can_edit: false,
    can_submit: false,
    available_actions: [],
    submission_readiness: null,
    error: null,
  };
}

export async function fetchPlatformWechatPayApplyments(input: {
  page: number;
  pageSize: number;
  status?: string;
  keyword?: string;
  tenant_id?: string;
}): Promise<PlatformWechatPayApplymentListResult> {
  const token = await getAdminToken();
  const fallback = emptyPlatformWechatPayApplymentList(input);
  if (!token) return { ...fallback, error: "缺少登录凭证" };

  const params = new URLSearchParams();
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));
  appendOptionalParam(params, "status", input.status);
  appendOptionalParam(params, "keyword", input.keyword);
  appendOptionalParam(params, "tenant_id", input.tenant_id);

  try {
    const response = await fetch(
      buildBackendUrl(`/platform/finance/wechat-pay/applyments?${params}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<PlatformWechatPayApplymentListData>(
      response,
    );
    return {
      ...(payload.data || fallback),
      error: null,
    };
  } catch (error) {
    return {
      ...fallback,
      error: error instanceof Error ? error.message : "微信支付进件申请列表加载失败",
    };
  }
}

export async function fetchPlatformWechatPayApplymentDetail(
  id: string,
): Promise<PlatformWechatPayApplymentDetailResult> {
  const token = await getAdminToken();
  if (!token) {
    return {
      ...emptyPlatformWechatPayApplymentDetail(),
      error: "缺少登录凭证",
    };
  }

  try {
    const response = await fetch(
      buildBackendUrl(`/platform/finance/wechat-pay/applyments/${id}`),
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<WechatPayApplymentDetailData>(
      response,
    );
    return {
      ...(payload.data || emptyPlatformWechatPayApplymentDetail()),
      error: null,
    };
  } catch (error) {
    return {
      ...emptyPlatformWechatPayApplymentDetail(),
      error: error instanceof Error ? error.message : "微信支付进件申请详情加载失败",
    };
  }
}

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value?: string,
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}
