"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Loader2, RefreshCw, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusAlert } from "@/components/admin/status-alert";
import type { CameraRecord } from "@/components/cameras/camera-types";
import type { PlayParams } from "@/components/cameras/camera-mutation-types";
import { getPreviewSources } from "@/components/cameras/camera-mutation-shared";

export function PlayPreviewDialog({
  camera,
  data,
  pending,
  onClose,
  onRefresh,
}: {
  camera: CameraRecord;
  data: PlayParams;
  pending: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sources = useMemo(() => getPreviewSources(data), [data]);
  const firstPlayableUrl = sources.find((source) => source.previewable)?.url || sources[0]?.url || "";
  const [selectedUrl, setSelectedUrl] = useState(firstPlayableUrl);
  const [playerError, setPlayerError] = useState("");
  const [copied, setCopied] = useState(false);
  const selectedSource = sources.find((source) => source.url === selectedUrl) || sources[0] || null;

  useEffect(() => {
    setSelectedUrl(firstPlayableUrl);
    setPlayerError("");
  }, [firstPlayableUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedSource?.previewable || !selectedSource.url) return;

    let disposed = false;
    let hlsInstance: { destroy: () => void } | null = null;
    setPlayerError("");

    if (selectedSource.protocol === "hls") {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = selectedSource.url;
        void video.play().catch(() => undefined);
      } else {
        import("hls.js")
          .then((module) => {
            if (disposed) return;
            const Hls = module.default;
            if (!Hls.isSupported()) {
              setPlayerError("当前浏览器不支持 HLS 实时预览，可复制地址到播放器验证。");
              return;
            }

            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
            });
            hlsInstance = hls;
            hls.loadSource(selectedSource.url);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, (_event, payload) => {
              if (payload.fatal) {
                setPlayerError("实时画面加载失败，请刷新播放地址或检查摄像头在线状态。");
              }
            });
            void video.play().catch(() => undefined);
          })
          .catch(() => {
            if (!disposed) {
              setPlayerError("播放器加载失败，请稍后重试。");
            }
          });
      }
    }

    return () => {
      disposed = true;
      hlsInstance?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [selectedSource]);

  async function copyUrl() {
    if (!selectedUrl) return;
    try {
      await navigator.clipboard.writeText(selectedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setPlayerError("复制失败，请手动选中播放地址复制。");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-[960px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{camera.name} 实时预览</DialogTitle>
          <DialogDescription>
            播放地址由后端实时换取，优先使用 HLS 在后台预览；RTMP/RTSP 仅保留为调试地址。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="overflow-hidden rounded-md border bg-muted">
            <div className="aspect-video bg-foreground">
              {selectedSource?.previewable ? (
                <video
                  ref={videoRef}
                  className="size-full object-contain"
                  controls
                  muted
                  playsInline
                  autoPlay
                  onError={() => setPlayerError("实时画面播放失败，请刷新地址或切换协议。")}
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-3 bg-foreground text-background">
                  <Video />
                  <div className="text-sm font-medium">当前协议暂不支持浏览器内直接预览</div>
                  <div className="max-w-[520px] px-6 text-center text-xs text-background/70">
                    请切换到 HLS，或复制当前地址到支持该协议的播放器中验证。
                  </div>
                </div>
              )}
            </div>
          </div>
          {playerError ? <StatusAlert>{playerError}</StatusAlert> : null}
          <div className="flex flex-wrap items-center gap-2">
            {sources.map((source) => (
              <Button
                key={`${source.protocol}-${source.url}`}
                type="button"
                size="sm"
                variant={source.url === selectedUrl ? "default" : "outline"}
                onClick={() => setSelectedUrl(source.url)}
              >
                {source.label}
              </Button>
            ))}
            {sources.length === 0 ? (
              <Badge variant="secondary">暂无播放地址</Badge>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <InfoItem label="播放器" value={`${data.player?.provider || "-"} ${data.player?.plugin_version || ""}`} />
            <InfoItem label="当前协议" value={selectedSource?.label || data.player?.protocol || "-"} />
            <InfoItem label="过期时间" value={formatDateTime(data.player?.expires_at)} />
          </div>
          <InfoItem label="当前播放地址" value={selectedUrl || "-"} wrap />
          {data.player?.request_id ? (
            <InfoItem label="RequestId" value={data.player.request_id} wrap />
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onRefresh}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            刷新地址
          </Button>
          <Button type="button" variant="outline" disabled={!selectedUrl} onClick={copyUrl}>
            <Copy data-icon="inline-start" />
            {copied ? "已复制" : "复制地址"}
          </Button>
          <Button type="button" onClick={onClose}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoItem({
  label,
  value,
  wrap,
}: {
  label: string;
  value: string;
  wrap?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={wrap ? "mt-1 break-all text-sm font-medium" : "mt-1 truncate text-sm font-medium"}>
        {value}
      </div>
    </div>
  );
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
