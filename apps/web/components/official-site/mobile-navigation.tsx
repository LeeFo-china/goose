"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function MobileNavigation(): React.JSX.Element {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-11" size="sm" variant="outline">
          打开菜单
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] rounded-lg">
        <DialogHeader>
          <DialogTitle>网站导航</DialogTitle>
          <DialogDescription>访问鹅班长官网公开页面。</DialogDescription>
        </DialogHeader>
        <nav aria-label="移动端导航" className="flex flex-col gap-2">
          <DialogClose asChild>
            <Button asChild variant="ghost">
              <Link href="/">返回首页</Link>
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button asChild variant="ghost">
              <Link href="/partners">城市合伙人</Link>
            </Button>
          </DialogClose>
        </nav>
      </DialogContent>
    </Dialog>
  );
}
