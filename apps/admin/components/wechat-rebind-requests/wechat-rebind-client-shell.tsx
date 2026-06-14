"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { TextActionDialog } from "@/components/admin/action-dialogs";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  WechatRebindFilters,
  WechatRebindPaginationControls,
} from "@/components/wechat-rebind-requests/wechat-rebind-list-actions";
import { WechatRebindTable } from "@/components/wechat-rebind-requests/wechat-rebind-table";
import type {
  WechatRebindPagination,
  WechatRebindRequest,
} from "@/components/wechat-rebind-requests/wechat-rebind-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requestBackendJson } from "@/lib/backend-client";

type ReviewState = {
  request: WechatRebindRequest;
  action: "approve" | "reject";
} | null;

export function WechatRebindClientShell({
  requests,
  pagination,
  status,
  error,
}: {
  requests: WechatRebindRequest[];
  pagination: WechatRebindPagination;
  status: string;
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reviewState, setReviewState] = useState<ReviewState>(null);
  const [actionError, setActionError] = useState("");

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  function submitReview(comment: string) {
    if (!reviewState) return;
    const { request, action } = reviewState;
    setActionError("");
    startTransition(async () => {
      try {
        await requestBackendJson(
          `/employee/auth/wechat-rebind-requests/${request.id}/${action}`,
          {
            method: "POST",
            body: JSON.stringify({ comment: comment.trim() || null }),
            fallbackMessage: action === "approve" ? "审核通过失败" : "审核拒绝失败",
          },
        );
        setReviewState(null);
        router.refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "审核操作失败");
      }
    });
  }

  const reviewing = Boolean(reviewState);
  const reviewTitle = reviewState?.action === "approve" ? "通过换绑申请" : "拒绝换绑申请";
  const reviewDescription = reviewState?.action === "approve"
    ? "确认身份后，目标客户或员工将切换到申请人的新微信账号。"
    : "拒绝后不会修改当前微信绑定关系，请填写拒绝原因。";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {actionError ? <StatusAlert>{actionError}</StatusAlert> : null}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
        <CardHeader className="shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3">
          <WechatRebindFilters
            status={status}
            pending={pending}
            onNavigate={navigate}
          />
        </CardHeader>
        <CardContent className="relative flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <WechatRebindTable
              requests={requests}
              onReview={(request, action) => {
                setActionError("");
                setReviewState({ request, action });
              }}
            />
          </div>
          {pending && !reviewing ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </div>
            </div>
          ) : null}
          <div className="shrink-0 flex flex-col gap-3 border-t bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>当前显示 {requests.length} 条，共 {pagination.total} 条</span>
              <Badge variant="outline">
                第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
              </Badge>
            </div>
            <WechatRebindPaginationControls
              pagination={pagination}
              status={status}
              pending={pending}
              onNavigate={navigate}
            />
          </div>
        </CardContent>
      </Card>

      <TextActionDialog
        open={reviewing}
        onOpenChange={(open) => {
          if (!open && !pending) setReviewState(null);
        }}
        title={reviewTitle}
        description={reviewDescription}
        label="审核说明"
        placeholder={reviewState?.action === "approve" ? "例如：身份已确认" : "请输入拒绝原因"}
        submitLabel={reviewState?.action === "approve" ? "确认通过" : "确认拒绝"}
        required={reviewState?.action === "reject"}
        pending={pending}
        onSubmit={submitReview}
      />
    </div>
  );
}
