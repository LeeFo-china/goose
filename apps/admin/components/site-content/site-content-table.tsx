"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Edit3, Loader2, Search, X } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { FormSelect } from "@/components/admin/form-select";
import type { SiteContentListItem } from "@/components/site-content/site-content-types";
import { siteContentStatusLabels, siteContentTypeLabels } from "@/components/site-content/site-content-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

const typeOptions = [
  { value: "all", label: "全部类型" },
  { value: "article", label: "文章" },
  { value: "case", label: "案例" },
  { value: "city", label: "城市页" },
];
const statusOptions = [
  { value: "all", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
];

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

const columns: ColumnDef<SiteContentListItem>[] = [
  {
    accessorKey: "title",
    header: "标题",
    cell: ({ row }) => <div className="min-w-0"><div className="max-w-[42ch] truncate font-medium">{row.original.title || "未命名内容"}</div><div className="max-w-[42ch] truncate text-xs text-muted-foreground">/{row.original.slug}</div></div>,
  },
  { accessorKey: "content_type", header: "类型", cell: ({ row }) => <Badge variant="outline">{siteContentTypeLabels[row.original.content_type]}</Badge> },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => <Badge variant={row.original.status === "published" ? "success" : row.original.status === "archived" ? "secondary" : "warning"}>{siteContentStatusLabels[row.original.status]}</Badge>,
  },
  { accessorKey: "updated_at", header: "更新时间", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(row.original.updated_at)}</span> },
  { accessorKey: "published_at", header: "发布时间", cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(row.original.published_at)}</span> },
  {
    id: "action",
    header: "操作",
    cell: ({ row }) => <Button asChild variant="ghost" size="sm"><Link href={`/platform/site-content/${row.original.id}`}><Edit3 data-icon="inline-start" />编辑</Link></Button>,
    meta: { headerClassName: "text-right", cellClassName: "text-right whitespace-nowrap" },
  },
];

function buildHref(input: { contentType: string; status: string; keyword: string }) {
  const query = new URLSearchParams();
  if (input.contentType !== "all") query.set("contentType", input.contentType);
  if (input.status !== "all") query.set("status", input.status);
  if (input.keyword) query.set("keyword", input.keyword);
  query.set("pageSize", "20");
  return `/platform/site-content?${query}`;
}

export function SiteContentFilters({ contentType, status, keyword }: { contentType: string; status: string; keyword: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [nextType, setNextType] = useState(contentType || "all");
  const [nextStatus, setNextStatus] = useState(status || "all");
  const [nextKeyword, setNextKeyword] = useState(keyword);

  useEffect(() => { setNextType(contentType || "all"); setNextStatus(status || "all"); setNextKeyword(keyword); }, [contentType, keyword, status]);

  function navigate(values: { contentType: string; status: string; keyword: string }) {
    startTransition(() => { router.push(buildHref(values)); router.refresh(); });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ contentType: nextType, status: nextStatus, keyword: nextKeyword.trim() });
  }

  return (
    <form className="grid gap-3 md:grid-cols-[150px_150px_minmax(220px,1fr)_72px]" onSubmit={submit}>
      <FormSelect id="site-content-type-filter" value={nextType} options={typeOptions} disabled={pending} onChange={(value) => { setNextType(value); navigate({ contentType: value, status: nextStatus, keyword: nextKeyword.trim() }); }} />
      <FormSelect id="site-content-status-filter" value={nextStatus} options={statusOptions} disabled={pending} onChange={(value) => { setNextStatus(value); navigate({ contentType: nextType, status: value, keyword: nextKeyword.trim() }); }} />
      <InputGroup>
        <InputGroupAddon><Search data-icon="inline-start" /></InputGroupAddon>
        <InputGroupInput value={nextKeyword} disabled={pending} placeholder="搜索标题或 slug" aria-label="搜索标题或 slug" onChange={(event) => setNextKeyword(event.target.value)} />
        {nextKeyword ? <InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-xs" aria-label="清空搜索" onClick={() => { setNextKeyword(""); navigate({ contentType: nextType, status: nextStatus, keyword: "" }); }}><X /></InputGroupButton></InputGroupAddon> : null}
      </InputGroup>
      <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}搜索</Button>
    </form>
  );
}

export function SiteContentTable({ items }: { items: SiteContentListItem[] }) {
  return <DataTable columns={columns} data={items} emptyText="没有符合条件的官网内容" minWidth="min-w-[920px]" tableClassName="border-t-0" />;
}
