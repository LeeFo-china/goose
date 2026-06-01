import { CopyValueButton } from "@/components/admin/copy-value-button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { TableCell, TableRow } from "@/components/ui/table";
import type { IdentityDiagnosticSeverity } from "@/components/platform-identity-diagnostics/identity-diagnostics-types";

export function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function statusVariant(status?: string | null) {
  if (status === "active" || status === "success") return "success" as const;
  if (status === "unbound" || status === "disabled" || status === "suspended") return "warning" as const;
  if (status === "failure") return "danger" as const;
  return "outline" as const;
}

export function severityVariant(severity: IdentityDiagnosticSeverity) {
  if (severity === "danger") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "success" as const;
}

export function severityLabel(severity: IdentityDiagnosticSeverity) {
  if (severity === "danger") return "需处理";
  if (severity === "warning") return "需关注";
  return "正常";
}

export function typeLabel(type: string) {
  if (type === "phone") return "手机号";
  if (type === "openid") return "微信 openid";
  if (type === "user_id") return "user_id / 档案 ID";
  return "未识别";
}

export function ShortValue({
  value,
  muted,
}: {
  value?: string | null;
  muted?: boolean;
}) {
  if (!value) return <span className="text-muted-foreground">-</span>;
  return (
    <span className={muted ? "truncate text-xs text-muted-foreground" : "truncate"}>
      {value}
    </span>
  );
}

export function ValueCell({ value }: { value?: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ShortValue value={value} />
      {value ? <CopyValueButton value={value} label="复制" /> : null}
    </div>
  );
}

export function JsonPreview({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground">-</span>;
  return (
    <pre className="max-h-28 overflow-auto rounded-md bg-muted p-2 text-xs leading-5 text-muted-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function EmptyRows({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-28">
        <Empty className="border-0 p-2">
          <EmptyHeader>
            <EmptyTitle>暂无数据</EmptyTitle>
            <EmptyDescription>{text}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </TableCell>
    </TableRow>
  );
}
