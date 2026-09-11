import { Edit3 } from "lucide-react";
import { findSystemAiScene } from "@gooes/domain";
import type { AiSceneRouteRecord, PageData } from "./ai-config-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, TablePageFooter } from "./ai-model-routing-sections";
import { modelLabel } from "./ai-model-routing-shared";

export function AiRouteTable({ page, loading, saving, canManage, onEdit, onPageChange }: {
  page: PageData<AiSceneRouteRecord>;
  loading: boolean;
  saving: boolean;
  canManage: boolean;
  onEdit: (route: AiSceneRouteRecord) => void;
  onPageChange: (page: number) => void;
}) {
  return (
    <Card className="flex min-h-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0">
        <CardTitle>场景路由列表</CardTitle>
        <CardDescription>已配置路由保留其业务场景身份和当前模型绑定。</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <Table containerClassName="h-full" className="min-w-[980px]">
          <TableHeader className="sticky top-0 bg-card">
            <TableRow>
              <TableHead>场景</TableHead>
              <TableHead>主模型</TableHead>
              <TableHead>备用模型</TableHead>
              <TableHead>参数</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading || page.list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {loading ? "场景路由加载中" : "暂无场景路由"}
                </TableCell>
              </TableRow>
            ) : page.list.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">{item.scene_code}</div>
                  {findSystemAiScene(item.scene_code)?.runtime_status === "not_connected" ? (
                    <Badge variant="outline" className="mt-1">运行时尚未接通</Badge>
                  ) : null}
                </TableCell>
                <TableCell>{item.primary_model_id && !item.primary_model ? "原绑定模型（关联记录不可用）" : modelLabel(item.primary_model)}</TableCell>
                <TableCell>{item.fallback_model_id && !item.fallback_model ? "原绑定模型（关联记录不可用）" : modelLabel(item.fallback_model)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={item.status} />
                    <Badge variant="secondary">{item.modality || "text"}</Badge>
                    <Badge variant="secondary">T {item.temperature ?? "-"}</Badge>
                    <Badge variant="secondary">{item.response_format || "默认"}</Badge>
                    <Badge variant="secondary">{item.timeout_ms ?? "-"}ms</Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {canManage ? (
                    <Button variant="outline" size="sm" disabled={saving} onClick={() => onEdit(item)}>
                      <Edit3 data-icon="inline-start" />编辑
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <TablePageFooter pagination={page.pagination} visibleCount={page.list.length} pending={loading} onPageChange={onPageChange} />
    </Card>
  );
}
