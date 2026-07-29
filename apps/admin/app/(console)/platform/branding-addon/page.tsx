import { redirect } from "next/navigation";

import { StatusAlert } from "@/components/admin/status-alert";
import { PlatformBrandingAddonProductForm } from "@/components/branding-addon/platform-branding-addon-product-form";
import type {
  PlatformBrandingAddonProduct,
  PlatformBrandingAddonProductResult,
} from "@/components/branding-addon/platform-branding-addon-product-types";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

const MANAGE_PERMISSION = "platform.branding_product.manage";

async function getProduct(): Promise<{
  product: PlatformBrandingAddonProduct | null;
  error: string | null;
}> {
  const token = await getAdminToken();
  if (!token) {
    return { product: null, error: "缺少登录凭证" };
  }

  try {
    const response = await fetch(
      buildBackendUrl("/platform/branding/entitlement-product"),
      {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const payload = await parseBackendJson<PlatformBrandingAddonProductResult>(
      response,
    );
    return {
      product: payload.data?.product ?? null,
      error: payload.data?.product ? null : "品牌权益商品不存在",
    };
  } catch (error) {
    return {
      product: null,
      error: error instanceof Error
        ? error.message
        : "品牌权益商品加载失败",
    };
  }
}

export default async function PlatformBrandingAddonPage() {
  const session = await getAdminSession();
  if (!session) redirect("/login");

  const hasManagePermission = isPlatformOnlySession(session) &&
    session.permissions.some(
      (permission) => permission.code === MANAGE_PERMISSION,
    );
  const result = hasManagePermission
    ? await getProduct()
    : {
      product: null,
      error: "当前账号无权管理品牌权益商品",
    };

  return (
    <div className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-normal">
          品牌权益商品
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          维护租户年度品牌技术支持商品的价格、购买说明和上下架状态。
        </p>
      </div>

      {result.error ? (
        <div className="shrink-0">
          <StatusAlert>{result.error}</StatusAlert>
        </div>
      ) : null}
      {result.product
        ? (
          <PlatformBrandingAddonProductForm
            key={result.product.version}
            initialProduct={result.product}
          />
        )
        : null}
    </div>
  );
}
