"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import {
  initializeCatalogCreateIntent,
  resolveCatalogCreateIntent,
} from "@/components/supplier-catalog/supplier-catalog-rules";
import type {
  CatalogCreateIntent,
  CatalogUnitSuggestion,
} from "@/components/supplier-catalog/supplier-catalog-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import {
  CatalogUnitDimension,
  UnitSuggestionStatusBadge,
} from "./tenant-catalog-display";
import { buildTenantUnitSuggestionCommand } from "./tenant-catalog-requests";
import { newTenantCatalogCommandKey } from "./tenant-catalog-rules";

export function TenantUnitSuggestionDialogButton() {
  const router = useRouter();
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [dimension, setDimension] = useState("quantity");
  const [reason, setReason] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = {
      suggested_code: code.trim().toUpperCase(),
      suggested_name: name.trim(),
      suggested_symbol: symbol.trim(),
      unit_dimension: dimension.trim(),
      reason: reason.trim() || null,
    };
    const intent = resolveCatalogCreateIntent(
      intentRef.current,
      payload,
      () => newTenantCatalogCommandKey("unit-suggestion"),
    );
    intentRef.current = intent;
    const request = buildTenantUnitSuggestionCommand(payload, intent.key);
    setPending(true);
    try {
      await requestBackendJson(request.path, {
        ...request.init,
        fallbackMessage: "提交单位建议失败",
      });
      toast.success("单位建议已提交");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交单位建议失败");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (pending) return;
      if (value) {
        setCode(""); setName(""); setSymbol(""); setDimension("quantity"); setReason("");
        intentRef.current = initializeCatalogCreateIntent(
          () => newTenantCatalogCommandKey("unit-suggestion"),
        );
      } else intentRef.current = null;
      setOpen(value);
    }}>
      <DialogTrigger asChild><Button type="button">提交单位建议</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>提交单位建议</DialogTitle><DialogDescription>租户只能提交建议，标准单位由平台审核后统一维护。</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="suggested-unit-code">建议编码</FieldLabel><Input id="suggested-unit-code" required maxLength={64} value={code} onChange={(event) => setCode(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="suggested-unit-name">建议名称</FieldLabel><Input id="suggested-unit-name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="suggested-unit-symbol">建议符号</FieldLabel><Input id="suggested-unit-symbol" required maxLength={32} value={symbol} onChange={(event) => setSymbol(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="suggested-unit-dimension">计量维度</FieldLabel><Input id="suggested-unit-dimension" required maxLength={64} value={dimension} onChange={(event) => setDimension(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="suggested-unit-reason">建议原因</FieldLabel><Textarea id="suggested-unit-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
          </FieldGroup>
          <DialogFooter className="mt-5"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>取消提交</Button><Button type="submit" disabled={pending}>{pending ? "正在提交" : "提交建议"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TenantUnitSuggestionTable({ records }: { records: CatalogUnitSuggestion[] }) {
  const columns: ColumnDef<CatalogUnitSuggestion>[] = [
    { accessorKey: "suggested_code", header: "建议编码" },
    { accessorKey: "suggested_name", header: "名称 / 符号", cell: ({ row }) => `${row.original.suggested_name}（${row.original.suggested_symbol}）` },
    { accessorKey: "unit_dimension", header: "计量维度", cell: ({ row }) => <CatalogUnitDimension value={row.original.unit_dimension} /> },
    { accessorKey: "reason", header: "建议原因", cell: ({ row }) => row.original.reason || "-" },
    { accessorKey: "status", header: "状态", cell: ({ row }) => <UnitSuggestionStatusBadge status={row.original.status} /> },
    { accessorKey: "review_remark", header: "审核说明", cell: ({ row }) => row.original.review_remark || "-" },
  ];
  return <DataTable columns={columns} data={records} emptyText="尚未提交单位建议" minWidth="min-w-[860px]" tableClassName="border-t-0" rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME} />;
}
