"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  PostPageSizeSelect,
  PostFilters,
  PostsPagination,
} from "@/components/organization/post-list-actions";
import { CreatePostButton } from "@/components/organization/post-mutations";
import { PostsTable } from "@/components/organization/posts-table";
import type {
  DepartmentPostRuleDepartment,
  Pagination,
  PostRecord,
} from "@/components/organization/organization-types";
import { Badge } from "@/components/ui/badge";

export function PostsClientShell({
  posts,
  pagination,
  status,
  salaryType,
  keyword,
  error,
  departments,
}: {
  posts: PostRecord[];
  pagination: Pagination;
  status: string;
  salaryType: string;
  keyword: string;
  error: string | null;
  departments: DepartmentPostRuleDepartment[];
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
    <div className="flex flex-col">
      {error ? (
        <div className="border-t px-4 pt-4">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t px-4 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <PostFilters
            status={status}
            salaryType={salaryType}
            keyword={keyword}
            pageSize={pagination.pageSize}
            pending={pending}
            onNavigate={navigate}
          />
          <CreatePostButton departments={departments} />
        </div>
      </div>
      <div className="relative flex flex-col gap-4">
        <PostsTable posts={posts} />
        {pending ? (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-background/65 pt-8 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="animate-spin" data-icon="inline-start" />
              正在更新列表
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 px-4 pb-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>每页</span>
            <PostPageSizeSelect
              pagination={pagination}
              status={status}
              salaryType={salaryType}
              keyword={keyword}
              pending={pending}
              onNavigate={navigate}
            />
            <span>
              共 {pagination.total} 条，第 {pagination.page} /{" "}
              {Math.max(pagination.totalPages, 1)} 页
            </span>
            {pending ? (
              <Badge variant="secondary">
                <Loader2 className="animate-spin" data-icon="inline-start" />
                正在更新
              </Badge>
            ) : null}
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
    </div>
  );
}
