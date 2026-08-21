import { CalendarClock } from "lucide-react";
import {
  douyinAppointmentStatusLabel,
  douyinAppointmentStatusVariant,
  formatDouyinBudgetRange,
  getDouyinCustomerSourceMetadata,
} from "@/components/customers/customer-detail-display";
import type { CustomerSourceRecord } from "@/components/customers/customer-mutation-types";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function CustomerDouyinSourceSnapshot({
  source,
}: {
  source: CustomerSourceRecord;
}) {
  const metadata = getDouyinCustomerSourceMetadata(source);
  if (!metadata) return null;
  const hasAiAdvice = Boolean(metadata.ai_summary)
    || metadata.allocation_advice.length > 0
    || metadata.risk_factors.length > 0
    || metadata.onsite_questions.length > 0;

  return (
    <section
      aria-label={`抖音预约 ${metadata.appointment_no || "编号未知"}`}
      className="mt-3 flex min-w-0 flex-col gap-3"
    >
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock aria-hidden="true" />
          抖音预约
        </div>
        <Badge variant={douyinAppointmentStatusVariant(metadata.status)}>
          {douyinAppointmentStatusLabel(metadata.status)}
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <SnapshotField label="预约申请编号" value={metadata.appointment_no} />
        <SnapshotField
          label="预算区间"
          value={formatDouyinBudgetRange(
            metadata.minimum_total,
            metadata.maximum_total,
          )}
          description={metadata.estimate_no
            ? `预算编号：${metadata.estimate_no}`
            : "未关联预算"}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2 rounded-md bg-muted/50 p-3">
        <div className="text-xs font-medium text-foreground">AI 建议</div>
        {hasAiAdvice ? (
          <div className="flex min-w-0 flex-col gap-3 text-xs leading-5 text-muted-foreground">
            {metadata.ai_summary ? (
              <p className="max-w-[75ch] whitespace-pre-wrap break-words text-foreground">
                {metadata.ai_summary}
              </p>
            ) : null}
            <AdviceList label="预算分配" items={metadata.allocation_advice} />
            <AdviceList label="风险提示" items={metadata.risk_factors} />
            <AdviceList label="量房确认" items={metadata.onsite_questions} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">暂无可展示的 AI 建议。</p>
        )}
      </div>
    </section>
  );
}

function SnapshotField({
  label,
  value,
  description,
}: {
  label: string;
  value: string | null;
  description?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-sm font-medium">{value || "-"}</div>
      {description ? (
        <div className="min-w-0 break-words text-xs text-muted-foreground">
          {description}
        </div>
      ) : null}
    </div>
  );
}

function AdviceList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="font-medium text-foreground">{label}</div>
      <ul className="flex min-w-0 list-disc flex-col gap-1 pl-4">
        {items.map((item, index) => (
          <li key={`${label}-${index}`} className="break-words">{item}</li>
        ))}
      </ul>
    </div>
  );
}
