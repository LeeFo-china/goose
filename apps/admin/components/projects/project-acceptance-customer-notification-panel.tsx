"use client";

import { MessageSquareText, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AcceptanceNotification } from "@/components/projects/project-acceptance-types";
import { formatDateTime, notificationLabel, notificationVariant } from "@/components/projects/project-acceptance-utils";

export function CustomerNotificationPanel({
  notification,
  disabled,
  onSend,
  onResend,
}: {
  notification: AcceptanceNotification | null;
  disabled: boolean;
  onSend: () => void;
  onResend: () => void;
}) {
  return (
    <div className="border-b bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">客户短信通知</span>
            <Badge variant={notificationVariant(notification)}>
              {notificationLabel(notification)}
            </Badge>
          </div>
          {notification ? (
            <div className="text-sm text-muted-foreground">
              手机：{notification.phone} · 链接：{notification.link_type || "-"} · 过期：
              {formatDateTime(notification.expire_at)}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              复核通过后可短信通知业主打开小程序确认验收
            </div>
          )}
          {notification?.send_error ? (
            <div className="text-sm text-destructive">
              失败原因：{notification.send_error}
            </div>
          ) : null}
          {notification?.sent_at ? (
            <div className="text-xs text-muted-foreground">
              发送时间：{formatDateTime(notification.sent_at)}
              {notification.used_at ? ` · 最近打开：${formatDateTime(notification.used_at)}` : ""}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          {notification ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResend}
              disabled={disabled}
            >
              <RefreshCw data-icon="inline-start" />
              重新发送
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={onSend} disabled={disabled}>
              <MessageSquareText data-icon="inline-start" />
              发送通知
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
