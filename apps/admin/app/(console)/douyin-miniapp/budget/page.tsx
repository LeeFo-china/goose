import { redirect } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { BudgetPricing } from "@/components/douyin-miniapp/budget-pricing";
import {
  normalizePricingVersionPage,
  type BudgetPricingPage,
} from "@/components/douyin-miniapp/budget-pricing-logic";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

const MANAGE_PERMISSION = "douyin_miniapp.manage";
const PAGE_SIZE = 20;

function emptyPage(): BudgetPricingPage {
  return {
    active_version: null,
    list: [],
    pagination: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 },
  };
}

export default async function TenantDouyinBudgetPricingPage() {
  const [session, token] = await Promise.all([
    getAdminSession(),
    getAdminToken(),
  ]);
  if (!session) redirect("/login");

  const canManage = session.tenant !== null && session.permissions.some(
    (permission) => permission.code === MANAGE_PERMISSION,
  );
  let data = emptyPage();
  let error: string | null = null;

  if (!canManage) {
    error = "当前账号缺少抖音小程序预算报价管理权限";
  } else if (!token) {
    error = "缺少登录凭证，请重新登录后重试";
  } else {
    try {
      const response = await fetch(
        buildBackendUrl(
          "/tenant/douyin-miniapp/budget/pricing-versions?page=1&pageSize=20",
        ),
        {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      const payload = await parseBackendJson<unknown>(response);
      const parsed = normalizePricingVersionPage(payload.data, {
        page: 1,
        pageSize: PAGE_SIZE,
      });
      if (!parsed) {
        error = "报价版本分页数据无效，请刷新后重试";
      } else {
        data = parsed;
      }
    } catch (loadError) {
      error = loadError instanceof Error
        ? loadError.message
        : "预算报价配置加载失败";
    }
  }

  if (!canManage) return <StatusAlert>{error}</StatusAlert>;
  return <BudgetPricing initialData={data} initialError={error} />;
}
