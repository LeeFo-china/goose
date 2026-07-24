"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";

import {
  formatSupplierDate,
  newIdempotencyKey,
  type PageData,
  type SupplierAddress,
  type SupplierContact,
  type SupplierEvent,
  type SupplierQualification,
  type SupplierServiceRegion,
} from "./platform-supplier-types";
import {
  nextChildPage,
  previousChildPage,
} from "./platform-supplier-rules";

function EmptyPanel({ text }: { text: string }) {
  return (
    <Empty className="min-h-48 border-0">
      <EmptyHeader>
        <EmptyTitle>暂无记录</EmptyTitle>
        <EmptyDescription>{text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ChildPageMeta({
  page,
  onPageChange,
  loading,
}: {
  page: PageData<unknown> | null;
  onPageChange: (page: number) => void;
  loading: boolean;
}) {
  if (!page) return null;
  const totalPages = Math.max(1, page.pagination.totalPages || 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs tabular-nums text-muted-foreground">
        第 {page.pagination.page} / {totalPages} 页，本页 {page.list.length} 条，
        共 {page.pagination.total} 条
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || page.pagination.page <= 1}
          onClick={() =>
            onPageChange(previousChildPage(page.pagination.page))
          }
        >
          <ChevronLeft data-icon="inline-start" />
          上一页
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || page.pagination.page >= totalPages}
          onClick={() =>
            onPageChange(nextChildPage(page.pagination.page, totalPages))
          }
        >
          下一页
          <ChevronRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}

function QualificationReviewButtons({
  supplierId,
  qualification,
  onReload,
}: {
  supplierId: string;
  qualification: SupplierQualification;
  onReload: () => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function review(status: "verified" | "rejected") {
    if (status === "rejected" && !reason.trim()) {
      toast.error("请填写资质驳回原因");
      return;
    }
    setPending(true);
    try {
      await requestBackendJson(
        `/platform/suppliers/${supplierId}/qualifications/${qualification.id}/${
          status === "verified" ? "verify" : "reject"
        }`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": newIdempotencyKey(`qualification-${status}`),
          },
          body: JSON.stringify({
            expected_version: qualification.version,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          }),
          fallbackMessage: status === "verified" ? "核验资质失败" : "驳回资质失败",
        },
      );
      toast.success(status === "verified" ? "资质已核验" : "资质已驳回");
      setRejectOpen(false);
      setReason("");
      onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新资质状态失败");
    } finally {
      setPending(false);
    }
  }

  if (qualification.verification_status !== "pending") return null;
  return (
    <>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => review("verified")}
        >
          核验通过
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() => setRejectOpen(true)}
        >
          驳回资质
        </Button>
      </div>
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>驳回供应商资质</DialogTitle>
            <DialogDescription>
              驳回后供应商需更新材料并重新提交核验。
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`qualification-reason-${qualification.id}`}>
                驳回原因
              </FieldLabel>
              <Textarea
                id={`qualification-reason-${qualification.id}`}
                value={reason}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setRejectOpen(false)}
            >
              取消驳回
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => review("rejected")}
            >
              确认驳回资质
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function QualificationsPanel({
  supplierId,
  data,
  canReview,
  onReload,
  onPageChange,
  loading,
}: {
  supplierId: string;
  data: PageData<SupplierQualification> | null;
  canReview: boolean;
  onReload: () => void;
  onPageChange: (page: number) => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ChildPageMeta
        page={data}
        onPageChange={onPageChange}
        loading={loading}
      />
      {data?.list.length ? <Table>
        <TableHeader>
          <TableRow>
            <TableHead>资质类型 ID</TableHead>
            <TableHead>证书编号</TableHead>
            <TableHead>有效期</TableHead>
            <TableHead>核验状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.list.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-48 truncate font-mono text-xs">
                {item.qualification_type_id}
              </TableCell>
              <TableCell>{item.certificate_no || "-"}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {item.valid_from || "-"} 至 {item.valid_until || "长期"}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    item.verification_status === "verified"
                      ? "success"
                      : item.verification_status === "rejected"
                        ? "danger"
                        : "warning"
                  }
                >
                  {item.verification_status === "verified"
                    ? "已核验"
                    : item.verification_status === "rejected"
                      ? "已驳回"
                      : "待核验"}
                </Badge>
              </TableCell>
              <TableCell>
                {canReview ? (
                  <QualificationReviewButtons
                    supplierId={supplierId}
                    qualification={item}
                    onReload={onReload}
                  />
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table> : <EmptyPanel text="供应商尚未提交资质文件。" />}
      <p className="text-xs text-muted-foreground">
        核验完成后会刷新供应商列表中的资质健康状态。
      </p>
    </div>
  );
}

export function ServiceRegionsPanel({
  data,
  onPageChange,
  loading,
}: {
  data: PageData<SupplierServiceRegion> | null;
  onPageChange: (page: number) => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ChildPageMeta
        page={data}
        onPageChange={onPageChange}
        loading={loading}
      />
      {data?.list.length ? <Table>
        <TableHeader>
          <TableRow>
            <TableHead>行政区划编码</TableHead>
            <TableHead>级别</TableHead>
            <TableHead>有效期</TableHead>
            <TableHead>状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.list.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.region_code}</TableCell>
              <TableCell>
                {item.region_level === "province"
                  ? "省"
                  : item.region_level === "city"
                    ? "市"
                    : "区县"}
              </TableCell>
              <TableCell className="tabular-nums">
                {item.valid_from || "-"} 至 {item.valid_until || "长期"}
              </TableCell>
              <TableCell>
                <Badge variant={item.status === "active" ? "success" : "secondary"}>
                  {item.status === "active" ? "启用" : "停用"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table> : <EmptyPanel text="尚未配置供应商服务区域。" />}
    </div>
  );
}

export function ContactsAndAddressesPanel({
  contacts,
  addresses,
  onContactPageChange,
  onAddressPageChange,
  contactsLoading,
  addressesLoading,
}: {
  contacts: PageData<SupplierContact> | null;
  addresses: PageData<SupplierAddress> | null;
  onContactPageChange: (page: number) => void;
  onAddressPageChange: (page: number) => void;
  contactsLoading: boolean;
  addressesLoading: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">联系人</h3>
        <ChildPageMeta
          page={contacts}
          onPageChange={onContactPageChange}
          loading={contactsLoading}
        />
        {contacts?.list.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {contacts.list.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.name}</span>
                  {item.is_primary ? <Badge variant="secondary">主要联系人</Badge> : null}
                </div>
                <p className="mt-2 text-sm">{item.phone || "未填写电话"}</p>
                <p className="text-sm text-muted-foreground">
                  {item.email || "未填写邮箱"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel text="尚未维护供应商联系人。" />
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">地址</h3>
        <ChildPageMeta
          page={addresses}
          onPageChange={onAddressPageChange}
          loading={addressesLoading}
        />
        {addresses?.list.length ? (
          <div className="flex flex-col gap-2">
            {addresses.list.map((item) => (
              <div key={item.id} className="rounded-md border p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {[item.province, item.city, item.district].filter(Boolean).join(" ")}
                  </span>
                  {item.is_default ? <Badge variant="secondary">默认地址</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.address_detail}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel text="尚未维护供应商地址。" />
        )}
      </section>
    </div>
  );
}

export function EventsPanel({
  data,
  onPageChange,
  loading,
}: {
  data: PageData<SupplierEvent> | null;
  onPageChange: (page: number) => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ChildPageMeta
        page={data}
        onPageChange={onPageChange}
        loading={loading}
      />
      {data?.list.length ? <div className="flex flex-col gap-2">
        {data.list.map((item) => (
          <div key={item.id} className="flex flex-col gap-1 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{item.command}</span>
              <time className="text-xs tabular-nums text-muted-foreground">
                {formatSupplierDate(item.created_at)}
              </time>
            </div>
            <p className="text-sm text-muted-foreground">
              {item.reason || "本次操作未填写原因"}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              结果版本 {item.result_version}
            </p>
          </div>
        ))}
      </div> : <EmptyPanel text="暂无供应商状态操作记录。" />}
    </div>
  );
}
