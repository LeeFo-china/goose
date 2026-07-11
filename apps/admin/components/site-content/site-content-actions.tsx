"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ExternalLink, Loader2, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { StatusAlert } from "@/components/admin/status-alert";
import {
  createSiteContentPreview,
  getSiteContentErrorMessage,
  mutateSiteContentPublication,
} from "@/components/site-content/site-content-api";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type PublicationAction = "publish" | "rollback" | "archive";

const actionCopy: Record<PublicationAction, { title: string; description: string; submit: string }> = {
  publish: {
    title: "发布当前版本",
    description: "发布后公开官网将读取此版本，并触发对应页面缓存失效。",
    submit: "确认发布",
  },
  rollback: {
    title: "回滚到此版本",
    description: "此版本将成为新的公开版本，并触发对应页面缓存失效。",
    submit: "确认回滚",
  },
  archive: {
    title: "归档此内容",
    description: "归档后公开页面将不可访问。后续仍可保留版本记录。",
    submit: "确认归档",
  },
};

function PublicationButton({
  id,
  versionId,
  action,
  canPublish,
  onWarning,
}: {
  id: string;
  versionId?: string;
  action: PublicationAction;
  canPublish: boolean;
  onWarning: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const copy = actionCopy[action];
  const Icon = action === "publish" ? Send : action === "rollback" ? RotateCcw : Archive;

  async function submit(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await mutateSiteContentPublication({ id, action, versionId });
      if (result.cache_revalidation.status === "failed") {
        onWarning("内容状态已更新，但官网缓存刷新失败。请保留本提示并联系运维核查公开页面。");
      } else {
        onWarning("");
      }
      toast.success(action === "publish" ? "内容已发布" : action === "rollback" ? "内容已回滚" : "内容已归档");
      setOpen(false);
      router.refresh();
    } catch (mutationError) {
      setError(getSiteContentErrorMessage(mutationError, "官网内容状态更新失败"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!pending) { setOpen(nextOpen); if (!nextOpen) setError(""); } }}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={action === "publish" ? "default" : "outline"} disabled={!canPublish || pending || (action !== "archive" && !versionId)} title={!canPublish ? "需要 platform.site_content.publish 权限" : undefined}>
          <Icon data-icon="inline-start" />
          {copy.submit.replace("确认", "")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={submit}>
            {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {copy.submit}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SiteContentActions({
  id,
  latestVersionId,
  canRead,
  canPublish,
  onWarning,
}: {
  id: string;
  latestVersionId?: string;
  canRead: boolean;
  canPublish: boolean;
  onWarning: (message: string) => void;
}) {
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState("");

  async function preview() {
    if (!latestVersionId) return;
    setPreviewPending(true);
    setPreviewError("");
    try {
      const { previewUrl } = await createSiteContentPreview(id, latestVersionId);
      const previewWindow = window.open(previewUrl, "_blank", "noopener,noreferrer");
      if (!previewWindow) {
        setPreviewError("浏览器阻止了预览窗口，请允许本站打开新窗口后重试");
      }
    } catch (error) {
      setPreviewError(getSiteContentErrorMessage(error, "生成预览地址失败，请检查官网地址配置"));
    } finally {
      setPreviewPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {previewError ? <StatusAlert>{previewError}</StatusAlert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!canRead || !latestVersionId || previewPending} onClick={() => void preview()}>
          {previewPending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <ExternalLink data-icon="inline-start" />}
          预览版本
        </Button>
        <PublicationButton id={id} versionId={latestVersionId} action="publish" canPublish={canPublish} onWarning={onWarning} />
        <PublicationButton id={id} action="archive" canPublish={canPublish} onWarning={onWarning} />
      </div>
      {!canPublish ? <p className="text-xs text-muted-foreground">发布和归档需要 platform.site_content.publish 权限。</p> : null}
    </div>
  );
}

export function SiteContentRollbackAction({
  id,
  versionId,
  canPublish,
  onWarning,
}: {
  id: string;
  versionId: string;
  canPublish: boolean;
  onWarning: (message: string) => void;
}) {
  return <PublicationButton id={id} versionId={versionId} action="rollback" canPublish={canPublish} onWarning={onWarning} />;
}
