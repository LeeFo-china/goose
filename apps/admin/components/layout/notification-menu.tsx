"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Bell, CheckCheck, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NotificationRecord = {
  id: string;
  scene: string;
  title: string;
  content: string;
  target_type: string | null;
  target_id: string | null;
  target_url: string | null;
  payload: Record<string, unknown>;
  status: "unread" | "read";
  created_at: string;
};

type NotificationListData = {
  list: NotificationRecord[];
  pagination: {
    total: number;
  };
};

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "通知请求失败"));
  }
  return payload.data as T;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeTargetUrl(notification: NotificationRecord) {
  if (notification.target_url) return notification.target_url;
  if (notification.target_type === "customer" && notification.target_id) {
    return `/customers?keyword=${encodeURIComponent(notification.target_id)}`;
  }
  return "";
}

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const hasUnread = unreadCount > 0;
  const countLabel = useMemo(() => unreadCount > 99 ? "99+" : String(unreadCount), [unreadCount]);

  async function loadSummary() {
    try {
      const data = await requestJson<{ unread_count: number }>("/api/backend/notifications/summary");
      setUnreadCount(data.unread_count || 0);
    } catch {
      setUnreadCount(0);
    }
  }

  async function loadNotifications() {
    setLoading(true);
    setError("");
    try {
      const data = await requestJson<NotificationListData>("/api/backend/notifications?page=1&pageSize=8");
      setNotifications(data.list || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, []);

  useEffect(() => {
    if (open) {
      void loadSummary();
      void loadNotifications();
    }
  }, [open]);

  function markRead(ids?: string[], targetUrl?: string) {
    startTransition(async () => {
      try {
        await requestJson("/api/backend/notifications/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(ids?.length ? { ids } : {}),
        });
        await Promise.all([loadSummary(), loadNotifications()]);
        if (targetUrl) {
          window.location.assign(targetUrl);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "通知处理失败");
      }
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" className="relative" aria-label="通知">
          <Bell />
          {hasUnread ? (
            <Badge
              variant="danger"
              className="absolute -right-2 -top-2 h-5 min-w-5 justify-center px-1 text-[10px]"
            >
              {countLabel}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <DropdownMenuLabel className="px-0 py-0">站内通知</DropdownMenuLabel>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || !hasUnread}
            onClick={() => markRead()}
          >
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <CheckCheck data-icon="inline-start" />}
            全部已读
          </Button>
        </div>
        <DropdownMenuSeparator />
        {error ? (
          <div className="px-3 py-2 text-sm text-destructive">{error}</div>
        ) : null}
        {loading ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="animate-spin" data-icon="inline-start" />
            正在加载通知
          </div>
        ) : notifications.length > 0 ? (
          <DropdownMenuGroup className="max-h-[420px] overflow-y-auto">
            {notifications.map((notification) => {
              const targetUrl = normalizeTargetUrl(notification);

              return (
                <DropdownMenuItem
                  key={notification.id}
                  className="items-start gap-3 p-3"
                  onSelect={(event) => {
                    event.preventDefault();
                    markRead([notification.id], targetUrl || undefined);
                  }}
                >
                  <div className="mt-1 size-2 shrink-0 rounded-full bg-primary data-[read=true]:bg-muted" data-read={notification.status === "read"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-medium">{notification.title}</div>
                      {targetUrl ? <ExternalLink className="shrink-0" /> : null}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {notification.content}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {formatDateTime(notification.created_at)}
                    </div>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
        ) : (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            暂无通知
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
