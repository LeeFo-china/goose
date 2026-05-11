import { BarChart3, Bot, MessageSquareText, TriangleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TenantUsageSummaryData } from "@/components/usage/usage-types";

function formatNumber(value?: number | null) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

export function UsageSummaryCards({ data }: { data: TenantUsageSummaryData }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Bot />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">AI Token</div>
            <div className="text-xl font-semibold">{formatNumber(data.ai.total_tokens)}</div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <BarChart3 />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">AI 调用</div>
            <div className="text-xl font-semibold">{formatNumber(data.ai.call_count)}</div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <MessageSquareText />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">短信发送</div>
            <div className="text-xl font-semibold">{formatNumber(data.sms.send_count)}</div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-10 items-center justify-center rounded-md bg-destructive text-destructive-foreground">
            <TriangleAlert />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">失败记录</div>
            <div className="text-xl font-semibold">
              {formatNumber(data.ai.failure_count + data.sms.failure_count)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
