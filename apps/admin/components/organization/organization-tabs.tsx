"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Building2, BriefcaseBusiness, Loader2 } from "lucide-react";
import { DepartmentsClientShell } from "@/components/organization/departments-client-shell";
import { PostsClientShell } from "@/components/organization/posts-client-shell";
import type {
  DepartmentRecord,
  Pagination,
  PostRecord,
} from "@/components/organization/organization-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type OrganizationTab = "departments" | "posts";

type ListData<T> = {
  list: T[];
  pagination: Pagination;
  error: string | null;
};

const tabs = [
  {
    value: "departments" as const,
    label: "部门",
    icon: Building2,
  },
  {
    value: "posts" as const,
    label: "岗位",
    icon: BriefcaseBusiness,
  },
];

export function OrganizationTabs({
  activeTab,
  departments,
  posts,
  departmentCode,
  departmentKeyword,
  postStatus,
  postSalaryType,
  postKeyword,
}: {
  activeTab: OrganizationTab;
  departments: ListData<DepartmentRecord>;
  posts: ListData<PostRecord>;
  departmentCode: string;
  departmentKeyword: string;
  postStatus: string;
  postSalaryType: string;
  postKeyword: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function switchTab(tab: OrganizationTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    startTransition(() => {
      router.push(`/organization?${params.toString()}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto rounded-md border bg-card p-2">
        {tabs.map((tab) => {
          const active = tab.value === activeTab;
          const Icon = tab.icon;
          const total = tab.value === "departments"
            ? departments.pagination.total
            : posts.pagination.total;

          return (
            <Button
              key={tab.value}
              type="button"
              variant={active ? "default" : "ghost"}
              className={cn(
                "h-9 shrink-0 gap-2 px-3",
                active ? "shadow-sm" : "text-muted-foreground",
              )}
              disabled={pending}
              aria-pressed={active}
              onClick={() => switchTab(tab.value)}
            >
              {pending && active ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : (
                <Icon data-icon="inline-start" />
              )}
              {tab.label}
              <Badge variant={active ? "secondary" : "outline"}>{total}</Badge>
            </Button>
          );
        })}
      </div>

      {activeTab === "departments" ? (
        <DepartmentsClientShell
          departments={departments.list}
          pagination={departments.pagination}
          code={departmentCode}
          keyword={departmentKeyword}
          error={departments.error}
        />
      ) : (
        <PostsClientShell
          posts={posts.list}
          pagination={posts.pagination}
          status={postStatus}
          salaryType={postSalaryType}
          keyword={postKeyword}
          error={posts.error}
        />
      )}
    </div>
  );
}
