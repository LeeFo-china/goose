"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import type {
  PictureAssetListData,
  PictureCategoryRecord,
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

export function buildPictureLibraryHref(input: {
  page?: number;
  status?: string;
  categoryId?: string;
  keyword?: string;
}) {
  const query = new URLSearchParams();
  if (input.page && input.page > 1) query.set("page", String(input.page));
  if (input.status && input.status !== "all") query.set("status", input.status);
  if (input.categoryId && input.categoryId !== "all") query.set("category_id", input.categoryId);
  if (input.keyword) query.set("keyword", input.keyword);
  const value = query.toString();
  return value ? `/platform/picture-library?${value}` : "/platform/picture-library";
}

export function PictureLibraryFilters({
  status,
  categoryId,
  keyword,
  categories,
}: {
  status: string;
  categoryId: string;
  keyword: string;
  categories: PictureCategoryRecord[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedStatus, setSelectedStatus] = useState(status || "all");
  const [selectedCategoryId, setSelectedCategoryId] = useState(categoryId || "all");
  const [selectedKeyword, setSelectedKeyword] = useState(keyword);

  function navigate(next: {
    status?: string;
    categoryId?: string;
    keyword?: string;
  }) {
    startTransition(() => {
      router.push(buildPictureLibraryHref({
        status: next.status ?? selectedStatus,
        categoryId: next.categoryId ?? selectedCategoryId,
        keyword: next.keyword ?? selectedKeyword.trim(),
      }));
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ keyword: selectedKeyword.trim() });
  }

  return (
    <form className="flex flex-col gap-3 md:flex-row" onSubmit={submit}>
      <div className="grid gap-3 md:grid-cols-[180px_220px_minmax(220px,1fr)] md:flex-1">
        <Select
          value={selectedStatus}
          onValueChange={(value) => {
            setSelectedStatus(value);
            navigate({ status: value });
          }}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="published">已发布</SelectItem>
              <SelectItem value="hidden">已隐藏</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          value={selectedCategoryId}
          onValueChange={(value) => {
            setSelectedCategoryId(value);
            navigate({ categoryId: value });
          }}
          disabled={pending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">全部分类</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input
          value={selectedKeyword}
          onChange={(event) => setSelectedKeyword(event.target.value)}
          placeholder="搜索图片标题"
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
            setSelectedCategoryId("all");
            setSelectedKeyword("");
            startTransition(() => router.push("/platform/picture-library"));
          }}
        >
          <X data-icon="inline-start" />
          清空
        </Button>
      </div>
    </form>
  );
}

export function PictureLibraryPagination({
  pagination,
  status,
  categoryId,
  keyword,
}: {
  pagination: PictureAssetListData["pagination"];
  status: string;
  categoryId: string;
  keyword: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const canPrev = pagination.page > 1;
  const canNext = pagination.page < pagination.totalPages;

  function navigate(page: number) {
    startTransition(() => {
      router.push(buildPictureLibraryHref({ page, status, categoryId, keyword }));
    });
  }

  return (
    <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
      <div className="text-sm text-muted-foreground">
        第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页，共 {pagination.total} 张
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
