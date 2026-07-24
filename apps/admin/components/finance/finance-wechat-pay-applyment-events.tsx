"use client";

import { Badge } from "@/components/ui/badge";

import {
  formatWechatPayApplymentTime,
  type WechatPayApplymentEvent,
} from "./finance-wechat-pay-applyment-shared";

export function FinanceWechatPayApplymentEvents({
  events,
}: {
  events: WechatPayApplymentEvent[];
}) {
  return (
    <aside className="h-fit min-w-0">
      <h2 className="text-sm font-semibold">处理记录</h2>
      <div className="mt-3 flex flex-col gap-3">
        {events.length > 0
          ? events.map((event) => (
              <div key={event.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{event.event_type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatWechatPayApplymentTime(event.created_at)}
                  </span>
                </div>
                <p className="mt-2 text-sm">{event.message || "-"}</p>
              </div>
            ))
          : (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                暂无处理记录
              </div>
            )}
      </div>
    </aside>
  );
}
