"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Search, Trash2, X } from "lucide-react";
import { requestPictureLibraryJson } from "@/components/picture-library/picture-library-requests";
import type {
  PictureAssetListData,
  PictureCommentListData,
  PictureCommentRecord,
} from "@/components/picture-library/picture-library-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function buildPictureCommentHref(input: {
  assetPage?: number;
  assetStatus?: string;
  categoryId?: string;
  assetKeyword?: string;
  commentPage?: number;
  commentStatus?: string;
  commentKeyword?: string;
}) {
  const query = new URLSearchParams();
  query.set("tab", "comments");
  if (input.assetPage && input.assetPage > 1) query.set("page", String(input.assetPage));
  if (input.assetStatus && input.assetStatus !== "all") query.set("status", input.assetStatus);
  if (input.categoryId && input.categoryId !== "all") query.set("category_id", input.categoryId);
  if (input.assetKeyword) query.set("keyword", input.assetKeyword);
  if (input.commentPage && input.commentPage > 1) {
    query.set("comment_page", String(input.commentPage));
  }
  if (input.commentStatus && input.commentStatus !== "all") {
    query.set("comment_status", input.commentStatus);
  }
  if (input.commentKeyword) query.set("comment_keyword", input.commentKeyword);
  return `/platform/picture-library?${query.toString()}`;
}

export function PictureCommentFilters({
  assetPage,
  assetStatus,
  categoryId,
  assetKeyword,
  commentStatus,
  commentKeyword,
}: {
  assetPage: number;
  assetStatus: string;
  categoryId: string;
  assetKeyword: string;
  commentStatus: string;
  commentKeyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedStatus, setSelectedStatus] = useState(commentStatus || "all");
  const [selectedKeyword, setSelectedKeyword] = useState(commentKeyword);

  function navigate(next: { commentStatus?: string; commentKeyword?: string }) {
    startTransition(() => {
      router.push(buildPictureCommentHref({
        assetPage,
        assetStatus,
        categoryId,
        assetKeyword,
        commentStatus: next.commentStatus ?? selectedStatus,
        commentKeyword: next.commentKeyword ?? selectedKeyword.trim(),
      }));
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ commentKeyword: selectedKeyword.trim() });
  }

  return (
    <form className="flex flex-col gap-3 md:flex-row" onSubmit={submit}>
      <div className="grid gap-3 md:grid-cols-[180px_minmax(220px,1fr)] md:flex-1">
        <Select
          value={selectedStatus}
          onValueChange={(value) => {
            setSelectedStatus(value);
            navigate({ commentStatus: value });
          }}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部评论</SelectItem>
              <SelectItem value="visible">可见</SelectItem>
              <SelectItem value="hidden">已隐藏</SelectItem>
              <SelectItem value="pending">待处理</SelectItem>
              <SelectItem value="rejected">已拒绝</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input
          className="h-9"
          value={selectedKeyword}
          onChange={(event) => setSelectedKeyword(event.target.value)}
          placeholder="搜索评论内容"
          maxLength={80}
          disabled={pending}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Search data-icon="inline-start" />}
          搜索
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setSelectedStatus("all");
            setSelectedKeyword("");
            startTransition(() => router.push(buildPictureCommentHref({
              assetPage,
              assetStatus,
              categoryId,
              assetKeyword,
            })));
          }}
        >
          <X data-icon="inline-start" />
          清空
        </Button>
      </div>
    </form>
  );
}

export function PictureCommentPagination({
  pagination,
  assetPage,
  assetStatus,
  categoryId,
  assetKeyword,
  commentStatus,
  commentKeyword,
}: {
  pagination: PictureCommentListData["pagination"];
  assetPage: number;
  assetStatus: string;
  categoryId: string;
  assetKeyword: string;
  commentStatus: string;
  commentKeyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canPrev = pagination.page > 1;
  const canNext = pagination.page < pagination.totalPages;

  function navigate(commentPage: number) {
    startTransition(() => {
      router.push(buildPictureCommentHref({
        assetPage,
        assetStatus,
        categoryId,
        assetKeyword,
        commentPage,
        commentStatus,
        commentKeyword,
      }));
    });
  }

  return (
    <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
      <div className="text-sm text-muted-foreground">
        第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页，共 {pagination.total} 条
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !canPrev}
          onClick={() => navigate(Math.max(1, pagination.page - 1))}
        >
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !canNext}
          onClick={() => navigate(pagination.page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

export function HidePictureCommentButton({ comment }: { comment: PictureCommentRecord }) {
  return (
    <PictureCommentMutationButton
      comment={comment}
      path={`/platform/picture-library/comments/${comment.id}/hide`}
      label="隐藏"
      icon={EyeOff}
      disabled={comment.status === "hidden" || comment.status === "deleted"}
      fallbackMessage="隐藏评论失败"
    />
  );
}

export function ShowPictureCommentButton({ comment }: { comment: PictureCommentRecord }) {
  return (
    <PictureCommentMutationButton
      comment={comment}
      path={`/platform/picture-library/comments/${comment.id}/show`}
      label="恢复"
      icon={Eye}
      disabled={comment.status === "visible" || comment.status === "deleted"}
      fallbackMessage="恢复评论失败"
    />
  );
}

export function DeletePictureCommentButton({ comment }: { comment: PictureCommentRecord }) {
  return (
    <PictureCommentMutationButton
      comment={comment}
      path={`/platform/picture-library/comments/${comment.id}`}
      method="DELETE"
      label="删除"
      icon={Trash2}
      disabled={comment.status === "deleted"}
      fallbackMessage="删除评论失败"
    />
  );
}

function PictureCommentMutationButton({
  path,
  method = "POST",
  label,
  icon: Icon,
  disabled = false,
  fallbackMessage,
}: {
  comment: PictureCommentRecord;
  path: string;
  method?: "POST" | "DELETE";
  label: string;
  icon: typeof EyeOff;
  disabled?: boolean;
  fallbackMessage: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function run() {
    if (pending || disabled) return;
    setError("");
    startTransition(async () => {
      try {
        await requestPictureLibraryJson(path, { method, fallbackMessage });
        refreshAfterDialogClose(router);
      } catch (err) {
        setError(err instanceof Error ? err.message : fallbackMessage);
      }
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending || disabled} onClick={run}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Icon data-icon="inline-start" />}
        {label}
      </Button>
      {error ? <span className="max-w-32 text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
