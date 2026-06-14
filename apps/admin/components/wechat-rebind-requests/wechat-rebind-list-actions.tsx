"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { Button } from "@/components/ui/button";
import type {
  WechatRebindPagination,
  WechatRebindStatus,
} from "@/components/wechat-rebind-requests/wechat-rebind-types";

type Navigate = (href: string) => void;

const statusOptions: Array<{ value: WechatRebindStatus | "__all"; label: string }> = [
  { value: "__all", label: "全部状态" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已拒绝" },
  { value: "cancelled", label: "已取消" },
];

export function buildWechatRebindHref(input: {
  page?: number;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.status) params.set("status", input.status);
  const query = params.toString();
  return query ? `/wechat-rebind-requests?${query}` : "/wechat-rebind-requests";
}

export function WechatRebindFilters({
  status,
  pending,
  onNavigate,
}: {
  status: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[180px_1fr]">
      <FormSelect
        id="wechat-rebind-status-filter"
        value={status || "__all"}
        disabled={pending}
        options={statusOptions}
        onChange={(value) => {
          const nextStatus = value === "__all" ? "" : value;
          onNavigate(buildWechatRebindHref({ status: nextStatus }));
        }}
      />
      <div className="flex items-center text-sm text-muted-foreground">
        待审核申请处理后会把客户或员工身份切换到新微信账号。
      </div>
    </div>
  );
}

export function WechatRebindPaginationControls({
  pagination,
  status,
  pending,
  onNavigate,
}: {
  pagination: WechatRebindPagination;
  status: string;
  pending: boolean;
  onNavigate: Navigate;
}) {
  const previousDisabled = pagination.page <= 1 || pending;
  const nextDisabled = pagination.page >= pagination.totalPages || pending;

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={previousDisabled}
        onClick={() => onNavigate(buildWechatRebindHref({
          page: Math.max(1, pagination.page - 1),
          status,
        }))}
      >
        <ChevronLeft data-icon="inline-start" />
        上一页
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={nextDisabled}
        onClick={() => onNavigate(buildWechatRebindHref({
          page: pagination.page + 1,
          status,
        }))}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        下一页
        <ChevronRight data-icon="inline-end" />
      </Button>
    </div>
  );
}
