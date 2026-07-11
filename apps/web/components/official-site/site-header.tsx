import Image from "next/image";
import Link from "next/link";

import { MobileNavigation } from "@/components/official-site/mobile-navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteHeader(): React.JSX.Element {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          className="flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/"
        >
          <Image alt="" height={32} priority src="/logo.png" width={32} />
          鹅班长
        </Link>

        <nav
          aria-label="主导航"
          className="ml-auto hidden items-center gap-1 whitespace-nowrap md:flex"
        >
          <Button asChild size="sm" variant="ghost">
            <Link href="/">首页</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/partners">城市合伙人</Link>
          </Button>
          <ThemeToggle />
        </nav>

        <div className="ml-auto flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <MobileNavigation />
        </div>
      </div>
    </header>
  );
}
