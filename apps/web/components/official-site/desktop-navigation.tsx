"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

import {
  isSiteNavigationActive,
  SITE_NAVIGATION,
} from "./site-navigation";

export function DesktopNavigation(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div className="ml-auto hidden items-center gap-1 whitespace-nowrap md:flex">
      <nav aria-label="主导航" className="flex items-center gap-1">
        {SITE_NAVIGATION.map((item) => {
          const isActive = isSiteNavigationActive(pathname, item.href);
          return (
            <Button
              asChild
              key={item.href}
              size="sm"
              variant={isActive ? "secondary" : "ghost"}
            >
              <Link aria-current={isActive ? "page" : undefined} href={item.href}>
                {item.label}
              </Link>
            </Button>
          );
        })}
      </nav>
      <ThemeToggle />
    </div>
  );
}
