import { Loader2 } from "lucide-react";
import type { ProjectOperationalRiskAiSummary } from "@gooes/domain";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ProjectHealthAiSummary({
  summary,
  error,
  isLoading,
  onRetry,
}: {
  summary: ProjectOperationalRiskAiSummary | null;
  error: string | null;
  isLoading: boolean;
  onRetry: () => void;
}) {
  if (!summary && !error && !isLoading) return null;

  return (
    <Card
      aria-live="polite"
      className="shrink-0 overflow-hidden shadow-none"
    >
      <CardHeader className="flex flex-col gap-2 border-b bg-muted/20 p-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <CardTitle>AI 经营摘要</CardTitle>
          <CardDescription className="mt-1">
            仅供处理排序参考，最终判断以项目事实和业务规则为准。
          </CardDescription>
        </div>
        {summary ? (
          <Badge variant="outline" className="shrink-0">
            最多 20 条风险
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" aria-hidden={true} />
            正在生成经营摘要
          </div>
        ) : null}

        {error ? (
          <div className="flex flex-col gap-3">
            <StatusAlert title="AI 摘要生成失败">{error}</StatusAlert>
            <div>
              <Button type="button" variant="outline" onClick={onRetry}>
                重试生成
              </Button>
            </div>
          </div>
        ) : null}

        {summary ? (
          <div className="flex flex-col gap-4">
            <p className="max-w-[75ch] text-sm leading-6 text-foreground">
              {summary.overview}
            </p>

            {summary.priorities.length > 0 ? (
              <ol className="flex flex-col gap-2">
                {summary.priorities.map((item, index) => (
                  <li
                    key={item.risk_key}
                    className="rounded-md border bg-background px-3 py-2"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="tabular-nums">
                          优先 {index + 1}
                        </Badge>
                        <span className="truncate text-sm font-medium" title={item.risk_key}>
                          {item.risk_key}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        原因：{item.reason}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        建议：{item.recommended_action}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : null}

            {summary.cautions.length > 0 ? (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/20 px-3 py-2">
                <p className="text-sm font-medium">注意事项</p>
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {summary.cautions.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
