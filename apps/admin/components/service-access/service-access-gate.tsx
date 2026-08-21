"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { useServiceAccess } from "@/components/service-access/service-access-context";
import { ServiceReadonlyBanner } from "@/components/service-access/service-readonly-banner";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

import { decideServiceAccessView } from "./service-access-routes";

export function ServiceAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const replacedPathRef = useRef<string | null>(null);
  const { loadResult, summary, refresh, refreshing } = useServiceAccess();
  const view = decideServiceAccessView(loadResult, pathname);

  useEffect(() => {
    if (view !== "replace") {
      replacedPathRef.current = null;
      return;
    }
    if (replacedPathRef.current === pathname) return;

    replacedPathRef.current = pathname;
    router.replace("/service-access");
  }, [pathname, router, view]);

  if (view === "workspace" || view === "recovery") return children;

  if (view === "readonly") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <ServiceReadonlyBanner />
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    );
  }

  if (view === "unavailable") {
    return (
      <div className="mx-auto flex h-full max-w-2xl items-start pt-8">
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>系统错误</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>
              {loadResult.kind === "unavailable"
                ? loadResult.message
                : "服务状态暂时无法加载，请稍后重试"}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              <RefreshCw
                className={refreshing ? "animate-spin" : undefined}
                data-icon="inline-start"
              />
              {refreshing ? "正在重试" : "重试"}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl items-start pt-8">
      <Alert>
        <ShieldAlert />
        <AlertTitle>{summary?.title ?? "正在前往服务状态"}</AlertTitle>
        <AlertDescription>
          {summary?.message ?? "正在打开服务状态页面，请稍候。"}
        </AlertDescription>
      </Alert>
    </div>
  );
}
