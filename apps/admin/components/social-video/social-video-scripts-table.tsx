import { FileVideo2 } from "lucide-react";
import { CopyValueButton } from "@/components/admin/copy-value-button";
import type { SocialVideoScriptItem } from "@/components/social-video/social-video-types";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TARGET_PLATFORM_LABELS: Record<SocialVideoScriptItem["target_platform"], string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  shipinhao: "视频号",
  kuaishou: "快手",
};

const STYLE_LABELS: Record<SocialVideoScriptItem["style"], string> = {
  practical: "实用口播",
  seeding: "种草分享",
  professional: "专业可信",
  down_to_earth: "接地气",
  douyin_practical: "抖音口播",
  xiaohongshu: "小红书种草",
};

const GOAL_LABELS: Record<SocialVideoScriptItem["goal"], string> = {
  lead_generation: "引流咨询",
  education: "装修科普",
  case_seeding: "案例种草",
  brand_trust: "品牌信任",
};

function formatDateTime(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatScriptForCopy(item: SocialVideoScriptItem) {
  const scenes = item.shooting_script
    .map((scene) => [
      `镜头 ${scene.scene}${scene.duration ? `（${scene.duration}）` : ""}`,
      `画面：${scene.shot}`,
      `口播：${scene.voiceover}`,
      scene.caption ? `字幕：${scene.caption}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");

  return [
    `标题：${item.title}`,
    `开场钩子：${item.hook}`,
    "",
    "改写文案：",
    item.rewritten_copy,
    "",
    "拍摄脚本：",
    scenes,
    "",
    "封面文案：",
    item.cover_text_options.join(" / "),
    "",
    "发布标题：",
    item.caption_options.join("\n"),
  ].join("\n");
}

export function SocialVideoScriptsTable({ items }: { items: SocialVideoScriptItem[] }) {
  if (!items.length) {
    return (
      <Empty className="min-h-[360px] rounded-none border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileVideo2 />
          </EmptyMedia>
          <EmptyTitle>暂无脚本记录</EmptyTitle>
          <EmptyDescription>
            小程序端完成短视频识别并生成脚本后，会在这里显示。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[980px] border-t">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[240px]">脚本</TableHead>
            <TableHead>平台</TableHead>
            <TableHead>目标</TableHead>
            <TableHead>文本量</TableHead>
            <TableHead>生成时间</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="max-w-[440px]">
                  <div className="line-clamp-1 font-medium">{item.title || "未命名脚本"}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.hook || item.rewritten_copy}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge variant={item.status === "completed" ? "success" : "danger"}>
                      {item.status === "completed" ? "已完成" : "失败"}
                    </Badge>
                    <Badge variant="outline">{STYLE_LABELS[item.style] || item.style}</Badge>
                    <Badge variant="outline">{item.duration_seconds} 秒</Badge>
                  </div>
                </div>
              </TableCell>
              <TableCell>{TARGET_PLATFORM_LABELS[item.target_platform] || item.target_platform}</TableCell>
              <TableCell>{GOAL_LABELS[item.goal] || item.goal}</TableCell>
              <TableCell>{item.source_text_length} 字</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateTime(item.created_at)}</TableCell>
              <TableCell className="text-right">
                <CopyValueButton value={formatScriptForCopy(item)} label="复制脚本" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
