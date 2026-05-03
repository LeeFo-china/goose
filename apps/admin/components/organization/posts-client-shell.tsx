"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  PostFilters,
  PostsPagination,
} from "@/components/organization/post-list-actions";
import { CreatePostButton } from "@/components/organization/post-mutations";
import { PostsTable } from "@/components/organization/posts-table";
import type {
  Pagination,
  PostRecord,
} from "@/components/organization/organization-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function PostsClientShell({
  posts,
  pagination,
  status,
  salaryType,
  keyword,
  error,
}: {
  posts: PostRecord[];
  pagination: Pagination;
  status: string;
  salaryType: string;
  keyword: string;
  error: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.push(href);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="p-4">
          <PostFilters
            status={status}
            salaryType={salaryType}
            keyword={keyword}
            pending={pending}
            onNavigate={navigate}
          />
        </CardContent>
      </Card>

      {error ? (
        <StatusAlert>{error}</StatusAlert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-3">
            <CardTitle>岗位列表</CardTitle>
            {pending ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新
              </Badge>
            ) : (
              <Badge variant="outline">
                第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
              </Badge>
            )}
          </div>
          <CreatePostButton />
        </CardHeader>
        <CardContent className="relative p-0">
          <PostsTable posts={posts} />
          {pending ? (
            <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground shadow-sm">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新列表
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          每页 {pagination.pageSize} 条，共 {pagination.total} 条
        </div>
        <PostsPagination
          pagination={pagination}
          status={status}
          salaryType={salaryType}
          keyword={keyword}
          pending={pending}
          onNavigate={navigate}
        />
      </div>
    </div>
  );
}
