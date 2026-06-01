import { z } from "zod";
import {
  EXPENSE_APPROVAL_ACTION_VALUES,
  EXPENSE_MODE_VALUES,
  EXPENSE_REQUEST_STEP_VALUES,
  EXPENSE_SETTLEMENT_METHOD_VALUES,
  ExpenseApprovalActionConfig,
  ExpenseModeConfig,
  ExpenseRequestStepConfig,
  ExpenseSettlementMethodConfig,
} from "@gooes/domain";
import type {
  ExpenseItem,
  ExpenseRecord,
  Person,
  Project,
} from "@/components/expenses/expense-mutation-types";
import { buildUploadPreviewUrl, uploadDirectToCos } from "@/lib/cos-direct-upload";

const settlementMethodOptions = EXPENSE_SETTLEMENT_METHOD_VALUES.map((value) => [
  value,
  ExpenseSettlementMethodConfig[value].label,
] as const);
const settlementMethodLabel = Object.fromEntries(settlementMethodOptions);
export const settlementMethodSelectOptions = settlementMethodOptions.map(([value, label]) => ({
  value,
  label,
}));

export const PayFormSchema = z.object({
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

export type PayFormValues = z.infer<typeof PayFormSchema>;

const EVIDENCE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 9;

export const modeLabel: Record<string, string> = Object.fromEntries(
  EXPENSE_MODE_VALUES.map((value) => [
    value,
    ExpenseModeConfig[value].label,
  ]),
);

export const requestStepLabel: Record<string, string> = Object.fromEntries(
  EXPENSE_REQUEST_STEP_VALUES.map((value) => [
    value,
    ExpenseRequestStepConfig[value].label,
  ]),
);

export const actionLabel: Record<string, string> = Object.fromEntries(
  EXPENSE_APPROVAL_ACTION_VALUES.map((value) => [
    value,
    ExpenseApprovalActionConfig[value].label,
  ]),
);

export const approvalChainStatusMeta: Record<string, {
  label: string;
  variant: "success" | "warning" | "outline" | "danger";
}> = {
  approved: { label: "已通过", variant: "success" },
  current: { label: "当前处理", variant: "warning" },
  pending: { label: "待处理", variant: "outline" },
  rejected: { label: "已驳回", variant: "danger" },
  cancelled: { label: "已作废", variant: "outline" },
  skipped: { label: "已跳过", variant: "outline" },
};

export const expenseCategoryFallbackLabel: Record<string, string> = {
  material: "材料费",
  transport: "交通费",
  labor: "人工费",
  subcontract: "外包费",
  meal: "餐饮费",
  hospitality: "餐饮费",
  travel: "差旅费",
  tool: "工具设备",
  office: "办公费用",
  other: "其他费用",
};

export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function personName(value: Person | Person[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || item?.phone || "-";
}

export function projectName(value: Project | Project[] | null | undefined) {
  const item = relationOne(value);
  return item?.name || "-";
}

export function getExpensePayeeName(expense: ExpenseRecord) {
  const directPayee = expense.mode === "direct"
    ? (expense.items || []).map((item) => item.vendor_name?.trim()).find(Boolean)
    : null;
  return directPayee || personName(expense.employee);
}

export function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return amount.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDateTime(value: string | null | undefined) {
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

export function formatSettlementMethod(value: string | null | undefined) {
  if (!value) return "-";
  return settlementMethodLabel[value] || value;
}

export function formatExpenseCategory(item: ExpenseItem) {
  const category = item.category_name || item.category;
  if (category?.trim()) {
    return category;
  }

  const code = item.category_code?.trim() || "";
  return code ? expenseCategoryFallbackLabel[code] || code : "-";
}

export function formatApprovalAction(value: string | null | undefined) {
  if (!value) return "审批记录";
  return actionLabel[value] || value;
}

export function formatApprovalStep(value: string | null | undefined) {
  if (!value) return "审批节点";
  return requestStepLabel[value] || value;
}

export function getApprovalChainStatusMeta(value: string | null | undefined) {
  return approvalChainStatusMeta[value || ""] || {
    label: value || "未知状态",
    variant: "outline" as const,
  };
}

export function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export async function requestExpense<T = unknown>(input: {
  path: string;
  method?: "GET" | "POST";
  payload?: unknown;
}): Promise<T> {
  const response = await fetch(`/api/backend${input.path}`, {
    method: input.method || "GET",
    headers: input.payload ? { "content-type": "application/json" } : undefined,
    body: input.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "操作失败"));
  }
  return payload.data as T;
}

export function loadImage(file: File) {
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

export function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
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

export async function compressImageIfNeeded(file: File) {
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

export function getEvidenceImagePreviewSrc(image: string) {
  return buildUploadPreviewUrl(image);
}

export async function uploadEvidenceImageDirect(file: File) {
  const uploadFile = await compressImageIfNeeded(file);
  const mimetype = uploadFile.type || "image/jpeg";
  const uploaded = await uploadDirectToCos(uploadFile, {
      scene: "expense_request",
      mimetype,
    uploadErrorLabel: "上传打款凭证",
    missingStorageMessage: "打款凭证上传成功但未返回图片地址",
  });

  return uploaded.storagePath;
}

export async function uploadEvidenceImages(files: File[]) {
  return Promise.all(files.map((file) => uploadEvidenceImageDirect(file)));
}
