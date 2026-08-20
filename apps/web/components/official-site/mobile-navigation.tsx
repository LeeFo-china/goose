"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

import {
  isSiteNavigationActive,
  SITE_NAVIGATION,
} from "./site-navigation";

export function MobileNavigation(): React.JSX.Element {
  const pathname = usePathname();

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
          <DialogDescription>访问好店智装云官网公开页面。</DialogDescription>
        </DialogHeader>
        <nav aria-label="移动端导航" className="flex flex-col gap-2">
          {SITE_NAVIGATION.map((item) => {
            const isActive = isSiteNavigationActive(pathname, item.href);
            return (
              <DialogClose asChild key={item.href}>
                <Button asChild variant={isActive ? "secondary" : "ghost"}>
                  <Link aria-current={isActive ? "page" : undefined} href={item.href}>
                    {item.mobileLabel ?? item.label}
                  </Link>
                </Button>
              </DialogClose>
            );
          })}
        </nav>
      </DialogContent>
    </Dialog>
  );
}
