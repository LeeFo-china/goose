"use client";

import { useEffect, useState } from "react";
import {
  adminTabsListClassName,
  adminTabsTriggerClassName,
} from "@/components/admin/admin-tabs";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadBatch } from "./batch-api";
import { BatchActions } from "./batch-actions";
import { BatchChildren } from "./batch-children";
import {
  type BatchRevision,
  BatchRevisionNotice,
} from "./batch-revision-notice";
import { batchDate, batchMoney, BatchReadState } from "./batch-page-parts";
import {
  BATCH_STATUS_LABELS,
  batchError,
  destinationName,
} from "./batch-rules";
import type {
  BatchAccess,
  BatchCommandResult,
  BatchDetail as BatchDetailRecord,
} from "./batch-types";

export function BatchSummary({ batch }: { batch: BatchDetailRecord }) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>{BATCH_STATUS_LABELS[batch.status]}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">采购去向</dt>
            <dd>
              {batch.destination_type === "warehouse" ? "仓库补货" : "项目采购"}
              {" "}
              · {destinationName(batch)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">冻结总金额</dt>
            <dd className="font-medium tabular-nums">
              {batchMoney(batch.total_amount)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">商品 / 供应商</dt>
            <dd>{batch.item_count} 个 SKU · {batch.supplier_count} 家供应商</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">预算校验</dt>
            <dd>
              {batch.destination_type === "warehouse" ? "不适用项目预算" : ({
                unchecked: "待校验",
                within_budget: "预算内",
                over_budget: "超出预算",
                not_applicable: "不适用",
              }[batch.budget_status])}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">申请人</dt>
            <dd>
              {batch.applicant?.name ?? batch.creator?.name ?? "人员信息不可用"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">提交时间</dt>
            <dd>{batchDate(batch.submitted_at)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">采购原因</dt>
            <dd className="whitespace-pre-wrap break-words">{batch.reason}</dd>
          </div>
          {batch.remark
            ? (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">备注</dt>
                <dd className="whitespace-pre-wrap break-words">
                  {batch.remark}
                </dd>
              </div>
            )
            : null}
        </dl>
      </CardContent>
    </Card>
  );
}
export function BatchDetail({
  id,
  access,
  receipt,
  onClose,
  onEdit,
  onChanged,
}: {
  id: string;
  access: BatchAccess;
  receipt: BatchCommandResult | null;
  onClose: () => void;
  onEdit: (batch: BatchDetailRecord) => void;
  onChanged: (receipt?: BatchCommandResult) => void;
}) {
  const [batch, setBatch] = useState<BatchDetailRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState("items");
  const [revision, setRevision] = useState<BatchRevision | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    loadBatch(id, controller.signal).then((next) => {
      if (!controller.signal.aborted) setBatch(next);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(batchError(caught));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [id, retry, receipt]);
  const current = !loading && !error ? batch : null;
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 p-0 sm:max-w-5xl">
        <SheetHeader className="shrink-0 border-b p-5 pr-12">
          <SheetTitle>
            采购批次{batch ? ` · ${batch.batch_no}` : "详情"}
          </SheetTitle>
          <SheetDescription>
            查看冻结明细、审批状态与供应商拆单。
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {receipt
            ? (
              <StatusAlert tone="success">
                {receipt.status === "saved"
                  ? "草稿已成功保存"
                  : "操作已成功处理"}。{error
                  ? "最新详情刷新失败，请重试读取；不需要重复提交命令。"
                  : "以下金额以服务端冻结结果为准。"}
              </StatusAlert>
            )
            : null}
          {revision ? <BatchRevisionNotice revision={revision} /> : null}
          <BatchReadState
            loading={loading}
            error={error}
            empty={false}
            onRetry={() => setRetry((value) => value + 1)}
          />
          {current
            ? (
              <>
                <BatchSummary batch={current} />
                <BatchActions
                  batch={current}
                  onEdit={() => onEdit(current)}
                  onAccepted={(result) => {
                    setRevision(null);
                    onChanged(result);
                    setRetry((value) => value + 1);
                  }}
                  onRevision={(next) => {
                    setRevision(next);
                    onChanged();
                    setRetry((value) => value + 1);
                  }}
                />
                {current.workflow_state
                  ? (
                    <Card className="shadow-none">
                      <CardHeader>
                        <CardTitle>审批进度</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <p>
                          {current.workflow_state.current_node_title ??
                            "流程已结束"} · 待办{" "}
                          {current.workflow_state.pending_task_count} 项
                        </p>
                        {current.approval_summary?.current_approvers.length
                          ? (
                            <p>
                              当前审批人：{current.approval_summary
                                .current_approvers.map((person) => person.name)
                                .join("、")}
                            </p>
                          )
                          : null}
                        {current.approval_summary?.review_remark
                          ? (
                            <p className="break-words">
                              审批意见：{current.approval_summary.review_remark}
                            </p>
                          )
                          : null}
                      </CardContent>
                    </Card>
                  )
                  : null}
                {receipt?.split_preview && receipt.batch.id === current.id &&
                    receipt.version === current.version
                  ? (
                    <Card className="shadow-none">
                      <CardHeader>
                        <CardTitle>本次保存的供应商拆单预览</CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>供应商</TableHead>
                              <TableHead className="text-right">
                                商品数
                              </TableHead>
                              <TableHead className="text-right">
                                冻结金额
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {receipt.split_preview.map((split) => (
                              <TableRow key={split.tenant_supplier_id}>
                                <TableCell>{split.supplier_name}</TableCell>
                                <TableCell className="text-right">
                                  {split.item_count}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {batchMoney(split.total_amount)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )
                  : null}
                <Tabs value={tab} onValueChange={setTab}>
                  <TabsList className={adminTabsListClassName}>
                    <TabsTrigger
                      value="items"
                      className={adminTabsTriggerClassName}
                    >
                      采购明细
                    </TabsTrigger>
                    <TabsTrigger
                      value="requisitions"
                      className={adminTabsTriggerClassName}
                    >
                      子申请
                    </TabsTrigger>
                    <TabsTrigger
                      value="orders"
                      className={adminTabsTriggerClassName}
                    >
                      子采购单
                    </TabsTrigger>
                  </TabsList>
                  {(["items", "requisitions", "orders"] as const).map((
                    kind,
                  ) => (
                    <TabsContent key={kind} value={kind}>
                      <BatchChildren
                        key={`${current.id}:${current.version}:${kind}`}
                        id={current.id}
                        kind={kind}
                        access={access}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              </>
            )
            : null}
        </div>
        <div className="flex shrink-0 justify-end border-t p-5">
          <Button type="button" variant="outline" onClick={onClose}>
            关闭详情
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
