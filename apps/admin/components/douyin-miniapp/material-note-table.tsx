"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { DouyinMaterialNoteTenantSummary } from "@gooes/domain";
import { ChevronLeft, ChevronRight, Eye, Loader2, Search, X } from "lucide-react";

import {
  type MaterialNoteFilters,
  materialNoteStatusLabels,
} from "@/components/douyin-miniapp/material-note-contract";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const statusOptions = [
  { value: "all", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
  { value: "withdrawn", label: "已撤回" },
] as const;

const pageSizeOptions = [20, 50, 100] as const;

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function statusVariant(status: DouyinMaterialNoteTenantSummary["status"]) {
  if (status === "published") return "success" as const;
  if (status === "archived") return "secondary" as const;
  if (status === "withdrawn") return "danger" as const;
  return "warning" as const;
}

export function MaterialNoteFilters({ filters }: { filters: MaterialNoteFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [keyword, setKeyword] = useState(filters.keyword);
  const [status, setStatus] = useState(filters.status || "all");
  const [pageSize, setPageSize] = useState(String(filters.pageSize));

  useEffect(() => {
    setKeyword(filters.keyword);
    setStatus(filters.status || "all");
    setPageSize(String(filters.pageSize));
  }, [filters]);

  function navigate(next: { keyword: string; status: string; pageSize: string }) {
    const query = new URLSearchParams();
    query.set("pageSize", next.pageSize);
    if (next.status !== "all") query.set("status", next.status);
    if (next.keyword.trim()) query.set("keyword", next.keyword.trim());
    startTransition(() => {
      router.push(`${pathname}?${query}`);
      router.refresh();
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ keyword, status, pageSize });
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup className="grid gap-2 lg:grid-cols-[170px_130px_minmax(240px,1fr)_80px] lg:items-end">
        <Field>
          <FieldLabel htmlFor="material-note-status" className="sr-only">资料状态</FieldLabel>
          <Select value={status} disabled={pending} onValueChange={(value) => {
            setStatus(value);
            navigate({ keyword, status: value, pageSize });
          }}>
            <SelectTrigger id="material-note-status"><SelectValue placeholder="全部状态" /></SelectTrigger>
            <SelectContent><SelectGroup>{statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="material-note-page-size" className="sr-only">每页条数</FieldLabel>
          <Select value={pageSize} disabled={pending} onValueChange={(value) => {
            setPageSize(value);
            navigate({ keyword, status, pageSize: value });
          }}>
            <SelectTrigger id="material-note-page-size"><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{pageSizeOptions.map((value) => (
              <SelectItem key={value} value={String(value)}>{value} 条/页</SelectItem>
            ))}</SelectGroup></SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="material-note-keyword" className="sr-only">搜索标题、摘要或分类</FieldLabel>
          <InputGroup>
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput
              id="material-note-keyword"
              value={keyword}
              disabled={pending}
              maxLength={120}
              placeholder="搜索标题、摘要或分类"
              onChange={(event) => setKeyword(event.target.value)}
            />
            {keyword ? <InputGroupAddon align="inline-end"><InputGroupButton
              type="button"
              size="icon-xs"
              aria-label="清空搜索"
              onClick={() => { setKeyword(""); navigate({ keyword: "", status, pageSize }); }}
            ><X /></InputGroupButton></InputGroupAddon> : null}
          </InputGroup>
        </Field>
        <Field>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            搜索
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}

export function MaterialNoteTable({
  items,
  initialError,
  loading = false,
}: {
  items: DouyinMaterialNoteTenantSummary[];
  initialError?: string | null;
  loading?: boolean;
}) {
  if (loading) {
    return <div className="flex flex-col gap-3 p-4" aria-label="正在加载资料列表">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>;
  }
  if (initialError) return <div className="p-4"><StatusAlert>{initialError}</StatusAlert></div>;

  return (
    <Table className="min-w-[1080px]">
      <TableHeader><TableRow>
        <TableHead>标题</TableHead><TableHead>分类</TableHead><TableHead>状态</TableHead>
        <TableHead>当前版本</TableHead><TableHead>领取次数</TableHead>
        <TableHead>发布时间</TableHead><TableHead>更新时间</TableHead><TableHead className="text-right">操作</TableHead>
      </TableRow></TableHeader>
      <TableBody>{items.length > 0 ? items.map((item) => (
        <TableRow key={item.id}>
          <TableCell><span className="block max-w-[34ch] truncate font-medium">{item.title}</span></TableCell>
          <TableCell><Badge variant="outline">{item.category}</Badge></TableCell>
          <TableCell><Badge variant={statusVariant(item.status)}>{materialNoteStatusLabels[item.status]}</Badge></TableCell>
          <TableCell className="tabular-nums">v{item.current_version}</TableCell>
          <TableCell className="tabular-nums">{item.claim_count}</TableCell>
          <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(item.published_at)}</TableCell>
          <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(item.updated_at)}</TableCell>
          <TableCell className="text-right"><Button asChild variant="ghost" size="sm">
            <Link href={`/douyin-miniapp/materials/${item.id}`}><Eye data-icon="inline-start" />查看</Link>
          </Button></TableCell>
        </TableRow>
      )) : <TableRow><TableCell colSpan={8} className="h-40">
        <Empty className="border-0 p-4"><EmptyHeader><EmptyTitle>暂无资料笔记</EmptyTitle>
          <EmptyDescription>调整关键词或状态筛选，或创建第一篇资料。</EmptyDescription>
        </EmptyHeader></Empty>
      </TableCell></TableRow>}</TableBody>
    </Table>
  );
}

export function MaterialNotePagination({
  pagination,
}: {
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const totalPages = Math.max(1, pagination.totalPages);

  function navigate(page: number) {
    const query = new URLSearchParams(window.location.search);
    if (page > 1) query.set("page", String(page)); else query.delete("page");
    query.set("pageSize", String(pagination.pageSize));
    startTransition(() => {
      router.push(`${pathname}?${query}`);
      router.refresh();
    });
  }

  return <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="text-sm text-muted-foreground tabular-nums">
      第 {pagination.page} / {totalPages} 页，共 {pagination.total} 篇资料
    </p>
    <div className="flex gap-2">
      <Button type="button" variant="outline" disabled={pending || pagination.page <= 1} onClick={() => navigate(pagination.page - 1)}>
        <ChevronLeft data-icon="inline-start" />上一页
      </Button>
      <Button type="button" variant="outline" disabled={pending || pagination.page >= totalPages} onClick={() => navigate(pagination.page + 1)}>
        下一页<ChevronRight data-icon="inline-end" />
      </Button>
    </div>
  </div>;
}
