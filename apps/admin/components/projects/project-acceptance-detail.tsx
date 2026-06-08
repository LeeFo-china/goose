"use client";

import { ChangeEvent } from "react";
import { CheckCircle2, Clock3, Loader2, MessageSquareText, Send, Trash2, XCircle } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AcceptanceAction, AcceptanceItemResult, AcceptanceSection, EditableItem, EditableState, ProjectAcceptance } from "@/components/projects/project-acceptance-types";
import { canEdit, formatDateTime, getAcceptanceDisplayTitle, isFinalAcceptance, resultLabel, resultVariant, statusVariant } from "@/components/projects/project-acceptance-utils";
import { CustomerNotificationPanel } from "@/components/projects/project-acceptance-customer-notification-panel";
import { AcceptanceTimeline } from "@/components/projects/project-acceptance-timeline";
import { ImageUploadBlock } from "@/components/projects/project-acceptance-image-upload-block";

type ProjectAcceptanceDetailProps = {
  selected: ProjectAcceptance | null;
  selectedStats: { total: number; pass: number; fail: number; pending: number };
  selectedSections: AcceptanceSection[];
  latestCustomerDispute: AcceptanceAction | null;
  latestRejectAction: AcceptanceAction | null;
  editable: EditableState;
  actionLoading: boolean;
  uploadingItemId: string;
  setEditable: (updater: (current: EditableState) => EditableState) => void;
  openActionDialog: (type: "approve" | "reject" | "delete") => void;
  saveAcceptance: (submit?: boolean) => Promise<void>;
  notifyCustomer: (force?: boolean) => Promise<void>;
  updateEditableItem: (itemId: string, patch: Partial<EditableItem>) => void;
  uploadImages: (itemId: string, event: ChangeEvent<HTMLInputElement>, target: "images" | "rectification_images") => void;
};

export function ProjectAcceptanceDetail({
  selected,
  selectedStats,
  selectedSections,
  latestCustomerDispute,
  latestRejectAction,
  editable,
  actionLoading,
  uploadingItemId,
  setEditable,
  openActionDialog,
  saveAcceptance,
  notifyCustomer,
  updateEditableItem,
  uploadImages,
}: ProjectAcceptanceDetailProps) {
  return selected ? (
            <section className="flex min-h-0 min-w-0 flex-col rounded-md border bg-card">
              <div className="h-[86px] shrink-0 overflow-hidden border-b bg-card px-4 py-3">
                <div className="flex h-8 items-center justify-between gap-3 overflow-hidden">
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <h3 className="min-w-0 truncate text-base font-semibold">
                      {getAcceptanceDisplayTitle(selected)}
                    </h3>
                    {isFinalAcceptance(selected) ? (
                      <Badge variant="outline" className="shrink-0">竣工报告</Badge>
                    ) : null}
                    <Badge variant={statusVariant(selected.status)} className="shrink-0">
                      {selected.status_label}
                    </Badge>
                    <div className="ml-0 hidden shrink-0 overflow-hidden rounded-md border bg-background text-xs md:flex lg:ml-2">
                      <span className="px-2 py-1 text-muted-foreground">
                        全部 <b className="font-semibold text-foreground">{selectedStats.total}</b>
                      </span>
                      <span className="border-l px-2 py-1 text-muted-foreground">
                        通过 <b className="font-semibold text-success">{selectedStats.pass}</b>
                      </span>
                      <span className="border-l px-2 py-1 text-muted-foreground">
                        问题 <b className="font-semibold text-destructive">{selectedStats.fail}</b>
                      </span>
                      <span className="border-l px-2 py-1 text-muted-foreground">
                        待填 <b className="font-semibold text-foreground">{selectedStats.pending}</b>
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 justify-end gap-2">
                  {canEdit(selected.status) ? (
                    <>
                      {selected.status === "draft" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openActionDialog("delete")}
                          disabled={actionLoading}
                        >
                          <Trash2 />
                          删除草稿
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => saveAcceptance(false)}
                        disabled={actionLoading}
                      >
                        保存草稿
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveAcceptance(true)}
                        disabled={actionLoading || selected.can_submit === false}
                      >
                        <Send />
                        提交验收
                      </Button>
                    </>
                  ) : null}
                  {selected.status === "submitted" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openActionDialog("reject")}
                        disabled={actionLoading}
                      >
                        <XCircle />
                        退回整改
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openActionDialog("approve")}
                        disabled={actionLoading}
                      >
                        <CheckCircle2 />
                        复核通过
                      </Button>
                    </>
                  ) : null}
                  {selected.status === "leader_approved" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={selected.latest_customer_notification ? "outline" : "default"}
                      onClick={() => notifyCustomer(Boolean(selected.latest_customer_notification))}
                      disabled={actionLoading}
                    >
                      {actionLoading
                        ? <Loader2 className="animate-spin" data-icon="inline-start" />
                        : <MessageSquareText data-icon="inline-start" />}
                      {selected.latest_customer_notification ? "重发客户通知" : "发送客户通知"}
                    </Button>
                  ) : null}
                  </div>
                </div>

                <div className="mt-2 flex h-5 min-w-0 items-center gap-x-3 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
                  <span className="shrink-0">发起：{selected.initiator?.name || "-"}</span>
                  <span className="shrink-0">复核：{selected.reviewer?.name || "-"}</span>
                  <span className="shrink-0">更新：{formatDateTime(selected.updated_at || selected.created_at)}</span>
                  {selected.reject_reason ? (
                    <span className="min-w-0 flex-1 truncate text-destructive">
                      {selected.reject_source === "customer" ? "业主疑问" : "驳回原因"}：
                      {selected.reject_reason}
                    </span>
                  ) : null}
                  {selected.reject_source === "customer" && latestCustomerDispute ? (
                    <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
                      <Clock3 data-icon="inline-start" />
                      <span className="truncate">
                        最近疑问：{formatDateTime(latestCustomerDispute.created_at)}
                        {latestCustomerDispute.comment ? ` · ${latestCustomerDispute.comment}` : ""}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-gutter:stable]">
                {selected.status === "leader_approved" || selected.latest_customer_notification ? (
                  <CustomerNotificationPanel
                    notification={selected.latest_customer_notification || null}
                    onSend={() => notifyCustomer(false)}
                    onResend={() => notifyCustomer(true)}
                    disabled={actionLoading || selected.status !== "leader_approved"}
                  />
                ) : null}

                <AcceptanceTimeline
                  acceptance={selected}
                  actions={selected.actions || []}
                  editable={editable}
                  latestRejectActionId={latestRejectAction?.id || null}
                  actionLoading={actionLoading}
                  uploadingItemId={uploadingItemId}
                  onSave={saveAcceptance}
                  onUpdateItem={updateEditableItem}
                  onUploadImages={uploadImages}
                />

                {selected.can_submit === false && selected.blocked_reason ? (
                  <StatusAlert>{selected.blocked_reason}</StatusAlert>
                ) : null}

                <div className="space-y-2">
                  <Label>整体验收说明</Label>
                  <Textarea
                    value={editable.summary}
                    onChange={(event) =>
                      setEditable((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))}
                    disabled={!canEdit(selected.status)}
                    placeholder="填写现场整体情况"
                  />
                </div>

                <div className="flex flex-col gap-4">
                  {selectedSections.map((section) => (
                    <section key={section.id || "flat-items"} className="flex flex-col gap-3">
                      {isFinalAcceptance(selected) ? (
                        <div className="rounded-md border bg-background px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-semibold">{section.title}</h4>
                              {section.description ? (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {section.description}
                                </p>
                              ) : null}
                            </div>
                            <Badge variant="secondary">{section.items.length} 项</Badge>
                          </div>
                        </div>
                      ) : null}
                      {section.items.map((item) => {
                        const draft = editable.items[item.id];
                        const editableNow = canEdit(selected.status);
                        return (
                          <article key={item.id} className="rounded-md border bg-background">
                            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className="font-medium">{item.title}</h4>
                                  <Badge variant={resultVariant(draft?.result)}>
                                    {resultLabel(draft?.result)}
                                  </Badge>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {item.category ? (
                                    <Badge variant="secondary">{item.category}</Badge>
                                  ) : null}
                                  {item.required ? <Badge variant="outline">必检</Badge> : null}
                                  {item.photo_required ? (
                                    <Badge variant="outline">
                                      需 {Math.max(item.photo_min_count || 1, 1)} 张照片
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                  {item.standard}
                                </p>
                              </div>
                              <div className="w-full sm:w-40">
                                <Select
                                  value={draft?.result || "unset"}
                                  disabled={!editableNow}
                                  onValueChange={(value) =>
                                    updateEditableItem(item.id, {
                                      result: value === "unset"
                                        ? null
                                        : value as AcceptanceItemResult,
                                    })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unset">未填写</SelectItem>
                                    <SelectItem value="pass">通过</SelectItem>
                                    <SelectItem value="fail">不通过</SelectItem>
                                    {item.allow_not_applicable ? (
                                      <SelectItem value="not_applicable">不适用</SelectItem>
                                    ) : null}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_240px]">
                              <div className="space-y-2">
                                <Label>备注</Label>
                                <Textarea
                                  className="min-h-24"
                                  value={draft?.remark || ""}
                                  disabled={!editableNow}
                                  onChange={(event) =>
                                    updateEditableItem(item.id, {
                                      remark: event.target.value,
                                    })}
                                  placeholder="填写验收备注"
                                />
                              </div>

                              <ImageUploadBlock
                                label="现场照片"
                                images={draft?.imagePreviews || draft?.images || []}
                                disabled={!editableNow}
                                uploading={uploadingItemId === `${item.id}:images`}
                                onUpload={(event) => uploadImages(item.id, event, "images")}
                                onRemove={(index) => updateEditableItem(item.id, {
                                  images: (draft?.images || []).filter((_, i) => i !== index),
                                  imagePreviews: (draft?.imagePreviews || []).filter((_, i) => i !== index),
                                })}
                              />
                            </div>
                          </article>
                        );
                      })}
                    </section>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <section className="flex min-h-0 items-center justify-center rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
              从左侧发起工序验收或竣工交付验收后，在这里填写验收内容。
            </section>
          );
}
