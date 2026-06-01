"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Copy, ExternalLink, Loader2, MoreHorizontal, PauseCircle, Pencil, PlayCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { H5MarketingPageRecord } from "@/components/marketing/marketing-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildH5PageEditHref, buildPageUrl, DEFAULT_H5_PAGE_API_BASE_PATH, DEFAULT_H5_PAGE_EDIT_BASE_PATH, DEFAULT_H5_PAGE_RETURN_TO, requestH5Page } from "@/components/marketing/h5-page-mutation-shared";
import { H5PageSettingsButton } from "@/components/marketing/h5-page-settings-dialog";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

export function H5PageRowActions({
  page,
  pages = [],
  apiBasePath = DEFAULT_H5_PAGE_API_BASE_PATH,
  editBasePath = DEFAULT_H5_PAGE_EDIT_BASE_PATH,
  returnTo = DEFAULT_H5_PAGE_RETURN_TO,
  tenantSlug,
}: {
  page: H5MarketingPageRecord;
  pages?: H5MarketingPageRecord[];
  apiBasePath?: string;
  editBasePath?: string;
  returnTo?: string;
  tenantSlug?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const pageUrl = buildPageUrl(page.slug, tenantSlug);

  function runAction(label: string, action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
        toast.success(label);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "操作失败");
      }
    });
  }

  function archivePage() {
    startTransition(async () => {
      try {
        setArchiveOpen(false);
        await requestH5Page({
          path: `${apiBasePath}/${page.id}`,
          method: "DELETE",
        });
        toast.success("H5 活动页已结束");
        refreshAfterDialogClose(router);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "操作失败");
      }
    });
  }

  function copyUrl() {
    navigator.clipboard.writeText(pageUrl)
      .then(() => toast.success("页面链接已复制"))
      .catch(() => toast.error("复制失败"));
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={pending}>
            {pending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <MoreHorizontal data-icon="inline-start" />
            )}
            操作
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={buildH5PageEditHref(page.id, editBasePath, returnTo)}>
                <Pencil />
                编辑
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <H5PageSettingsButton
                page={page}
                pages={pages}
                apiBasePath={apiBasePath}
                variant="menu"
                tenantSlug={tenantSlug}
              />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={copyUrl}>
              <Copy />
              复制链接
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => window.open(pageUrl, "_blank")}>
              <ExternalLink />
              预览
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={() => runAction("已复制为新页面", () =>
                requestH5Page({
                  path: `${apiBasePath}/${page.id}/duplicate`,
                  method: "POST",
                  payload: {},
                })
              )}
            >
              <RefreshCw />
              复制页面
            </DropdownMenuItem>
            {page.status === "published" ? (
              <DropdownMenuItem
                onSelect={() => runAction("H5 活动页已下线", () =>
                  requestH5Page({
                    path: `${apiBasePath}/${page.id}/offline`,
                    method: "POST",
                  })
                )}
              >
                <PauseCircle />
                停止
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onSelect={() => runAction("H5 活动页已发布", () =>
                  requestH5Page({
                    path: `${apiBasePath}/${page.id}/publish`,
                    method: "POST",
                  })
                )}
              >
                <PlayCircle />
                发布
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setArchiveOpen(true)}
          >
            <Archive />
            结束
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>结束 H5 活动页</DialogTitle>
            <DialogDescription>
              结束后页面会归档，不再出现在活动页列表中，已投放的 H5 地址也不能继续作为有效活动页访问。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setArchiveOpen(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={archivePage}
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Archive data-icon="inline-start" />}
              确认结束
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
