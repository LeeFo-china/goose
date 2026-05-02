"use client";

import { useMemo, useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  EXPENSE_MODE_VALUES,
  EXPENSE_SETTLEMENT_METHOD_VALUES,
  ExpenseModeConfig,
  ExpenseSettlementMethodConfig,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { z } from "zod";
import {
  CheckCircle2,
  Eye,
  Loader2,
  RotateCcw,
  SendHorizontal,
  WalletCards,
  XCircle,
} from "lucide-react";
import { FormSelect } from "@/components/admin/form-select";
import { StatusAlert } from "@/components/admin/status-alert";
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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Person = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  status?: string | null;
};

type Project = {
  id?: string | null;
  name?: string | null;
  status?: string | null;
};

export type ExpenseItem = {
  id: string;
  occurred_at: string | null;
  category_code: string | null;
  category: string | null;
  amount: number;
  remark: string | null;
  invoice_no: string | null;
  vendor_name: string | null;
  evidence_images?: string[];
};

export type ApprovalRecord = {
  id: string;
  step: string;
  action: string;
  approver_id: string | null;
  comment: string | null;
  created_at: string | null;
  approver?: Person | Person[] | null;
};

export type ApprovalChainRecord = {
  id: string;
  step: string;
  step_name: string;
  sort_order: number;
  assignee_id: string;
  assignee_name_snapshot: string | null;
  required_permission: string;
  status: string;
  acted_by: string | null;
  acted_at: string | null;
  comment: string | null;
  assignee?: Person | Person[] | null;
};

type SettlementRecord = {
  id: string;
  payee_name?: string | null;
  payee_bank?: string | null;
  payee_account?: string | null;
  method: string;
  paid_amount: number;
  paid_at: string | null;
  remark?: string | null;
  evidence_images?: string[];
  paid_operator?: Person | Person[] | null;
};

export type ExpenseRecord = {
  id: string;
  request_no: string | null;
  employee_id: string;
  project_id: string | null;
  mode: string;
  title: string | null;
  total_amount: number;
  status: string;
  current_step: string;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  assignee_id: string | null;
  rejected_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  employee?: Person | Person[] | null;
  project?: Project | Project[] | null;
  assignee?: Person | Person[] | null;
  items?: ExpenseItem[];
  approvals?: ApprovalRecord[];
  settlement?: SettlementRecord | SettlementRecord[] | null;
  approval_chain?: ApprovalChainRecord[];
};

const settlementMethodOptions = EXPENSE_SETTLEMENT_METHOD_VALUES.map((value) => [
  value,
  ExpenseSettlementMethodConfig[value].label,
] as const);
const settlementMethodSelectOptions = settlementMethodOptions.map(([value, label]) => ({
  value,
  label,
}));

const PayFormSchema = z.object({
  payee_bank: z.string(),
  payee_account: z.string(),
  method: z.enum(EXPENSE_SETTLEMENT_METHOD_VALUES),
  paid_amount: z.string().refine((value) => {
    const amount = Number(value);
    return Number.isFinite(amount) && amount > 0;
  }, "请输入有效打款金额"),
  paid_at: z.string().min(1, "请选择打款时间"),
  evidence_images: z.array(z.string().trim().min(1, "打款凭证不能为空"))
    .min(1, "请上传至少 1 张打款凭证"),
  remark: z.string(),
});

type PayFormValues = z.infer<typeof PayFormSchema>;

const EVIDENCE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024;
const MAX_UPLOAD_FILES = 9;

const modeLabel: Record<string, string> = Object.fromEntries(
  EXPENSE_MODE_VALUES.map((value) => [
    value,
    ExpenseModeConfig[value].label,
  ]),
);

const actionLabel: Record<string, string> = {
  submit: "提交",
  resubmit: "重新提交",
  approve: "通过",
  reject: "驳回",
  cancel: "撤回",
  pay: "打款",
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function personName(value: Person | Person[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || item?.phone || "-";
}

function projectName(value: Project | Project[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || "-";
}

function getExpensePayeeName(expense: ExpenseRecord) {
  const directPayee = expense.mode === "direct"
    ? (expense.items || []).map((item) => item.vendor_name?.trim()).find(Boolean)
    : null;
  return directPayee || personName(expense.employee);
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestExpense(input: {
  path: string;
  method?: "GET" | "POST";
  payload?: unknown;
}) {
  const response = await fetch(`/api/backend${input.path}`, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload.data;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("图片压缩失败"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", quality);
  });
}

async function compressImageIfNeeded(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} 不是图片文件`);
  }

  if (file.size <= EVIDENCE_COMPRESS_THRESHOLD) {
    return file;
  }

  if (file.type === "image/heic" || file.type === "image/heif") {
    throw new Error(`${file.name} 大于 1.5MB，当前浏览器无法压缩 HEIC/HEIF，请先转换为 JPG/PNG`);
  }

  const image = await loadImage(file);
  let scale = Math.min(1, 2200 / Math.max(image.width, image.height));

  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.44]) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持图片压缩");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= EVIDENCE_COMPRESS_THRESHOLD) {
      return new File(
        [blob],
        file.name.replace(/\.[^.]+$/, "") + ".jpg",
        { type: "image/jpeg" },
      );
    }
    scale *= 0.82;
  }

  throw new Error(`${file.name} 压缩后仍超过 1.5MB，请更换更小的图片`);
}

async function uploadEvidenceImages(files: File[]) {
  const formData = new FormData();
  formData.append("scene", "expense_request");

  for (const file of files) {
    const uploadFile = await compressImageIfNeeded(file);
    formData.append("files", uploadFile);
  }

  const response = await fetch("/api/backend/uploads/images", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "上传打款凭证失败"));
  }

  const list = Array.isArray(payload.data?.list) ? payload.data.list : [];
  return list
    .map((item: { url?: unknown }) => item.url)
    .filter((url: unknown): url is string => typeof url === "string" && Boolean(url));
}

function DetailDialog({
  expense,
  onClose,
}: {
  expense: ExpenseRecord;
  onClose: () => void;
}) {
  const settlement = relationOne(expense.settlement);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-[920px] overflow-hidden p-0">
        <DialogHeader className="flex-row items-start justify-between gap-4 border-b p-5 text-left">
          <div>
            <DialogTitle>{expense.title || "费用申请详情"}</DialogTitle>
            <DialogDescription>
              {expense.request_no || expense.id} · {personName(expense.employee)}
            </DialogDescription>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>关闭</Button>
        </DialogHeader>
        <div className="flex max-h-[calc(88vh-82px)] flex-col gap-5 overflow-y-auto p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <InfoItem label="金额" value={`¥${formatMoney(expense.total_amount)}`} />
            <InfoItem label="模式" value={modeLabel[expense.mode] || expense.mode} />
            <InfoItem label="项目" value={projectName(expense.project)} />
            <InfoItem label="创建时间" value={formatDateTime(expense.created_at)} />
          </div>

          <section>
            <h3 className="mb-3 text-sm font-semibold">费用明细</h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">分类</th>
                    <th className="px-4 py-3">金额</th>
                    <th className="px-4 py-3">商户</th>
                    <th className="px-4 py-3">发生时间</th>
                    <th className="px-4 py-3">说明</th>
                  </tr>
                </thead>
                <tbody>
                  {(expense.items || []).length > 0 ? (
                    (expense.items || []).map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-4 py-3">{item.category || item.category_code || "-"}</td>
                        <td className="px-4 py-3">¥{formatMoney(item.amount)}</td>
                        <td className="px-4 py-3">{item.vendor_name || "-"}</td>
                        <td className="px-4 py-3">{formatDateTime(item.occurred_at)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.remark || "-"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                        暂无费用明细
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">审批链</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {(expense.approval_chain || []).map((node) => (
                <div key={node.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{node.step_name || node.step}</div>
                    <Badge variant={node.status === "approved" ? "success" : node.status === "current" ? "warning" : "outline"}>
                      {node.status}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {personName(node.assignee)} · {formatDateTime(node.acted_at)}
                  </div>
                  {node.comment ? (
                    <div className="mt-2 text-sm text-muted-foreground">{node.comment}</div>
                  ) : null}
                </div>
              ))}
              {(expense.approval_chain || []).length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  暂无审批链
                </div>
              ) : null}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold">审批记录</h3>
            <div className="flex flex-col gap-2">
              {(expense.approvals || []).map((item) => (
                <div key={item.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      {actionLabel[item.action] || item.action} · {personName(item.approver)}
                    </div>
                    <span className="text-muted-foreground">{formatDateTime(item.created_at)}</span>
                  </div>
                  {item.comment ? (
                    <div className="mt-1 text-muted-foreground">{item.comment}</div>
                  ) : null}
                </div>
              ))}
              {(expense.approvals || []).length === 0 ? (
                <div className="rounded-md border p-4 text-sm text-muted-foreground">
                  暂无审批记录
                </div>
              ) : null}
            </div>
          </section>

          {settlement ? (
            <section>
              <h3 className="mb-3 text-sm font-semibold">打款记录</h3>
              <div className="grid gap-3 rounded-md border p-4 md:grid-cols-4">
                <InfoItem label="收款人" value={settlement.payee_name || "-"} />
                <InfoItem label="方式" value={settlement.method} />
                <InfoItem label="金额" value={`¥${formatMoney(settlement.paid_amount)}`} />
                <InfoItem label="时间" value={formatDateTime(settlement.paid_at)} />
              </div>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

function PayDialog({
  expense,
  currentEmployeeId,
  onClose,
  onDone,
}: {
  expense: ExpenseRecord;
  currentEmployeeId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [uploading, startUploadTransition] = useTransition();
  const [error, setError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const payeeName = getExpensePayeeName(expense);
  const defaults = useMemo<PayFormValues>(() => ({
    payee_bank: "",
    payee_account: "",
    method: "bank_transfer",
    paid_amount: String(expense.total_amount || ""),
    paid_at: new Date().toISOString().slice(0, 16),
    evidence_images: [],
    remark: "",
  }), [expense.total_amount]);
  const form = useForm<PayFormValues>({
    resolver: zodResolver(PayFormSchema as never) as Resolver<PayFormValues>,
    defaultValues: defaults,
  });

  function submit(values: PayFormValues) {
    if (!payeeName || payeeName === "-") {
      setError("申请中缺少可用于打款的收款人");
      return;
    }

    const paidAmount = Number(values.paid_amount);
    if (paidAmount.toFixed(2) !== Number(expense.total_amount || 0).toFixed(2)) {
      setError(`打款金额必须等于申请总额 ¥${formatMoney(expense.total_amount)}`);
      return;
    }

    const payload = {
      payee_name: payeeName,
      payee_bank: values.payee_bank.trim() || null,
      payee_account: values.payee_account.trim() || null,
      method: values.method,
      paid_amount: paidAmount,
      paid_at: new Date(values.paid_at).toISOString(),
      paid_by: currentEmployeeId,
      evidence_images: values.evidence_images,
      remark: values.remark.trim() || null,
    };

    setError("");
    startTransition(async () => {
      try {
        await requestExpense({
          path: `/expense-requests/${expense.id}/pay`,
          method: "POST",
          payload,
        });
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "登记打款失败");
      }
    });
  }

  function handleEvidenceFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const currentImages = form.getValues("evidence_images");
    if (currentImages.length + files.length > MAX_UPLOAD_FILES) {
      setError(`打款凭证最多上传 ${MAX_UPLOAD_FILES} 张`);
      return;
    }

    setError("");
    setUploadMessage("正在处理图片...");
    startUploadTransition(async () => {
      try {
        const urls = await uploadEvidenceImages(files);
        if (urls.length === 0) {
          throw new Error("上传完成但未返回图片地址");
        }
        const nextImages = [...form.getValues("evidence_images"), ...urls];
        form.setValue("evidence_images", nextImages, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setUploadMessage(`已上传 ${nextImages.length} 张打款凭证`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "上传打款凭证失败");
        setUploadMessage("");
      }
    });
  }

  function removeEvidenceImage(index: number) {
    const nextImages = form.getValues("evidence_images").filter((_, itemIndex) => itemIndex !== index);
    form.setValue("evidence_images", nextImages, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setUploadMessage(nextImages.length > 0 ? `已上传 ${nextImages.length} 张打款凭证` : "");
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>登记打款</DialogTitle>
          <DialogDescription>
            金额必须等于申请总额 ¥{formatMoney(expense.total_amount)}，打款凭证至少 1 张。
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>收款人</FieldLabel>
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 text-sm">
                {payeeName}
              </div>
            </Field>
            <Controller
              name="method"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="method">打款方式</FieldLabel>
                  <FormSelect
                    id="method"
                    value={field.value}
                    disabled={pending}
                    invalid={fieldState.invalid}
                    options={settlementMethodSelectOptions}
                    onChange={field.onChange}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="paid_amount"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="paid_amount">打款金额</FieldLabel>
                  <Input
                    {...field}
                    id="paid_amount"
                    type="number"
                    step="0.01"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="paid_at"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="paid_at">打款时间</FieldLabel>
                  <Input
                    {...field}
                    id="paid_at"
                    type="datetime-local"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="payee_bank"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="payee_bank">收款银行</FieldLabel>
                  <Input
                    {...field}
                    id="payee_bank"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="payee_account"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="payee_account">收款账号</FieldLabel>
                  <Input
                    {...field}
                    id="payee_account"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            <Controller
              name="evidence_images"
              control={form.control}
              render={({ fieldState }) => {
                const images = form.watch("evidence_images");
                return (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="evidence_images">打款凭证图片</FieldLabel>
                  <Input
                    id="evidence_images"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    multiple
                    disabled={pending || uploading}
                    aria-invalid={fieldState.invalid}
                    onChange={(event) => {
                      handleEvidenceFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  {uploadMessage ? (
                    <div className="text-xs text-muted-foreground">{uploadMessage}</div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      支持 JPG、PNG、WebP、HEIC；单张大于 1.5MB 会先压缩再上传。
                    </div>
                  )}
                  {images.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {images.map((image, index) => (
                        <div key={image} className="overflow-hidden rounded-md border bg-background">
                          <img
                            src={image}
                            alt={`打款凭证 ${index + 1}`}
                            className="h-24 w-full object-cover"
                          />
                          <div className="flex items-center justify-between gap-2 p-2">
                            <span className="truncate text-xs text-muted-foreground">
                              凭证 {index + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending || uploading}
                              onClick={() => removeEvidenceImage(index)}
                            >
                              移除
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <FieldError errors={[fieldState.error]} />
                </Field>
              );
              }}
            />
            <Controller
              name="remark"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field className="md:col-span-2" data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="remark">备注</FieldLabel>
                  <Textarea
                    {...field}
                    id="remark"
                    disabled={pending}
                    aria-invalid={fieldState.invalid}
                    className="min-h-[72px]"
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>
          {error ? (
            <StatusAlert>{error}</StatusAlert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending || uploading}>
              取消
            </Button>
            <Button type="submit" disabled={pending || uploading}>
              {pending || uploading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <WalletCards data-icon="inline-start" />}
              确认打款
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseRowActions({
  expense,
  currentEmployeeId,
}: {
  expense: ExpenseRecord;
  currentEmployeeId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ExpenseRecord | null>(null);
  const [payExpense, setPayExpense] = useState<ExpenseRecord | null>(null);
  const canApprove = expense.status === "pending" &&
    ["manager_review", "finance_review"].includes(expense.current_step);
  const canCancel = ["draft", "pending", "rejected"].includes(expense.status) &&
    Boolean(currentEmployeeId);
  const canPay = expense.status === "approved" &&
    expense.current_step === "payment" &&
    Boolean(currentEmployeeId);

  function refresh() {
    router.refresh();
  }

  function runAction(input: {
    label: string;
    path: string;
    payload: unknown;
    confirm?: string;
  }) {
    if (input.confirm && !window.confirm(input.confirm)) return;
    setError("");
    startTransition(async () => {
      try {
        await requestExpense({
          path: input.path,
          method: "POST",
          payload: input.payload,
        });
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : `${input.label}失败`);
      }
    });
  }

  function approve() {
    const comment = window.prompt("审批意见（可留空）");
    if (comment === null) return;
    runAction({
      label: "审批通过",
      path: `/expense-requests/${expense.id}/approve`,
      payload: { comment: comment.trim() || null },
    });
  }

  function reject() {
    const reason = window.prompt("请输入驳回原因");
    if (!reason?.trim()) return;
    runAction({
      label: "审批驳回",
      path: `/expense-requests/${expense.id}/reject`,
      payload: {
        rejected_reason: reason.trim(),
        comment: reason.trim(),
      },
    });
  }

  function cancel() {
    if (!currentEmployeeId) return;
    const comment = window.prompt("撤回说明（可留空）") || "";
    runAction({
      label: "撤回",
      path: `/expense-requests/${expense.id}/cancel`,
      payload: {
        operator_id: currentEmployeeId,
        comment: comment.trim() || null,
      },
      confirm: "确认撤回这条费用申请？",
    });
  }

  function openDetail() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestExpense({ path: `/expense-requests/${expense.id}` });
        setDetail(data as ExpenseRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : "详情加载失败");
      }
    });
  }

  function openPay() {
    setError("");
    startTransition(async () => {
      try {
        const data = await requestExpense({ path: `/expense-requests/${expense.id}` });
        setPayExpense(data as ExpenseRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : "打款信息加载失败");
      }
    });
  }

  return (
    <div className="flex min-w-[236px] flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
      <Button type="button" variant="outline" size="sm" onClick={openDetail} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Eye />}
        详情
      </Button>
      {canApprove ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={approve} disabled={pending}>
            <CheckCircle2 />
            通过
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={reject} disabled={pending}>
            <XCircle />
            驳回
          </Button>
        </>
      ) : null}
      {canCancel ? (
        <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={pending}>
          <RotateCcw />
          撤回
        </Button>
      ) : null}
      {canPay ? (
        <Button type="button" variant="outline" size="sm" onClick={openPay} disabled={pending}>
          <SendHorizontal />
          打款
        </Button>
      ) : null}
      {detail ? <DetailDialog expense={detail} onClose={() => setDetail(null)} /> : null}
      {payExpense && currentEmployeeId ? (
        <PayDialog
          expense={payExpense}
          currentEmployeeId={currentEmployeeId}
          onClose={() => setPayExpense(null)}
          onDone={() => {
            setPayExpense(null);
            refresh();
          }}
        />
      ) : null}
      {error ? (
        <div className="absolute right-5 mt-10 max-w-[360px] rounded-md border border-destructive/50 bg-background px-3 py-2 text-xs text-destructive shadow-sm">
          {error}
        </div>
      ) : null}
    </div>
  );
}
