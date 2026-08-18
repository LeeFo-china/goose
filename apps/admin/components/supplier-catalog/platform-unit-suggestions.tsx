"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";

import { DataTable } from "@/components/admin/data-table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";
import {
  CatalogUnitDimension,
  UnitSuggestionStatusBadge,
} from "@/components/tenant-supplier-catalog/tenant-catalog-display";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import {
  initializeCatalogCreateIntent,
  resolveCatalogCreateIntent,
} from "./supplier-catalog-rules";
import type {
  CatalogCreateIntent,
  CatalogUnit,
  CatalogUnitSuggestion,
} from "./supplier-catalog-types";
import {
  buildPlatformSuggestionReviewCommand,
  validateSuggestionReview,
} from "./supplier-catalog-v2-requests";

const NO_UNIT = "none";

function PlatformUnitSuggestionReview({
  suggestion,
  units,
}: {
  suggestion: CatalogUnitSuggestion;
  units: CatalogUnit[];
}) {
  const router = useRouter();
  const intentRef = useRef<CatalogCreateIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [action, setAction] = useState<"approved" | "rejected">("approved");
  const [unitId, setUnitId] = useState(NO_UNIT);
  const [remark, setRemark] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const approvedCatalogUnitId = unitId === NO_UNIT ? "" : unitId;
    const nextError = validateSuggestionReview({
      action,
      approvedCatalogUnitId,
      reviewRemark: remark,
    });
    setError(nextError);
    if (nextError) return;
    const payload = {
      action,
      approved_catalog_unit_id: action === "approved" ? approvedCatalogUnitId : null,
      review_remark: remark.trim() || null,
      expected_version: suggestion.version,
    };
    const intent = resolveCatalogCreateIntent(
      intentRef.current,
      payload,
      () => `platform-unit-suggestion:${crypto.randomUUID()}`,
    );
    intentRef.current = intent;
    const request = buildPlatformSuggestionReviewCommand({
      suggestionId: suggestion.id,
      expectedVersion: suggestion.version,
      action,
      approvedCatalogUnitId,
      reviewRemark: remark,
      idempotencyKey: intent.key,
    });
    setPending(true);
    try {
      await requestBackendJson(request.path, {
        ...request.init,
        fallbackMessage: "审核单位建议失败",
      });
      toast.success("单位建议已审核");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "审核单位建议失败");
    } finally {
      setPending(false);
    }
  }

  if (suggestion.status !== "submitted") {
    return <span className="text-sm text-muted-foreground">已处理</span>;
  }
  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (pending) return;
      if (value) {
        setAction("approved"); setUnitId(NO_UNIT); setRemark(""); setError(null);
        intentRef.current = initializeCatalogCreateIntent(
          () => `platform-unit-suggestion:${crypto.randomUUID()}`,
        );
      } else intentRef.current = null;
      setOpen(value);
    }}>
      <DialogTrigger asChild><Button type="button" size="sm" variant="ghost">审核</Button></DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>审核单位建议</DialogTitle><DialogDescription>{suggestion.suggested_name}（{suggestion.suggested_symbol}）· {suggestion.suggested_code}</DialogDescription></DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>审核动作</FieldLabel>
            <Select value={action} onValueChange={(value) => { setAction(value as "approved" | "rejected"); setError(null); }}>
              <SelectTrigger aria-label="审核动作"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="approved">通过</SelectItem><SelectItem value="rejected">拒绝</SelectItem></SelectGroup></SelectContent>
            </Select>
          </Field>
          {action === "approved" ? (
            <Field data-invalid={Boolean(error)}>
              <FieldLabel>对应标准单位</FieldLabel>
              <Select value={unitId} onValueChange={(value) => { setUnitId(value); setError(null); }}>
                <SelectTrigger aria-label="对应标准单位"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup><SelectItem value={NO_UNIT}>请选择</SelectItem>{units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}（{unit.symbol}）</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <FieldError>{error}</FieldError>
            </Field>
          ) : null}
          <Field data-invalid={Boolean(error && action === "rejected")}>
            <FieldLabel htmlFor={`unit-suggestion-remark-${suggestion.id}`}>审核备注</FieldLabel>
            <Textarea id={`unit-suggestion-remark-${suggestion.id}`} maxLength={500} value={remark} onChange={(event) => { setRemark(event.target.value); setError(null); }} />
            {action === "rejected" ? <FieldError>{error}</FieldError> : null}
          </Field>
        </FieldGroup>
        <DialogFooter><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>取消审核</Button><Button type="button" disabled={pending} onClick={() => void submit()}>{pending ? "正在提交" : "提交审核"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlatformUnitSuggestionTable({ records, units }: { records: CatalogUnitSuggestion[]; units: CatalogUnit[] }) {
  const columns: ColumnDef<CatalogUnitSuggestion>[] = [
    { accessorKey: "tenant_id", header: "租户", cell: ({ row }) => <span className="font-mono text-xs">{row.original.tenant_id}</span> },
    { accessorKey: "suggested_code", header: "建议编码" },
    { accessorKey: "suggested_name", header: "名称 / 符号", cell: ({ row }) => `${row.original.suggested_name}（${row.original.suggested_symbol}）` },
    { accessorKey: "unit_dimension", header: "计量维度", cell: ({ row }) => <CatalogUnitDimension value={row.original.unit_dimension} /> },
    { accessorKey: "status", header: "状态", cell: ({ row }) => <UnitSuggestionStatusBadge status={row.original.status} /> },
    { accessorKey: "review_remark", header: "审核说明", cell: ({ row }) => row.original.review_remark || "-" },
    { id: "actions", header: "操作", cell: ({ row }) => <PlatformUnitSuggestionReview suggestion={row.original} units={units} />, meta: { headerClassName: "text-right", cellClassName: "text-right" } },
  ];
  return <DataTable columns={columns} data={records} emptyText="当前筛选条件下没有单位建议" minWidth="min-w-[980px]" tableClassName="border-t-0" rowClassName={() => PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME} />;
}
