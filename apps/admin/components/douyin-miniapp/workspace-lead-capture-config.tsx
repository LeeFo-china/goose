"use client";

import { Badge } from "@/components/ui/badge";

import type { TenantDouyinWorkspace } from "./workspace-types";

type Installation = NonNullable<TenantDouyinWorkspace["installation"]>;

export function TenantDouyinLeadCaptureConfig({
  installation,
}: {
  canManage: boolean;
  installation: Installation | null;
}) {
  return (
    <section aria-labelledby="douyin-lead-capture-heading">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="douyin-lead-capture-heading" className="text-sm font-semibold">
          手机号留资
        </h2>
        <Badge variant="secondary">短信验证码模式</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        免费量房由用户填写手机号并完成短信验证；抖音手机号快捷登录仅用于客户账号登录。
      </p>
      {installation ? (
        <p className="mt-2 break-all text-xs text-muted-foreground">
          当前授权小程序 AppID：
          <span className="font-mono text-foreground">
            {installation.authorizer_appid}
          </span>
        </p>
      ) : null}
    </section>
  );
}
