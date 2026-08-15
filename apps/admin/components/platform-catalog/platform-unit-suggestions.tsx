"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import {
  listPlatformUnitSuggestions,
  processPlatformUnitSuggestion,
  type PlatformUnitSuggestion,
} from "./platform-catalog-api";

export function PlatformUnitSuggestions() {
  const [suggestions, setSuggestions] = useState<PlatformUnitSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listPlatformUnitSuggestions("pending");
      setSuggestions(page.list);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载单位建议失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function process(id: string, status: "approved" | "rejected") {
    try {
      await processPlatformUnitSuggestion(id, status);
      toast.success(status === "approved" ? "已批准" : "已拒绝");
      await load();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "处理失败");
    }
  }

  return (
    <Card>
      <CardHeader className="p-4 text-sm font-medium">单位建议处理</CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-muted-foreground">{error}</div>
        ) : suggestions.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            暂无待处理的单位建议
          </div>
        ) : (
          <ul className="divide-y text-sm">
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div>
                  <div>
                    {suggestion.name}（{suggestion.symbol}）
                  </div>
                  <div className="text-muted-foreground">
                    {suggestion.dimension}
                    {suggestion.note ? ` · ${suggestion.note}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => process(suggestion.id, "approved")}
                  >
                    批准
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => process(suggestion.id, "rejected")}
                  >
                    拒绝
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
